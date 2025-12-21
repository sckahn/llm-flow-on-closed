# LLMFlow - Enterprise LLM Platform

폐쇄망 환경의 대규모 조직(500+ 사용자)을 위한 엔터프라이즈 LLM 플랫폼

**Author:** Seokchan Lee <sc_liam>

## 개요

LLMFlow는 보안이 중요한 폐쇄망 환경에서 **Llama-4 (Maverick/Scout)** 시리즈와 **지식 그래프(Microsoft GraphRAG)**를 결합하여, 단순 검색을 넘어선 심층적인 통찰을 제공하는 AI 플랫폼입니다.

핵심 차별점:

* **Dual-Track RAG Strategy**: 실시간 데이터 반영(Vector)과 거시적 통찰(Graph)의 조화
* **Next-Gen MoE Pipeline**: **H200 8장**을 활용한 **Llama 4 Maverick (400B MoE)** 고속 추론
* **Enterprise Ready**: SSO, RBAC, 감사 로그(Audit Log), 전체 관측성(Observability) 완비

## 기술 스택

| 컴포넌트 | 기술 | 비고 |
| --- | --- | --- |
| **Core Platform** | Dify 0.15+ | Workflow Orchestration |
| **LLM Inference** | vLLM (OpenAI Compatible) | **FP8 MoE Kernel Optimization** (H200 Optimized) |
| **Embedding** | TEI + BGE-M3 | 1024차원, 다국어/한국어 최적화 |
| **Reranking** | TEI + BGE-Reranker-v2-M3 | 검색 정확도 보정 |
| **Vector DB** | Milvus 2.4+ | 실시간 인덱싱 (HNSW) |
| **Graph DB** | Neo4j 5.x + **Microsoft GraphRAG** | 지식 그래프 및 커뮤니티 요약 |
| **Graph Middleware** | **FastAPI (Custom Adapter)** | Dify와 GraphRAG 간 통신 중계 |
| **Document ETL** | Unstructured API / LlamaParse | 표/이미지 포함 복잡한 문서 처리 |
| **Fine-tuning** | LLaMA-Factory | 사내 데이터 기반 LoRA/QLoRA 학습 |
| **Auth** | Keycloak 24+ | LDAP/AD 연동 SSO |
| **API Gateway** | Apache APISIX | 트래픽 제어 및 라우팅 |
| **Monitoring** | Prometheus + Grafana | 시스템 리소스 모니터링 |
| **Tracing** | Langfuse | LLM 입출력 트레이싱 |

## 시스템 요구사항 (Dual Environment)

개발 검증(PoC)과 실제 운영(Prod) 환경을 분리하여 효율적인 리소스 관리 전략을 수립합니다.

### 1. Development (기능 검증)

* **CPU**: 16+ cores
* **RAM**: 64GB
* **Storage**: 500GB NVMe SSD
* **GPU**: NVIDIA RTX 3090 / 4090 (24GB) x 1
* **Model**: **Llama-4-Mini (8B Dense)**
* *Note:* 기능 검증용 소형 모델. MoE 아키텍처가 아닌 Dense 버전을 사용하여 24GB VRAM 내 구동.


* **Target**: 소량 샘플 데이터(50~100건) 기반 기능 테스트
* **Configuration**: Low Concurrency, Small Batch Size

### 2. Production (대규모 운영)

* **CPU**: 32+ cores (Intel Xeon / AMD EPYC)
* **RAM**: 512GB+ (MoE 모델 로딩을 위한 대용량 메모리 권장)
* **Storage**: 2TB+ NVMe SSD (RAID 0/1 권장)
* **GPU**: **NVIDIA H200 (141GB) x 8** (Total 1.1TB VRAM)
* **Model**: **Llama-4-Maverick (400B MoE)**
* *Spec:* 400B Total Params (17B Active), 128 Experts.
* *Performance:* FP8 양자화 적용 시 H200 클러스터에 최적화. GPT-4o급 추론 능력 제공.


