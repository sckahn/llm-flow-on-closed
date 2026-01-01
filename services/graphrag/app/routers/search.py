from fastapi import APIRouter, HTTPException
from typing import Optional, List

from app.models.search import (
    SearchQuery,
    SearchResult,
    NaturalLanguageQuery,
    NarrativeResponse,
    ClarificationRequest,
    ClarificationOption,
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


async def extract_document_context(question: str) -> Optional[str]:
    """Extract document/product context from question and return matching document ID"""
    import asyncpg
    import os

    # Product keywords to document name patterns
    product_patterns = {
        '변액연금': '변액연금보험',
        '변액적립': '변액적립보험',
        '즉시연금': '즉시연금보험',
        '월지급': '월지급식',
        '종신': '종신보험',
        '건강': '건강보험',
    }

    # Find matching product in question
    matched_pattern = None
    for keyword, pattern in product_patterns.items():
        if keyword in question:
            matched_pattern = pattern
            break

    if not matched_pattern:
        return None

    # Find document ID from database
    try:
        conn = await asyncpg.connect(
            host=os.getenv("DIFY_DB_HOST", "postgresql"),
            port=int(os.getenv("DIFY_DB_PORT", "5432")),
            user=os.getenv("DIFY_DB_USER", "llmflow"),
            password=os.getenv("DIFY_DB_PASSWORD", "postgres_llmflow"),
            database=os.getenv("DIFY_DB_NAME", "dify"),
        )
        try:
            row = await conn.fetchrow(
                "SELECT id::text FROM documents WHERE name ILIKE $1 LIMIT 1",
                f"%{matched_pattern}%"
            )
            return row['id'] if row else None
        finally:
            await conn.close()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to extract document context: {e}")
        return None


# Common topics that exist across multiple insurance documents
COMMON_INSURANCE_TOPICS = [
    '보험금', '지급', '지급사유', '보장', '특약', '납입', '해지',
    '청구', '보험료', '계약', '가입', '만기', '수익자', '피보험자',
    '보험기간', '면책', '부담보', '갱신', '전환', '중도인출',
]


def needs_document_clarification(question: str, doc_context: Optional[str]) -> bool:
    """Check if the question is about a common topic and needs document clarification"""
    if doc_context:
        # Document context already specified
        return False

    # Check if question contains common insurance topics
    for topic in COMMON_INSURANCE_TOPICS:
        if topic in question:
            return True

    return False


async def get_available_documents(dataset_id: Optional[str] = None) -> List[ClarificationOption]:
    """Get list of available insurance documents for clarification"""
    import asyncpg
    import os

    try:
        conn = await asyncpg.connect(
            host=os.getenv("DIFY_DB_HOST", "postgresql"),
            port=int(os.getenv("DIFY_DB_PORT", "5432")),
            user=os.getenv("DIFY_DB_USER", "llmflow"),
            password=os.getenv("DIFY_DB_PASSWORD", "postgres_llmflow"),
            database=os.getenv("DIFY_DB_NAME", "dify"),
        )
        try:
            # Get documents with insurance-related names
            query = """
                SELECT id::text, name
                FROM documents
                WHERE name ILIKE '%보험%' OR name ILIKE '%연금%'
                ORDER BY name
                LIMIT 10
            """
            rows = await conn.fetch(query)
            return [
                ClarificationOption(
                    document_id=row['id'],
                    document_name=row['name'],
                    description=None
                )
                for row in rows
            ]
        finally:
            await conn.close()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to get available documents: {e}")
        return []


@router.post("/nl-query", response_model=NarrativeResponse)
async def natural_language_query(query: NaturalLanguageQuery):
    """Process natural language query and return narrative response"""
    try:
        import time
        start_time = time.time()

        # Use explicitly provided document_id or extract from question
        doc_context = query.document_id
        if not doc_context:
            doc_context = await extract_document_context(query.question)

        # Check if clarification is needed (common topic without document context)
        # Skip if document_id was explicitly provided in query
        if not query.document_id and needs_document_clarification(query.question, doc_context):
            available_docs = await get_available_documents(query.dataset_id)
            if available_docs:
                processing_time = (time.time() - start_time) * 1000
                return NarrativeResponse(
                    question=query.question,
                    answer="",
                    narrative="",
                    graph=None,
                    sources=[],
                    cypher_query=None,
                    processing_time_ms=processing_time,
                    needs_clarification=True,
                    clarification=ClarificationRequest(
                        message="어떤 보험 상품에 대해 질문하시는 건가요? 아래에서 선택해 주세요.",
                        options=available_docs
                    )
                )

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
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Hybrid search failed: {e}")

        # Additional fallback: direct Neo4j text search
        if not graph or (not graph.nodes):
            try:
                import re
                # Extract keywords from question (remove common question words)
                question_text = query.question
                # Remove common Korean question patterns
                question_text = re.sub(r'(이란|란|가|는|을|를|에|의|로|으로|에서|하다|입니까|인가요|인가|입니다|무엇|어떻게|어디|언제|왜|뭐|뭔가요|\?)', ' ', question_text)
                # Clean up whitespace
                keywords = [k.strip() for k in question_text.split() if len(k.strip()) >= 2]

                text_results = []
                # Try searching with different keyword combinations
                for keyword in keywords[:3]:  # Try top 3 keywords
                    results = graph_store.search_entities(
                        query=keyword,
                        dataset_id=query.dataset_id,
                        source_document_id=doc_context,  # Filter by document context
                        limit=5,
                    )
                    text_results.extend(results)
                    if results:
                        break  # Found results, stop searching

                if text_results:
                    # Get graph from first result
                    first_entity_id = text_results[0].get("id")
                    if first_entity_id:
                        graph = graph_store.get_entity_neighbors(
                            entity_id=first_entity_id,
                            max_depth=2,
                            limit=50,
                        )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Neo4j text search failed: {e}")

        # Last resort: get dataset graph if dataset_id provided
        if (not graph or not graph.nodes) and query.dataset_id:
            try:
                graph = graph_store.get_graph_by_dataset(
                    dataset_id=query.dataset_id,
                    limit=50,
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Dataset graph fallback failed: {e}")

        # Generate narrative if requested
        if query.include_narrative and graph and graph.nodes:
            response = await narrative_generator.answer_question(
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
