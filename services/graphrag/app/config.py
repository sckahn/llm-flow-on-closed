from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional
import os


class Settings(BaseSettings):
    """GraphRAG Service Configuration"""

    # Service
    app_name: str = "GraphRAG Service"
    debug: bool = False
    env_type: str = "dev"  # dev | prod

    # Neo4j
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "neo4j_password"

    # Milvus
    milvus_host: str = "milvus-standalone"
    milvus_port: int = 19530
    milvus_collection: str = "knowledge_entities"

    # vLLM (OpenAI compatible) - Llama 4 support
    llm_api_base: str = "http://vllm:8000/v1"
    llm_api_key: str = "llmflow-vllm-api-key"
    llm_model: str = "llama-4-mini"  # Default to Llama 4 Mini

    # Embedding (TEI)
    embedding_api_base: str = "http://tei-embedding:80/v1"
    embedding_model: str = "BAAI/bge-m3"
    embedding_dimension: int = 1024

    # Search settings
    vector_top_k: int = 10
    graph_max_depth: int = 2
    rrf_k: int = 60  # RRF constant

    # Microsoft GraphRAG settings
    graphrag_data_dir: str = "/data/graphrag"
    graphrag_cache_dir: str = "/data/graphrag/cache"
    graphrag_settings_path: str = "/app/configs/settings.yaml"

    # GraphRAG indexing
    graphrag_chunk_size: int = 1200
    graphrag_chunk_overlap: int = 100
    graphrag_community_level: int = 2

    class Config:
        env_file = ".env"
        env_prefix = "GRAPHRAG_"

    def get_graphrag_settings_path(self) -> str:
        """Get environment-specific settings file path"""
        if self.env_type == "prod":
            return "/app/configs/settings_prod.yaml"
        return "/app/configs/settings_dev.yaml"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