* **Target**: 전체 데이터(30,000+ 문서) 처리 및 고품질 그래프 생성
* **Configuration**: Max Concurrency, Multi-GPU Parallel Processing

### 소프트웨어

* Docker 24.0+
* Docker Compose v2.20+
* NVIDIA Driver 550+ (Llama 4 MoE 커널 호환)
* NVIDIA Container Toolkit

## 빠른 시작

### 1. 환경 설정

```bash
# 저장소 클론
cd /path/to/llmflow

# 환경 변수 설정
cp docker/.env.example docker/.env

# .env 파일 수정 (비밀번호, ENV_TYPE=dev/prod 설정)
vim docker/.env

```

### 2. 모델 다운로드

Llama 4 시리즈는 MoE 아키텍처로 인해 모델 사이즈가 큽니다. 네트워크 환경을 확인하세요.

```bash
# Hugging Face 토큰 설정
export HF_TOKEN="your_token_here"

# [Prod] 운영용 Llama-4-Maverick (400B MoE, FP8) 다운로드
# H200 x 8 환경 필수
./scripts/download-models.sh prod-maverick

# [Dev] 개발용 Llama-4-Mini (8B, Int4) 다운로드
# RTX 3090/4090 환경용
./scripts/download-models.sh dev-mini

```

### 3. 플랫폼 시작

```bash
# 전체 서비스 시작 (GraphRAG 포함)
./scripts/init-all.sh full

# 또는 단계별 시작
./scripts/init-all.sh infra      # 인프라만
./scripts/init-all.sh platform   # 코어 플랫폼
./scripts/init-all.sh inference  # 추론 서비스 (vLLM MoE)
./scripts/init-all.sh monitoring # 모니터링
./scripts/init-all.sh graph      # GraphRAG 미들웨어

```

### 4. 상태 확인

```bash
./scripts/healthcheck.sh

```

## 서비스 접속 URL

| 서비스 | URL | 기본 계정 |
| --- | --- | --- |
| Dify Web | http://localhost:3000 | 첫 로그인시 설정 |
| Dify API | http://localhost:5001 | - |
| **GraphRAG API** | **http://localhost:8082** | **-** |
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
│   ├── ...
├── diagrams/                # Mermaid 다이어그램
│   ├── ...
├── docker/                  # Docker 설정
│   ├── docker-compose.yml
│   ├── .env.example
│   └── configs/
│       ├── apisix/
│       ├── prometheus/
│       ├── grafana/
│       └── graphrag/        # GraphRAG 설정
│           ├── settings.yaml      # 기본 설정
│           ├── settings_dev.yaml  # 3090용 (Mini-8B)
│           ├── settings_prod.yaml # H200용 (Maverick-400B)
│           └── prompts/           # 한국어 프롬프트 템플릿
├── scripts/                 # 초기화 스크립트
│   ├── init-all.sh
│   ├── init-databases.sh
│   ├── init-milvus.sh
│   ├── init-neo4j.sh
│   ├── graphrag-rebuild-full.sh  # 전체 재구축
│   ├── graphrag-index-delta.sh   # 증분 업데이트
│   ├── graphrag-resume.sh        # 체크포인트 복구
│   ├── download-models.sh
│   └── healthcheck.sh
├── models/                  # 모델 저장소
└── data/                    # 데이터 볼륨

```

## 주요 기능

### 1. Hybrid RAG 쿼리 (Two-Track Strategy)

Vector 검색과 Graph 검색을 결합한 하이브리드 RAG 및 H200 기반 가속 파이프라인:

```
Query → Embedding → [Track A: Vector Search] + [Track B: Graph Search] → RRF Fusion → Reranking → Llama-4-Maverick

