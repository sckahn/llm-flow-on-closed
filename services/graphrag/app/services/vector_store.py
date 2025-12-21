import logging
from typing import List, Optional, Dict, Any
import httpx
from pymilvus import (
    connections,
    Collection,
    CollectionSchema,
    FieldSchema,
    DataType,
    utility,
)

from app.config import get_settings
from app.models.entity import Entity

logger = logging.getLogger(__name__)


class VectorStore:
    """Service for Milvus vector database operations"""

    COLLECTION_NAME = "graphrag_entities"
    EMBEDDING_DIM = 1024  # TEI default dimension

    def __init__(self):
        settings = get_settings()
        self.settings = settings
        self._connect()
        self._ensure_collection()

    def _connect(self):
        """Connect to Milvus"""
        connections.connect(
            alias="default",
            host=self.settings.milvus_host,
            port=self.settings.milvus_port,
        )

    def _ensure_collection(self):
        """Create collection if not exists"""
        if utility.has_collection(self.COLLECTION_NAME):
            self.collection = Collection(self.COLLECTION_NAME)
            self.collection.load()
            return

        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=256),
            FieldSchema(name="entity_name", dtype=DataType.VARCHAR, max_length=512),
            FieldSchema(name="entity_type", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="description", dtype=DataType.VARCHAR, max_length=2048),
            FieldSchema(name="dataset_id", dtype=DataType.VARCHAR, max_length=256),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=self.EMBEDDING_DIM),
        ]
        schema = CollectionSchema(fields=fields, description="GraphRAG entity embeddings")
        self.collection = Collection(self.COLLECTION_NAME, schema)

        # Create index
        index_params = {
            "metric_type": "COSINE",
            "index_type": "IVF_FLAT",
            "params": {"nlist": 128},
        }
        self.collection.create_index(field_name="embedding", index_params=index_params)
        self.collection.load()

    async def get_embedding(self, text: str) -> List[float]:
        """Get embedding from TEI service"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.settings.embedding_api_base}/embed",
                json={"inputs": text},
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()
            # TEI returns list of embeddings, get the first one
            if isinstance(result, list) and len(result) > 0:
                if isinstance(result[0], list):
                    return result[0]
                return result
            return result

    async def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for multiple texts"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.settings.embedding_api_base}/embed",
                json={"inputs": texts},
                timeout=60.0,
            )
            response.raise_for_status()
            return response.json()

    async def insert_entity(self, entity: Entity, dataset_id: str) -> str:
        """Insert an entity with its embedding"""
        # Generate embedding from entity text
        text = f"{entity.name}: {entity.description or ''}"
        embedding = await self.get_embedding(text)

        entity_id = entity.id or f"{dataset_id}_{entity.name}"

        self.collection.insert([
            [entity_id],
            [entity.name],
            [entity.type],
            [entity.description or ""],
            [dataset_id],
            [embedding],
        ])
        self.collection.flush()

        return entity_id

    async def insert_entities_batch(self, entities: List[Entity], dataset_id: str) -> List[str]:
        """Insert multiple entities with embeddings"""
        if not entities:
            return []

        # Generate embeddings
        texts = [f"{e.name}: {e.description or ''}" for e in entities]
        embeddings = await self.get_embeddings_batch(texts)

        ids = []
        names = []
        types = []
        descriptions = []
        dataset_ids = []

        for i, entity in enumerate(entities):
            entity_id = entity.id or f"{dataset_id}_{entity.name}"
            ids.append(entity_id)
            names.append(entity.name)
            types.append(entity.type)
            descriptions.append(entity.description or "")
            dataset_ids.append(dataset_id)

        self.collection.insert([
            ids,
            names,
            types,
            descriptions,
            dataset_ids,
            embeddings,
        ])
        self.collection.flush()

        return ids

    async def search(
        self,
        query: str,
        dataset_id: Optional[str] = None,
        entity_types: Optional[List[str]] = None,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """Search for similar entities"""
        # Get query embedding
        query_embedding = await self.get_embedding(query)

        # Build filter expression
        expr_parts = []
        if dataset_id:
            expr_parts.append(f'dataset_id == "{dataset_id}"')
        if entity_types:
            types_str = ", ".join([f'"{t}"' for t in entity_types])
            expr_parts.append(f"entity_type in [{types_str}]")

        expr = " and ".join(expr_parts) if expr_parts else None

        # Search
        search_params = {"metric_type": "COSINE", "params": {"nprobe": 16}}
        results = self.collection.search(
            data=[query_embedding],
            anns_field="embedding",
            param=search_params,
            limit=top_k,
            expr=expr,
            output_fields=["id", "entity_name", "entity_type", "description", "dataset_id"],
        )

        # Format results
        search_results = []
        for hits in results:
            for hit in hits:
                search_results.append({
                    "id": hit.entity.get("id"),
                    "name": hit.entity.get("entity_name"),
                    "type": hit.entity.get("entity_type"),
                    "description": hit.entity.get("description"),
                    "dataset_id": hit.entity.get("dataset_id"),
                    "score": hit.score,
                    "source": "vector",
                })

        return search_results

    def delete_by_dataset(self, dataset_id: str) -> int:
        """Delete all entities for a dataset"""
        expr = f'dataset_id == "{dataset_id}"'
        result = self.collection.delete(expr)
        self.collection.flush()
        return result.delete_count if hasattr(result, 'delete_count') else 0

    def get_stats(self, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        """Get vector store statistics"""
        self.collection.flush()

        if dataset_id:
            expr = f'dataset_id == "{dataset_id}"'
            # Count entities for dataset
            results = self.collection.query(
                expr=expr,
                output_fields=["id"],
            )
            count = len(results)
        else:
            count = self.collection.num_entities

        return {
            "total_entities": count,
            "collection_name": self.COLLECTION_NAME,
            "embedding_dim": self.EMBEDDING_DIM,
            "dataset_id": dataset_id,
        }

    def close(self):
        """Close connection"""
        connections.disconnect("default")
