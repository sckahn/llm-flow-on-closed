import logging
import time
from typing import List, Dict, Any, Optional
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.models.search import GraphData, GraphNode, GraphEdge, NarrativeResponse
from app.services.graph_store import GraphStore

logger = logging.getLogger(__name__)

NARRATIVE_PROMPT = """You are an expert at explaining complex graph relationships in simple, story-like language.

Given the following graph data, create a narrative explanation that a non-technical person can understand.

Graph Information:
{graph_info}

Question/Context: {question}

Write a clear, engaging narrative that:
1. Explains the main entities and their roles
2. Describes how they are connected
3. Highlights key relationships and patterns
4. Uses simple language and avoids technical jargon
5. Tells a coherent story

Write in Korean (한국어). Keep it concise but informative (2-4 paragraphs).

Narrative:"""

ANSWER_WITH_CONTEXT_PROMPT = """You are a helpful assistant that answers questions using knowledge graph information.

Graph Context:
{graph_context}

Question: {question}

Provide a clear, accurate answer based on the graph information. If the information is not sufficient, say so.
Write in Korean (한국어).

Answer:"""


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
                    "content": "You are a helpful assistant that explains complex information in simple, "
                    "story-like language. Always respond in Korean (한국어)."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=1000,
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

    def answer_question(
        self,
        question: str,
        graph: GraphData,
        cypher_query: Optional[str] = None,
    ) -> NarrativeResponse:
        """Answer a question using graph context and generate narrative"""
        start_time = time.time()

        # Format graph context
        graph_context = self._format_graph_info(graph)

        # Generate answer
        answer_prompt = ANSWER_WITH_CONTEXT_PROMPT.format(
            graph_context=graph_context,
            question=question,
        )

        try:
            answer = self._call_llm(answer_prompt)
        except Exception as e:
            logger.error(f"Failed to generate answer: {e}")
            answer = "답변을 생성할 수 없습니다."

        # Generate narrative
        narrative = self.generate_narrative(graph, question)

        processing_time = (time.time() - start_time) * 1000

        # Format sources from graph nodes
        sources = [
            {
                "id": node.id,
                "name": node.label,
                "type": node.type,
                "description": node.properties.get("description", ""),
            }
            for node in graph.nodes[:10]
        ]

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
