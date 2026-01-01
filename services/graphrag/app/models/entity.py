from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class EntityType(str, Enum):
    """Types of entities that can be extracted"""
    PERSON = "person"
    ORGANIZATION = "organization"
    LOCATION = "location"
    DATE = "date"
    CONCEPT = "concept"
    PRODUCT = "product"
    EVENT = "event"
    TECHNOLOGY = "technology"
    DOCUMENT = "document"
    TOPIC = "topic"
    OTHER = "other"


class Entity(BaseModel):
    """Represents an extracted entity"""
    id: Optional[str] = None
    name: str = Field(..., description="Entity name")
    type: EntityType = Field(..., description="Entity type")
    description: Optional[str] = Field(None, description="Entity description")
    aliases: List[str] = Field(default_factory=list, description="Alternative names")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Additional properties")
    source_document_id: Optional[str] = Field(None, description="Source document ID")
    source_chunk_id: Optional[str] = Field(None, description="Source chunk ID")
    source_page: Optional[int] = Field(None, description="Source page number in document")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Extraction confidence")
    embedding: Optional[List[float]] = Field(None, description="Entity embedding vector")

    class Config:
        use_enum_values = True


class EntityExtractionRequest(BaseModel):
    """Request to extract entities from text"""
    text: str = Field(..., description="Text to extract entities from")
    document_id: Optional[str] = Field(None, description="Document ID for reference")
    chunk_id: Optional[str] = Field(None, description="Chunk ID for reference")
    entity_types: Optional[List[EntityType]] = Field(
        None, description="Specific entity types to extract"
    )


class EntityExtractionResponse(BaseModel):
    """Response containing extracted entities"""
    entities: List[Entity]
    text: str
    processing_time_ms: float