```

* **Track A (Real-time):** Milvus HNSW 인덱스. 최신 문서 즉시 반영.
* **Track B (Global Context):** Neo4j + GraphRAG. 주기적(야간/주말) 전체 재구축을 통한 거시적 통찰 제공.
* **Fusion:** Reciprocal Rank Fusion (RRF)
* **Reranking:** BGE-Reranker-v2-M3

### 2. 문서 인덱싱 파이프라인

```
Upload → Unstructured(OCR/Parse) → Chunking → TEI Embedding → Milvus + [Async Batch] Graph Indexing

```

* **지원 포맷:** PDF, DOCX, PPTX, XLSX, TXT, MD, HTML
* **한국어 최적화:** GraphRAG 프롬프트(`prompts.py`) 오버라이딩을 통한 한국어 Entity/Summary 추출 강화.

### 3. Fine-tuning

LLaMA-Factory WebUI를 통한 GUI 기반 파인튜닝:

* **Target Model:** **Llama-4 Series (Mini/Maverick)**
* **Method:** LoRA/QLoRA (MoE 레이어 타겟팅 지원)
* 학습 진행 모니터링
* MLflow 실험 추적

## 운영 명령어

### 일반 운영

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

### [New] GraphRAG 파이프라인 제어

```bash
# [Track A] Vector DB 상태 확인
./scripts/check-milvus-stats.sh

# [Track B] GraphRAG 전체 재구축 (H200 8장 풀가동 - Maverick 400B)
# 주의: 기존 그래프 데이터를 아카이빙하고 3만개 문서를 처음부터 다시 인덱싱합니다.
./scripts/graphrag-rebuild-full.sh

# [Track B] GraphRAG 증분 업데이트 (신규 문서만)
./scripts/graphrag-index-delta.sh

# 인덱싱 재개 (마지막 체크포인트부터)
./scripts/graphrag-resume.sh

```

## 트러블슈팅

### GPU 관련 (MoE 주의사항)

```bash
# NVIDIA 드라이버 확인 (550+ 버전 필수)
nvidia-smi

# [New] H200 FP8 및 MoE 커널 활성화 확인 (vLLM)
# Llama-4-Maverick 로딩 시 "MoE Experts loaded: 128" 로그 확인 필요
docker compose logs vllm | grep "MoE"

```

### 서비스 로그

```bash
# vLLM 로그
docker compose logs -f vllm

# Dify API 로그
docker compose logs -f dify-api

# [New] GraphRAG API 로그
docker compose logs -f graphrag-api

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

# Swap 추가 (Linux) - 대용량 Graph 처리를 위해 필수
sudo fallocate -l 32G /swapfile
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
    "model": "llama-4-mini",
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

### [New] Hybrid Search (via Custom Middleware)

Dify에서 호출하는 통합 검색 API 예시입니다.

```bash
curl http://localhost:8082/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "query": "최근 반도체 시장의 주요 리스크 요인은?",
    "user_id": "user_123",
    "filters": {"date_range": "2024-01-01..2024-12-31"},
    "mode": "comprehensive"  // vector + global_graph
  }'

```

## 라이선스

이 프로젝트는 각 오픈소스 컴포넌트의 라이선스를 따릅니다:

* Dify: Apache 2.0
* vLLM: Apache 2.0
* Milvus: Apache 2.0
* Neo4j: GPL v3 (Community Edition)
* **Microsoft GraphRAG: MIT License**
* LLaMA-Factory: Apache 2.0
* **LLaMA 4 (Maverick/Scout/Mini): Meta License (Community)**

## 문서

상세 문서는 `docs/` 디렉토리를 참조하세요:

- [기능정의서](docs/01-기능정의서.md)
- [오픈소스 조합 가이드](docs/02-오픈소스-조합-가이드.md)
- [시스템 아키텍처](docs/03-시스템-아키텍처.md)
- [API 설계서](docs/04-API-설계서.md)
- [데이터 플로우](docs/05-데이터-플로우.md)
- [보안/인증 설계](docs/06-보안-인증-설계.md)
- [인프라 구성](docs/07-인프라-구성.md)