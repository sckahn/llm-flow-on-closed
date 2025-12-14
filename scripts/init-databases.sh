#!/bin/bash
# PostgreSQL Database Initialization
# Creates databases for Dify, Keycloak, Langfuse, MLflow

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../docker/.env" 2>/dev/null || true

# Default values
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres_password}"

echo "=== PostgreSQL Database Initialization ==="
echo "Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    echo "Waiting for PostgreSQL to be ready..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -c '\q' 2>/dev/null; then
            echo "PostgreSQL is ready!"
            return 0
        fi
        echo "Attempt $attempt/$max_attempts - PostgreSQL not ready, waiting..."
        sleep 2
        ((attempt++))
    done

    echo "ERROR: PostgreSQL did not become ready in time"
    exit 1
}

# Create database if not exists
create_database() {
    local db_name=$1
    local db_user=$2
    local db_password=$3

    echo "Creating database: ${db_name}"

    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" <<EOF
-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${db_user}') THEN
        CREATE ROLE ${db_user} WITH LOGIN PASSWORD '${db_password}';
    END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE ${db_name} OWNER ${db_user}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db_name}')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ${db_name} TO ${db_user};
EOF

    echo "Database ${db_name} created successfully"
}

# Enable extensions
enable_extensions() {
    local db_name=$1

    echo "Enabling extensions for ${db_name}..."

    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${db_name}" <<EOF
-- Enable commonly used extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOF
}

# Main execution
main() {
    wait_for_postgres

    echo ""
    echo "=== Creating Dify Database ==="
    create_database "dify" "${DIFY_DB_USER:-dify}" "${DIFY_DB_PASSWORD:-dify_password}"
    enable_extensions "dify"

    echo ""
    echo "=== Creating Keycloak Database ==="
    create_database "keycloak" "${KEYCLOAK_DB_USER:-keycloak}" "${KEYCLOAK_DB_PASSWORD:-keycloak_password}"

    echo ""
    echo "=== Creating Langfuse Database ==="
    create_database "langfuse" "${LANGFUSE_DB_USER:-langfuse}" "${LANGFUSE_DB_PASSWORD:-langfuse_password}"

    echo ""
    echo "=== Creating MLflow Database ==="
    create_database "mlflow" "${MLFLOW_DB_USER:-mlflow}" "${MLFLOW_DB_PASSWORD:-mlflow_password}"

    echo ""
    echo "=== Creating LLMFlow Database ==="
    create_database "llmflow" "${LLMFLOW_DB_USER:-llmflow}" "${LLMFLOW_DB_PASSWORD:-llmflow_password}"
    enable_extensions "llmflow"

    echo ""
    echo "=== Database Initialization Complete ==="
    echo "Created databases: dify, keycloak, langfuse, mlflow, llmflow"
}

main "$@"
