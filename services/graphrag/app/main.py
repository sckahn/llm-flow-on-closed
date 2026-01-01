import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import extract_router, ingest_router, search_router, visualize_router, backup_router, build_router
from app.routers.conversation import router as conversation_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("Starting GraphRAG service...")
    settings = get_settings()
    logger.info(f"Neo4j: {settings.neo4j_uri}")
    logger.info(f"Milvus: {settings.milvus_host}:{settings.milvus_port}")
    logger.info(f"LLM: {settings.llm_api_base}")
    yield
    logger.info("Shutting down GraphRAG service...")


app = FastAPI(
    title="GraphRAG Service",
    description="Knowledge Graph RAG service for entity extraction, graph storage, and hybrid search",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(extract_router, prefix="/api/graphrag")
app.include_router(ingest_router, prefix="/api/graphrag")
app.include_router(search_router, prefix="/api/graphrag")
app.include_router(visualize_router, prefix="/api/graphrag")
app.include_router(backup_router, prefix="/api/graphrag")
app.include_router(build_router, prefix="/api/graphrag")
# Conversation router - no prefix (router already has /conversation prefix)
app.include_router(conversation_router)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "graphrag"}


@app.get("/api/graphrag/stats")
async def get_global_stats():
    """Get global graph statistics (graph only to avoid blocking)"""
    from app.services.graph_store import GraphStore

    try:
        graph_store = GraphStore()
        graph_stats = graph_store.get_stats()
        entity_count = graph_stats.get("entity_count", 0)

        return {
            "graph": graph_stats,
            "vector": {
                "count": entity_count,
                "total_entities": entity_count,
                "status": "synced_with_graph",
            },
        }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        return {
            "graph": {"entity_count": 0, "relationship_count": 0},
            "vector": {"count": 0, "total_entities": 0},
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
