# LLMFlow - Enterprise LLM Platform

폐쇄망 환경의 대규모 조직(500+ 사용자)을 위한 엔터프라이즈 LLM 플랫폼

**Author:** Seokchan Lee <sc_liam>

## 개요

LLMFlow는 다음 핵심 기능을 제공합니다:

- **Hybrid RAG**: Vector(Milvus) + Graph(Neo4j) 검색 결합
- **Self-Hosted LLM**: vLLM 기반 LLaMA 3.1 추론
- **Fine-tuning**: LLaMA-Factory 통합
- **Enterprise Auth**: Keycloak SSO/LDAP
- **Full Observability**: Prometheus + Grafana + Langfuse

## 기술 스택

| 컴포넌트 | 기술 |
|----------|------|
| Core Platform | Dify 0.15+ |
| LLM Inference | vLLM (OpenAI Compatible) |
| Embedding | TEI + BGE-M3 (1024차원) |
| Reranking | TEI + BGE-Reranker-v2-M3 |
| Vector DB | Milvus 2.4+ |
| Graph DB | Neo4j 5.x (GraphRAG) |
| Document ETL | Unstructured API |
| Fine-tuning | LLaMA-Factory |
| Auth | Keycloak 24+ |
| API Gateway | Apache APISIX |
| Monitoring | Prometheus + Grafana |
| Tracing | Langfuse |

## 시스템 요구사항

### 최소 사양
- **CPU**: 8 cores
- **RAM**: 32GB
- **Storage**: 100GB SSD
- **GPU**: NVIDIA GPU 16GB+ VRAM (vLLM용)

### 권장 사양
- **CPU**: 16+ cores
- **RAM**: 64GB
- **Storage**: 500GB NVMe SSD
- **GPU**: NVIDIA A100/H100 또는 RTX 4090

### 소프트웨어
- Docker 24.0+
- Docker Compose v2.20+
- NVIDIA Driver 535+
- NVIDIA Container Toolkit

## 빠른 시작

### 1. 환경 설정

```bash
# 저장소 클론
cd /path/to/llmflow

# 환경 변수 설정
cp docker/.env.example docker/.env

# .env 파일 수정 (비밀번호 등)
vim docker/.env
```

### 2. 모델 다운로드 (선택)

```bash
# Hugging Face 토큰 설정 (LLaMA 접근용)
export HF_TOKEN="your_token_here"

# 필수 모델 다운로드
./scripts/download-models.sh essential
```

### 3. 플랫폼 시작

```bash
# 전체 서비스 시작
./scripts/init-all.sh full

# 또는 단계별 시작
./scripts/init-all.sh infra      # 인프라만
./scripts/init-all.sh platform   # 코어 플랫폼
./scripts/init-all.sh inference  # 추론 서비스
./scripts/init-all.sh monitoring # 모니터링
```

### 4. 상태 확인

```bash
./scripts/healthcheck.sh
```

## 서비스 접속 URL

| 서비스 | URL | 기본 계정 |
|--------|-----|-----------|
| Dify Web | http://localhost:3000 | 첫 로그인시 설정 |
| Dify API | http://localhost:5001 | - |
| APISIX Gateway | http://localhost:9080 | - |
| vLLM API | http://localhost:8000 | - |
| TEI Embedding | http://localhost:8080 | - |
| TEI Reranker | http://localhost:8081 | - |
| Neo4j Browser | http://localhost:7474 | neo4j / neo4j_password |
| LLaMA-Factory | http://localhost:7860 | - |
| MLflow | http://localhost:5000 | - |
| Langfuse | http://localhost:3001 | - |
| Grafana | http://localhost:3002 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |
| Keycloak | http://localhost:8080 | admin / admin |

## 디렉토리 구조

