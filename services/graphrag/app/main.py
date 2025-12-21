import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import extract_router, ingest_router, search_router, visualize_router

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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "graphrag"}


@app.get("/api/graphrag/stats")
async def get_global_stats():
    """Get global graph statistics"""
    from app.services.graph_store import GraphStore
    from app.services.vector_store import VectorStore

    try:
        graph_store = GraphStore()
        vector_store = VectorStore()

        graph_stats = graph_store.get_stats()
        vector_stats = vector_store.get_stats()

        return {
            "graph": graph_stats,
            "vector": vector_stats,
        }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        return {
            "graph": {"error": str(e)},
            "vector": {"error": str(e)},
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
