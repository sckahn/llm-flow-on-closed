#!/bin/bash
# ============================================
# Phase 1: Service Health Checks
# ============================================

run_health_checks() {
    # Test: Dify API Health
    print_test "Dify API Health (/health)"
    if check_http "${DIFY_API_URL}/health"; then
        print_pass
    else
        print_fail "Not responding at ${DIFY_API_URL}"
    fi

    # Test: GraphRAG API Health
    print_test "GraphRAG API Health (/health)"
    local response=$(http_get "${GRAPHRAG_API_URL}/health")
    if [ -n "$response" ]; then
        print_pass
    else
        print_fail "Not responding at ${GRAPHRAG_API_URL}"
    fi

    # Test: TEI Embedding Health
    print_test "TEI Embedding Health (/health)"
    if check_http "${TEI_EMBEDDING_URL}/health"; then
        print_pass
    else
        print_fail "Not responding at ${TEI_EMBEDDING_URL}"
    fi

    # Test: TEI Reranker Health
    print_test "TEI Reranker Health (/health)"
    if check_http "${TEI_RERANKER_URL}/health"; then
        print_pass
    else
        print_fail "Not responding at ${TEI_RERANKER_URL}"
    fi

    # Test: Neo4j HTTP
    print_test "Neo4j HTTP Interface (port 7474)"
    if check_http "${NEO4J_HTTP_URL}"; then
        print_pass
    else
        print_fail "Not responding at ${NEO4J_HTTP_URL}"
    fi

    # Test: Neo4j Bolt
    print_test "Neo4j Bolt Protocol (port 7687)"
    if check_tcp "${NEO4J_BOLT_HOST}" "${NEO4J_BOLT_PORT}"; then
        print_pass
    else
        print_fail "Bolt protocol not responding"
    fi

    # Test: Milvus gRPC
    print_test "Milvus gRPC (port 19530)"
    if check_tcp "${MILVUS_HOST}" "${MILVUS_PORT}"; then
        print_pass
    else
        print_fail "gRPC not responding"
    fi

    # Test: Milvus Health API
    print_test "Milvus Health API (port 9091)"
    if check_http "${MILVUS_HEALTH_URL}/healthz"; then
        print_pass
    else
        print_fail "Health endpoint not responding"
    fi
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "${SCRIPT_DIR}/config.sh"
    source "${SCRIPT_DIR}/utils.sh"
    run_health_checks
fi
