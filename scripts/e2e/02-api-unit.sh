#!/bin/bash
# ============================================
# Phase 2: API Unit Tests
# ============================================

run_api_tests() {
    echo ""
    echo -e "${BLUE}Testing GraphRAG API Endpoints${NC}"

    # Test: GraphRAG Stats
    print_test "GraphRAG Stats (/api/graphrag/stats)"
    local response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/stats")
    if [ -n "$response" ]; then
        print_pass
    else
        print_fail "Stats endpoint failed"
    fi

    # Test: GraphRAG Extract Entities
    print_test "GraphRAG Extract Entities"
    local payload='{
        "text": "삼성전자는 서울에 본사를 두고 있습니다.",
        "document_id": "test_doc_001",
        "chunk_id": "chunk_001"
    }'
    response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/extract/entities" "$payload" 60)
    if [ -n "$response" ]; then
        local entity_count=$(json_get "$response" '.entities | length')
        if [ -n "$entity_count" ] && [ "$entity_count" != "null" ]; then
            print_pass
            [ "$VERBOSE" = true ] && print_info "Extracted ${entity_count} entities"
        else
            print_pass
        fi
    else
        print_fail "Entity extraction failed"
    fi

    # Test: GraphRAG Extract All
    print_test "GraphRAG Extract All (entities + rels)"
    payload='{
        "text": "이재용 회장은 삼성전자를 경영하고 있습니다. 삼성전자는 NVIDIA와 협력합니다.",
        "document_id": "test_doc_002"
    }'
    response=$(http_post "${GRAPHRAG_API_URL}/api/graphrag/extract/all" "$payload" 90)
    if [ -n "$response" ]; then
        print_pass
    else
        print_fail "Extract all failed"
    fi

    # Test: GraphRAG Suggestions
    print_test "GraphRAG Query Suggestions"
    response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/search/suggestions")
    if [ -n "$response" ]; then
        print_pass
    else
        print_fail "Suggestions endpoint failed"
    fi

    # Test: GraphRAG Colors
    print_test "GraphRAG Color Palette"
    response=$(http_get "${GRAPHRAG_API_URL}/api/graphrag/visualize/colors")
    if [ -n "$response" ]; then
        print_pass
    else
        print_fail "Colors endpoint failed"
    fi

    echo ""
    echo -e "${BLUE}Testing TEI Endpoints${NC}"

    # Test: TEI Embedding
    print_test "TEI Embedding (/embed)"
    payload='{"inputs": "테스트 문장입니다"}'
    response=$(http_post "${TEI_EMBEDDING_URL}/embed" "$payload" 30)
    if [ -n "$response" ] && [[ "$response" == "["* ]]; then
        print_pass
    else
        print_fail "Embedding failed"
    fi

    # Test: TEI Rerank
    print_test "TEI Reranker (/rerank)"
    payload='{
        "query": "인공지능 반도체",
        "texts": ["삼성전자 반도체 투자", "날씨 정보", "AI 칩 개발"]
    }'
    response=$(http_post "${TEI_RERANKER_URL}/rerank" "$payload" 30)
    if [ -n "$response" ]; then
        print_pass
    else
        print_fail "Rerank failed"
    fi
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "${SCRIPT_DIR}/config.sh"
    source "${SCRIPT_DIR}/utils.sh"
    run_api_tests
fi
