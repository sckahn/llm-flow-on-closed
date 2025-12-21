from fastapi import APIRouter, HTTPException
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from app.models.search import GraphData, GraphNode, GraphEdge
from app.services.graph_store import GraphStore

router = APIRouter(prefix="/visualize", tags=["visualization"])

# Lazy initialization
_graph_store: Optional[GraphStore] = None


def get_graph_store() -> GraphStore:
    global _graph_store
    if _graph_store is None:
        _graph_store = GraphStore()
    return _graph_store


class LayoutConfig(BaseModel):
    """Configuration for graph layout"""
    type: str = Field(default="force", description="Layout type: force, circular, hierarchical")
    node_spacing: int = Field(default=100, description="Spacing between nodes")
    level_spacing: int = Field(default=150, description="Spacing between hierarchy levels")


class StyledGraphData(BaseModel):
    """Graph data with styling information"""
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    layout: LayoutConfig = Field(default_factory=LayoutConfig)
    legend: Dict[str, str] = Field(default_factory=dict)


# Color palette for entity types
ENTITY_COLORS = {
    "person": "#4F46E5",       # Indigo
    "organization": "#059669", # Emerald
    "location": "#DC2626",     # Red
    "date": "#D97706",         # Amber
    "concept": "#7C3AED",      # Violet
    "product": "#2563EB",      # Blue
    "event": "#DB2777",        # Pink
    "technology": "#0891B2",   # Cyan
    "document": "#65A30D",     # Lime
    "topic": "#EA580C",        # Orange
    "other": "#6B7280",        # Gray
}

# Node sizes by type importance
ENTITY_SIZES = {
    "person": 40,
    "organization": 45,
    "location": 35,
    "date": 25,
    "concept": 50,
    "product": 35,
    "event": 40,
    "technology": 35,
    "document": 30,
    "topic": 45,
    "other": 25,
}


def style_graph(graph: GraphData) -> StyledGraphData:
    """Apply visual styling to graph data"""
    styled_nodes = []
    for node in graph.nodes:
        entity_type = node.type.lower() if node.type else "other"
        styled_nodes.append(GraphNode(
            id=node.id,
            label=node.label,
            type=node.type,
            properties=node.properties,
            color=ENTITY_COLORS.get(entity_type, ENTITY_COLORS["other"]),
            size=ENTITY_SIZES.get(entity_type, ENTITY_SIZES["other"]),
        ))

    # Calculate edge weights for visual thickness
    styled_edges = []
    for edge in graph.edges:
        styled_edges.append(GraphEdge(
            id=edge.id,
            source=edge.source,
            target=edge.target,
            label=edge.label,
            type=edge.type,
            weight=edge.weight,
            properties=edge.properties,
        ))

    # Build legend from unique types
    unique_types = set(n.type.lower() if n.type else "other" for n in graph.nodes)
    legend = {t: ENTITY_COLORS.get(t, ENTITY_COLORS["other"]) for t in unique_types}

    return StyledGraphData(
        nodes=styled_nodes,
        edges=styled_edges,
        metadata=graph.metadata,
        legend=legend,
    )


