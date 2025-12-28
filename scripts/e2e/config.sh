#!/bin/bash
# ============================================
# E2E Test Configuration
# ============================================

# Service Endpoints
export DIFY_API_URL="http://localhost:5001"
export GRAPHRAG_API_URL="http://localhost:8082"
export TEI_EMBEDDING_URL="http://localhost:8083"
export TEI_RERANKER_URL="http://localhost:8081"
export NEO4J_HTTP_URL="http://localhost:7474"
export NEO4J_BOLT_HOST="localhost"
export NEO4J_BOLT_PORT="7687"
export MILVUS_HOST="localhost"
export MILVUS_PORT="19530"
export MILVUS_HEALTH_URL="http://localhost:9091"

# Timeouts (seconds)
export HEALTH_TIMEOUT=5
export API_TIMEOUT=30
export FLOW_TIMEOUT=120

# Retry settings
export MAX_RETRIES=3
export RETRY_DELAY=2

# Test data settings
export TEST_CHUNK_SIZE=500

# Colors
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m'

# Symbols
export CHECK_MARK="✓"
export CROSS_MARK="✗"
export WARN_MARK="⚠"
export INFO_MARK="ℹ"
