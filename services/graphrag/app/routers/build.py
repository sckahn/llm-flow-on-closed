"""
Background build endpoint for GraphRAG indexing.
Processes documents server-side to avoid browser OOM.
Uses PostgreSQL direct access to fetch segments.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
import asyncio
import asyncpg
import logging
import os

from app.services.entity_extractor import EntityExtractor
from app.services.graph_store import GraphStore
from app.services.vector_store import VectorStore
from app.services.pdf_page_extractor import PDFPageExtractor
from app.services.docling_parser import DoclingParser, DoclingChunk, get_docling_parser

router = APIRouter(prefix="/build", tags=["build"])
logger = logging.getLogger(__name__)

# PostgreSQL connection settings (Dify database)
PG_HOST = os.getenv("DIFY_DB_HOST", "postgresql")
PG_PORT = int(os.getenv("DIFY_DB_PORT", "5432"))
PG_USER = os.getenv("DIFY_DB_USER", "postgres")
PG_PASSWORD = os.getenv("DIFY_DB_PASSWORD", "postgres_llmflow")
PG_DATABASE = os.getenv("DIFY_DB_NAME", "dify")

# In-memory progress tracking (use Redis in production)
_build_progress: Dict[str, dict] = {}

# Lazy initialization
_graph_store: Optional[GraphStore] = None
_vector_store: Optional[VectorStore] = None


def get_graph_store() -> GraphStore:
    global _graph_store
    if _graph_store is None:
        _graph_store = GraphStore()
    return _graph_store


def get_vector_store() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


class BuildRequest(BaseModel):
    dataset_id: str = Field(..., description="Dataset ID to build")
    dify_api_url: str = Field(default="http://dify-api:5001", description="Dify API URL")
    dify_api_key: str = Field(default="", description="Dify API key (optional)")
    chunk_size: int = Field(default=4000, description="Chunk size for processing")
    batch_size: int = Field(default=5, description="Segments per batch")
    resume: bool = Field(default=True, description="Resume from last checkpoint (skip already processed segments)")
    use_docling: bool = Field(default=False, description="Use Docling for high-quality PDF parsing (slower but more accurate)")
    docling_languages: List[str] = Field(default=["ko", "en"], description="OCR languages for Docling")


class BuildResponse(BaseModel):
    dataset_id: str
    status: str
    message: str


class ProgressResponse(BaseModel):
    dataset_id: str
    status: str  # idle, building, completed, error
    total_documents: int = 0
    completed_documents: int = 0
    total_segments: int = 0
    completed_segments: int = 0
    skipped_segments: int = 0
    current_document: str = ""
    entities_extracted: int = 0
    relationships_extracted: int = 0
    error: Optional[str] = None
    resume_mode: bool = False
    docling_mode: bool = False


async def get_pg_connection():
    """Get PostgreSQL connection to Dify database"""
    return await asyncpg.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        database=PG_DATABASE,
    )


async def fetch_documents_from_db(dataset_id: str) -> List[dict]:
    """Fetch documents directly from PostgreSQL with S3 file keys"""
    conn = await get_pg_connection()
    try:
        rows = await conn.fetch("""
            SELECT d.id, d.name, d.indexing_status, d.word_count,
                   uf.key as s3_key, uf.extension
            FROM documents d
            LEFT JOIN upload_files uf ON uf.id::text = (d.data_source_info::json->>'upload_file_id')
            WHERE d.dataset_id = $1 AND d.indexing_status = 'completed'
            ORDER BY d.created_at
        """, dataset_id)
        return [dict(row) for row in rows]
    finally:
        await conn.close()


async def fetch_segments_from_db(document_id: str) -> List[dict]:
    """Fetch document segments directly from PostgreSQL"""
    conn = await get_pg_connection()
    try:
        rows = await conn.fetch("""
            SELECT id, content, position, word_count
            FROM document_segments
            WHERE document_id = $1 AND status = 'completed'
            ORDER BY position
        """, document_id)
        return [dict(row) for row in rows]
    finally:
        await conn.close()


async def build_graphrag_task(
    dataset_id: str,
    chunk_size: int,
    resume: bool = True,
    use_docling: bool = False,
    docling_languages: List[str] = None,
):
    """Background task to build GraphRAG index using direct DB access"""
    global _build_progress

    if docling_languages is None:
        docling_languages = ["ko", "en"]

    try:
        _build_progress[dataset_id] = {
            "status": "building",
            "total_documents": 0,
            "completed_documents": 0,
            "total_segments": 0,
            "completed_segments": 0,
            "skipped_segments": 0,
            "current_document": "Fetching documents from database...",
            "entities_extracted": 0,
            "relationships_extracted": 0,
            "error": None,
            "resume_mode": resume,
            "docling_mode": use_docling,
        }

        extractor = EntityExtractor()
        graph_store = get_graph_store()
        vector_store = get_vector_store()

        # Initialize PDF page extractor
        try:
            pdf_extractor = PDFPageExtractor()
            logger.info("PDF page extractor initialized")
        except Exception as e:
            logger.warning(f"PDF page extractor not available: {e}")
            pdf_extractor = None

        # Initialize Docling parser if enabled
        docling_parser = None
        if use_docling:
            try:
                docling_parser = get_docling_parser(languages=docling_languages)
                logger.info(f"Docling parser initialized with languages: {docling_languages}")
            except Exception as e:
                logger.warning(f"Docling parser not available, falling back to Dify segments: {e}")
                docling_parser = None

        # Get already processed chunk_ids if resume mode
        processed_chunks: set = set()
        if resume:
            _build_progress[dataset_id]["current_document"] = "Loading processed chunks from Neo4j..."
            processed_chunks = graph_store.get_processed_chunk_ids(dataset_id)
            logger.info(f"Resume mode: Found {len(processed_chunks)} already processed chunks")

        # Fetch documents directly from PostgreSQL
        completed_docs = await fetch_documents_from_db(dataset_id)

        if not completed_docs:
            _build_progress[dataset_id]["status"] = "error"
            _build_progress[dataset_id]["error"] = "No completed documents found"
            return

        _build_progress[dataset_id]["total_documents"] = len(completed_docs)

        total_entities = 0
        total_relationships = 0
        skipped_count = 0

        for doc_idx, doc in enumerate(completed_docs):
            doc_id = str(doc["id"])
            doc_name = doc.get("name", doc_id)
            s3_key = doc.get("s3_key")
            is_pdf = doc.get("extension", "").lower() == "pdf" or doc_name.lower().endswith(".pdf")

            _build_progress[dataset_id]["current_document"] = f"[{doc_idx + 1}/{len(completed_docs)}] {doc_name}"

            try:
                # Decide whether to use Docling or Dify segments
                use_docling_for_doc = docling_parser and s3_key and is_pdf

                if use_docling_for_doc:
                    # Use Docling for high-quality PDF parsing
                    _build_progress[dataset_id]["current_document"] = f"[{doc_idx + 1}/{len(completed_docs)}] {doc_name} (Docling parsing...)"
                    try:
                        docling_chunks = docling_parser.parse_from_s3(s3_key, chunk_size=chunk_size)
                        logger.info(f"Docling parsed {doc_name}: {len(docling_chunks)} chunks")
                        _build_progress[dataset_id]["total_segments"] += len(docling_chunks)

                        # Process Docling chunks
                        for chunk_idx, chunk in enumerate(docling_chunks):
                            chunk_id = f"{doc_id}_docling_{chunk_idx}"

                            # Skip already processed chunks in resume mode
                            if resume and chunk_id in processed_chunks:
                                skipped_count += 1
                                _build_progress[dataset_id]["completed_segments"] += 1
                                _build_progress[dataset_id]["skipped_segments"] = skipped_count
                                continue

                            if not chunk.content.strip():
                                _build_progress[dataset_id]["completed_segments"] += 1
                                continue

                            try:
                                # Extract entities and relationships
                                entity_response, rel_response = extractor.extract_all(
                                    text=chunk.content[:chunk_size],
                                    document_id=doc_id,
                                    chunk_id=chunk_id,
                                )

                                entities = entity_response.entities
                                relationships = rel_response.relationships

                                # Set page number from Docling chunk
                                if chunk.page_number:
                                    for entity in entities:
                                        entity.source_page = chunk.page_number

                                # Store in graph and vector DBs
                                if entities:
                                    graph_store.create_entities_batch(entities, dataset_id)
                                    await vector_store.insert_entities_batch(entities, dataset_id)
                                    total_entities += len(entities)

                                if relationships:
                                    graph_store.create_relationships_batch(relationships, dataset_id)
                                    total_relationships += len(relationships)

                            except Exception as e:
                                logger.warning(f"Failed to process Docling chunk {chunk_idx} of {doc_name}: {e}")

                            _build_progress[dataset_id]["completed_segments"] += 1
                            _build_progress[dataset_id]["entities_extracted"] = total_entities
                            _build_progress[dataset_id]["relationships_extracted"] = total_relationships

                            await asyncio.sleep(0.05)

                    except Exception as e:
                        logger.warning(f"Docling parsing failed for {doc_name}, falling back to Dify segments: {e}")
                        use_docling_for_doc = False  # Fallback to Dify segments

                if not use_docling_for_doc:
                    # Use Dify segments (original behavior)
                    segments = await fetch_segments_from_db(doc_id)
                    _build_progress[dataset_id]["total_segments"] += len(segments)

                    # Build segment-to-page map for PDF documents
                    segment_page_map: Dict[str, int] = {}
                    if pdf_extractor and s3_key and is_pdf:
                        try:
                            _build_progress[dataset_id]["current_document"] = f"[{doc_idx + 1}/{len(completed_docs)}] {doc_name} (extracting pages...)"
                            segment_page_map = pdf_extractor.build_segment_page_map(s3_key, segments)
                            total_pages = pdf_extractor.get_total_pages(s3_key)
                            logger.info(f"Extracted {total_pages} pages from {doc_name}")
                        except Exception as e:
                            logger.warning(f"Failed to extract pages from {doc_name}: {e}")

                    # Process each segment individually for better extraction
                    for seg_idx, segment in enumerate(segments):
                        chunk_id = f"{doc_id}_seg_{seg_idx}"
                        seg_id = str(segment.get("id", f"seg_{seg_idx}"))

                        # Skip already processed chunks in resume mode
                        if resume and chunk_id in processed_chunks:
                            skipped_count += 1
                            _build_progress[dataset_id]["completed_segments"] += 1
                            _build_progress[dataset_id]["skipped_segments"] = skipped_count
                            continue

                        seg_text = segment.get("content", "").strip()
                        if not seg_text:
                            _build_progress[dataset_id]["completed_segments"] += 1
                            continue

                        # Get page number for this segment
                        page_number = segment_page_map.get(seg_id)
                        if not page_number and segment_page_map:
                            # Try with position-based key
                            page_number = segment_page_map.get(str(seg_idx))

                        try:
                            # Extract entities and relationships from each segment
                            entity_response, rel_response = extractor.extract_all(
                                text=seg_text[:chunk_size],
                                document_id=doc_id,
                                chunk_id=chunk_id,
                            )

                            entities = entity_response.entities
                            relationships = rel_response.relationships

                            # Set page number on each entity
                            if page_number:
                                for entity in entities:
                                    entity.source_page = page_number

                            # Store in graph and vector DBs
                            if entities:
                                graph_store.create_entities_batch(entities, dataset_id)
                                await vector_store.insert_entities_batch(entities, dataset_id)
                                total_entities += len(entities)

                            if relationships:
                                graph_store.create_relationships_batch(relationships, dataset_id)
                                total_relationships += len(relationships)

                        except Exception as e:
                            logger.warning(f"Failed to process segment {seg_idx} of {doc_name}: {e}")

                        _build_progress[dataset_id]["completed_segments"] += 1
                        _build_progress[dataset_id]["entities_extracted"] = total_entities
                        _build_progress[dataset_id]["relationships_extracted"] = total_relationships

                        # Small delay to avoid overwhelming the system
                        await asyncio.sleep(0.05)

            except Exception as e:
                logger.error(f"Failed to process document {doc_name}: {e}")

            _build_progress[dataset_id]["completed_documents"] = doc_idx + 1

        _build_progress[dataset_id]["status"] = "completed"
        _build_progress[dataset_id]["current_document"] = ""
        logger.info(f"Build completed for {dataset_id}: {total_entities} entities, {total_relationships} relationships, {skipped_count} skipped")

    except Exception as e:
        logger.error(f"Build failed for {dataset_id}: {e}")
        _build_progress[dataset_id]["status"] = "error"
        _build_progress[dataset_id]["error"] = str(e)


@router.post("/start", response_model=BuildResponse)
async def start_build(request: BuildRequest, background_tasks: BackgroundTasks):
    """Start background GraphRAG build for a dataset (uses direct DB access)"""
    dataset_id = request.dataset_id

    # Check if already building
    if dataset_id in _build_progress and _build_progress[dataset_id].get("status") == "building":
        raise HTTPException(status_code=409, detail="Build already in progress")

    # Start background task
    background_tasks.add_task(
        build_graphrag_task,
        dataset_id=dataset_id,
        chunk_size=request.chunk_size,
        resume=request.resume,
        use_docling=request.use_docling,
        docling_languages=request.docling_languages,
    )

    mode_parts = []
    if request.resume:
        mode_parts.append("resume")
    if request.use_docling:
        mode_parts.append("Docling")
    mode = ", ".join(mode_parts) if mode_parts else "full rebuild"
    return BuildResponse(
        dataset_id=dataset_id,
        status="started",
        message=f"Build started in background ({mode} mode)",
    )


@router.get("/progress/{dataset_id}", response_model=ProgressResponse)
async def get_progress(dataset_id: str):
    """Get build progress for a dataset"""
    if dataset_id not in _build_progress:
        return ProgressResponse(dataset_id=dataset_id, status="idle")

    progress = _build_progress[dataset_id]
    return ProgressResponse(
        dataset_id=dataset_id,
        status=progress.get("status", "idle"),
        total_documents=progress.get("total_documents", 0),
        completed_documents=progress.get("completed_documents", 0),
        total_segments=progress.get("total_segments", 0),
        completed_segments=progress.get("completed_segments", 0),
        skipped_segments=progress.get("skipped_segments", 0),
        current_document=progress.get("current_document", ""),
        entities_extracted=progress.get("entities_extracted", 0),
        relationships_extracted=progress.get("relationships_extracted", 0),
        error=progress.get("error"),
        resume_mode=progress.get("resume_mode", False),
        docling_mode=progress.get("docling_mode", False),
    )


@router.delete("/progress/{dataset_id}")
async def clear_progress(dataset_id: str):
    """Clear build progress for a dataset"""
    if dataset_id in _build_progress:
        del _build_progress[dataset_id]
    return {"message": "Progress cleared"}


class PageMappingRequest(BaseModel):
    dataset_id: str = Field(..., description="Dataset ID to update page info")


class PageMappingResponse(BaseModel):
    dataset_id: str
    status: str
    updated_entities: int = 0
    message: str


async def update_page_mapping_task(dataset_id: str):
    """Background task to update page info on existing entities"""
    global _build_progress

    try:
        _build_progress[dataset_id] = {
            "status": "building",
            "total_documents": 0,
            "completed_documents": 0,
            "total_segments": 0,
            "completed_segments": 0,
            "skipped_segments": 0,
            "current_document": "Initializing page mapping...",
            "entities_extracted": 0,
            "relationships_extracted": 0,
            "error": None,
            "resume_mode": False,
        }

        graph_store = get_graph_store()

        # Initialize PDF page extractor
        try:
            pdf_extractor = PDFPageExtractor()
        except Exception as e:
            _build_progress[dataset_id]["status"] = "error"
            _build_progress[dataset_id]["error"] = f"PDF extractor init failed: {e}"
            return

        # Fetch documents with S3 keys
        _build_progress[dataset_id]["current_document"] = "Fetching documents..."
        completed_docs = await fetch_documents_from_db(dataset_id)

        if not completed_docs:
            _build_progress[dataset_id]["status"] = "error"
            _build_progress[dataset_id]["error"] = "No documents found"
            return

        _build_progress[dataset_id]["total_documents"] = len(completed_docs)
        total_updated = 0

        for doc_idx, doc in enumerate(completed_docs):
            doc_id = str(doc["id"])
            doc_name = doc.get("name", doc_id)
            s3_key = doc.get("s3_key")
            is_pdf = doc.get("extension", "").lower() == "pdf" or doc_name.lower().endswith(".pdf")

            if not s3_key or not is_pdf:
                _build_progress[dataset_id]["completed_documents"] = doc_idx + 1
                continue

            _build_progress[dataset_id]["current_document"] = f"[{doc_idx + 1}/{len(completed_docs)}] {doc_name}"

            try:
                # Fetch segments for this document
                segments = await fetch_segments_from_db(doc_id)
                _build_progress[dataset_id]["total_segments"] += len(segments)

                # Build segment-to-page map
                _build_progress[dataset_id]["current_document"] = f"[{doc_idx + 1}/{len(completed_docs)}] {doc_name} (extracting pages...)"
                segment_page_map = pdf_extractor.build_segment_page_map(s3_key, segments)
                total_pages = pdf_extractor.get_total_pages(s3_key)
                logger.info(f"Extracted {total_pages} pages, mapped {len(segment_page_map)} segments from {doc_name}")

                if not segment_page_map:
                    _build_progress[dataset_id]["completed_documents"] = doc_idx + 1
                    continue

                # Update entities in Neo4j with page numbers
                _build_progress[dataset_id]["current_document"] = f"[{doc_idx + 1}/{len(completed_docs)}] {doc_name} (updating entities...)"

                for seg_idx, segment in enumerate(segments):
                    seg_id = str(segment.get("id", f"seg_{seg_idx}"))
                    chunk_id = f"{doc_id}_seg_{seg_idx}"

                    # Get page number for this segment (try multiple key formats)
                    page_number = (
                        segment_page_map.get(seg_id) or
                        segment_page_map.get(str(seg_idx)) or
                        segment_page_map.get(chunk_id)
                    )

                    # If no direct mapping, estimate based on position
                    if not page_number and total_pages > 0:
                        page_number = min(int((seg_idx / len(segments)) * total_pages) + 1, total_pages)

                    if page_number:
                        # Update all entities from this chunk with page number
                        with graph_store.driver.session() as session:
                            result = session.run("""
                                MATCH (e:Entity {dataset_id: $dataset_id, source_chunk_id: $chunk_id})
                                SET e.source_page = $page_number
                                RETURN count(e) as updated
                            """, dataset_id=dataset_id, chunk_id=chunk_id, page_number=page_number)
                            record = result.single()
                            if record:
                                total_updated += record["updated"]

                    _build_progress[dataset_id]["completed_segments"] += 1
                    _build_progress[dataset_id]["entities_extracted"] = total_updated

            except Exception as e:
                logger.error(f"Failed to process document {doc_name}: {e}")

            _build_progress[dataset_id]["completed_documents"] = doc_idx + 1

        # Clear PDF cache
        pdf_extractor.clear_cache()

        _build_progress[dataset_id]["status"] = "completed"
        _build_progress[dataset_id]["current_document"] = ""
        _build_progress[dataset_id]["entities_extracted"] = total_updated
        logger.info(f"Page mapping completed for {dataset_id}: {total_updated} entities updated")

    except Exception as e:
        logger.error(f"Page mapping failed for {dataset_id}: {e}")
        _build_progress[dataset_id]["status"] = "error"
        _build_progress[dataset_id]["error"] = str(e)


@router.post("/update-pages", response_model=PageMappingResponse)
async def update_page_mapping(request: PageMappingRequest, background_tasks: BackgroundTasks):
    """Update page numbers on existing entities without full rebuild"""
    dataset_id = request.dataset_id

    # Check if already building
    if dataset_id in _build_progress and _build_progress[dataset_id].get("status") == "building":
        raise HTTPException(status_code=409, detail="Build already in progress")

    # Start background task
    background_tasks.add_task(update_page_mapping_task, dataset_id=dataset_id)

    return PageMappingResponse(
        dataset_id=dataset_id,
        status="started",
        message="Page mapping update started in background",
    )
