#!/bin/bash
# ============================================
# LLMFlow E2E Integration Test Suite
# ============================================
# Usage:
#   ./scripts/e2e-test.sh all           # Run all tests
#   ./scripts/e2e-test.sh health        # Health checks only
#   ./scripts/e2e-test.sh api           # Health + API tests
#   ./scripts/e2e-test.sh flow          # Health + API + Flow tests
#   ./scripts/e2e-test.sh all --verbose # Verbose output
#   ./scripts/e2e-test.sh all --cleanup # Cleanup after tests
# ============================================

# Don't use set -e as we want to continue on test failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="${SCRIPT_DIR}/e2e"

# Source configuration and utilities
source "${E2E_DIR}/config.sh"
source "${E2E_DIR}/utils.sh"

# Source test modules
source "${E2E_DIR}/01-healthcheck.sh"
source "${E2E_DIR}/02-api-unit.sh"
source "${E2E_DIR}/03-integration-flow.sh"
source "${E2E_DIR}/cleanup.sh"

# Global options
VERBOSE=false
DO_CLEANUP=false
TEST_LEVEL="all"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

show_usage() {
    echo "LLMFlow E2E Integration Test Suite"
    echo ""
    echo "Usage: $0 <level> [options]"
    echo ""
    echo "Levels:"
    echo "  health    Run health checks only"
    echo "  api       Run health + API unit tests"
    echo "  flow      Run health + API + integration flow tests"
    echo "  all       Run all tests (same as flow)"
    echo ""
    echo "Options:"
    echo "  --verbose, -v   Show detailed output"
    echo "  --cleanup, -c   Cleanup test data after tests"
    echo "  --help, -h      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 health              # Quick health check"
    echo "  $0 all --verbose       # Full test with details"
    echo "  $0 flow --cleanup      # Full test with cleanup"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            health|api|flow|all)
                TEST_LEVEL="$1"
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --cleanup|-c)
                DO_CLEANUP=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_usage
                exit 1
                ;;
        esac
    done
}

print_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║       LLMFlow E2E Integration Test Suite                 ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Testing: Dify API, GraphRAG, TEI, Neo4j, Milvus         ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${CYAN}Test Level:${NC} ${TEST_LEVEL}"
    echo -e "${CYAN}Verbose:${NC} ${VERBOSE}"
    echo -e "${CYAN}Cleanup:${NC} ${DO_CLEANUP}"
    echo -e "${CYAN}Started:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
}

print_summary() {
    local exit_code=0

    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║                    Test Summary                          ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    printf "║  %-20s %5d                              ║\n" "Total Tests:" "$TOTAL_TESTS"
    printf "║  %-20s ${GREEN}%5d${NC}                              ║\n" "Passed:" "$PASSED_TESTS"
    printf "║  %-20s ${RED}%5d${NC}                              ║\n" "Failed:" "$FAILED_TESTS"
    printf "║  %-20s ${YELLOW}%5d${NC}                              ║\n" "Skipped:" "$SKIPPED_TESTS"
    echo "╚══════════════════════════════════════════════════════════╝"

    if [ $FAILED_TESTS -eq 0 ]; then
        echo ""
        echo -e "${GREEN}${CHECK_MARK} All tests passed!${NC}"
    else
        echo ""
        echo -e "${RED}${CROSS_MARK} Some tests failed. Check the output above for details.${NC}"
        exit_code=1
    fi

    echo ""
    echo -e "${CYAN}Finished:${NC} $(date '+%Y-%m-%d %H:%M:%S')"

    return $exit_code
}

run_tests() {
    local start_time=$(date +%s)

    # Phase 1: Health Checks (always run)
    print_section "Phase 1: Service Health Checks"
    run_health_checks

    # Phase 2: API Unit Tests
    if [[ "$TEST_LEVEL" == "api" || "$TEST_LEVEL" == "flow" || "$TEST_LEVEL" == "all" ]]; then
        print_section "Phase 2: API Unit Tests"
        run_api_tests
    fi

    # Phase 3: Integration Flow Tests
    if [[ "$TEST_LEVEL" == "flow" || "$TEST_LEVEL" == "all" ]]; then
        print_section "Phase 3: Integration Flow Tests"
        run_integration_tests
    fi

    # Cleanup if requested
    if [ "$DO_CLEANUP" = true ] && [ -n "$TEST_DATASET_ID" ]; then
        print_section "Cleanup"
        cleanup_test_data "$TEST_DATASET_ID"
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo ""
    echo -e "${CYAN}Duration:${NC} ${duration}s"
}

check_dependencies() {
    local missing=false

    # Check curl
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}${CROSS_MARK} curl is required but not installed${NC}"
        missing=true
    fi

    # Check jq (optional but recommended)
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}${WARN_MARK} jq is not installed. Some tests may have limited output.${NC}"
        echo -e "${BLUE}${INFO_MARK} Install with: sudo apt-get install jq${NC}"
    fi

    if [ "$missing" = true ]; then
        exit 1
    fi
}

main() {
    parse_args "$@"

    # Default to "all" if no level specified
    if [ -z "$TEST_LEVEL" ]; then
        TEST_LEVEL="all"
    fi

    check_dependencies
    print_banner
    start_timer

    run_tests

    print_summary
    exit $?
}

# Run main
main "$@"
