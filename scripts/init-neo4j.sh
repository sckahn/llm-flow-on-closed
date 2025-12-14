#!/bin/bash
# Neo4j Schema Initialization
# Creates constraints and indexes for GraphRAG

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../docker/.env" 2>/dev/null || true

NEO4J_HOST="${NEO4J_HOST:-localhost}"
NEO4J_BOLT_PORT="${NEO4J_BOLT_PORT:-7687}"
NEO4J_USER="${NEO4J_AUTH%%/*}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_AUTH##*/}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-neo4j_password}"

echo "=== Neo4j Schema Initialization ==="
echo "Host: ${NEO4J_HOST}:${NEO4J_BOLT_PORT}"

# Wait for Neo4j to be ready
wait_for_neo4j() {
    echo "Waiting for Neo4j to be ready..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://${NEO4J_HOST}:7474" > /dev/null 2>&1; then
            # Additional check via bolt
            if cypher-shell -a "bolt://${NEO4J_HOST}:${NEO4J_BOLT_PORT}" \
                           -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" \
                           "RETURN 1" > /dev/null 2>&1; then
                echo "Neo4j is ready!"
                return 0
            fi
        fi
        echo "Attempt $attempt/$max_attempts - Neo4j not ready, waiting..."
        sleep 5
        ((attempt++))
    done

    echo "ERROR: Neo4j did not become ready in time"
    exit 1
}

# Execute Cypher queries
execute_cypher() {
    local query=$1
    cypher-shell -a "bolt://${NEO4J_HOST}:${NEO4J_BOLT_PORT}" \
                 -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" \
                 "$query"
}

# Create schema
create_schema() {
    echo "Creating Neo4j schema for GraphRAG..."

    # Node constraints and indexes
    execute_cypher "
    // Document node
    CREATE CONSTRAINT document_id IF NOT EXISTS
    FOR (d:Document) REQUIRE d.id IS UNIQUE;
    "

    execute_cypher "
    // Chunk node
    CREATE CONSTRAINT chunk_id IF NOT EXISTS
    FOR (c:Chunk) REQUIRE c.id IS UNIQUE;
    "

    execute_cypher "
    // Entity node
    CREATE CONSTRAINT entity_id IF NOT EXISTS
    FOR (e:Entity) REQUIRE e.id IS UNIQUE;
    "

    execute_cypher "
    // Concept node
    CREATE CONSTRAINT concept_id IF NOT EXISTS
    FOR (c:Concept) REQUIRE c.id IS UNIQUE;
    "

    execute_cypher "
    // User node
    CREATE CONSTRAINT user_id IF NOT EXISTS
    FOR (u:User) REQUIRE u.id IS UNIQUE;
    "

    execute_cypher "
    // Workspace node
    CREATE CONSTRAINT workspace_id IF NOT EXISTS
    FOR (w:Workspace) REQUIRE w.id IS UNIQUE;
    "

    # Full-text indexes for search
    execute_cypher "
    CREATE FULLTEXT INDEX entity_name_fulltext IF NOT EXISTS
    FOR (e:Entity) ON EACH [e.name, e.description];
    "

    execute_cypher "
    CREATE FULLTEXT INDEX chunk_content_fulltext IF NOT EXISTS
    FOR (c:Chunk) ON EACH [c.content];
    "

    # Property indexes for filtering
    execute_cypher "
    CREATE INDEX document_type IF NOT EXISTS
    FOR (d:Document) ON (d.type);
    "

    execute_cypher "
    CREATE INDEX entity_type IF NOT EXISTS
    FOR (e:Entity) ON (e.type);
    "

    execute_cypher "
    CREATE INDEX chunk_document IF NOT EXISTS
    FOR (c:Chunk) ON (c.document_id);
    "

    echo "Schema created successfully!"
}

# Create sample relationship types documentation
show_relationship_types() {
    echo ""
    echo "=== GraphRAG Relationship Types ==="
    echo "Document relationships:"
    echo "  (Document)-[:HAS_CHUNK]->(Chunk)"
    echo "  (Document)-[:BELONGS_TO]->(Workspace)"
    echo "  (User)-[:OWNS]->(Document)"
    echo ""
    echo "Entity relationships:"
    echo "  (Chunk)-[:MENTIONS]->(Entity)"
    echo "  (Entity)-[:RELATED_TO]->(Entity)"
    echo "  (Entity)-[:IS_A]->(Concept)"
    echo "  (Entity)-[:PART_OF]->(Entity)"
    echo ""
    echo "Knowledge relationships:"
    echo "  (Concept)-[:BROADER_THAN]->(Concept)"
    echo "  (Chunk)-[:SIMILAR_TO]->(Chunk)"
}

# Main execution
main() {
    # Check if cypher-shell is available
    if ! command -v cypher-shell &> /dev/null; then
        echo "WARNING: cypher-shell not found, using curl for basic check"
        echo "To create schema, please run inside Neo4j container:"
        echo "  docker exec -it llmflow-neo4j cypher-shell"

        # Just wait and show instructions
        wait_for_neo4j || true
        show_relationship_types

        echo ""
        echo "Run the following Cypher commands manually in Neo4j Browser (http://localhost:7474):"
        echo ""
        cat << 'CYPHER'
// Constraints
CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT workspace_id IF NOT EXISTS FOR (w:Workspace) REQUIRE w.id IS UNIQUE;

// Full-text indexes
CREATE FULLTEXT INDEX entity_name_fulltext IF NOT EXISTS FOR (e:Entity) ON EACH [e.name, e.description];
CREATE FULLTEXT INDEX chunk_content_fulltext IF NOT EXISTS FOR (c:Chunk) ON EACH [c.content];

// Property indexes
CREATE INDEX document_type IF NOT EXISTS FOR (d:Document) ON (d.type);
CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type);
CREATE INDEX chunk_document IF NOT EXISTS FOR (c:Chunk) ON (c.document_id);
CYPHER
        return 0
    fi

    wait_for_neo4j
    create_schema
    show_relationship_types

    echo ""
    echo "=== Neo4j Initialization Complete ==="
}

main "$@"
