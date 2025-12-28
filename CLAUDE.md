# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLMFlow is an enterprise LLM platform for closed-network environments (500+ users) combining Llama-4 series models with Microsoft GraphRAG for hybrid RAG capabilities.

## Common Commands

### Platform Startup
```bash
# Full stack (17 services)
./scripts/init-all.sh full

# Phased startup
./scripts/init-all.sh infra      # etcd, postgresql, redis, minio
./scripts/init-all.sh platform   # Dify API/worker
./scripts/init-all.sh inference  # vLLM, TEI embedding/reranking
./scripts/init-all.sh monitoring # Prometheus, Grafana, Langfuse
./scripts/init-all.sh graph      # GraphRAG API, Neo4j

# Stop/restart
./scripts/init-all.sh stop
./scripts/init-all.sh restart
```

### Health Checks & Logs
```bash
./scripts/healthcheck.sh
cd docker && docker compose logs -f [service-name]
cd docker && docker compose restart [service-name]
```

### GraphRAG Pipeline
```bash
./scripts/graphrag-rebuild-full.sh   # Full reindex (destructive)
./scripts/graphrag-index-delta.sh    # Incremental update
./scripts/graphrag-resume.sh         # Resume from checkpoint
```

### UI Development (Next.js)
```bash
cd ui
npm install
npm run dev     # Development server (port 3033)
npm run build   # Production build
npm run lint    # ESLint
```

### GraphRAG Service (Python/FastAPI)
```bash
cd services/graphrag
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

# Tests
pytest
pytest -v tests/test_search.py  # Single test file
```

## Architecture

### Two-Track Hybrid RAG Strategy
```
Query → Embedding → [Track A: Vector Search] + [Track B: Graph Search] → RRF Fusion → Reranking → Llama-4
```
- **Track A (Real-time)**: Milvus vector search with HNSW indexing for immediate document updates
- **Track B (Global Context)**: Neo4j + Microsoft GraphRAG for macro insights, rebuilt periodically
- **Fusion**: Reciprocal Rank Fusion (RRF) with k=60
- **Reranking**: BGE-Reranker-v2-M3 for final relevance scoring

### Service Components (Docker Compose)
17 containerized services across 6 isolated networks:

| Category | Services |
|----------|----------|
| Infrastructure | etcd, PostgreSQL, Redis, MinIO |
| Vector/Graph DB | Milvus, Neo4j |
| LLM Inference | vLLM (OpenAI-compatible), TEI (embedding/reranking) |
| Platform | Dify (API + Worker), LLMFlow UI |
| Auth | Keycloak (SSO/RBAC) |
| Monitoring | Prometheus, Grafana, Langfuse |
| Gateway | Apache APISIX |
| Fine-tuning | LLaMA-Factory, MLflow |

### Key Ports
- **3033**: LLMFlow UI (Next.js)
- **5001**: Dify API (direct)
- **5002**: Dify Nginx Proxy (CORS-enabled, used by UI)
- **8000**: vLLM (OpenAI-compatible)
- **8080**: TEI Embedding
- **8081**: TEI Reranking
- **8082**: GraphRAG API (FastAPI middleware)
- **7474**: Neo4j Browser
- **7687**: Neo4j Bolt Protocol
- **9080**: Apache APISIX Gateway

### Code Structure

```
services/graphrag/app/     # Python FastAPI service
├── main.py                # Application entry
├── config.py              # Pydantic settings (env vars prefixed GRAPHRAG_)
├── routers/               # API endpoints (search, ingest, extract, visualize)
├── services/              # Business logic (graph_store, vector_store, hybrid_search)
└── models/                # Pydantic data models

ui/src/                    # Next.js 14 frontend
├── app/                   # App router
│   ├── (auth)/            # Auth routes (login, register)
│   ├── (dashboard)/       # Protected routes (apps, datasets, knowledge-graph, settings)
│   └── api/               # Next.js API routes (proxy endpoints)
├── components/            # React components
│   ├── workflow/          # Workflow editor (ReactFlow-based)
│   ├── chat/              # Chat interface
│   ├── graphrag/          # GraphRAG visualization
│   └── ui/                # Radix UI primitives (shadcn/ui style)
├── lib/
│   ├── api/               # API client modules (client.ts, auth.ts, datasets.ts, graphrag.ts)
│   └── stores/            # Zustand state stores
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript definitions

docker/                    # Docker configuration
├── docker-compose.yml     # Full 17-service stack
├── .env.example           # Environment template
└── configs/
    └── graphrag/          # GraphRAG settings (dev/prod YAML, Korean prompts)
```

### API Routing
- UI (`localhost:3033`) → Nginx Proxy (`localhost:5002`) → Dify API (`localhost:5001`)
- UI calls GraphRAG via `/api/graphrag/*` routes proxied to port 8082
- Auth tokens stored in localStorage, attached as `Authorization: Bearer` header

### Environment Configurations
- **Dev** (`settings_dev.yaml`): Llama-4-Mini (8B), single GPU (RTX 3090/4090)
- **Prod** (`settings_prod.yaml`): Llama-4-Maverick (400B MoE), 8x H200 GPUs

### Key Environment Variables
```bash
ENV_TYPE=dev|prod              # Affects model and GPU config
GRAPHRAG_NEO4J_URI             # Neo4j connection (default: bolt://neo4j:7687)
GRAPHRAG_MILVUS_HOST           # Milvus host (default: milvus-standalone)
GRAPHRAG_LLM_MODEL             # LLM model name (default: llama-4-mini)
NEXT_PUBLIC_API_URL            # UI API base URL (default: http://localhost:5002)
```

### Tech Stack
- **Backend**: Python 3.11, FastAPI, Microsoft GraphRAG, Neo4j, Milvus
- **Frontend**: Next.js 14, React 18, TypeScript, TailwindCSS, Radix UI, Zustand, TanStack Query
- **Inference**: vLLM with FP8 MoE kernel optimization
- **Platform**: Dify 0.11+ for workflow orchestration

### Docker Networks (for debugging)
```
llmflow-frontend    (172.28.1.0/24)   → UI, APISIX
llmflow-backend     (172.28.2.0/24)   → Dify, GraphRAG, APISIX
llmflow-data        (172.28.3.0/24)   → PostgreSQL, Redis, MinIO, Milvus, Neo4j, etcd
llmflow-inference   (172.28.4.0/24)   → vLLM, TEI, Unstructured
llmflow-auth        (172.28.5.0/24)   → Keycloak, APISIX
llmflow-monitoring  (172.28.6.0/24)   → Prometheus, Grafana, Langfuse
```
