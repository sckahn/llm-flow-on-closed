from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class SearchMode(str, Enum):
    """Search modes"""
    VECTOR = "vector"  # Vector search only
    GRAPH = "graph"    # Graph search only
    HYBRID = "hybrid"  # Combined vector + graph with RRF fusion


class GraphNode(BaseModel):
    """Node for graph visualization"""
    id: str
    label: str
    type: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    x: Optional[float] = None
    y: Optional[float] = None
    size: Optional[float] = None
    color: Optional[str] = None


class GraphEdge(BaseModel):
    """Edge for graph visualization"""
    id: str
    source: str
    target: str
    label: str
    type: str
    weight: float = 1.0
    properties: Dict[str, Any] = Field(default_factory=dict)


class GraphData(BaseModel):
    """Graph data for visualization"""
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SearchQuery(BaseModel):
    """Search query request"""
    query: str = Field(..., description="Search query text")
    mode: SearchMode = Field(default=SearchMode.HYBRID, description="Search mode")
    dataset_id: Optional[str] = Field(None, description="Filter by dataset")
    entity_types: Optional[List[str]] = Field(None, description="Filter by entity types")
    top_k: int = Field(default=10, ge=1, le=100, description="Number of results")
    include_graph: bool = Field(default=True, description="Include graph visualization data")
    max_graph_depth: int = Field(default=2, ge=1, le=5, description="Max graph traversal depth")


class SearchResultItem(BaseModel):
    """Individual search result"""
    id: str
    type: str  # 'entity', 'document', 'chunk'
    name: str
    description: Optional[str] = None
    score: float
    source: str  # 'vector', 'graph', 'hybrid'
    properties: Dict[str, Any] = Field(default_factory=dict)
    connections: List[Dict[str, Any]] = Field(default_factory=list)


class SearchResult(BaseModel):
    """Complete search response"""
    query: str
    mode: SearchMode
    results: List[SearchResultItem]
    graph: Optional[GraphData] = None
    total_count: int
    processing_time_ms: float


class NaturalLanguageQuery(BaseModel):
    """Natural language query request"""
    question: str = Field(..., description="Natural language question")
    dataset_id: Optional[str] = Field(None, description="Filter by dataset")
    include_narrative: bool = Field(default=True, description="Include narrative explanation")


class NarrativeResponse(BaseModel):
    """Response with narrative explanation"""
    question: str
    answer: str
    narrative: str  # Story-like explanation of the graph relationships
    graph: Optional[GraphData] = None
    sources: List[Dict[str, Any]] = Field(default_factory=list)
    cypher_query: Optional[str] = Field(None, description="Generated Cypher query")
    processing_time_ms: float
