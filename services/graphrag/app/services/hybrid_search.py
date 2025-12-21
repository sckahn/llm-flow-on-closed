import logging
import time
from typing import List, Optional, Dict, Any

from app.config import get_settings
from app.models.search import (
    SearchQuery,
    SearchResult,
    SearchResultItem,
    SearchMode,
    GraphData,
)
from app.services.vector_store import VectorStore
from app.services.graph_store import GraphStore
from app.services.graphrag_adapter import GraphRAGAdapter

logger = logging.getLogger(__name__)


class HybridSearch:
    """
    Hybrid search combining vector search, graph search, and MS GraphRAG.

    Supports three search strategies:
    1. Vector Search (Milvus) - Real-time similarity search
    2. Graph Search (Neo4j) - Entity relationship traversal
    3. GraphRAG Search - Community-based global and entity-based local search
    """

    def __init__(
        self,
        vector_store: VectorStore,
        graph_store: GraphStore,
        graphrag_adapter: Optional[GraphRAGAdapter] = None,
    ):
        self.vector_store = vector_store
        self.graph_store = graph_store
        self.graphrag_adapter = graphrag_adapter
        self.settings = get_settings()

    def _rrf_fusion(
        self,
        vector_results: List[Dict[str, Any]],
        graph_results: List[Dict[str, Any]],
        k: int = 60,
    ) -> List[Dict[str, Any]]:
        """
        Reciprocal Rank Fusion (RRF) to combine results from multiple sources.
        RRF score = sum(1 / (k + rank)) for each result list
        """
        # Build score maps
        scores = {}
        items = {}

        # Process vector results
        for rank, item in enumerate(vector_results):
            item_id = item["id"]
            rrf_score = 1.0 / (k + rank + 1)
            scores[item_id] = scores.get(item_id, 0) + rrf_score
            if item_id not in items:
                items[item_id] = item.copy()
                items[item_id]["sources"] = ["vector"]
            else:
                items[item_id]["sources"].append("vector")

        # Process graph results
        for rank, item in enumerate(graph_results):
            item_id = item["id"]
            rrf_score = 1.0 / (k + rank + 1)
            scores[item_id] = scores.get(item_id, 0) + rrf_score
            if item_id not in items:
                items[item_id] = item.copy()
                items[item_id]["sources"] = ["graph"]
            else:
                items[item_id]["sources"].append("graph")

        # Sort by RRF score
        sorted_items = sorted(
            items.values(),
            key=lambda x: scores[x["id"]],
            reverse=True,
        )

        # Update scores
        for item in sorted_items:
            item["score"] = scores[item["id"]]
            item["source"] = "hybrid" if len(item.get("sources", [])) > 1 else item.get("sources", ["unknown"])[0]

        return sorted_items

    async def search(self, query: SearchQuery) -> SearchResult:
        """Perform hybrid search based on mode"""
        start_time = time.time()

        vector_results = []
        graph_results = []
        graph_data = None

        # Vector search
        if query.mode in [SearchMode.VECTOR, SearchMode.HYBRID]:
            vector_results = await self.vector_store.search(
                query=query.query,
                dataset_id=query.dataset_id,
                entity_types=query.entity_types,
                top_k=query.top_k * 2,  # Get more for fusion
            )

        # Graph search
        if query.mode in [SearchMode.GRAPH, SearchMode.HYBRID]:
            graph_results = self.graph_store.search_entities(
                query=query.query,
                dataset_id=query.dataset_id,
                entity_types=query.entity_types,
                limit=query.top_k * 2,
            )
            # Format graph results
            graph_results = [
                {
                    "id": r.get("id"),
                    "name": r.get("name"),
                    "type": r.get("type", "unknown"),
                    "description": r.get("description"),
                    "score": r.get("confidence", 1.0),
                    "source": "graph",
                }
                for r in graph_results
            ]

        # Combine results
        if query.mode == SearchMode.HYBRID:
            combined = self._rrf_fusion(
                vector_results,
                graph_results,
                k=self.settings.rrf_k,
            )
        elif query.mode == SearchMode.VECTOR:
            combined = vector_results
        else:
            combined = graph_results

        # Limit results
        combined = combined[: query.top_k]

        # Build result items
        result_items = []
        for item in combined:
            result_items.append(
                SearchResultItem(
                    id=item["id"],
                    type="entity",
                    name=item.get("name", ""),
                    description=item.get("description"),
                    score=item.get("score", 0.0),
                    source=item.get("source", "unknown"),
                    properties=item,
                )
            )

        # Get graph visualization data if requested
        if query.include_graph and result_items:
            # Get graph around top results
            top_entity_id = result_items[0].id
            graph_data = self.graph_store.get_entity_neighbors(
                entity_id=top_entity_id,
                max_depth=query.max_graph_depth,
                limit=50,
            )

        processing_time = (time.time() - start_time) * 1000

        return SearchResult(
            query=query.query,
            mode=query.mode,
            results=result_items,
            graph=graph_data,
            total_count=len(result_items),
            processing_time_ms=processing_time,
        )

    async def search_with_expansion(
        self,
        query: str,
        dataset_id: Optional[str] = None,
        top_k: int = 10,
        expansion_depth: int = 1,
    ) -> SearchResult:
        """Search with automatic graph expansion"""
        # Initial search
        search_query = SearchQuery(
            query=query,
            mode=SearchMode.HYBRID,
            dataset_id=dataset_id,
            top_k=top_k,
            include_graph=True,
            max_graph_depth=expansion_depth,
        )
        return await self.search(search_query)

    def get_connections(
        self,
        entity_id: str,
        max_depth: int = 2,
    ) -> GraphData:
        """Get entity connections for visualization"""
        return self.graph_store.get_entity_neighbors(
            entity_id=entity_id,
            max_depth=max_depth,
        )

    async def search_with_graphrag(
        self,
        query: str,
        dataset_id: Optional[str] = None,
        use_global: bool = True,
        use_local: bool = True,
        use_vector: bool = True,
        top_k: int = 10,
    ) -> Dict[str, Any]:
        """
        Advanced hybrid search combining Vector, Graph, and MS GraphRAG.

        This method implements a Three-Track RAG strategy:
        1. Vector Search (Milvus) - For real-time document similarity
        2. GraphRAG Global Search - For broad thematic questions (community summaries)
        3. GraphRAG Local Search - For specific entity-based questions

        Args:
            query: User query
            dataset_id: Target dataset ID
            use_global: Include GraphRAG global search
            use_local: Include GraphRAG local search
            use_vector: Include vector search
            top_k: Number of results to return

        Returns:
            Combined search results with context from all sources
        """
        start_time = time.time()

        results = {
            "query": query,
            "dataset_id": dataset_id,
            "vector_results": None,
            "global_context": None,
            "local_context": None,
            "combined_response": None,
            "sources": [],
        }

        # 1. Vector Search (real-time)
        if use_vector:
            try:
                vector_results = await self.vector_store.search(
                    query=query,
                    dataset_id=dataset_id,
                    top_k=top_k,
                )
                results["vector_results"] = vector_results
                results["sources"].append("vector")
            except Exception as e:
                logger.error(f"Vector search failed: {e}")

        # 2. GraphRAG Global Search (community summaries)
        if use_global and self.graphrag_adapter:
            try:
                adapter = self.graphrag_adapter
                if dataset_id:
                    adapter = GraphRAGAdapter(dataset_id=dataset_id)

                global_result = await adapter.global_search(query)
                results["global_context"] = global_result
                results["sources"].append("graphrag_global")
            except Exception as e:
                logger.error(f"GraphRAG global search failed: {e}")

        # 3. GraphRAG Local Search (entity-centric)
        if use_local and self.graphrag_adapter:
            try:
                adapter = self.graphrag_adapter
                if dataset_id:
                    adapter = GraphRAGAdapter(dataset_id=dataset_id)

                local_result = await adapter.local_search(query, top_k)
                results["local_context"] = local_result
                results["sources"].append("graphrag_local")
            except Exception as e:
                logger.error(f"GraphRAG local search failed: {e}")

        # Combine and synthesize results
        results["combined_response"] = self._synthesize_results(results)
        results["processing_time_ms"] = (time.time() - start_time) * 1000

        return results

    def _synthesize_results(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synthesize results from multiple search sources.

        Combines:
        - Vector search results (document chunks)
        - GraphRAG global context (community summaries)
        - GraphRAG local context (entity information)
        """
        synthesis = {
            "has_vector": results.get("vector_results") is not None,
            "has_global": results.get("global_context") is not None,
            "has_local": results.get("local_context") is not None,
            "context_pieces": [],
        }

        # Extract context from vector results
        if results.get("vector_results"):
            for item in results["vector_results"][:5]:
                synthesis["context_pieces"].append({
                    "type": "document",
                    "source": "vector",
                    "content": item.get("description") or item.get("content", ""),
                    "score": item.get("score", 0),
                })

        # Extract context from global search
        global_ctx = results.get("global_context")
        if global_ctx and not global_ctx.get("error"):
            synthesis["context_pieces"].append({
                "type": "community_summary",
                "source": "graphrag_global",
                "content": global_ctx.get("response", ""),
                "communities": global_ctx.get("communities_used", 0),
            })

        # Extract context from local search
        local_ctx = results.get("local_context")
        if local_ctx and not local_ctx.get("error"):
            synthesis["context_pieces"].append({
                "type": "entity_context",
                "source": "graphrag_local",
                "content": local_ctx.get("response", ""),
                "entities": local_ctx.get("entities", [])[:5],
                "relationships": local_ctx.get("relationships", [])[:5],
            })

        return synthesis

    async def graphrag_global_search(
        self,
        query: str,
        dataset_id: str = "default",
    ) -> Dict[str, Any]:
        """
        Direct access to MS GraphRAG global search.
        Uses community summaries for broad, thematic questions.
        """
        if not self.graphrag_adapter:
            return {"error": "GraphRAG adapter not configured"}

        adapter = GraphRAGAdapter(dataset_id=dataset_id)
        return await adapter.global_search(query)

    async def graphrag_local_search(
        self,
        query: str,
        dataset_id: str = "default",
        top_k: int = 10,
    ) -> Dict[str, Any]:
        """
        Direct access to MS GraphRAG local search.
        Uses entity-centric retrieval for specific questions.
        """
        if not self.graphrag_adapter:
            return {"error": "GraphRAG adapter not configured"}

        adapter = GraphRAGAdapter(dataset_id=dataset_id)
        return await adapter.local_search(query, top_k)
