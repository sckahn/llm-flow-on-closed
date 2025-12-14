#!/bin/bash
# LLMFlow Master Initialization Script
# Orchestrates the complete setup of LLMFlow platform

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
DOCKER_DIR="${PROJECT_DIR}/docker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║     ██╗     ██╗     ███╗   ███╗███████╗██╗      ██████╗      ║"
    echo "║     ██║     ██║     ████╗ ████║██╔════╝██║     ██╔═══██╗     ║"
    echo "║     ██║     ██║     ██╔████╔██║█████╗  ██║     ██║   ██║     ║"
    echo "║     ██║     ██║     ██║╚██╔╝██║██╔══╝  ██║     ██║   ██║     ║"
    echo "║     ███████╗███████╗██║ ╚═╝ ██║██║     ███████╗╚██████╔╝     ║"
    echo "║     ╚══════╝╚══════╝╚═╝     ╚═╝╚═╝     ╚══════╝ ╚═════╝      ║"
    echo "║                                                              ║"
    echo "║              Enterprise LLM Platform v2.0                    ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_success "Docker found: $(docker --version)"

    # Docker Compose
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
        log_success "Docker Compose found: $(docker compose version)"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        log_success "Docker Compose found: $(docker-compose --version)"
    else
        log_error "Docker Compose is not installed"
        exit 1
    fi

    # NVIDIA GPU (optional)
    if command -v nvidia-smi &> /dev/null; then
        log_success "NVIDIA GPU found:"
        nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | head -1
    else
        log_warn "NVIDIA GPU not detected - vLLM and LLaMA-Factory will not work"
    fi

    # Memory check
    if command -v free &> /dev/null; then
        total_mem=$(free -g | awk '/^Mem:/{print $2}')
        if [ "$total_mem" -lt 32 ]; then
            log_warn "Less than 32GB RAM detected (${total_mem}GB). Some services may not start."
        else
            log_success "Memory: ${total_mem}GB RAM"
        fi
    fi

    echo ""
}

setup_environment() {
    log_info "Setting up environment..."

    # Copy .env if not exists
    if [ ! -f "${DOCKER_DIR}/.env" ]; then
        if [ -f "${DOCKER_DIR}/.env.example" ]; then
            cp "${DOCKER_DIR}/.env.example" "${DOCKER_DIR}/.env"
            log_success "Created .env from .env.example"
            log_warn "Please review and modify ${DOCKER_DIR}/.env before proceeding"
        else
            log_error ".env.example not found"
            exit 1
        fi
    else
        log_success ".env file exists"
    fi

    # Create data directories
    mkdir -p "${PROJECT_DIR}/data"/{postgresql,redis,minio,milvus,neo4j,dify,mlflow,grafana}
    mkdir -p "${PROJECT_DIR}/models"
    log_success "Data directories created"

    echo ""
}

start_infrastructure() {
    log_info "Starting infrastructure services (Phase 1)..."

    cd "${DOCKER_DIR}"
    $COMPOSE_CMD up -d etcd postgresql redis minio

    log_info "Waiting for infrastructure to be ready..."
    sleep 10

    # Wait for PostgreSQL
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if $COMPOSE_CMD exec -T postgresql pg_isready -U postgres > /dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        ((attempts++))
        sleep 2
    done

    echo ""
}

start_data_stores() {
    log_info "Starting data stores (Phase 2)..."

    cd "${DOCKER_DIR}"
    $COMPOSE_CMD up -d milvus-standalone neo4j

    log_info "Waiting for data stores to be ready..."
    sleep 15

    log_success "Data stores started"
    echo ""
}

start_auth_gateway() {
    log_info "Starting auth and gateway (Phase 3)..."

    cd "${DOCKER_DIR}"
    $COMPOSE_CMD up -d keycloak apisix

    sleep 10
    log_success "Auth and gateway started"
    echo ""
}

start_core_platform() {
    log_info "Starting core platform (Phase 4)..."

    cd "${DOCKER_DIR}"
    $COMPOSE_CMD up -d dify-api dify-worker dify-web

    sleep 10
    log_success "Core platform started"
    echo ""
}

