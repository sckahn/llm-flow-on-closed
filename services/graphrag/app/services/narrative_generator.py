import logging
import time
import os
from typing import List, Dict, Any, Optional
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential
import asyncpg

from app.config import get_settings
from app.models.search import GraphData, GraphNode, GraphEdge, NarrativeResponse
from app.services.graph_store import GraphStore

logger = logging.getLogger(__name__)

# PostgreSQL connection settings (Dify database)
PG_HOST = os.getenv("DIFY_DB_HOST", "postgresql")
PG_PORT = int(os.getenv("DIFY_DB_PORT", "5432"))
PG_USER = os.getenv("DIFY_DB_USER", "postgres")
PG_PASSWORD = os.getenv("DIFY_DB_PASSWORD", "postgres_llmflow")
PG_DATABASE = os.getenv("DIFY_DB_NAME", "dify")

# Cache for document names
_doc_name_cache: Dict[str, str] = {}


async def get_document_names(doc_ids: List[str]) -> Dict[str, str]:
    """Fetch document names from PostgreSQL for given document IDs"""
    global _doc_name_cache

    # Filter out already cached IDs
    uncached_ids = [doc_id for doc_id in doc_ids if doc_id and doc_id not in _doc_name_cache]

    if uncached_ids:
        try:
            conn = await asyncpg.connect(
                host=PG_HOST,
                port=PG_PORT,
                user=PG_USER,
                password=PG_PASSWORD,
                database=PG_DATABASE,
            )
            try:
                rows = await conn.fetch("""
                    SELECT id::text, name FROM documents WHERE id::text = ANY($1)
                """, uncached_ids)
                for row in rows:
                    _doc_name_cache[row['id']] = row['name']
            finally:
                await conn.close()
        except Exception as e:
            logger.warning(f"Failed to fetch document names: {e}")

    return {doc_id: _doc_name_cache.get(doc_id, doc_id) for doc_id in doc_ids if doc_id}


def get_document_names_sync(doc_ids: List[str]) -> Dict[str, str]:
    """Synchronous wrapper for getting document names (uses cache only)"""
    global _doc_name_cache
    return {doc_id: _doc_name_cache.get(doc_id, doc_id[:20] + "...") for doc_id in doc_ids if doc_id}


NARRATIVE_PROMPT = """당신은 기업 사내 규정 상담사입니다. 아래 정보를 바탕으로 관련 규정을 정리해주세요.

관련 정보:
{graph_info}

질문: {question}

다음 형식으로 답변하세요:
1. 핵심 내용을 먼저 요약
2. 세부 규정이나 기준을 항목별로 정리
3. 관련 조항이나 참고사항 안내

- 전문적이고 사무적인 어조로 작성
- 불필요한 수식어나 이야기체 표현 금지
- 명확하고 간결하게 작성
- 한국어로 작성

답변:"""

ANSWER_WITH_CONTEXT_PROMPT = """당신은 기업 사내 규정 전문 상담사입니다. 질문에 대해 정확하고 명확하게 답변해주세요.

[참조 정보]
{graph_context}

[출처 문서]
{source_docs}

[질문]
{question}

[답변 작성 지침]
- 전문적이고 사무적인 어조 사용
- 핵심 내용 먼저 답변 후 세부사항 설명
- 관련 규정이나 기준은 항목별로 정리
- 불필요한 이야기체나 감정적 표현 금지
- 정보가 부족한 경우 "해당 내용은 제공된 문서에서 확인되지 않습니다"로 답변
- 마지막에 출처 문서명 표기

[답변]"""


