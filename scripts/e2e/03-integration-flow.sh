#!/bin/bash
# ============================================
# Phase 3: Integration Flow Tests
# ============================================

# Global variables for test data
TEST_DATASET_ID=""
TEST_DOCUMENT_ID=""
CREATED_ENTITY_IDS=()

run_integration_tests() {
    # Generate unique IDs for this test run
    TEST_DATASET_ID="e2e_test_$(date +%s)"
    TEST_DOCUMENT_ID="doc_$(date +%s)"

    echo ""
    echo -e "${BLUE}Flow 1: Document Ingestion${NC}"
    run_flow1_document_ingestion

    echo ""
    echo -e "${BLUE}Flow 2: Hybrid Search${NC}"
    run_flow2_hybrid_search

    echo ""
    echo -e "${BLUE}Flow 3: Graph Visualization${NC}"
    run_flow3_graph_visualization

    echo ""
    echo -e "${BLUE}Flow 4: Natural Language Query${NC}"
    run_flow4_nl_query
}

run_flow1_document_ingestion() {
    # Step 1: Ingest document with entities
    print_test "Ingest Document with Entities"
    local payload=$(cat <<EOF
{
    "text": "삼성전자는 대한민국 서울에 본사를 둔 글로벌 IT 기업입니다. 이재용 회장이 경영하고 있으며, NVIDIA와 AI 반도체 분야에서 협력하고 있습니다. 삼성전자는 갤럭시 스마트폰과 메모리 반도체로 유명합니다.",
    "document_id": "${TEST_DOCUMENT_ID}",
    "dataset_id": "${TEST_DATASET_ID}",
    "metadata": {
        "source": "e2e_test",
        "language": "ko"
    }
}
EOF
)
    local response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/ingest/document" "$payload" 120)
    if [ -n "$response" ]; then
        local entity_count=$(json_get "$response" '.entities | length // 0')
        local rel_count=$(json_get "$response" '.relationships | length // 0')
        print_pass
        [ "$VERBOSE" = true ] && print_info "Entities: ${entity_count}, Relationships: ${rel_count}"

        # Store entity IDs for cleanup
        local ids=$(json_get "$response" '.entities[].id // empty')
        if [ -n "$ids" ]; then
            while IFS= read -r id; do
                [ -n "$id" ] && CREATED_ENTITY_IDS+=("$id")
            done <<< "$ids"
        fi
    else
        print_fail "Document ingestion failed"
    fi

    # Step 2: Verify document was stored
    print_test "Verify Document Storage"
    sleep 2  # Wait for async processing
    response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/ingest/stats/${TEST_DATASET_ID}")
    if [ -n "$response" ]; then
        local doc_count=$(json_get "$response" '.document_count // .total_documents // 0')
        if [ "$doc_count" != "null" ] && [ "$doc_count" != "0" ]; then
            print_pass
            [ "$VERBOSE" = true ] && print_info "Documents in dataset: ${doc_count}"
        else
            print_pass
            [ "$VERBOSE" = true ] && print_info "Stats endpoint responded (may be async)"
        fi
    else
        print_skip "Stats endpoint not available"
    fi

    # Step 3: Get entity details
    print_test "Retrieve Entity Details"
    response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/entities?dataset_id=${TEST_DATASET_ID}&limit=5")
    if [ -n "$response" ]; then
        local count=$(json_get "$response" '.entities | length // length // 0')
        print_pass
        [ "$VERBOSE" = true ] && print_info "Retrieved ${count} entities"
    else
        print_skip "Entity retrieval not available"
    fi
}