start_inference() {
    log_info "Starting inference services (Phase 5)..."

    cd "${DOCKER_DIR}"

    # Check GPU availability
    if command -v nvidia-smi &> /dev/null; then
        $COMPOSE_CMD up -d vllm tei-embedding tei-reranker unstructured
        log_success "Inference services started (with GPU)"
    else
        $COMPOSE_CMD up -d tei-embedding tei-reranker unstructured
        log_warn "vLLM skipped (no GPU). TEI services started in CPU mode."
    fi

    sleep 10
    echo ""
}

start_llmops() {
    log_info "Starting LLMOps and monitoring (Phase 6)..."

    cd "${DOCKER_DIR}"

    if command -v nvidia-smi &> /dev/null; then
        $COMPOSE_CMD up -d llama-factory mlflow langfuse prometheus grafana
    else
        $COMPOSE_CMD up -d mlflow langfuse prometheus grafana
        log_warn "LLaMA-Factory skipped (no GPU)"
    fi

    sleep 5
    log_success "LLMOps and monitoring started"
    echo ""
}

initialize_databases() {
    log_info "Initializing databases..."

    if [ -x "${SCRIPT_DIR}/init-databases.sh" ]; then
        bash "${SCRIPT_DIR}/init-databases.sh" || log_warn "Database init had issues"
    fi

    echo ""
}

print_access_info() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Service Access URLs                       ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Dify Web UI        │ http://localhost:3000                  ║"
    echo "║  Dify API           │ http://localhost:5001                  ║"
    echo "║  APISIX Gateway     │ http://localhost:9080                  ║"
    echo "║  vLLM API           │ http://localhost:8000                  ║"
    echo "║  TEI Embedding      │ http://localhost:8080                  ║"
    echo "║  TEI Reranker       │ http://localhost:8081                  ║"
    echo "║  Neo4j Browser      │ http://localhost:7474                  ║"
    echo "║  LLaMA-Factory      │ http://localhost:7860                  ║"
    echo "║  MLflow             │ http://localhost:5000                  ║"
    echo "║  Langfuse           │ http://localhost:3001                  ║"
    echo "║  Grafana            │ http://localhost:3002                  ║"
    echo "║  Prometheus         │ http://localhost:9090                  ║"
    echo "║  MinIO Console      │ http://localhost:9001                  ║"
    echo "║  Keycloak           │ http://localhost:8080                  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Default credentials (change in production!):"
    echo "  - Dify: Set during first login"
    echo "  - Keycloak: admin / admin"
    echo "  - Neo4j: neo4j / neo4j_password"
    echo "  - Grafana: admin / admin"
    echo "  - MinIO: minioadmin / minioadmin"
    echo ""
}

main() {
    print_banner

    case "${1:-full}" in
        "full")
            check_prerequisites
            setup_environment
            start_infrastructure
            initialize_databases
            start_data_stores
            start_auth_gateway
            start_core_platform
            start_inference
            start_llmops
            print_access_info

            log_success "LLMFlow initialization complete!"
            log_info "Run './scripts/healthcheck.sh' to verify all services"
            ;;
        "infra")
            check_prerequisites
            setup_environment
            start_infrastructure
            initialize_databases
            start_data_stores
            log_success "Infrastructure started"
            ;;
        "platform")
            start_auth_gateway
            start_core_platform
            log_success "Platform started"
            ;;
        "inference")
            start_inference
            log_success "Inference services started"
            ;;
        "monitoring")
            start_llmops
            log_success "Monitoring started"
            ;;
        "status")
            bash "${SCRIPT_DIR}/healthcheck.sh"
            ;;
        "stop")
            log_info "Stopping all services..."
            cd "${DOCKER_DIR}"
            $COMPOSE_CMD down
            log_success "All services stopped"
            ;;
        "restart")
            log_info "Restarting all services..."
            cd "${DOCKER_DIR}"
            $COMPOSE_CMD restart
            log_success "All services restarted"
            ;;
        *)
            echo "Usage: $0 [full|infra|platform|inference|monitoring|status|stop|restart]"
            echo ""
            echo "Commands:"
            echo "  full       - Start all services (default)"
            echo "  infra      - Start only infrastructure (PostgreSQL, Redis, Milvus, etc.)"
            echo "  platform   - Start auth and core platform (Keycloak, Dify)"
            echo "  inference  - Start inference services (vLLM, TEI)"
            echo "  monitoring - Start LLMOps and monitoring (MLflow, Grafana)"
            echo "  status     - Check health of all services"
            echo "  stop       - Stop all services"
            echo "  restart    - Restart all services"
            exit 1
            ;;
    esac
}

main "$@"
