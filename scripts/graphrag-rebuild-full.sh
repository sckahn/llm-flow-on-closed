#!/bin/bash
# GraphRAG Full Rebuild Script
# Archives existing data and performs complete re-indexing
# Usage: ./scripts/graphrag-rebuild-full.sh [dataset_id]

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
    echo "║           GraphRAG Full Rebuild                              ║"
    echo "║           Microsoft GraphRAG + vLLM (Air-gapped)             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# Parse arguments
DATASET_ID=${1:-default}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
GRAPHRAG_CONTAINER="llmflow-graphrag"

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check if graphrag container is running
    if ! docker ps --format '{{.Names}}' | grep -q "${GRAPHRAG_CONTAINER}"; then
        log_error "GraphRAG container '${GRAPHRAG_CONTAINER}' is not running"
        log_info "Start it with: cd ${DOCKER_DIR} && docker compose up -d graphrag"
        exit 1
    fi

    log_success "Prerequisites check passed"
    echo ""
}

archive_existing_data() {
    log_info "Archiving existing data for dataset: ${DATASET_ID}..."

    ARCHIVE_DIR="/data/graphrag/archives/${DATASET_ID}_${TIMESTAMP}"

    docker exec ${GRAPHRAG_CONTAINER} bash -c "
        if [ -d '/data/graphrag/${DATASET_ID}/output' ]; then
            mkdir -p '${ARCHIVE_DIR}'
            cp -r '/data/graphrag/${DATASET_ID}/output' '${ARCHIVE_DIR}/'
            echo 'Archived to ${ARCHIVE_DIR}'
        else
            echo 'No existing output to archive'
        fi
    " || log_warn "Archive step skipped (no existing data)"

    log_success "Archive complete"
    echo ""
}

clear_cache() {
    log_info "Clearing cache for dataset: ${DATASET_ID}..."

    docker exec ${GRAPHRAG_CONTAINER} bash -c "
        rm -rf /data/graphrag/cache/${DATASET_ID}/* 2>/dev/null || true
        rm -rf /data/graphrag/${DATASET_ID}/output/* 2>/dev/null || true
    " || log_warn "Cache clear had issues"

    log_success "Cache cleared"
    echo ""
}

run_full_indexing() {
    log_info "Starting full indexing for dataset: ${DATASET_ID}..."
    log_info "This may take a while depending on document size..."
    echo ""

    # Run Microsoft GraphRAG indexing
    docker exec ${GRAPHRAG_CONTAINER} python -m graphrag.index \
        --root "/data/graphrag/${DATASET_ID}" \
        --config "/app/configs/settings.yaml" \
        2>&1 | while read line; do
            echo -e "${BLUE}[GRAPHRAG]${NC} $line"
        done

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        log_success "Full indexing complete!"
    else
        log_error "Indexing failed"
        exit 1
    fi
    echo ""
}

update_neo4j() {
    log_info "Updating Neo4j with new graph data..."

    docker exec ${GRAPHRAG_CONTAINER} python -c "
from app.services.graphrag_adapter import GraphRAGAdapter
import asyncio

async def sync_to_neo4j():
    adapter = GraphRAGAdapter()
    await adapter.sync_to_neo4j('${DATASET_ID}')
    print('Neo4j sync complete')

asyncio.run(sync_to_neo4j())
" || log_warn "Neo4j sync had issues (adapter may not be configured)"

    log_success "Neo4j update complete"
    echo ""
}

print_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Rebuild Summary                           ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Dataset ID     │ ${DATASET_ID}"
    echo "║  Timestamp      │ ${TIMESTAMP}"
    echo "║  Archive Path   │ /data/graphrag/archives/${DATASET_ID}_${TIMESTAMP}"
    echo "║  Output Path    │ /data/graphrag/${DATASET_ID}/output"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

main() {
    print_banner

    log_info "Dataset ID: ${DATASET_ID}"
    log_info "Timestamp: ${TIMESTAMP}"
    echo ""

    case "${2:-rebuild}" in
        "rebuild")
            check_prerequisites
            archive_existing_data
            clear_cache
            run_full_indexing
            update_neo4j
            print_summary
            log_success "GraphRAG full rebuild complete!"
            ;;
        "archive-only")
            check_prerequisites
            archive_existing_data
            log_success "Archive complete (no rebuild)"
            ;;
        "index-only")
            check_prerequisites
            run_full_indexing
            update_neo4j
            print_summary
            log_success "Indexing complete (no archive)"
            ;;
        *)
            echo "Usage: $0 [dataset_id] [rebuild|archive-only|index-only]"
            echo ""
            echo "Commands:"
            echo "  rebuild      - Archive existing data, clear cache, and rebuild (default)"
            echo "  archive-only - Only archive existing data"
            echo "  index-only   - Only run indexing (no archive)"
            echo ""
            echo "Examples:"
            echo "  $0 my-documents rebuild"
            echo "  $0 knowledge-base"
            exit 1
            ;;
    esac
}

main "$@"
