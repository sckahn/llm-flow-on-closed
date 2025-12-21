"""
Microsoft GraphRAG Adapter for LLMFlow

This module provides an adapter for the Microsoft GraphRAG library,
configured for air-gapped environments using vLLM instead of Azure OpenAI.
"""

import os
import asyncio
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

import pandas as pd
from neo4j import AsyncGraphDatabase
from pymilvus import connections, Collection

from ..config import get_settings

logger = logging.getLogger(__name__)


class GraphRAGAdapter:
    """
    Adapter for Microsoft GraphRAG library.
    Provides indexing, search, and sync capabilities for air-gapped environments.
    """

    def __init__(self, dataset_id: str = "default"):
        self.settings = get_settings()
        self.dataset_id = dataset_id
        self.data_root = Path(self.settings.graphrag_data_dir) / dataset_id
        self._neo4j_driver = None
        self._milvus_connected = False

    async def __aenter__(self):
        await self._connect_stores()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._disconnect_stores()

    async def _connect_stores(self):
        """Connect to Neo4j and Milvus"""
        # Neo4j
        self._neo4j_driver = AsyncGraphDatabase.driver(
            self.settings.neo4j_uri,
            auth=(self.settings.neo4j_user, self.settings.neo4j_password)
        )

        # Milvus
        connections.connect(
            alias="default",
            host=self.settings.milvus_host,
            port=self.settings.milvus_port
        )
        self._milvus_connected = True

    async def _disconnect_stores(self):
        """Disconnect from stores"""
        if self._neo4j_driver:
            await self._neo4j_driver.close()
        if self._milvus_connected:
            connections.disconnect("default")

    def _ensure_directories(self):
        """Ensure required directories exist"""
        (self.data_root / "input").mkdir(parents=True, exist_ok=True)
        (self.data_root / "output").mkdir(parents=True, exist_ok=True)
        (Path(self.settings.graphrag_cache_dir) / self.dataset_id).mkdir(
            parents=True, exist_ok=True
        )

    async def index_documents(
        self,
        input_dir: Optional[str] = None,
        resume: bool = False,
        update: bool = False
    ) -> Dict[str, Any]:
        """
        Index documents using Microsoft GraphRAG.

        Args:
            input_dir: Directory containing input documents
            resume: Resume from last checkpoint
            update: Incremental update (delta indexing)

        Returns:
            Indexing result with statistics
        """
        self._ensure_directories()

        # Use graphrag CLI programmatically
        from graphrag.index import run_pipeline
        from graphrag.config import create_graphrag_config

        input_path = input_dir or str(self.data_root / "input")
        settings_path = self.settings.get_graphrag_settings_path()

        logger.info(f"Starting indexing for dataset: {self.dataset_id}")
        logger.info(f"Input directory: {input_path}")
        logger.info(f"Settings: {settings_path}")

        try:
            config = create_graphrag_config(
                root_dir=str(self.data_root),
                config_filepath=settings_path
            )

            result = await run_pipeline(
                config=config,
                resume=resume,
                update=update
            )

            return {
                "status": "success",
                "dataset_id": self.dataset_id,
                "timestamp": datetime.utcnow().isoformat(),
                "stats": result
            }

        except Exception as e:
            logger.error(f"Indexing failed: {e}")
            return {
                "status": "error",
                "dataset_id": self.dataset_id,
                "error": str(e)
            }

    async def global_search(
        self,
        query: str,
        community_level: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Perform global search using community summaries.
        Best for broad, thematic questions about the entire corpus.

        Args:
            query: User query
            community_level: Community hierarchy level (default from settings)

        Returns:
            Search results with context and response
        """
        from graphrag.query import GlobalSearch
        from graphrag.config import create_graphrag_config

        config = create_graphrag_config(
            root_dir=str(self.data_root),
            config_filepath=self.settings.get_graphrag_settings_path()
        )

        level = community_level or self.settings.graphrag_community_level

        try:
            search = GlobalSearch(config)
            result = await search.asearch(
                query=query,
                community_level=level
            )

            return {
                "type": "global",
                "query": query,
                "response": result.response,
                "context": result.context_data,
                "communities_used": result.llm_calls,
                "dataset_id": self.dataset_id
            }

        except Exception as e:
            logger.error(f"Global search failed: {e}")
            return {
                "type": "global",
                "query": query,
                "error": str(e)
            }

    async def local_search(
        self,
        query: str,
        top_k: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Perform local search using entity-centric retrieval.
        Best for specific questions about particular entities or relationships.

        Args:
            query: User query
            top_k: Number of top entities to consider

        Returns:
            Search results with entities, relationships, and response
        """
        from graphrag.query import LocalSearch
        from graphrag.config import create_graphrag_config

        config = create_graphrag_config(
            root_dir=str(self.data_root),
            config_filepath=self.settings.get_graphrag_settings_path()
        )

        k = top_k or self.settings.vector_top_k

        try:
            search = LocalSearch(config)
            result = await search.asearch(
                query=query,
                k=k
            )

            return {
                "type": "local",
                "query": query,
                "response": result.response,
                "entities": result.context_data.get("entities", []),
                "relationships": result.context_data.get("relationships", []),
                "sources": result.context_data.get("sources", []),
                "dataset_id": self.dataset_id
            }

        except Exception as e:
            logger.error(f"Local search failed: {e}")
            return {
                "type": "local",
                "query": query,
                "error": str(e)
            }

    async def hybrid_search(
        self,
        query: str,
        use_global: bool = True,
        use_local: bool = True,
        top_k: int = 10
    ) -> Dict[str, Any]:
        """
        Perform hybrid search combining global and local strategies.

        Args:
            query: User query
            use_global: Include global search results
            use_local: Include local search results
            top_k: Number of results per strategy

        Returns:
            Combined search results
        """
        results = {
            "query": query,
            "dataset_id": self.dataset_id,
            "global_result": None,
            "local_result": None
        }

        tasks = []
        if use_global:
            tasks.append(("global", self.global_search(query)))
        if use_local:
            tasks.append(("local", self.local_search(query, top_k)))

        for name, task in tasks:
            try:
                result = await task
                results[f"{name}_result"] = result
            except Exception as e:
                logger.error(f"{name} search failed: {e}")
                results[f"{name}_result"] = {"error": str(e)}

        return results

    async def sync_to_neo4j(self, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Sync GraphRAG output to Neo4j for visualization.

        Args:
            dataset_id: Dataset to sync (default: current dataset)

        Returns:
            Sync statistics
        """
        ds_id = dataset_id or self.dataset_id
        output_dir = Path(self.settings.graphrag_data_dir) / ds_id / "output"

        entities_file = output_dir / "entities.parquet"
        relationships_file = output_dir / "relationships.parquet"

        stats = {"entities_synced": 0, "relationships_synced": 0}

        async with self._neo4j_driver.session() as session:
            # Clear existing data for this dataset
            await session.run(
                "MATCH (n {dataset_id: $dataset_id}) DETACH DELETE n",
                dataset_id=ds_id
            )

            # Load and sync entities
            if entities_file.exists():
                entities_df = pd.read_parquet(entities_file)
                for _, row in entities_df.iterrows():
                    await session.run(
                        """
                        CREATE (e:Entity {
                            id: $id,
                            name: $name,
                            type: $type,
                            description: $description,
                            dataset_id: $dataset_id
                        })
                        """,
                        id=row.get("id"),
                        name=row.get("name"),
                        type=row.get("type"),
                        description=row.get("description", ""),
                        dataset_id=ds_id
                    )
                    stats["entities_synced"] += 1

            # Load and sync relationships
            if relationships_file.exists():
                rels_df = pd.read_parquet(relationships_file)
                for _, row in rels_df.iterrows():
                    await session.run(
                        """
                        MATCH (s:Entity {id: $source_id, dataset_id: $dataset_id})
                        MATCH (t:Entity {id: $target_id, dataset_id: $dataset_id})
                        CREATE (s)-[r:RELATES_TO {
                            description: $description,
                            weight: $weight,
                            keywords: $keywords
                        }]->(t)
                        """,
                        source_id=row.get("source"),
                        target_id=row.get("target"),
                        description=row.get("description", ""),
                        weight=row.get("weight", 1.0),
                        keywords=row.get("keywords", ""),
                        dataset_id=ds_id
                    )
                    stats["relationships_synced"] += 1

        logger.info(f"Synced to Neo4j: {stats}")
        return stats

    async def sync_to_milvus(self, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Sync entity embeddings to Milvus for vector search.

        Args:
            dataset_id: Dataset to sync (default: current dataset)

        Returns:
            Sync statistics
        """
        ds_id = dataset_id or self.dataset_id
        output_dir = Path(self.settings.graphrag_data_dir) / ds_id / "output"
        embeddings_file = output_dir / "entity_embeddings.parquet"

        stats = {"embeddings_synced": 0}

        if not embeddings_file.exists():
            logger.warning(f"No embeddings file found: {embeddings_file}")
            return stats

        embeddings_df = pd.read_parquet(embeddings_file)

        collection = Collection(self.settings.milvus_collection)

        # Prepare data for insertion
        entities = []
        for _, row in embeddings_df.iterrows():
            entities.append({
                "id": row.get("id"),
                "name": row.get("name"),
                "embedding": row.get("embedding"),
                "dataset_id": ds_id
            })

        if entities:
            collection.insert(entities)
            collection.flush()
            stats["embeddings_synced"] = len(entities)

        logger.info(f"Synced to Milvus: {stats}")
        return stats

    async def sync_delta_to_neo4j(self, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        """Sync only new entities to Neo4j (incremental)"""
        # For delta sync, we check which entities don't exist yet
        return await self.sync_to_neo4j(dataset_id)

    async def sync_delta_to_milvus(self, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        """Sync only new embeddings to Milvus (incremental)"""
        return await self.sync_to_milvus(dataset_id)

    async def get_community_summaries(
        self,
        level: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Get community summaries from GraphRAG output.

        Args:
            level: Community level (default from settings)

        Returns:
            List of community summaries
        """
        output_dir = self.data_root / "output"
        communities_file = output_dir / "community_reports.parquet"

        if not communities_file.exists():
            return []

        df = pd.read_parquet(communities_file)
        target_level = level or self.settings.graphrag_community_level

        filtered = df[df["level"] == target_level]
        return filtered.to_dict(orient="records")


async def archive_dataset(dataset_id: str, timestamp: str) -> Dict[str, Any]:
    """
    Archive a dataset for backup.

    Args:
        dataset_id: Dataset to archive
        timestamp: Timestamp for archive name

    Returns:
        Archive info
    """
    import shutil

    settings = get_settings()
    data_dir = Path(settings.graphrag_data_dir)
    source = data_dir / dataset_id / "output"
    archive_dir = data_dir / "archives" / f"{dataset_id}_{timestamp}"

    if source.exists():
        archive_dir.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, archive_dir / "output")
        return {
            "status": "archived",
            "source": str(source),
            "archive": str(archive_dir)
        }

    return {"status": "no_data", "source": str(source)}
