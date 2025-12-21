#!/bin/bash
# GraphRAG Resume Script
# Resume indexing from the last checkpoint after interruption
# Usage: ./scripts/graphrag-resume.sh [dataset_id]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
DOCKER_DIR="${PROJECT_DIR}/docker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

log_checkpoint() {
    echo -e "${CYAN}[CHECKPOINT]${NC} $1"
}

print_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           GraphRAG Resume from Checkpoint                    ║"
    echo "║           Continue Interrupted Indexing                      ║"
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

    log_success "Prerequisites check passed"
    echo ""
}

check_checkpoint() {
    log_info "Checking for existing checkpoint..."

    CHECKPOINT_INFO=$(docker exec ${GRAPHRAG_CONTAINER} bash -c "
        CACHE_DIR='/data/graphrag/cache/${DATASET_ID}'
        CHECKPOINT_FILE=\"\${CACHE_DIR}/.checkpoint\"

        if [ -f \"\${CHECKPOINT_FILE}\" ]; then
            cat \"\${CHECKPOINT_FILE}\"
        else
            # Check for partial output
            OUTPUT_DIR='/data/graphrag/${DATASET_ID}/output'
            if [ -d \"\${OUTPUT_DIR}\" ]; then
                LAST_STEP=\$(ls -t \"\${OUTPUT_DIR}\" 2>/dev/null | head -1)
                if [ -n \"\${LAST_STEP}\" ]; then
                    echo \"partial:\${LAST_STEP}\"
                else
                    echo 'none'
                fi
            else
                echo 'none'
            fi
        fi
    ")

    if [ "$CHECKPOINT_INFO" = "none" ]; then
        log_warn "No checkpoint found for dataset: ${DATASET_ID}"
        log_info "Consider running a full rebuild instead:"
        log_info "  ./scripts/graphrag-rebuild-full.sh ${DATASET_ID}"
        return 1
    else
        log_checkpoint "Found checkpoint: ${CHECKPOINT_INFO}"
        return 0
    fi
}

list_checkpoints() {
    log_info "Available checkpoints for all datasets:"
    echo ""

    docker exec ${GRAPHRAG_CONTAINER} bash -c "
        echo '┌─────────────────┬────────────────────────────┬──────────────┐'
        echo '│ Dataset         │ Last Activity              │ Status       │'
        echo '├─────────────────┼────────────────────────────┼──────────────┤'

        for dir in /data/graphrag/*/; do
            if [ -d \"\$dir\" ]; then
                dataset=\$(basename \"\$dir\")
                if [ \"\$dataset\" != 'cache' ] && [ \"\$dataset\" != 'archives' ]; then
                    checkpoint_file=\"/data/graphrag/cache/\${dataset}/.checkpoint\"
                    output_dir=\"\${dir}output\"

                    if [ -f \"\$checkpoint_file\" ]; then
                        last_mod=\$(stat -c '%Y' \"\$checkpoint_file\" 2>/dev/null || stat -f '%m' \"\$checkpoint_file\" 2>/dev/null)
                        last_date=\$(date -d \"@\$last_mod\" '+%Y-%m-%d %H:%M' 2>/dev/null || date -r \"\$last_mod\" '+%Y-%m-%d %H:%M' 2>/dev/null)
                        status='In Progress'
                    elif [ -d \"\$output_dir\" ] && [ \"\$(ls -A \"\$output_dir\" 2>/dev/null)\" ]; then
                        last_mod=\$(stat -c '%Y' \"\$output_dir\" 2>/dev/null || stat -f '%m' \"\$output_dir\" 2>/dev/null)
                        last_date=\$(date -d \"@\$last_mod\" '+%Y-%m-%d %H:%M' 2>/dev/null || date -r \"\$last_mod\" '+%Y-%m-%d %H:%M' 2>/dev/null)
                        status='Completed'
                    else
                        last_date='-'
                        status='Not Started'
                    fi

                    printf '│ %-15s │ %-26s │ %-12s │\n' \"\$dataset\" \"\$last_date\" \"\$status\"
                fi
            fi
        done

        echo '└─────────────────┴────────────────────────────┴──────────────┘'
    " 2>/dev/null || log_warn "Could not list checkpoints"
    echo ""
}

resume_indexing() {
    log_info "Resuming indexing for dataset: ${DATASET_ID}..."
    log_info "Continuing from last checkpoint..."
    echo ""

    # Run Microsoft GraphRAG in resume mode
    docker exec ${GRAPHRAG_CONTAINER} python -m graphrag.index \
        --root "/data/graphrag/${DATASET_ID}" \
        --config "/app/configs/settings.yaml" \
        --resume \
        2>&1 | while read line; do
            echo -e "${BLUE}[GRAPHRAG]${NC} $line"
        done

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        log_success "Resume indexing complete!"
    else
        log_error "Resume indexing failed"
        log_info "Try running a full rebuild: ./scripts/graphrag-rebuild-full.sh ${DATASET_ID}"
        exit 1
    fi
    echo ""
}

clear_checkpoint() {
    log_info "Clearing checkpoint for dataset: ${DATASET_ID}..."

    docker exec ${GRAPHRAG_CONTAINER} bash -c "
        rm -f '/data/graphrag/cache/${DATASET_ID}/.checkpoint'
        rm -rf '/data/graphrag/cache/${DATASET_ID}/*'
    " || log_warn "Clear checkpoint had issues"

    log_success "Checkpoint cleared"
    echo ""
}

sync_to_stores() {
    log_info "Syncing results to Neo4j and Milvus..."

    docker exec ${GRAPHRAG_CONTAINER} python -c "
from app.services.graphrag_adapter import GraphRAGAdapter
import asyncio

async def sync_all():
    adapter = GraphRAGAdapter()
    await adapter.sync_to_neo4j('${DATASET_ID}')
    await adapter.sync_to_milvus('${DATASET_ID}')
    print('Store sync complete')

asyncio.run(sync_all())
" || log_warn "Sync had issues (adapter may not be configured yet)"

    log_success "Store sync complete"
    echo ""
}

print_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Resume Summary                            ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Dataset ID     │ ${DATASET_ID}"
    echo "║  Mode           │ Resume from Checkpoint"
    echo "║  Output Path    │ /data/graphrag/${DATASET_ID}/output"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

main() {
    print_banner

    log_info "Dataset ID: ${DATASET_ID}"
    echo ""

    case "${2:-resume}" in
        "resume")
            check_prerequisites
            if check_checkpoint; then
                resume_indexing
                sync_to_stores
                print_summary
                log_success "GraphRAG resume complete!"
            else
                exit 1
            fi
            ;;
        "list")
            check_prerequisites
            list_checkpoints
            ;;
        "status")
            check_prerequisites
            check_checkpoint
            ;;
        "clear")
            check_prerequisites
            clear_checkpoint
            log_success "Checkpoint cleared for ${DATASET_ID}"
            ;;
        *)
            echo "Usage: $0 [dataset_id] [resume|list|status|clear]"
            echo ""
            echo "Commands:"
            echo "  resume  - Resume from last checkpoint (default)"
            echo "  list    - List all datasets and their checkpoint status"
            echo "  status  - Check checkpoint status for a dataset"
            echo "  clear   - Clear checkpoint and cache for a dataset"
            echo ""
            echo "Examples:"
            echo "  $0 my-documents resume"
            echo "  $0 list"
            echo "  $0 knowledge-base status"
            echo "  $0 old-dataset clear"
            exit 1
            ;;
    esac
}

main "$@"