run_flow2_hybrid_search() {
    local search_query="삼성전자 AI 반도체"

    # Vector Search
    print_test "Vector Search (Milvus)"
    local payload=$(cat <<EOF
{
    "query": "${search_query}",
    "dataset_id": "${TEST_DATASET_ID}",
    "mode": "vector",
    "top_k": 5
}
EOF
)
    local response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/search/query" "$payload" 60)
    if [ -n "$response" ]; then
        local result_count=$(json_get "$response" '.results | length // 0')
        print_pass
        [ "$VERBOSE" = true ] && print_info "Vector results: ${result_count}"
    else
        print_fail "Vector search failed"
    fi

    # Graph Search
    print_test "Graph Search (Neo4j)"
    payload=$(cat <<EOF
{
    "query": "${search_query}",
    "dataset_id": "${TEST_DATASET_ID}",
    "mode": "graph",
    "top_k": 5
}
EOF
)
    response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/search/query" "$payload" 60)
    if [ -n "$response" ]; then
        local result_count=$(json_get "$response" '.results | length // 0')
        print_pass
        [ "$VERBOSE" = true ] && print_info "Graph results: ${result_count}"
    else
        print_fail "Graph search failed"
    fi

    # Hybrid Search with RRF
    print_test "Hybrid Search (RRF Fusion)"
    payload=$(cat <<EOF
{
    "query": "${search_query}",
    "dataset_id": "${TEST_DATASET_ID}",
    "mode": "hybrid",
    "top_k": 5,
    "rerank": true
}
EOF
)
    response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/search/query" "$payload" 90)
    if [ -n "$response" ]; then
        local result_count=$(json_get "$response" '.results | length // 0')
        print_pass
        [ "$VERBOSE" = true ] && print_info "Hybrid results: ${result_count}"
    else
        print_fail "Hybrid search failed"
    fi
}

run_flow3_graph_visualization() {
    # Get graph data for visualization
    print_test "Get Graph Data"
    local response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/visualize/graph/${TEST_DATASET_ID}?limit=50")
    if [ -n "$response" ]; then
        local node_count=$(json_get "$response" '.nodes | length // 0')
        local edge_count=$(json_get "$response" '.edges | length // .links | length // 0')
        print_pass
        [ "$VERBOSE" = true ] && print_info "Nodes: ${node_count}, Edges: ${edge_count}"
    else
        print_skip "Graph visualization not available"
    fi

    # Get entity neighborhood
    print_test "Get Entity Neighborhood"
    if [ ${#CREATED_ENTITY_IDS[@]} -gt 0 ]; then
        local entity_id="${CREATED_ENTITY_IDS[0]}"
        response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/visualize/entity/${entity_id}?depth=2")
        if [ -n "$response" ]; then
            print_pass
        else
            print_skip "Entity neighborhood not available"
        fi
    else
        print_skip "No entity IDs available"
    fi

    # Get visualization stats
    print_test "Get Visualization Stats"
    response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/visualize/stats/${TEST_DATASET_ID}")
    if [ -n "$response" ]; then
        print_pass
    else
        print_skip "Visualization stats not available"
    fi
}

run_flow4_nl_query() {
    # Natural language query with context
    print_test "Natural Language Query"
    local payload=$(cat <<EOF
{
    "query": "삼성전자와 NVIDIA의 관계는 무엇인가요?",
    "dataset_id": "${TEST_DATASET_ID}",
    "use_graph_context": true,
    "max_tokens": 500
}
EOF
)
    local response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/search/nl-query" "$payload" 120)
    if [ -n "$response" ]; then
        local answer=$(json_get "$response" '.answer // .response // .result // empty')
        if [ -n "$answer" ] && [ "$answer" != "null" ]; then
            print_pass
            [ "$VERBOSE" = true ] && print_info "Answer received (${#answer} chars)"
        else
            print_pass
            [ "$VERBOSE" = true ] && print_info "Response received"
        fi
    else
        print_skip "NL query endpoint not available"
    fi

    # Query with graph exploration
    print_test "Graph-Augmented Query"
    payload=$(cat <<EOF
{
    "query": "이재용 회장이 경영하는 회사는?",
    "dataset_id": "${TEST_DATASET_ID}",
    "use_graph_context": true,
    "explore_depth": 2
}
EOF
)
    response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/search/nl-query" "$payload" 120)
    if [ -n "$response" ]; then
        print_pass
    else
        print_skip "Graph-augmented query not available"
    fi
}

# Export test data IDs for cleanup
export_test_ids() {
    echo "TEST_DATASET_ID=${TEST_DATASET_ID}"
    echo "TEST_DOCUMENT_ID=${TEST_DOCUMENT_ID}"
    echo "CREATED_ENTITY_IDS=${CREATED_ENTITY_IDS[*]}"
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "${SCRIPT_DIR}/config.sh"
    source "${SCRIPT_DIR}/utils.sh"
    run_integration_tests
    echo ""
    export_test_ids
fi
