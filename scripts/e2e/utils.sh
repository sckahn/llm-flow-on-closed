#!/bin/bash
# ============================================
# E2E Test Utility Functions
# ============================================

# Test counters (initialized in main script)
TOTAL_TESTS=${TOTAL_TESTS:-0}
PASSED_TESTS=${PASSED_TESTS:-0}
FAILED_TESTS=${FAILED_TESTS:-0}
SKIPPED_TESTS=${SKIPPED_TESTS:-0}

# Logging functions
print_header() {
    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    printf "║  %-48s ║\n" "$1"
    echo "╚══════════════════════════════════════════════════╝"
}

print_section() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${CYAN}${INFO_MARK} $1${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

print_test() {
    printf "  %-50s" "$1"
}

print_pass() {
    echo -e "${GREEN}${CHECK_MARK} PASS${NC}"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

print_fail() {
    echo -e "${RED}${CROSS_MARK} FAIL${NC}"
    [ -n "${1:-}" ] && echo -e "    ${RED}Error: $1${NC}"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

print_skip() {
    echo -e "${YELLOW}${WARN_MARK} SKIP${NC}"
    [ -n "${1:-}" ] && echo -e "    ${YELLOW}Reason: $1${NC}"
    ((SKIPPED_TESTS++))
    ((TOTAL_TESTS++))
}

print_info() {
    echo -e "    ${BLUE}${INFO_MARK} $1${NC}"
}

print_success() {
    echo -e "${GREEN}${CHECK_MARK} $1${NC}"
}

print_error() {
    echo -e "${RED}${CROSS_MARK} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARN_MARK} $1${NC}"
}

# HTTP request helper
http_get() {
    local url=$1
    local timeout="${2:-$API_TIMEOUT}"

    curl -sf --max-time "$timeout" "$url" 2>/dev/null
}

http_post() {
    local url=$1
    local data=$2
    local timeout="${3:-$API_TIMEOUT}"

    curl -sf --max-time "$timeout" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$data" \
        "$url" 2>/dev/null
}

http_delete() {
    local url=$1
    local data="${2:-}"
    local timeout="${3:-$API_TIMEOUT}"

    if [ -n "$data" ]; then
        curl -sf --max-time "$timeout" \
            -X DELETE \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$url" 2>/dev/null
    else
        curl -sf --max-time "$timeout" -X DELETE "$url" 2>/dev/null
    fi
}

# Check HTTP endpoint
check_http() {
    local url=$1
    local timeout="${2:-$HEALTH_TIMEOUT}"

    curl -sf --max-time "$timeout" "$url" > /dev/null 2>&1
}

# Check TCP port
check_tcp() {
    local host=$1
    local port=$2
    local timeout="${3:-$HEALTH_TIMEOUT}"

    if command -v nc &> /dev/null; then
        nc -z -w "$timeout" "$host" "$port" 2>/dev/null
    else
        timeout "$timeout" bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null
    fi
}

# JSON field extraction (requires jq)
json_get() {
    local json=$1
    local field=$2

    if command -v jq &> /dev/null; then
        echo "$json" | jq -r "$field" 2>/dev/null
    else
        echo ""
    fi
}

# Check if jq is available
check_jq() {
    if ! command -v jq &> /dev/null; then
        print_warning "jq not found. Some tests may not work properly."
        print_info "Install with: sudo apt-get install jq"
        return 1
    fi
    return 0
}

# Timer functions
start_timer() {
    TEST_START_TIME=$(date +%s%N 2>/dev/null || date +%s)
}

end_timer() {
    local end_time=$(date +%s%N 2>/dev/null || date +%s)
    if [[ "$TEST_START_TIME" =~ ^[0-9]+$ ]] && [[ "$end_time" =~ ^[0-9]+$ ]]; then
        if [ ${#TEST_START_TIME} -gt 10 ]; then
            # Nanoseconds available
            local elapsed=$(( (end_time - TEST_START_TIME) / 1000000 ))
            echo "${elapsed}ms"
        else
            # Only seconds available
            local elapsed=$((end_time - TEST_START_TIME))
            echo "${elapsed}s"
        fi
    else
        echo "N/A"
    fi
}

# Generate unique test ID
generate_test_id() {
    echo "e2e_test_$(date +%s)"
}
