from fastapi import APIRouter, HTTPException
from typing import Optional, List

from app.models.search import (
    SearchQuery,
    SearchResult,
    NaturalLanguageQuery,
    NarrativeResponse,
)
from app.services.graph_store import GraphStore
from app.services.vector_store import VectorStore
from app.services.hybrid_search import HybridSearch
from app.services.nl_to_cypher import NLToCypher
from app.services.narrative_generator import NarrativeGenerator

router = APIRouter(prefix="/search", tags=["search"])

# Lazy initialization
_graph_store: Optional[GraphStore] = None
_vector_store: Optional[VectorStore] = None
_hybrid_search: Optional[HybridSearch] = None
_nl_to_cypher: Optional[NLToCypher] = None
_narrative_generator: Optional[NarrativeGenerator] = None


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


def get_hybrid_search() -> HybridSearch:
    global _hybrid_search
    if _hybrid_search is None:
        _hybrid_search = HybridSearch(get_vector_store(), get_graph_store())
    return _hybrid_search


def get_nl_to_cypher() -> NLToCypher:
    global _nl_to_cypher
    if _nl_to_cypher is None:
        _nl_to_cypher = NLToCypher(get_graph_store())
    return _nl_to_cypher


def get_narrative_generator() -> NarrativeGenerator:
    global _narrative_generator
    if _narrative_generator is None:
        _narrative_generator = NarrativeGenerator(get_graph_store())
    return _narrative_generator


@router.post("/", response_model=SearchResult)
async def search(query: SearchQuery):
    """Perform hybrid search (vector + graph)"""
    try:
        hybrid_search = get_hybrid_search()
        result = await hybrid_search.search(query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nl-query", response_model=NarrativeResponse)
async def natural_language_query(query: NaturalLanguageQuery):
    """Process natural language query and return narrative response"""
    try:
        nl_to_cypher = get_nl_to_cypher()
        narrative_generator = get_narrative_generator()
        graph_store = get_graph_store()
        hybrid_search = get_hybrid_search()

        # Convert to Cypher and execute
        nl_result = nl_to_cypher.execute_nl_query(
            question=query.question,
            dataset_id=query.dataset_id,
        )

        graph = None
        used_fallback = False

        # Get graph data for visualization
        if nl_result["success"] and nl_result["results"]:
            # Try to extract entity IDs from results and build graph
            entity_ids = []
            for record in nl_result["results"][:10]:
                if isinstance(record, dict):
                    for key, value in record.items():
                        if isinstance(value, dict) and "id" in value:
                            entity_ids.append(value["id"])

            if entity_ids:
                # Get graph centered on first entity
                graph = graph_store.get_entity_neighbors(
                    entity_id=entity_ids[0],
                    max_depth=2,
                    limit=50,
                )
            else:
                # Fallback: search by query text
                graph = graph_store.get_graph_by_dataset(
                    dataset_id=query.dataset_id,
                    limit=50,
                ) if query.dataset_id else None

        # Fallback to hybrid search if Cypher returned no results
        if not graph or (not graph.nodes):
            used_fallback = True
            try:
                # Use hybrid search (vector + graph text search)
                search_results = await hybrid_search.search_with_expansion(
                    query=query.question,
                    dataset_id=query.dataset_id,
                    top_k=10,
                    expansion_depth=2,
                )

                if search_results.results:
                    # Get graph from first result
                    first_result = search_results.results[0]
                    graph = graph_store.get_entity_neighbors(
                        entity_id=first_result.id,
                        max_depth=2,
                        limit=50,
                    )
                elif query.dataset_id:
                    # Last resort: get dataset graph
                    graph = graph_store.get_graph_by_dataset(
                        dataset_id=query.dataset_id,
                        limit=50,
                    )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Fallback search failed: {e}")

        # Generate narrative if requested
        if query.include_narrative and graph and graph.nodes:
            response = narrative_generator.answer_question(
                question=query.question,
                graph=graph,
                cypher_query=nl_result.get("cypher") if not used_fallback else None,
            )
            return response
        else:
            # Return basic response
            return NarrativeResponse(
                question=query.question,
                answer=str(nl_result.get("results", [])) if nl_result["results"] else "관련 정보를 찾지 못했습니다.",
                narrative="",
                graph=graph,
                sources=[],
                cypher_query=nl_result.get("cypher"),
                processing_time_ms=nl_result.get("processing_time_ms", 0),
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions")
async def get_query_suggestions(dataset_id: Optional[str] = None):
    """Get suggested queries for the dataset"""
    try:
        nl_to_cypher = get_nl_to_cypher()
        suggestions = nl_to_cypher.suggest_queries(dataset_id)
        return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/entity/{entity_id}/story", response_model=NarrativeResponse)
async def get_entity_story(entity_id: str, max_depth: int = 2):
    """Get narrative story about an entity and its connections"""
    try:
        narrative_generator = get_narrative_generator()
        response = narrative_generator.generate_entity_story(
            entity_id=entity_id,
            max_depth=max_depth,
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dataset/{dataset_id}/summary")
async def get_dataset_summary(dataset_id: str):
    """Get narrative summary of a dataset's knowledge graph"""
    try:
        narrative_generator = get_narrative_generator()
        summary = narrative_generator.summarize_dataset(dataset_id)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
