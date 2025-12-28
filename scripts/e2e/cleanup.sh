#!/bin/bash
# ============================================
# E2E Test Cleanup Script
# ============================================

cleanup_test_data() {
    local dataset_id="${1:-}"
    local force="${2:-false}"

    echo ""
    echo -e "${CYAN}${INFO_MARK} Cleaning up test data...${NC}"

    if [ -z "$dataset_id" ]; then
        echo -e "${YELLOW}${WARN_MARK} No dataset_id provided, cleaning all e2e_test_* data${NC}"
        dataset_id="e2e_test_*"
    fi

    # Cleanup Neo4j graph data
    print_test "Cleanup Neo4j Graph Data"
    local payload=$(cat <<EOF
{
    "dataset_id": "${dataset_id}",
    "confirm": true
}
EOF
)
    local response=$(http_delete "${GRAPHRAG_API_URL}/api/graphrag/data/dataset/${dataset_id}" "$payload" 30)
    if [ -n "$response" ] || [ "$force" = true ]; then
        print_pass
    else
        print_skip "No graph data to clean or endpoint not available"
    fi

    # Cleanup Milvus vectors
    print_test "Cleanup Milvus Vectors"
    response=$(http_delete "${GRAPHRAG_API_URL}/api/graphrag/vectors/${dataset_id}" "" 30)
    if [ -n "$response" ] || [ "$force" = true ]; then
        print_pass
    else
        print_skip "No vectors to clean or endpoint not available"
    fi

    # Cleanup test documents from storage
    print_test "Cleanup Test Documents"
    response=$(http_delete "${GRAPHRAG_API_URL}/api/graphrag/documents/${dataset_id}" "" 30)
    if [ -n "$response" ] || [ "$force" = true ]; then
        print_pass
    else
        print_skip "No documents to clean or endpoint not available"
    fi

    echo ""
    echo -e "${GREEN}${CHECK_MARK} Cleanup completed${NC}"
}

cleanup_all_test_data() {
    echo ""
    echo -e "${YELLOW}${WARN_MARK} Cleaning ALL e2e test data...${NC}"

    # Find and clean all test datasets
    local response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/datasets?prefix=e2e_test_")
    if [ -n "$response" ]; then
        local datasets=$(json_get "$response" '.datasets[]? // empty')
        if [ -n "$datasets" ]; then
            while IFS= read -r ds; do
                if [ -n "$ds" ]; then
                    echo -e "${BLUE}${INFO_MARK} Cleaning dataset: ${ds}${NC}"
                    cleanup_test_data "$ds" true
                fi
            done <<< "$datasets"
        else
            echo -e "${GREEN}${CHECK_MARK} No test datasets found${NC}"
        fi
    else
        # Fallback: try to clean known patterns
        echo -e "${YELLOW}${WARN_MARK} Could not list datasets, attempting pattern-based cleanup${NC}"
        cleanup_test_data "e2e_test_*" true
    fi
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "${SCRIPT_DIR}/config.sh"
    source "${SCRIPT_DIR}/utils.sh"

    if [ "$1" = "--all" ]; then
        cleanup_all_test_data
    elif [ -n "$1" ]; then
        cleanup_test_data "$1"
    else
        echo "Usage: $0 <dataset_id> | --all"
        echo ""
        echo "Options:"
        echo "  <dataset_id>  Clean specific dataset"
        echo "  --all         Clean all e2e_test_* datasets"
        exit 1
    fi
fi