@router.get("/graph/{dataset_id}", response_model=StyledGraphData)
async def get_dataset_graph(
    dataset_id: str,
    limit: int = 100,
    include_styling: bool = True,
):
    """Get styled graph data for a dataset"""
    try:
        graph_store = get_graph_store()
        graph = graph_store.get_graph_by_dataset(dataset_id, limit)

        if include_styling:
            return style_graph(graph)
        return StyledGraphData(
            nodes=graph.nodes,
            edges=graph.edges,
            metadata=graph.metadata,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/entity/{entity_id}", response_model=StyledGraphData)
async def get_entity_graph(
    entity_id: str,
    max_depth: int = 2,
    limit: int = 50,
    include_styling: bool = True,
):
    """Get graph centered on a specific entity"""
    try:
        graph_store = get_graph_store()
        graph = graph_store.get_entity_neighbors(
            entity_id=entity_id,
            max_depth=max_depth,
            limit=limit,
        )

        if include_styling:
            return style_graph(graph)
        return StyledGraphData(
            nodes=graph.nodes,
            edges=graph.edges,
            metadata=graph.metadata,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/{dataset_id}")
async def get_graph_stats(dataset_id: str):
    """Get graph statistics for visualization dashboard"""
    try:
        graph_store = get_graph_store()
        stats = graph_store.get_stats(dataset_id)

        # Format for visualization
        type_distribution = [
            {"type": t, "count": c, "color": ENTITY_COLORS.get(t.lower(), ENTITY_COLORS["other"])}
            for t, c in stats.get("entity_types", {}).items()
        ]

        return {
            "dataset_id": dataset_id,
            "total_entities": stats.get("entity_count", 0),
            "total_relationships": stats.get("relationship_count", 0),
            "type_distribution": type_distribution,
            "avg_connections": stats.get("relationship_count", 0) / max(stats.get("entity_count", 1), 1) * 2,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/colors")
async def get_color_palette():
    """Get the color palette used for entity types"""
    return {
        "entity_colors": ENTITY_COLORS,
        "entity_sizes": ENTITY_SIZES,
    }


class PathRequest(BaseModel):
    """Request to find path between entities"""
    source_id: str = Field(..., description="Source entity ID")
    target_id: str = Field(..., description="Target entity ID")
    max_depth: int = Field(default=5, ge=1, le=10, description="Maximum path length")


@router.post("/path", response_model=StyledGraphData)
async def find_path(request: PathRequest):
    """Find and visualize path between two entities"""
    try:
        graph_store = get_graph_store()

        # Find shortest path using Cypher
        query = """
        MATCH path = shortestPath((a:Entity {id: $source_id})-[*1..$max_depth]-(b:Entity {id: $target_id}))
        RETURN path
        LIMIT 1
        """
        results = graph_store.execute_cypher(
            query,
            {"source_id": request.source_id, "target_id": request.target_id, "max_depth": request.max_depth}
        )

        if not results:
            raise HTTPException(status_code=404, detail="No path found between entities")

        # Convert path to graph data
        nodes = {}
        edges = []

        for record in results:
            path = record.get("path")
            if path:
                for node in path.nodes:
                    node_dict = dict(node)
                    nodes[node_dict["id"]] = GraphNode(
                        id=node_dict["id"],
                        label=node_dict.get("name", ""),
                        type=node_dict.get("type", "unknown"),
                        properties=node_dict,
                    )
                for rel in path.relationships:
                    edges.append(GraphEdge(
                        id=f"{rel.start_node.element_id}_{rel.end_node.element_id}",
                        source=str(rel.start_node.element_id),
                        target=str(rel.end_node.element_id),
                        label=rel.get("type", "RELATES_TO"),
                        type=rel.get("type", "RELATES_TO"),
                        weight=rel.get("weight", 1.0),
                        properties=dict(rel),
                    ))

        graph = GraphData(
            nodes=list(nodes.values()),
            edges=edges,
            metadata={"type": "path", "source": request.source_id, "target": request.target_id},
        )

        return style_graph(graph)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clusters/{dataset_id}")
async def get_clusters(dataset_id: str, min_size: int = 3):
    """Get entity clusters for the dataset"""
    try:
        graph_store = get_graph_store()

        # Find connected components using Cypher
        query = """
        MATCH (e:Entity {dataset_id: $dataset_id})
        WITH e
        CALL {
            WITH e
            MATCH (e)-[*1..2]-(connected:Entity {dataset_id: $dataset_id})
            RETURN collect(DISTINCT connected.id) as cluster_members
        }
        WITH e.type as entity_type, cluster_members, size(cluster_members) as cluster_size
        WHERE cluster_size >= $min_size
        RETURN entity_type, cluster_members, cluster_size
        ORDER BY cluster_size DESC
        LIMIT 20
        """
        results = graph_store.execute_cypher(
            query,
            {"dataset_id": dataset_id, "min_size": min_size}
        )

        clusters = []
        for record in results:
            clusters.append({
                "type": record.get("entity_type"),
                "members": record.get("cluster_members", []),
                "size": record.get("cluster_size", 0),
            })

        return {"dataset_id": dataset_id, "clusters": clusters}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