```
llmflow/
├── docs/                    # 상세 문서
│   ├── 01-기능정의서.md
│   ├── 02-오픈소스-조합-가이드.md
│   ├── 03-시스템-아키텍처.md
│   ├── 04-API-설계서.md
│   ├── 05-데이터-플로우.md
│   ├── 06-보안-인증-설계.md
│   └── 07-인프라-구성.md
├── diagrams/                # Mermaid 다이어그램
│   ├── 01-system-architecture.mmd
│   ├── 02-document-indexing-flow.mmd
│   ├── 03-hybrid-rag-query-flow.mmd
│   ├── 04-finetuning-pipeline.mmd
│   ├── 05-security-auth-flow.mmd
│   └── 06-network-topology.mmd
├── docker/                  # Docker 설정
│   ├── docker-compose.yml
│   ├── .env.example
│   └── configs/
│       ├── apisix/
│       ├── prometheus/
│       └── grafana/
├── scripts/                 # 초기화 스크립트
│   ├── init-all.sh
│   ├── init-databases.sh
│   ├── init-milvus.sh
│   ├── init-neo4j.sh
│   ├── download-models.sh
│   └── healthcheck.sh
├── models/                  # 모델 저장소
└── data/                    # 데이터 볼륨
```

## 주요 기능

### 1. Hybrid RAG 쿼리

Vector 검색과 Graph 검색을 결합한 하이브리드 RAG:

```
Query → Embedding → [Vector Search] + [Graph Search] → RRF Fusion → Reranking → LLM
```

- Vector Search: Milvus HNSW 인덱스, Cosine 유사도
- Graph Search: Neo4j 관계 기반 탐색
- Fusion: Reciprocal Rank Fusion (RRF)
- Reranking: BGE-Reranker-v2-M3

### 2. 문서 인덱싱 파이프라인

```
Upload → Unstructured(OCR/Parse) → Chunking → TEI Embedding → Milvus + Neo4j
```

지원 포맷: PDF, DOCX, PPTX, XLSX, TXT, MD, HTML

### 3. Fine-tuning

LLaMA-Factory WebUI를 통한 GUI 기반 파인튜닝:

- LoRA/QLoRA 지원
- 학습 진행 모니터링
- MLflow 실험 추적

## 운영 명령어

```bash
# 전체 시작
./scripts/init-all.sh full

# 전체 중지
./scripts/init-all.sh stop

# 재시작
./scripts/init-all.sh restart

# 상태 확인
./scripts/healthcheck.sh

# 로그 확인
cd docker && docker compose logs -f [서비스명]

# 특정 서비스 재시작
cd docker && docker compose restart [서비스명]
```

## 트러블슈팅

### GPU 관련

```bash
# NVIDIA 드라이버 확인
nvidia-smi

# Container Toolkit 확인
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### 서비스 로그

```bash
# vLLM 로그
docker compose logs -f vllm

# Dify API 로그
docker compose logs -f dify-api
```

### 포트 충돌

```bash
# 사용 중인 포트 확인
lsof -i :3000
netstat -tlnp | grep 3000
```

### 메모리 부족

```bash
# Docker 메모리 제한 확인
docker stats

# Swap 추가 (Linux)
sudo fallocate -l 16G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## API 사용 예시

### vLLM (OpenAI Compatible)

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}],
    "temperature": 0.7
  }'
```

### TEI Embedding

```bash
curl http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": "검색할 텍스트"}'
```

### TEI Reranker

```bash
curl http://localhost:8081/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "질문",
    "texts": ["문서1", "문서2", "문서3"]
  }'
```

## 라이선스

이 프로젝트는 각 오픈소스 컴포넌트의 라이선스를 따릅니다:

- Dify: Apache 2.0
- vLLM: Apache 2.0
- Milvus: Apache 2.0
- Neo4j: GPL v3 (Community Edition)
- LLaMA-Factory: Apache 2.0
- LLaMA 3.1: Meta License

## 문서

상세 문서는 `docs/` 디렉토리를 참조하세요:

- [기능정의서](docs/01-기능정의서.md)
- [오픈소스 조합 가이드](docs/02-오픈소스-조합-가이드.md)
- [시스템 아키텍처](docs/03-시스템-아키텍처.md)
- [API 설계서](docs/04-API-설계서.md)
- [데이터 플로우](docs/05-데이터-플로우.md)
- [보안/인증 설계](docs/06-보안-인증-설계.md)
- [인프라 구성](docs/07-인프라-구성.md)
