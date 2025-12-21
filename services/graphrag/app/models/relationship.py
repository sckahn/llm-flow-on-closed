from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class RelationshipType(str, Enum):
    """Types of relationships between entities"""
    RELATED_TO = "RELATED_TO"
    MENTIONS = "MENTIONS"
    WORKS_FOR = "WORKS_FOR"
    LOCATED_IN = "LOCATED_IN"
    PART_OF = "PART_OF"
    CREATED_BY = "CREATED_BY"
    BELONGS_TO = "BELONGS_TO"
    DEPENDS_ON = "DEPENDS_ON"
    SIMILAR_TO = "SIMILAR_TO"
    CAUSED_BY = "CAUSED_BY"
    LEADS_TO = "LEADS_TO"
    CONTAINS = "CONTAINS"
    USES = "USES"
    IS_A = "IS_A"
    HAS = "HAS"
    ABOUT = "ABOUT"
    OTHER = "OTHER"


class Relationship(BaseModel):
    """Represents a relationship between two entities"""
    id: Optional[str] = None
    source_entity_id: str = Field(..., description="Source entity ID")
    target_entity_id: str = Field(..., description="Target entity ID")
    source_entity_name: Optional[str] = Field(None, description="Source entity name")
    target_entity_name: Optional[str] = Field(None, description="Target entity name")
    type: RelationshipType = Field(..., description="Relationship type")
    description: Optional[str] = Field(None, description="Relationship description")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Additional properties")
    weight: float = Field(default=1.0, ge=0.0, description="Relationship weight/strength")
    source_document_id: Optional[str] = Field(None, description="Source document ID")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Extraction confidence")

    class Config:
        use_enum_values = True


class RelationshipExtractionRequest(BaseModel):
    """Request to extract relationships from text"""
    text: str = Field(..., description="Text to extract relationships from")
    entities: list = Field(..., description="List of entities already extracted")
    document_id: Optional[str] = Field(None, description="Document ID for reference")


class RelationshipExtractionResponse(BaseModel):
    """Response containing extracted relationships"""
    relationships: list[Relationship]
    processing_time_ms: float
