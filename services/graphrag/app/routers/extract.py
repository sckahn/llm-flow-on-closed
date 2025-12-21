from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List

from app.models.entity import EntityExtractionRequest, EntityExtractionResponse, Entity
from app.models.relationship import RelationshipExtractionRequest, RelationshipExtractionResponse
from app.services.entity_extractor import EntityExtractor

router = APIRouter(prefix="/extract", tags=["extraction"])

# Lazy initialization
_extractor: Optional[EntityExtractor] = None


def get_extractor() -> EntityExtractor:
    global _extractor
    if _extractor is None:
        _extractor = EntityExtractor()
    return _extractor


class ExtractAllRequest(BaseModel):
    """Request to extract both entities and relationships"""
    text: str = Field(..., description="Text to extract from")
    document_id: Optional[str] = Field(None, description="Document ID")
    chunk_id: Optional[str] = Field(None, description="Chunk ID")


class ExtractAllResponse(BaseModel):
    """Response containing both entities and relationships"""
    entities: EntityExtractionResponse
    relationships: RelationshipExtractionResponse


@router.post("/entities", response_model=EntityExtractionResponse)
async def extract_entities(request: EntityExtractionRequest):
    """Extract entities from text using LLM"""
    try:
        extractor = get_extractor()
        response = extractor.extract_entities(
            text=request.text,
            document_id=request.document_id,
            chunk_id=request.chunk_id,
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/relationships", response_model=RelationshipExtractionResponse)
async def extract_relationships(request: RelationshipExtractionRequest):
    """Extract relationships between entities"""
    try:
        extractor = get_extractor()
        # Convert entity dicts to Entity objects if needed
        entities = []
        for e in request.entities:
            if isinstance(e, dict):
                entities.append(Entity(**e))
            else:
                entities.append(e)

        response = extractor.extract_relationships(
            text=request.text,
            entities=entities,
            document_id=request.document_id,
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/all", response_model=ExtractAllResponse)
async def extract_all(request: ExtractAllRequest):
    """Extract both entities and relationships from text"""
    try:
        extractor = get_extractor()
        entity_response, relationship_response = extractor.extract_all(
            text=request.text,
            document_id=request.document_id,
            chunk_id=request.chunk_id,
        )
        return ExtractAllResponse(
            entities=entity_response,
            relationships=relationship_response,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
