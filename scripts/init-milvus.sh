#!/bin/bash
# Milvus Collection Initialization
# Creates collections for document embeddings

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../docker/.env" 2>/dev/null || true

MILVUS_HOST="${MILVUS_HOST:-localhost}"
MILVUS_PORT="${MILVUS_PORT:-19530}"

echo "=== Milvus Collection Initialization ==="
echo "Host: ${MILVUS_HOST}:${MILVUS_PORT}"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 is required but not installed"
    exit 1
fi

# Install pymilvus if not present
pip3 install pymilvus --quiet 2>/dev/null || true

# Wait for Milvus to be ready
wait_for_milvus() {
    echo "Waiting for Milvus to be ready..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if python3 -c "from pymilvus import connections; connections.connect(host='${MILVUS_HOST}', port='${MILVUS_PORT}')" 2>/dev/null; then
            echo "Milvus is ready!"
            return 0
        fi
        echo "Attempt $attempt/$max_attempts - Milvus not ready, waiting..."
        sleep 5
        ((attempt++))
    done

    echo "ERROR: Milvus did not become ready in time"
    exit 1
}

# Create collections using Python
create_collections() {
    python3 << 'PYTHON_SCRIPT'
from pymilvus import (
    connections,
    utility,
    FieldSchema,
    CollectionSchema,
    DataType,
    Collection,
)
import os

MILVUS_HOST = os.environ.get('MILVUS_HOST', 'localhost')
MILVUS_PORT = os.environ.get('MILVUS_PORT', '19530')

print(f"Connecting to Milvus at {MILVUS_HOST}:{MILVUS_PORT}")
connections.connect(host=MILVUS_HOST, port=MILVUS_PORT)

# BGE-M3 produces 1024-dimensional embeddings
EMBEDDING_DIM = 1024

collections_config = [
    {
        "name": "document_chunks",
        "description": "Document chunk embeddings for RAG",
        "fields": [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
            FieldSchema(name="document_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="chunk_index", dtype=DataType.INT64),
            FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=65535),
            FieldSchema(name="metadata", dtype=DataType.JSON),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM),
        ],
        "index_params": {
            "field_name": "embedding",
            "index_type": "HNSW",
            "metric_type": "COSINE",
            "params": {"M": 16, "efConstruction": 256}
        }
    },
    {
        "name": "qa_pairs",
        "description": "Question-Answer pair embeddings",
        "fields": [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
            FieldSchema(name="question", dtype=DataType.VARCHAR, max_length=4096),
            FieldSchema(name="answer", dtype=DataType.VARCHAR, max_length=65535),
            FieldSchema(name="source_doc_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="metadata", dtype=DataType.JSON),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM),
        ],
        "index_params": {
            "field_name": "embedding",
            "index_type": "HNSW",
            "metric_type": "COSINE",
            "params": {"M": 16, "efConstruction": 256}
        }
    },
    {
        "name": "knowledge_entities",
        "description": "Knowledge graph entity embeddings",
        "fields": [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
            FieldSchema(name="entity_name", dtype=DataType.VARCHAR, max_length=512),
            FieldSchema(name="entity_type", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="description", dtype=DataType.VARCHAR, max_length=4096),
            FieldSchema(name="neo4j_node_id", dtype=DataType.INT64),
            FieldSchema(name="metadata", dtype=DataType.JSON),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM),
        ],
        "index_params": {
            "field_name": "embedding",
            "index_type": "HNSW",
            "metric_type": "COSINE",
            "params": {"M": 16, "efConstruction": 256}
        }
    }
]

for config in collections_config:
    collection_name = config["name"]

    if utility.has_collection(collection_name):
        print(f"Collection '{collection_name}' already exists, skipping...")
        continue

    print(f"Creating collection: {collection_name}")

    schema = CollectionSchema(
        fields=config["fields"],
        description=config["description"]
    )

    collection = Collection(name=collection_name, schema=schema)

    # Create index
    print(f"Creating index for {collection_name}...")
    collection.create_index(**config["index_params"])

    # Load collection into memory
    collection.load()

    print(f"Collection '{collection_name}' created and loaded successfully")

print("\n=== Milvus Collections Summary ===")
for name in utility.list_collections():
    collection = Collection(name)
    print(f"- {name}: {collection.num_entities} entities")

connections.disconnect(alias="default")
print("\nMilvus initialization complete!")
PYTHON_SCRIPT
}

# Main execution
main() {
    wait_for_milvus
    export MILVUS_HOST MILVUS_PORT
    create_collections
}

main "$@"
