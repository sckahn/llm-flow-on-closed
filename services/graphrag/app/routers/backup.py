"""Backup and restore endpoints for GraphRAG data"""
import json
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
import io

from app.models.entity import Entity
from app.models.relationship import Relationship
from app.services.graph_store import GraphStore
from app.services.vector_store import VectorStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/backup", tags=["backup"])

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


class ExportMetadata(BaseModel):
    """Metadata for exported data"""
    version: str = "1.0"
    exported_at: str
    dataset_id: str
    entity_count: int
    relationship_count: int
    platform: str = "llmflow-graphrag"


class GraphRAGExport(BaseModel):
    """Complete export format for GraphRAG data"""
    metadata: ExportMetadata
    entities: List[dict]
    relationships: List[dict]


class ImportResult(BaseModel):
    """Result of import operation"""
    success: bool
    dataset_id: str
    imported_entities: int
    imported_relationships: int
    message: str


@router.get("/export/{dataset_id}")
async def export_dataset(dataset_id: str, include_vectors: bool = False):
    """Export all GraphRAG data for a dataset as JSON"""
    try:
        graph_store = get_graph_store()
        
        # Get all entities for the dataset
        entity_query = """
        MATCH (e:Entity {dataset_id: $dataset_id})
        RETURN e
        """
        entity_results = graph_store.execute_cypher(entity_query, {"dataset_id": dataset_id})
        
        entities = []
        for record in entity_results:
            node = record.get("e")
            if node:
                entity_data = dict(node)
                entities.append(entity_data)
        
        # Get all relationships for the dataset
        rel_query = """
        MATCH (s:Entity {dataset_id: $dataset_id})-[r]->(t:Entity {dataset_id: $dataset_id})
        RETURN s.id as source_id, t.id as target_id, type(r) as rel_type, properties(r) as props
        """
        rel_results = graph_store.execute_cypher(rel_query, {"dataset_id": dataset_id})
        
        relationships = []
        for record in rel_results:
            rel_data = {
                "source_id": record.get("source_id"),
                "target_id": record.get("target_id"),
                "type": record.get("rel_type"),
                "properties": record.get("props", {}),
            }
            relationships.append(rel_data)
        
        # Build export data
        export_data = GraphRAGExport(
            metadata=ExportMetadata(
                exported_at=datetime.utcnow().isoformat(),
                dataset_id=dataset_id,
                entity_count=len(entities),
                relationship_count=len(relationships),
            ),
            entities=entities,
            relationships=relationships,
        )
        
        # Return as downloadable JSON
        json_str = export_data.model_dump_json(indent=2)
        
        return StreamingResponse(
            io.BytesIO(json_str.encode('utf-8')),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="graphrag_{dataset_id}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json"'
            }
        )
        
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import", response_model=ImportResult)
async def import_dataset(
    file: UploadFile = File(...),
    target_dataset_id: Optional[str] = None,
    merge: bool = False,
):
    """Import GraphRAG data from JSON file
    
    Args:
        file: JSON file exported from GraphRAG
        target_dataset_id: Override dataset ID (optional, uses original if not provided)
        merge: If True, merge with existing data. If False, replace existing data.
    """
    try:
        # Read and parse JSON
        content = await file.read()
        data = json.loads(content.decode('utf-8'))
        
        # Validate format
        if "metadata" not in data or "entities" not in data:
            raise HTTPException(status_code=400, detail="Invalid export format")
        
        metadata = data["metadata"]
        dataset_id = target_dataset_id or metadata.get("dataset_id")
        
        if not dataset_id:
            raise HTTPException(status_code=400, detail="Dataset ID is required")
        
        graph_store = get_graph_store()
        vector_store = get_vector_store()
        
        # Clear existing data if not merging
        if not merge:
            graph_store.delete_dataset(dataset_id)
            vector_store.delete_by_dataset(dataset_id)
        
        # Import entities
        entities = []
        for entity_data in data["entities"]:
            # Update dataset_id if overridden
            entity_data["dataset_id"] = dataset_id
            
            entity = Entity(
                id=entity_data.get("id"),
                name=entity_data.get("name", ""),
                type=entity_data.get("type", "other"),
                description=entity_data.get("description"),
                aliases=entity_data.get("aliases", []),
                source_document_id=entity_data.get("source_document_id"),
                source_chunk_id=entity_data.get("source_chunk_id"),
            )
            entities.append(entity)
        
        if entities:
            graph_store.create_entities_batch(entities, dataset_id)
            await vector_store.insert_entities_batch(entities, dataset_id)
        
        # Import relationships
        relationships = []
        for rel_data in data.get("relationships", []):
            rel = Relationship(
                source_entity_id=rel_data.get("source_id"),
                target_entity_id=rel_data.get("target_id"),
                type=rel_data.get("type", "RELATED_TO"),
                description=rel_data.get("properties", {}).get("description"),
                source_document_id=rel_data.get("properties", {}).get("source_document_id"),
            )
            relationships.append(rel)
        
        if relationships:
            graph_store.create_relationships_batch(relationships, dataset_id)
        
        return ImportResult(
            success=True,
            dataset_id=dataset_id,
            imported_entities=len(entities),
            imported_relationships=len(relationships),
            message=f"Successfully imported {len(entities)} entities and {len(relationships)} relationships",
        )
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        logger.error(f"Import failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/{dataset_id}")
async def list_backups(dataset_id: str):
    """List available backups for a dataset (if stored in MinIO)"""
    # This would integrate with MinIO to list stored backups
    # For now, return empty list as backups are downloaded directly
    return {"dataset_id": dataset_id, "backups": []}
