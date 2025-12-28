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
    current_document: str = ""
    entities_extracted: int = 0
    relationships_extracted: int = 0
    error: Optional[str] = None


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
    """Fetch documents directly from PostgreSQL"""
    conn = await get_pg_connection()
    try:
        rows = await conn.fetch("""
            SELECT id, name, indexing_status, word_count
            FROM documents
            WHERE dataset_id = $1 AND indexing_status = 'completed'
            ORDER BY created_at
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
):
    """Background task to build GraphRAG index using direct DB access"""
    global _build_progress

    try:
        _build_progress[dataset_id] = {
            "status": "building",
            "total_documents": 0,
            "completed_documents": 0,
            "total_segments": 0,
            "completed_segments": 0,
            "current_document": "Fetching documents from database...",
            "entities_extracted": 0,
            "relationships_extracted": 0,
            "error": None,
        }

        extractor = EntityExtractor()
        graph_store = get_graph_store()
        vector_store = get_vector_store()

        # Fetch documents directly from PostgreSQL
        completed_docs = await fetch_documents_from_db(dataset_id)

        if not completed_docs:
            _build_progress[dataset_id]["status"] = "error"
            _build_progress[dataset_id]["error"] = "No completed documents found"
            return

        _build_progress[dataset_id]["total_documents"] = len(completed_docs)

        total_entities = 0
        total_relationships = 0

        for doc_idx, doc in enumerate(completed_docs):
            doc_id = str(doc["id"])
            doc_name = doc.get("name", doc_id)

            _build_progress[dataset_id]["current_document"] = f"[{doc_idx + 1}/{len(completed_docs)}] {doc_name}"

            try:
                # Fetch segments directly from PostgreSQL
                segments = await fetch_segments_from_db(doc_id)
                _build_progress[dataset_id]["total_segments"] += len(segments)

                # Process each segment individually for better extraction
                for seg_idx, segment in enumerate(segments):
                    seg_text = segment.get("content", "").strip()
                    if not seg_text:
                        _build_progress[dataset_id]["completed_segments"] += 1
                        continue

                    try:
                        chunk_id = f"{doc_id}_seg_{seg_idx}"

                        # Extract entities and relationships from each segment
                        entity_response, rel_response = extractor.extract_all(
                            text=seg_text[:chunk_size],
                            document_id=doc_id,
                            chunk_id=chunk_id,
                        )

                        entities = entity_response.entities
                        relationships = rel_response.relationships

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
        logger.info(f"Build completed for {dataset_id}: {total_entities} entities, {total_relationships} relationships")

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
    )

    return BuildResponse(
        dataset_id=dataset_id,
        status="started",
        message="Build started in background",
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
        current_document=progress.get("current_document", ""),
        entities_extracted=progress.get("entities_extracted", 0),
        relationships_extracted=progress.get("relationships_extracted", 0),
        error=progress.get("error"),
    )


@router.delete("/progress/{dataset_id}")
async def clear_progress(dataset_id: str):
    """Clear build progress for a dataset"""
    if dataset_id in _build_progress:
        del _build_progress[dataset_id]
    return {"message": "Progress cleared"}
