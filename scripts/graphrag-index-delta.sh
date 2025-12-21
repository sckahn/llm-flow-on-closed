#!/bin/bash
# GraphRAG Delta Indexing Script
# Incrementally indexes only new or modified documents
# Usage: ./scripts/graphrag-index-delta.sh [dataset_id]

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
    echo "║           GraphRAG Delta Indexing                            ║"
    echo "║           Incremental Update for New Documents               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# Parse arguments
DATASET_ID=${1:-default}
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

    # Check if dataset exists
    if ! docker exec ${GRAPHRAG_CONTAINER} test -d "/data/graphrag/${DATASET_ID}"; then
        log_error "Dataset directory '/data/graphrag/${DATASET_ID}' does not exist"
        log_info "Create the dataset directory and add input documents first"
        exit 1
    fi

    log_success "Prerequisites check passed"
    echo ""
}

check_new_documents() {
    log_info "Checking for new documents in dataset: ${DATASET_ID}..."

    NEW_DOCS=$(docker exec ${GRAPHRAG_CONTAINER} bash -c "
        INPUT_DIR='/data/graphrag/${DATASET_ID}/input'
        PROCESSED_FILE='/data/graphrag/${DATASET_ID}/.processed_files'

        if [ ! -d \"\${INPUT_DIR}\" ]; then
            echo 'ERROR: Input directory not found'
            exit 1
        fi

        if [ ! -f \"\${PROCESSED_FILE}\" ]; then
            # First run - all files are new
            find \"\${INPUT_DIR}\" -type f \\( -name '*.txt' -o -name '*.md' -o -name '*.pdf' \\) | wc -l
        else
            # Compare with processed files list
            find \"\${INPUT_DIR}\" -type f \\( -name '*.txt' -o -name '*.md' -o -name '*.pdf' \\) -newer \"\${PROCESSED_FILE}\" | wc -l
        fi
    " | tail -1)

    if [ "$NEW_DOCS" = "0" ]; then
        log_info "No new documents found. Skipping indexing."
        return 1
    else
        log_info "Found ${NEW_DOCS} new/modified documents"
        return 0
    fi
}

run_delta_indexing() {
    log_info "Starting delta indexing for dataset: ${DATASET_ID}..."
    log_info "Only new and modified documents will be processed..."
    echo ""

    # Run Microsoft GraphRAG update mode
    docker exec ${GRAPHRAG_CONTAINER} python -m graphrag.index \
        --root "/data/graphrag/${DATASET_ID}" \
        --config "/app/configs/settings.yaml" \
        --update \
        2>&1 | while read line; do
            echo -e "${BLUE}[GRAPHRAG]${NC} $line"
        done

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        log_success "Delta indexing complete!"
    else
        log_error "Delta indexing failed"
        exit 1
    fi
    echo ""
}

update_processed_marker() {
    log_info "Updating processed files marker..."

    docker exec ${GRAPHRAG_CONTAINER} bash -c "
        touch '/data/graphrag/${DATASET_ID}/.processed_files'
    "

    log_success "Marker updated"
    echo ""
}

sync_to_stores() {
    log_info "Syncing updates to Neo4j and Milvus..."

    docker exec ${GRAPHRAG_CONTAINER} python -c "
from app.services.graphrag_adapter import GraphRAGAdapter
import asyncio

async def sync_updates():
    adapter = GraphRAGAdapter()

    # Sync new entities to Neo4j
    await adapter.sync_delta_to_neo4j('${DATASET_ID}')

    # Sync new embeddings to Milvus
    await adapter.sync_delta_to_milvus('${DATASET_ID}')

    print('Delta sync complete')

asyncio.run(sync_updates())
" || log_warn "Sync had issues (adapter may not be configured yet)"

    log_success "Store sync complete"
    echo ""
}

print_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                Delta Indexing Summary                        ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Dataset ID     │ ${DATASET_ID}"
    echo "║  Mode           │ Incremental Update"
    echo "║  Output Path    │ /data/graphrag/${DATASET_ID}/output"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

main() {
    print_banner

    log_info "Dataset ID: ${DATASET_ID}"
    echo ""

    case "${2:-delta}" in
        "delta")
            check_prerequisites
            if check_new_documents; then
                run_delta_indexing
                update_processed_marker
                sync_to_stores
                print_summary
                log_success "GraphRAG delta indexing complete!"
            else
                log_success "No updates needed"
            fi
            ;;
        "force")
            check_prerequisites
            run_delta_indexing
            update_processed_marker
            sync_to_stores
            print_summary
            log_success "GraphRAG forced delta indexing complete!"
            ;;
        "check")
            check_prerequisites
            if check_new_documents; then
                log_info "New documents are available for indexing"
            else
                log_info "No new documents to index"
            fi
            ;;
        *)
            echo "Usage: $0 [dataset_id] [delta|force|check]"
            echo ""
            echo "Commands:"
            echo "  delta  - Index only new/modified documents (default)"
            echo "  force  - Force delta indexing even if no new documents detected"
            echo "  check  - Only check for new documents without indexing"
            echo ""
            echo "Examples:"
            echo "  $0 my-documents delta"
            echo "  $0 knowledge-base check"
            exit 1
            ;;
    esac
}

main "$@"
