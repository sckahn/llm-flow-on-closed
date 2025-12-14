#!/bin/bash
# Service Health Check Script
# Checks the health status of all LLMFlow services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../docker/.env" 2>/dev/null || true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service configurations
declare -A SERVICES=(
    # Infrastructure
    ["PostgreSQL"]="localhost:5432|tcp"
    ["Redis"]="localhost:6379|tcp"
    ["MinIO"]="http://localhost:9000/minio/health/live|http"
    ["etcd"]="http://localhost:2379/health|http"

    # Data Stores
    ["Milvus"]="http://localhost:19530/healthz|http"
    ["Neo4j"]="http://localhost:7474|http"

    # Auth & Gateway
    ["Keycloak"]="http://localhost:8080/health/ready|http"
    ["APISIX"]="http://localhost:9080/apisix/status|http"

    # Core Platform
    ["Dify API"]="http://localhost:5001/health|http"
    ["Dify Web"]="http://localhost:3000|http"

    # Inference
    ["vLLM"]="http://localhost:8000/health|http"
    ["TEI Embedding"]="http://localhost:8080/health|http"
    ["TEI Reranker"]="http://localhost:8081/health|http"
    ["Unstructured"]="http://localhost:8000/healthcheck|http"

    # LLMOps
    ["LLaMA-Factory"]="http://localhost:7860|http"
    ["MLflow"]="http://localhost:5000/health|http"
    ["Langfuse"]="http://localhost:3001/api/public/health|http"

    # Monitoring
    ["Prometheus"]="http://localhost:9090/-/healthy|http"
    ["Grafana"]="http://localhost:3002/api/health|http"
)

# Check single service
check_service() {
    local name=$1
    local config=$2

    IFS='|' read -r endpoint check_type <<< "$config"

    case $check_type in
        "http")
            if curl -sf --max-time 5 "$endpoint" > /dev/null 2>&1; then
                echo -e "  ${GREEN}✓${NC} $name"
                return 0
            else
                echo -e "  ${RED}✗${NC} $name (${endpoint})"
                return 1
            fi
            ;;
        "tcp")
            IFS=':' read -r host port <<< "$endpoint"
            if nc -z -w 5 "$host" "$port" 2>/dev/null; then
                echo -e "  ${GREEN}✓${NC} $name"
                return 0
            else
                echo -e "  ${RED}✗${NC} $name (${endpoint})"
                return 1
            fi
            ;;
    esac
}

# Check all services by category
check_all_services() {
    local total=0
    local healthy=0

    echo ""
    echo "=== Infrastructure ==="
    for service in "PostgreSQL" "Redis" "MinIO" "etcd"; do
        ((total++))
        if check_service "$service" "${SERVICES[$service]}"; then
            ((healthy++))
        fi
    done

    echo ""
    echo "=== Data Stores ==="
    for service in "Milvus" "Neo4j"; do
        ((total++))
        if check_service "$service" "${SERVICES[$service]}"; then
            ((healthy++))
        fi
    done

    echo ""
    echo "=== Auth & Gateway ==="
    for service in "Keycloak" "APISIX"; do
        ((total++))
        if check_service "$service" "${SERVICES[$service]}"; then
            ((healthy++))
        fi
    done

    echo ""
    echo "=== Core Platform ==="
    for service in "Dify API" "Dify Web"; do
        ((total++))
        if check_service "$service" "${SERVICES[$service]}"; then
            ((healthy++))
        fi
    done

    echo ""
    echo "=== Inference Services ==="
    for service in "vLLM" "TEI Embedding" "TEI Reranker" "Unstructured"; do
        ((total++))
        if check_service "$service" "${SERVICES[$service]}"; then
            ((healthy++))
        fi
    done

    echo ""
    echo "=== LLMOps ==="
    for service in "LLaMA-Factory" "MLflow" "Langfuse"; do
        ((total++))
        if check_service "$service" "${SERVICES[$service]}"; then
            ((healthy++))
        fi
    done

    echo ""
    echo "=== Monitoring ==="
    for service in "Prometheus" "Grafana"; do
        ((total++))
        if check_service "$service" "${SERVICES[$service]}"; then
            ((healthy++))
        fi
    done

    echo ""
    echo "=========================================="
    if [ $healthy -eq $total ]; then
        echo -e "${GREEN}All services healthy: ${healthy}/${total}${NC}"
    elif [ $healthy -gt 0 ]; then
        echo -e "${YELLOW}Some services unhealthy: ${healthy}/${total}${NC}"
    else
        echo -e "${RED}All services down: ${healthy}/${total}${NC}"
    fi
    echo "=========================================="

    return $((total - healthy))
}

# Docker status
check_docker_status() {
    echo ""
    echo "=== Docker Container Status ==="
    docker compose -f "${SCRIPT_DIR}/../docker/docker-compose.yml" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
    docker-compose -f "${SCRIPT_DIR}/../docker/docker-compose.yml" ps 2>/dev/null || \
    echo "Could not get Docker status"
}

# GPU status
check_gpu_status() {
    echo ""
    echo "=== GPU Status ==="
    if command -v nvidia-smi &> /dev/null; then
        nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader
    else
        echo "NVIDIA GPU not available or nvidia-smi not installed"
    fi
}

# Resource usage
check_resource_usage() {
    echo ""
    echo "=== Resource Usage ==="
    echo "Memory:"
    free -h 2>/dev/null || vm_stat 2>/dev/null || echo "Could not get memory info"
    echo ""
    echo "Disk (Docker volumes):"
    df -h "${SCRIPT_DIR}/../data" 2>/dev/null || df -h . 2>/dev/null || echo "Could not get disk info"
}

# Main execution
main() {
    echo "╔══════════════════════════════════════════╗"
    echo "║     LLMFlow Health Check                 ║"
    echo "║     $(date '+%Y-%m-%d %H:%M:%S')                ║"
    echo "╚══════════════════════════════════════════╝"

    case "${1:-all}" in
        "services")
            check_all_services
            ;;
        "docker")
            check_docker_status
            ;;
        "gpu")
            check_gpu_status
            ;;
        "resources")
            check_resource_usage
            ;;
        "all")
            check_all_services
            check_docker_status
            check_gpu_status
            check_resource_usage
            ;;
        *)
            echo "Usage: $0 [services|docker|gpu|resources|all]"
            exit 1
            ;;
    esac
}

main "$@"
