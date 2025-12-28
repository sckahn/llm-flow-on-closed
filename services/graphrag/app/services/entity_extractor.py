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

ENTITY_EXTRACTION_PROMPT = """You are an expert at extracting entities from Korean insurance/financial documents.
Extract ALL entities from the following text, including:
- Organizations (companies, associations, government agencies)
- Products (insurance products, financial products, services)
- Concepts (terms, conditions, clauses, legal terms)
- Documents (contracts, agreements, regulations, laws)
- Locations, dates, people if mentioned

Be thorough - extract every named entity, term, and concept that could be useful for understanding the document.

For each entity, provide:
- name: The exact entity name as it appears in text
- type: One of [person, organization, location, date, concept, product, event, technology, document, topic, other]
- description: Brief description of what this entity is or does
- aliases: Alternative names or abbreviations (if any)

Return a JSON array with ALL entities found. Aim to extract at least 10-20 entities per text chunk.

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
            timeout=3600.0,  # 1 hour timeout per request
        )
        self.model = settings.llm_model

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def _call_llm(self, prompt: str) -> str:
        """Call LLM with retry logic"""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts structured information from Korean text. Always respond with valid JSON only. Be thorough in extraction."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=1500,
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

            # Extract FIRST complete JSON array (handle extra text after it)
            start_idx = response.find('[')
            if start_idx != -1:
                # Find matching closing bracket by counting depth
                depth = 0
                end_idx = -1
                for i, char in enumerate(response[start_idx:], start=start_idx):
                    if char == '[':
                        depth += 1
                    elif char == ']':
                        depth -= 1
                        if depth == 0:
                            end_idx = i
                            break
                if end_idx != -1:
                    response = response[start_idx:end_idx + 1]

            data = json.loads(response)

            # Build entity map with multiple matching strategies
            entity_map = {}
            for e in entities:
                entity_map[e.name.lower()] = e
                entity_map[e.name.lower().strip()] = e
                # Also add without special characters
                clean_name = ''.join(c for c in e.name.lower() if c.isalnum() or c.isspace())
                entity_map[clean_name] = e

            relationships = []

            for item in data:
                source_name = item.get("source", "").lower().strip()
                target_name = item.get("target", "").lower().strip()

                # Try exact match first
                source_entity = entity_map.get(source_name)
                target_entity = entity_map.get(target_name)

                # Try fuzzy match if exact match fails
                if not source_entity:
                    for key, entity in entity_map.items():
                        if source_name in key or key in source_name:
                            source_entity = entity
                            break

                if not target_entity:
                    for key, entity in entity_map.items():
                        if target_name in key or key in target_name:
                            target_entity = entity
                            break

                if source_entity and target_entity:
                    rel = Relationship(
                        source_entity_id=source_entity.id or source_name,
                        target_entity_id=target_entity.id or target_name,
                        source_entity_name=item.get("source"),
                        target_entity_name=item.get("target"),
                        type=self._map_relationship_type(item.get("type", "RELATED_TO")),
                        description=item.get("description"),
                    )
                    relationships.append(rel)
                else:
                    logger.debug(f"Could not match entities for relationship: {source_name} -> {target_name}")

            logger.info(f"Parsed {len(relationships)} relationships from {len(data)} items")
            return relationships
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse relationship response: {e}")
            logger.debug(f"Response was: {response[:500]}...")
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

        prompt = ENTITY_EXTRACTION_PROMPT.format(text=text[:4000])  # Limit text length for 8K context model
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

        entity_list = ", ".join([f"{e.name} ({e.type})" for e in entities[:20]])  # Limit entities
        prompt = RELATIONSHIP_EXTRACTION_PROMPT.format(
            entities=entity_list,
            text=text[:1500],
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
