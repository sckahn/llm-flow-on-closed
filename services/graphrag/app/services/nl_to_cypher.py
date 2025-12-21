import json
import logging
import time
from typing import List, Dict, Any, Optional
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.services.graph_store import GraphStore

logger = logging.getLogger(__name__)

NL_TO_CYPHER_PROMPT = """You are an expert at converting natural language questions to Neo4j Cypher queries.

Schema Information:
- Node label: Entity
- Node properties: id, name, type, description, aliases, dataset_id, source_document_id, confidence
- Entity types: person, organization, location, date, concept, product, event, technology, document, topic, other
- Relationship type: RELATES_TO
- Relationship properties: type, description, weight, confidence

Available relationship types in the 'type' property:
RELATED_TO, MENTIONS, WORKS_FOR, LOCATED_IN, PART_OF, CREATED_BY, BELONGS_TO, DEPENDS_ON, SIMILAR_TO, CAUSED_BY, LEADS_TO, CONTAINS, USES, IS_A, HAS, ABOUT, OTHER

Convert the following natural language question to a Cypher query.

Question: {question}
{dataset_filter}

Return ONLY a valid Cypher query, no explanation:"""

CYPHER_EXAMPLES = """
Examples:
- "Show me all people" → MATCH (e:Entity) WHERE e.type = 'person' RETURN e LIMIT 50
- "Find documents about AI" → MATCH (e:Entity) WHERE e.type = 'document' AND (e.name CONTAINS 'AI' OR e.description CONTAINS 'AI') RETURN e LIMIT 50
- "What is connected to X?" → MATCH (e:Entity)-[r]-(other:Entity) WHERE e.name CONTAINS 'X' RETURN e, r, other LIMIT 100
- "Show relationships between A and B" → MATCH path = (a:Entity)-[*1..3]-(b:Entity) WHERE a.name CONTAINS 'A' AND b.name CONTAINS 'B' RETURN path LIMIT 50
"""


class NLToCypher:
    """Service for converting natural language to Cypher queries"""

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
                    "content": "You are an expert at converting natural language to Cypher queries. "
                    "Return only valid Cypher queries, no explanation."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=500,
        )
        return response.choices[0].message.content.strip()

    def _clean_cypher(self, cypher: str) -> str:
        """Clean and validate Cypher query"""
        # Remove markdown code blocks
        cypher = cypher.strip()
        if cypher.startswith("```cypher"):
            cypher = cypher[9:]
        if cypher.startswith("```"):
            cypher = cypher[3:]
        if cypher.endswith("```"):
            cypher = cypher[:-3]
        cypher = cypher.strip()

        # Basic safety check - prevent destructive operations
        dangerous_keywords = ["DELETE", "REMOVE", "DROP", "CREATE", "SET", "MERGE"]
        cypher_upper = cypher.upper()
        for keyword in dangerous_keywords:
            if keyword in cypher_upper:
                logger.warning(f"Blocked potentially dangerous Cypher: {cypher}")
                return None

        return cypher

    def convert(
        self,
        question: str,
        dataset_id: Optional[str] = None,
    ) -> Optional[str]:
        """Convert natural language question to Cypher query"""
        dataset_filter = ""
        if dataset_id:
            dataset_filter = f"Filter by dataset_id: {dataset_id}"

        prompt = NL_TO_CYPHER_PROMPT.format(
            question=question,
            dataset_filter=dataset_filter,
        ) + CYPHER_EXAMPLES

        try:
            cypher = self._call_llm(prompt)
            return self._clean_cypher(cypher)
        except Exception as e:
            logger.error(f"Failed to convert NL to Cypher: {e}")
            return None

    def execute_nl_query(
        self,
        question: str,
        dataset_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Convert and execute natural language query"""
        start_time = time.time()

        cypher = self.convert(question, dataset_id)
        if not cypher:
            return {
                "success": False,
                "error": "Failed to generate valid Cypher query",
                "question": question,
                "cypher": None,
                "results": [],
                "processing_time_ms": (time.time() - start_time) * 1000,
            }

        try:
            results = self.graph_store.execute_cypher(cypher)
            processing_time = (time.time() - start_time) * 1000

            return {
                "success": True,
                "question": question,
                "cypher": cypher,
                "results": results,
                "result_count": len(results),
                "processing_time_ms": processing_time,
            }
        except Exception as e:
            logger.error(f"Failed to execute Cypher: {e}")
            return {
                "success": False,
                "error": str(e),
                "question": question,
                "cypher": cypher,
                "results": [],
                "processing_time_ms": (time.time() - start_time) * 1000,
            }

    def suggest_queries(
        self,
        dataset_id: Optional[str] = None,
    ) -> List[str]:
        """Suggest example queries based on graph content"""
        # Get some entity types from the graph
        stats = self.graph_store.get_stats(dataset_id)
        entity_types = list(stats.get("entity_types", {}).keys())[:5]

        suggestions = [
            "모든 사람 보여줘",
            "이 문서와 관련된 개념들은?",
        ]

        if "person" in entity_types:
            suggestions.append("누가 누구와 일하나요?")
        if "organization" in entity_types:
            suggestions.append("어떤 조직들이 있나요?")
        if "technology" in entity_types:
            suggestions.append("사용된 기술들을 보여줘")
        if "document" in entity_types:
            suggestions.append("가장 많이 연결된 문서는?")

        return suggestions
