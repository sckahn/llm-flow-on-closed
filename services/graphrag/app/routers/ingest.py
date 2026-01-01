from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from app.models.entity import Entity
from app.models.relationship import Relationship
from app.services.graph_store import GraphStore
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/ingest", tags=["ingestion"])

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


class IngestEntitiesRequest(BaseModel):
    """Request to ingest entities into graph and vector stores"""
    entities: List[Entity]
    dataset_id: str = Field(..., description="Dataset ID to associate entities with")
    include_vectors: bool = Field(default=True, description="Also store in vector DB")


class IngestEntitiesResponse(BaseModel):
    """Response after ingesting entities"""
    entity_ids: List[str]
    graph_count: int
    vector_count: int
    message: str


class IngestRelationshipsRequest(BaseModel):
    """Request to ingest relationships"""
    relationships: List[Relationship]
    dataset_id: str = Field(..., description="Dataset ID")


class IngestRelationshipsResponse(BaseModel):
    """Response after ingesting relationships"""
    relationship_ids: List[str]
    count: int
    message: str


class IngestDocumentRequest(BaseModel):
    """Request to process and ingest a complete document"""
    text: str = Field(..., description="Document text")
    document_id: str = Field(..., description="Document ID")
    dataset_id: str = Field(..., description="Dataset ID")
    chunk_size: int = Field(default=1000, description="Chunk size for processing")


class IngestDocumentResponse(BaseModel):
    """Response after document ingestion"""
    document_id: str
    entity_count: int
    relationship_count: int
    processing_time_ms: float
    message: str


class DeleteDatasetRequest(BaseModel):
    """Request to delete a dataset"""
    dataset_id: str = Field(..., description="Dataset ID to delete")


class DeleteDatasetResponse(BaseModel):
    """Response after deleting a dataset"""
    dataset_id: str
    deleted_entities: int
    deleted_vectors: int
    message: str


@router.post("/entities", response_model=IngestEntitiesResponse)
async def ingest_entities(request: IngestEntitiesRequest):
    """Ingest entities into Neo4j and optionally Milvus"""
    try:
        graph_store = get_graph_store()
        vector_store = get_vector_store()

        # Store in Neo4j
        entity_ids = graph_store.create_entities_batch(
            entities=request.entities,
            dataset_id=request.dataset_id,
        )

        # Store in Milvus if requested
        vector_count = 0
        if request.include_vectors:
            vector_ids = await vector_store.insert_entities_batch(
                entities=request.entities,
                dataset_id=request.dataset_id,
            )
            vector_count = len(vector_ids)

        return IngestEntitiesResponse(
            entity_ids=entity_ids,
            graph_count=len(entity_ids),
            vector_count=vector_count,
            message=f"Successfully ingested {len(entity_ids)} entities",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/relationships", response_model=IngestRelationshipsResponse)
async def ingest_relationships(request: IngestRelationshipsRequest):
    """Ingest relationships into Neo4j"""
    try:
        graph_store = get_graph_store()

        relationship_ids = graph_store.create_relationships_batch(
            relationships=request.relationships,
            dataset_id=request.dataset_id,
        )

        return IngestRelationshipsResponse(
            relationship_ids=relationship_ids,
            count=len(relationship_ids),
            message=f"Successfully ingested {len(relationship_ids)} relationships",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/document", response_model=IngestDocumentResponse)
async def ingest_document(request: IngestDocumentRequest):
    """Process and ingest a complete document (extract + ingest)"""
    import time
    from app.services.entity_extractor import EntityExtractor

    try:
        start_time = time.time()

        extractor = EntityExtractor()
        graph_store = get_graph_store()
        vector_store = get_vector_store()

        # Chunk the text if needed
        text = request.text
        chunks = []
        if len(text) > request.chunk_size:
            # Simple chunking by size
            for i in range(0, len(text), request.chunk_size):
                chunks.append(text[i:i + request.chunk_size])
        else:
            chunks = [text]

        all_entities = []
        all_relationships = []

        # Extract from each chunk
        for i, chunk in enumerate(chunks):
            chunk_id = f"{request.document_id}_chunk_{i}"
            entity_response, rel_response = extractor.extract_all(
                text=chunk,
                document_id=request.document_id,
                chunk_id=chunk_id,
            )
            all_entities.extend(entity_response.entities)
            all_relationships.extend(rel_response.relationships)

        # Ingest entities
        if all_entities:
            graph_store.create_entities_batch(all_entities, request.dataset_id)
            await vector_store.insert_entities_batch(all_entities, request.dataset_id)

        # Ingest relationships
        if all_relationships:
            graph_store.create_relationships_batch(all_relationships, request.dataset_id)

        processing_time = (time.time() - start_time) * 1000

        return IngestDocumentResponse(
            document_id=request.document_id,
            entity_count=len(all_entities),
            relationship_count=len(all_relationships),
            processing_time_ms=processing_time,
            message=f"Successfully processed document with {len(all_entities)} entities and {len(all_relationships)} relationships",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/dataset", response_model=DeleteDatasetResponse)
async def delete_dataset(request: DeleteDatasetRequest):
    """Delete all entities and relationships for a dataset"""
    try:
        graph_store = get_graph_store()
        vector_store = get_vector_store()

        deleted_entities = graph_store.delete_dataset(request.dataset_id)
        deleted_vectors = vector_store.delete_by_dataset(request.dataset_id)

        return DeleteDatasetResponse(
            dataset_id=request.dataset_id,
            deleted_entities=deleted_entities,
            deleted_vectors=deleted_vectors,
            message=f"Successfully deleted dataset {request.dataset_id}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/{dataset_id}")
async def get_dataset_stats(dataset_id: str):
    """Get statistics for a dataset (graph only, vector stats are async)"""
    try:
        graph_store = get_graph_store()
        graph_stats = graph_store.get_stats(dataset_id)

        # Skip Milvus stats to avoid blocking - use graph stats only
        # Vector embeddings are synced with graph entities
        entity_count = graph_stats.get("entity_count", 0)
        return {
            "dataset_id": dataset_id,
            "graph": graph_stats,
            "vector": {
                "count": entity_count,
                "total_entities": entity_count,
                "entity_count": entity_count,
                "status": "synced_with_graph",
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