class NarrativeGenerator:
    """Service for generating narrative explanations from graph data"""

    def __init__(self, graph_store: GraphStore):
        settings = get_settings()
        self.client = OpenAI(
            base_url=settings.llm_api_base,
            api_key=settings.llm_api_key,
        )
        self.model = settings.llm_model
        self.graph_store = graph_store

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def _call_llm(self, prompt: str) -> str:
        """Call LLM with retry logic"""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": "당신은 기업 사내 규정 전문 상담사입니다. 전문적이고 사무적인 어조로 "
                    "정확한 정보를 제공합니다. 불필요한 이야기체 표현이나 감정적 수식어를 사용하지 않습니다. "
                    "항상 한국어로 답변합니다."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1500,
        )
        return response.choices[0].message.content.strip()

    def _format_graph_info(self, graph: GraphData) -> str:
        """Format graph data for LLM prompt"""
        lines = []

        # Describe nodes
        lines.append("Entities:")
        for node in graph.nodes[:20]:  # Limit for prompt size
            lines.append(f"- {node.label} (Type: {node.type})")
            if node.properties.get("description"):
                lines.append(f"  Description: {node.properties['description'][:200]}")

        # Describe edges
        lines.append("\nRelationships:")
        node_map = {n.id: n.label for n in graph.nodes}
        for edge in graph.edges[:30]:  # Limit for prompt size
            source_name = node_map.get(edge.source, edge.source)
            target_name = node_map.get(edge.target, edge.target)
            lines.append(f"- {source_name} --[{edge.label}]--> {target_name}")
            if edge.properties.get("description"):
                lines.append(f"  ({edge.properties['description'][:100]})")

        return "\n".join(lines)

    def generate_narrative(
        self,
        graph: GraphData,
        question: Optional[str] = None,
    ) -> str:
        """Generate narrative explanation for graph data"""
        graph_info = self._format_graph_info(graph)
        context = question or "Explain these entities and their relationships"

        prompt = NARRATIVE_PROMPT.format(
            graph_info=graph_info,
            question=context,
        )

        try:
            return self._call_llm(prompt)
        except Exception as e:
            logger.error(f"Failed to generate narrative: {e}")
            return "내러티브 생성에 실패했습니다."

    async def _extract_source_docs(self, graph: GraphData) -> tuple[str, List[Dict[str, Any]]]:
        """Extract unique source documents from graph nodes with page info and document names"""
        doc_map = {}
        doc_ids = set()

        for node in graph.nodes:
            doc_id = node.properties.get("source_document_id")
            page_num = node.properties.get("source_page")
            if doc_id:
                doc_ids.add(doc_id)
                key = f"{doc_id}_{page_num}" if page_num else doc_id
                if key not in doc_map:
                    doc_map[key] = {
                        "id": doc_id,
                        "chunk_id": node.properties.get("source_chunk_id", ""),
                        "page": page_num,
                        "entity_name": node.label,
                        "entity_type": node.type,
                    }

        # Fetch document names
        doc_names = await get_document_names(list(doc_ids))

        sources = list(doc_map.values())

        # Add document names to sources
        for s in sources:
            s["document_name"] = doc_names.get(s["id"], s["id"])

        # Format for prompt with document names and page numbers
        if sources:
            doc_lines = []
            for s in sources[:5]:
                doc_name = s.get("document_name", s["id"])
                # Remove file extension for cleaner display
                if doc_name.endswith(".pdf"):
                    doc_name = doc_name[:-4]
                if s.get("page"):
                    doc_lines.append(f"- {doc_name} (p.{s['page']})")
                else:
                    doc_lines.append(f"- {doc_name}")
            source_docs_str = "\n".join(doc_lines)
        else:
            source_docs_str = "출처 문서 정보 없음"

        return source_docs_str, sources

    async def answer_question(
        self,
        question: str,
        graph: GraphData,
        cypher_query: Optional[str] = None,
    ) -> NarrativeResponse:
        """Answer a question using graph context and generate narrative"""
        start_time = time.time()

        # Format graph context
        graph_context = self._format_graph_info(graph)

        # Extract source documents with names
        source_docs_str, source_list = await self._extract_source_docs(graph)

        # Generate answer
        answer_prompt = ANSWER_WITH_CONTEXT_PROMPT.format(
            graph_context=graph_context,
            source_docs=source_docs_str,
            question=question,
        )

        try:
            answer = self._call_llm(answer_prompt)
        except Exception as e:
            logger.error(f"Failed to generate answer: {e}")
            answer = "답변을 생성할 수 없습니다."

        # Generate narrative (now in consultant style)
        narrative = self.generate_narrative(graph, question)

        processing_time = (time.time() - start_time) * 1000

        # Build doc_id to name mapping from source_list
        doc_names = {s["id"]: s.get("document_name", s["id"]) for s in source_list}

        # Format sources with document names and page numbers
        sources = []
        for node in graph.nodes[:10]:
            doc_id = node.properties.get("source_document_id", "")
            doc_name = doc_names.get(doc_id, doc_id)
            sources.append({
                "id": node.id,
                "name": node.label,
                "type": node.type,
                "description": node.properties.get("description", ""),
                "source_document_id": doc_id,
                "source_document_name": doc_name,
                "source_chunk_id": node.properties.get("source_chunk_id", ""),
                "source_page": node.properties.get("source_page"),
            })

        return NarrativeResponse(
            question=question,
            answer=answer,
            narrative=narrative,
            graph=graph,
            sources=sources,
            cypher_query=cypher_query,
            processing_time_ms=processing_time,
        )

    def generate_entity_story(
        self,
        entity_id: str,
        max_depth: int = 2,
    ) -> NarrativeResponse:
        """Generate a story about an entity and its connections"""
        start_time = time.time()

        # Get entity's graph
        graph = self.graph_store.get_entity_neighbors(
            entity_id=entity_id,
            max_depth=max_depth,
            limit=50,
        )

        if not graph.nodes:
            return NarrativeResponse(
                question=f"Tell me about entity {entity_id}",
                answer="해당 엔티티를 찾을 수 없습니다.",
                narrative="",
                graph=None,
                sources=[],
                processing_time_ms=(time.time() - start_time) * 1000,
            )

        # Find the center entity
        center_entity = None
        for node in graph.nodes:
            if node.id == entity_id:
                center_entity = node
                break

        question = f"'{center_entity.label if center_entity else entity_id}'에 대해 설명해주세요."

        # Generate narrative
        narrative = self.generate_narrative(graph, question)

        processing_time = (time.time() - start_time) * 1000

        return NarrativeResponse(
            question=question,
            answer=narrative,
            narrative=narrative,
            graph=graph,
            sources=[
                {"id": n.id, "name": n.label, "type": n.type}
                for n in graph.nodes[:10]
            ],
            processing_time_ms=processing_time,
        )

    def summarize_dataset(self, dataset_id: str) -> Dict[str, Any]:
        """Generate a summary of a dataset's knowledge graph"""
        start_time = time.time()

        # Get stats
        stats = self.graph_store.get_stats(dataset_id)

        # Get sample graph
        graph = self.graph_store.get_graph_by_dataset(dataset_id, limit=50)

        if not graph.nodes:
            return {
                "summary": "이 데이터셋에는 아직 그래프 데이터가 없습니다.",
                "stats": stats,
                "processing_time_ms": (time.time() - start_time) * 1000,
            }

        # Generate summary narrative
        summary_prompt = f"""Summarize this knowledge graph dataset:

Entity count: {stats.get('entity_count', 0)}
Relationship count: {stats.get('relationship_count', 0)}
Entity types: {', '.join(stats.get('entity_types', {}).keys())}

Sample entities and relationships:
{self._format_graph_info(graph)}

Write a 2-3 sentence summary in Korean about what this knowledge graph contains."""

        try:
            summary = self._call_llm(summary_prompt)
        except Exception as e:
            logger.error(f"Failed to summarize dataset: {e}")
            summary = f"이 지식 그래프에는 {stats.get('entity_count', 0)}개의 엔티티와 {stats.get('relationship_count', 0)}개의 관계가 있습니다."

        return {
            "summary": summary,
            "stats": stats,
            "sample_graph": graph,
            "processing_time_ms": (time.time() - start_time) * 1000,
        }
