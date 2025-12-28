import logging
from typing import List, Optional, Dict, Any
from neo4j import GraphDatabase, Driver
from neo4j.exceptions import Neo4jError
from neo4j.time import DateTime as Neo4jDateTime

from app.config import get_settings
from app.models.entity import Entity
from app.models.relationship import Relationship
from app.models.search import GraphNode, GraphEdge, GraphData

logger = logging.getLogger(__name__)


def _serialize_neo4j_value(value: Any) -> Any:
    """Convert Neo4j types to JSON-serializable types"""
    if isinstance(value, Neo4jDateTime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _serialize_neo4j_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize_neo4j_value(v) for v in value]
    return value


class GraphStore:
    """Service for Neo4j graph database operations"""

    def __init__(self):
        settings = get_settings()
        self.driver: Driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        self._ensure_constraints()

    def _ensure_constraints(self):
        """Create necessary constraints and indexes"""
        constraints = [
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
            "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)",
            "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)",
            "CREATE INDEX entity_dataset IF NOT EXISTS FOR (e:Entity) ON (e.dataset_id)",
        ]
        with self.driver.session() as session:
            for constraint in constraints:
                try:
                    session.run(constraint)
                except Neo4jError as e:
                    logger.debug(f"Constraint/index may already exist: {e}")

    def close(self):
        """Close the driver connection"""
        self.driver.close()

    def create_entity(self, entity: Entity, dataset_id: str) -> str:
        """Create an entity node in Neo4j"""
        query = """
        MERGE (e:Entity {id: $id})
        SET e.name = $name,
            e.type = $type,
            e.description = $description,
            e.aliases = $aliases,
            e.properties = $properties,
            e.source_document_id = $source_document_id,
            e.source_chunk_id = $source_chunk_id,
            e.confidence = $confidence,
            e.dataset_id = $dataset_id,
            e.updated_at = datetime()
        RETURN e.id as id
        """
        with self.driver.session() as session:
            result = session.run(
                query,
                id=entity.id or f"{dataset_id}_{entity.name}",
                name=entity.name,
                type=entity.type,
                description=entity.description,
                aliases=entity.aliases,
                properties=str(entity.properties),
                source_document_id=entity.source_document_id,
                source_chunk_id=entity.source_chunk_id,
                confidence=entity.confidence,
                dataset_id=dataset_id,
            )
            record = result.single()
            return record["id"] if record else None

    def create_entities_batch(self, entities: List[Entity], dataset_id: str) -> List[str]:
        """Create multiple entities in batch"""
        query = """
        UNWIND $entities as entity
        MERGE (e:Entity {id: entity.id})
        SET e.name = entity.name,
            e.type = entity.type,
            e.description = entity.description,
            e.aliases = entity.aliases,
            e.properties = entity.properties,
            e.source_document_id = entity.source_document_id,
            e.source_chunk_id = entity.source_chunk_id,
            e.confidence = entity.confidence,
            e.dataset_id = $dataset_id,
            e.updated_at = datetime()
        RETURN e.id as id
        """
        entity_data = []
        for e in entities:
            entity_data.append({
                "id": e.id or f"{dataset_id}_{e.name}",
                "name": e.name,
                "type": e.type,
                "description": e.description,
                "aliases": e.aliases,
                "properties": str(e.properties),
                "source_document_id": e.source_document_id,
                "source_chunk_id": e.source_chunk_id,
                "confidence": e.confidence,
            })

        with self.driver.session() as session:
            result = session.run(query, entities=entity_data, dataset_id=dataset_id)
            return [record["id"] for record in result]

    def create_relationship(self, relationship: Relationship, dataset_id: str) -> str:
        """Create a relationship between entities"""
        query = """
        MATCH (source:Entity {id: $source_id})
        MATCH (target:Entity {id: $target_id})
        MERGE (source)-[r:RELATES_TO {id: $rel_id}]->(target)
        SET r.type = $type,
            r.description = $description,
            r.properties = $properties,
            r.weight = $weight,
            r.source_document_id = $source_document_id,
            r.confidence = $confidence,
            r.dataset_id = $dataset_id,
            r.updated_at = datetime()
        RETURN r.id as id
        """
        rel_id = relationship.id or f"{relationship.source_entity_id}_{relationship.target_entity_id}_{relationship.type}"

        with self.driver.session() as session:
            result = session.run(
                query,
                source_id=relationship.source_entity_id,
                target_id=relationship.target_entity_id,
                rel_id=rel_id,
                type=relationship.type,
                description=relationship.description,
                properties=str(relationship.properties),
                weight=relationship.weight,
                source_document_id=relationship.source_document_id,
                confidence=relationship.confidence,
                dataset_id=dataset_id,
            )
            record = result.single()
            return record["id"] if record else None

    def create_relationships_batch(self, relationships: List[Relationship], dataset_id: str) -> List[str]:
        """Create multiple relationships in batch"""
        # Match by entity name within the same dataset (more reliable than ID matching)
        query = """
        UNWIND $relationships as rel
        MATCH (source:Entity {dataset_id: $dataset_id})
        WHERE toLower(source.name) = toLower(rel.source_name)
        MATCH (target:Entity {dataset_id: $dataset_id})
        WHERE toLower(target.name) = toLower(rel.target_name)
        MERGE (source)-[r:RELATES_TO {id: rel.id}]->(target)
        SET r.type = rel.type,
            r.description = rel.description,
            r.properties = rel.properties,
            r.weight = rel.weight,
            r.source_document_id = rel.source_document_id,
            r.confidence = rel.confidence,
            r.dataset_id = $dataset_id,
            r.updated_at = datetime()
        RETURN r.id as id
        """
        rel_data = []
        for r in relationships:
            source_name = r.source_entity_name or r.source_entity_id
            target_name = r.target_entity_name or r.target_entity_id
            rel_data.append({
                "id": r.id or f"{source_name}_{target_name}_{r.type}",
                "source_name": source_name,
                "target_name": target_name,
                "type": r.type,
                "description": r.description,
                "properties": str(r.properties),
                "weight": r.weight,
                "source_document_id": r.source_document_id,
                "confidence": r.confidence,
            })

        with self.driver.session() as session:
            result = session.run(query, relationships=rel_data, dataset_id=dataset_id)
            return [record["id"] for record in result]

    def get_entity(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Get an entity by ID"""
        query = """
        MATCH (e:Entity {id: $id})
        RETURN e
        """
        with self.driver.session() as session:
            result = session.run(query, id=entity_id)
            record = result.single()
            if record:
                return dict(record["e"])
            return None

    def search_entities(
        self,
        query: str,
        dataset_id: Optional[str] = None,
        entity_types: Optional[List[str]] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Search entities by name or description"""
        cypher = """
        MATCH (e:Entity)
        WHERE (e.name CONTAINS $search_text OR e.description CONTAINS $search_text)
        """
        params = {"search_text": query, "limit": limit}

        if dataset_id:
            cypher += " AND e.dataset_id = $dataset_id"
            params["dataset_id"] = dataset_id

        if entity_types:
            cypher += " AND e.type IN $entity_types"
            params["entity_types"] = entity_types

        cypher += """
        RETURN e
        ORDER BY e.confidence DESC
        LIMIT $limit
        """

        with self.driver.session() as session:
            result = session.run(cypher, parameters=params)
            return [dict(record["e"]) for record in result]

    def get_entity_neighbors(
        self,
        entity_id: str,
        max_depth: int = 2,
        limit: int = 50,
    ) -> GraphData:
        """Get entity and its neighbors up to max_depth"""
        # Note: Neo4j doesn't allow parameters in relationship depth, so we construct the query
        query = f"""
        MATCH path = (start:Entity {{id: $entity_id}})-[r*1..{max_depth}]-(neighbor:Entity)
        WITH start, neighbor, relationships(path) as rels, length(path) as depth
        ORDER BY depth
        LIMIT $limit
        RETURN DISTINCT start, neighbor, rels
        """
        nodes = {}
        edges = []

        with self.driver.session() as session:
            result = session.run(query, entity_id=entity_id, limit=limit)

            for record in result:
                # Add start node
                start = _serialize_neo4j_value(dict(record["start"]))
                if start["id"] not in nodes:
                    nodes[start["id"]] = GraphNode(
                        id=start["id"],
                        label=start["name"],
                        type=start.get("type", "unknown"),
                        properties=start,
                    )

                # Add neighbor node
                neighbor = _serialize_neo4j_value(dict(record["neighbor"]))
                if neighbor["id"] not in nodes:
                    nodes[neighbor["id"]] = GraphNode(
                        id=neighbor["id"],
                        label=neighbor["name"],
                        type=neighbor.get("type", "unknown"),
                        properties=neighbor,
                    )

                # Add edges - use entity IDs, not Neo4j element IDs
                for rel in record["rels"]:
                    # Get the actual entity IDs from the relationship's start/end nodes
                    start_node_id = dict(rel.start_node).get("id", str(rel.start_node.element_id))
                    end_node_id = dict(rel.end_node).get("id", str(rel.end_node.element_id))
                    edge_id = f"{start_node_id}_{end_node_id}_{rel.get('type', 'RELATES_TO')}"
                    edges.append(GraphEdge(
                        id=edge_id,
                        source=start_node_id,
                        target=end_node_id,
                        label=rel.get("type", "RELATES_TO"),
                        type=rel.get("type", "RELATES_TO"),
                        weight=rel.get("weight", 1.0),
                        properties=_serialize_neo4j_value(dict(rel)),
                    ))

        return GraphData(
            nodes=list(nodes.values()),
            edges=edges,
            metadata={"center_entity": entity_id, "max_depth": max_depth},
        )

    def get_graph_by_dataset(
        self,
        dataset_id: str,
        limit: int = 100,
    ) -> GraphData:
        """Get graph data for a dataset"""
        node_query = """
        MATCH (e:Entity {dataset_id: $dataset_id})
        RETURN e
        LIMIT $limit
        """
        edge_query = """
        MATCH (e1:Entity {dataset_id: $dataset_id})-[r]->(e2:Entity {dataset_id: $dataset_id})
        RETURN e1.id as source, e2.id as target, r
        LIMIT $limit
        """
        nodes = []
        edges = []

        with self.driver.session() as session:
            # Get nodes
            result = session.run(node_query, dataset_id=dataset_id, limit=limit)
            for record in result:
                e = _serialize_neo4j_value(dict(record["e"]))
                nodes.append(GraphNode(
                    id=e["id"],
                    label=e["name"],
                    type=e.get("type", "unknown"),
                    properties=e,
                ))

            # Get edges
            result = session.run(edge_query, dataset_id=dataset_id, limit=limit)
            for record in result:
                rel = _serialize_neo4j_value(dict(record["r"]))
                edges.append(GraphEdge(
                    id=f"{record['source']}_{record['target']}",
                    source=record["source"],
                    target=record["target"],
                    label=rel.get("type", "RELATES_TO"),
                    type=rel.get("type", "RELATES_TO"),
                    weight=rel.get("weight", 1.0),
                    properties=rel,
                ))

        return GraphData(
            nodes=nodes,
            edges=edges,
            metadata={"dataset_id": dataset_id},
        )

    def execute_cypher(self, query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Execute a raw Cypher query"""
        with self.driver.session() as session:
            result = session.run(query, **(params or {}))
            return [dict(record) for record in result]

    def get_stats(self, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        """Get graph statistics"""
        if dataset_id:
            entity_query = "MATCH (e:Entity {dataset_id: $dataset_id}) RETURN count(e) as count"
            rel_query = """
            MATCH (e1:Entity {dataset_id: $dataset_id})-[r]->(e2:Entity {dataset_id: $dataset_id})
            RETURN count(r) as count
            """
            type_query = """
            MATCH (e:Entity {dataset_id: $dataset_id})
            RETURN e.type as type, count(e) as count
            ORDER BY count DESC
            """
            params = {"dataset_id": dataset_id}
        else:
            entity_query = "MATCH (e:Entity) RETURN count(e) as count"
            rel_query = "MATCH ()-[r]->() RETURN count(r) as count"
            type_query = """
            MATCH (e:Entity)
            RETURN e.type as type, count(e) as count
            ORDER BY count DESC
            """
            params = {}

        with self.driver.session() as session:
            entity_count = session.run(entity_query, **params).single()["count"]
            rel_count = session.run(rel_query, **params).single()["count"]
            type_counts = {
                record["type"]: record["count"]
                for record in session.run(type_query, **params)
            }

        return {
            "entity_count": entity_count,
            "relationship_count": rel_count,
            "entity_types": type_counts,
            "dataset_id": dataset_id,
        }

    def delete_dataset(self, dataset_id: str) -> int:
        """Delete all entities and relationships for a dataset"""
        query = """
        MATCH (e:Entity {dataset_id: $dataset_id})
        DETACH DELETE e
        RETURN count(e) as deleted
        """
        with self.driver.session() as session:
            result = session.run(query, dataset_id=dataset_id)
            return result.single()["deleted"]

    def get_processed_chunk_ids(self, dataset_id: str) -> set:
        """Get set of chunk_ids that have already been processed for a dataset"""
        query = """
        MATCH (e:Entity {dataset_id: $dataset_id})
        WHERE e.source_chunk_id IS NOT NULL
        RETURN DISTINCT e.source_chunk_id as chunk_id
        """
        with self.driver.session() as session:
            result = session.run(query, dataset_id=dataset_id)
            return {record["chunk_id"] for record in result}
