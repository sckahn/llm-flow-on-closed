import json
import time
import logging
from typing import List, Optional, Tuple
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.models.entity import Entity, EntityType, EntityExtractionResponse
from app.models.relationship import Relationship, RelationshipType, RelationshipExtractionResponse

logger = logging.getLogger(__name__)

ENTITY_EXTRACTION_PROMPT = """You are an expert at extracting entities from text.
Extract all important entities from the following text.

For each entity, provide:
- name: The entity name
- type: One of [person, organization, location, date, concept, product, event, technology, document, topic, other]
- description: Brief description of the entity
- aliases: Alternative names or abbreviations (if any)

Return a JSON array of entities.

Text:
{text}

Return ONLY valid JSON array, no other text:"""

RELATIONSHIP_EXTRACTION_PROMPT = """You are an expert at identifying relationships between entities.
Given the text and a list of entities, identify relationships between them.

For each relationship, provide:
- source: Source entity name
- target: Target entity name
- type: One of [RELATED_TO, MENTIONS, WORKS_FOR, LOCATED_IN, PART_OF, CREATED_BY, BELONGS_TO, DEPENDS_ON, SIMILAR_TO, CAUSED_BY, LEADS_TO, CONTAINS, USES, IS_A, HAS, ABOUT, OTHER]
- description: Brief description of the relationship

Entities found in text:
{entities}

Text:
{text}

Return ONLY valid JSON array of relationships, no other text:"""


class EntityExtractor:
    """Service for extracting entities and relationships using LLM"""

    def __init__(self):
        settings = get_settings()
        self.client = OpenAI(
            base_url=settings.llm_api_base,
            api_key=settings.llm_api_key,
        )
        self.model = settings.llm_model

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def _call_llm(self, prompt: str) -> str:
        """Call LLM with retry logic"""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts structured information from text. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=2000,
        )
        return response.choices[0].message.content.strip()

    def _parse_entities(self, response: str) -> List[Entity]:
        """Parse LLM response into Entity objects"""
        try:
            # Clean response - extract JSON array
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.startswith("```"):
                response = response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()

            data = json.loads(response)
            entities = []
            for item in data:
                entity = Entity(
                    name=item.get("name", ""),
                    type=self._map_entity_type(item.get("type", "other")),
                    description=item.get("description"),
                    aliases=item.get("aliases", []),
                )
                if entity.name:
                    entities.append(entity)
            return entities
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse entity response: {e}")
            logger.debug(f"Response was: {response}")
            return []

    def _map_entity_type(self, type_str: str) -> EntityType:
        """Map string to EntityType enum"""
        type_str = type_str.lower().strip()
        type_mapping = {
            "person": EntityType.PERSON,
            "organization": EntityType.ORGANIZATION,
            "location": EntityType.LOCATION,
            "date": EntityType.DATE,
            "concept": EntityType.CONCEPT,
            "product": EntityType.PRODUCT,
            "event": EntityType.EVENT,
            "technology": EntityType.TECHNOLOGY,
            "document": EntityType.DOCUMENT,
            "topic": EntityType.TOPIC,
        }
        return type_mapping.get(type_str, EntityType.OTHER)

    def _parse_relationships(self, response: str, entities: List[Entity]) -> List[Relationship]:
        """Parse LLM response into Relationship objects"""
        try:
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.startswith("```"):
                response = response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()

            data = json.loads(response)
            entity_map = {e.name.lower(): e for e in entities}
            relationships = []

            for item in data:
                source_name = item.get("source", "").lower()
                target_name = item.get("target", "").lower()

                if source_name in entity_map and target_name in entity_map:
                    rel = Relationship(
                        source_entity_id=entity_map[source_name].id or source_name,
                        target_entity_id=entity_map[target_name].id or target_name,
                        source_entity_name=item.get("source"),
                        target_entity_name=item.get("target"),
                        type=self._map_relationship_type(item.get("type", "RELATED_TO")),
                        description=item.get("description"),
                    )
                    relationships.append(rel)
            return relationships
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse relationship response: {e}")
            return []

    def _map_relationship_type(self, type_str: str) -> RelationshipType:
        """Map string to RelationshipType enum"""
        type_str = type_str.upper().strip()
        try:
            return RelationshipType(type_str)
        except ValueError:
            return RelationshipType.RELATED_TO

    def extract_entities(
        self,
        text: str,
        document_id: Optional[str] = None,
        chunk_id: Optional[str] = None,
    ) -> EntityExtractionResponse:
        """Extract entities from text"""
        start_time = time.time()

        prompt = ENTITY_EXTRACTION_PROMPT.format(text=text[:4000])  # Limit text length
        response = self._call_llm(prompt)
        entities = self._parse_entities(response)

        # Set source references
        for entity in entities:
            entity.source_document_id = document_id
            entity.source_chunk_id = chunk_id

        processing_time = (time.time() - start_time) * 1000

        return EntityExtractionResponse(
            entities=entities,
            text=text,
            processing_time_ms=processing_time,
        )

    def extract_relationships(
        self,
        text: str,
        entities: List[Entity],
        document_id: Optional[str] = None,
    ) -> RelationshipExtractionResponse:
        """Extract relationships between entities"""
        start_time = time.time()

        if not entities:
            return RelationshipExtractionResponse(
                relationships=[],
                processing_time_ms=0,
            )

        entity_list = ", ".join([f"{e.name} ({e.type})" for e in entities])
        prompt = RELATIONSHIP_EXTRACTION_PROMPT.format(
            entities=entity_list,
            text=text[:4000],
        )

        response = self._call_llm(prompt)
        relationships = self._parse_relationships(response, entities)

        # Set source references
        for rel in relationships:
            rel.source_document_id = document_id

        processing_time = (time.time() - start_time) * 1000

        return RelationshipExtractionResponse(
            relationships=relationships,
            processing_time_ms=processing_time,
        )

    def extract_all(
        self,
        text: str,
        document_id: Optional[str] = None,
        chunk_id: Optional[str] = None,
    ) -> Tuple[EntityExtractionResponse, RelationshipExtractionResponse]:
        """Extract both entities and relationships"""
        entity_response = self.extract_entities(text, document_id, chunk_id)
        relationship_response = self.extract_relationships(
            text, entity_response.entities, document_id
        )
        return entity_response, relationship_response
