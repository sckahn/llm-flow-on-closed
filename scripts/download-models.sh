#!/bin/bash
# Model Download Script
# Downloads required models for LLMFlow

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${SCRIPT_DIR}/../models"

# Hugging Face settings
HF_TOKEN="${HF_TOKEN:-}"
HF_ENDPOINT="${HF_ENDPOINT:-https://huggingface.co}"

echo "=== LLMFlow Model Download ==="
echo "Models directory: ${MODELS_DIR}"

# Check if huggingface-cli is available
check_hf_cli() {
    if ! command -v huggingface-cli &> /dev/null; then
        echo "Installing huggingface_hub..."
        pip3 install huggingface_hub --quiet
    fi
}

# Download model from Hugging Face
download_model() {
    local model_id=$1
    local local_dir=$2
    local description=$3

    echo ""
    echo "=== Downloading: ${description} ==="
    echo "Model: ${model_id}"
    echo "Target: ${local_dir}"

    if [ -d "${local_dir}" ] && [ "$(ls -A ${local_dir} 2>/dev/null)" ]; then
        echo "Model already exists, skipping..."
        return 0
    fi

    mkdir -p "${local_dir}"

    if [ -n "${HF_TOKEN}" ]; then
        huggingface-cli download "${model_id}" \
            --local-dir "${local_dir}" \
            --token "${HF_TOKEN}"
    else
        huggingface-cli download "${model_id}" \
            --local-dir "${local_dir}"
    fi

    echo "Download complete: ${model_id}"
}

# Main models configuration
declare -A MODELS=(
    # Llama 4 Models (Latest)
    ["llama4_mini"]="meta-llama/Llama-4-Mini-Instruct|${MODELS_DIR}/llama-4-mini|Llama 4 Mini 8B (Dev, 24GB VRAM)"
    ["llama4_maverick"]="meta-llama/Llama-4-Maverick-Instruct|${MODELS_DIR}/llama-4-maverick|Llama 4 Maverick 400B MoE (Prod, H200 x 8)"

    # Llama 3.1 Models (Legacy)
    ["llm_8b"]="meta-llama/Llama-3.1-8B-Instruct|${MODELS_DIR}/llama-3.1-8b-instruct|LLaMA 3.1 8B (16GB+ VRAM)"
    ["llm_70b"]="meta-llama/Llama-3.1-70B-Instruct|${MODELS_DIR}/llama-3.1-70b-instruct|LLaMA 3.1 70B (Multi-GPU)"

    # Embedding Model
    ["embedding"]="BAAI/bge-m3|${MODELS_DIR}/bge-m3|BGE-M3 Embedding Model"

    # Reranker Model
    ["reranker"]="BAAI/bge-reranker-v2-m3|${MODELS_DIR}/bge-reranker-v2-m3|BGE Reranker v2 M3"
)

# Show menu
show_menu() {
    echo ""
    echo "Available models to download:"
    echo ""
    echo "  === Llama 4 (Recommended) ==="
    echo "  1) Llama 4 Mini 8B (Dev environment, RTX 3090/4090, 24GB VRAM)"
    echo "  2) Llama 4 Maverick 400B MoE (Prod environment, H200 x 8)"
    echo ""
    echo "  === Llama 3.1 (Legacy) ==="
    echo "  3) LLaMA 3.1 8B Instruct (Single GPU, 16GB+ VRAM)"
    echo "  4) LLaMA 3.1 70B Instruct (Multi-GPU, 80GB+ VRAM)"
    echo ""
    echo "  === Embedding & Reranking ==="
    echo "  5) BGE-M3 Embedding Model (Required for RAG)"
    echo "  6) BGE Reranker v2 M3 (Required for reranking)"
    echo ""
    echo "  === Bundles ==="
    echo "  7) Dev Bundle (Llama 4 Mini + Embedding + Reranker)"
    echo "  8) Prod Bundle (Llama 4 Maverick + Embedding + Reranker)"
    echo ""
    echo "  9) Exit"
    echo ""
}

# Download selected model
download_selected() {
    local choice=$1

    case $choice in
        1)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llama4_mini]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        2)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llama4_maverick]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        3)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_8b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        4)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_70b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        5)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[embedding]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        6)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[reranker]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        7)
            echo "Downloading Dev Bundle (Llama 4 Mini + Embedding + Reranker)..."
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llama4_mini]}"
            download_model "$model_id" "$local_dir" "$description"
            IFS='|' read -r model_id local_dir description <<< "${MODELS[embedding]}"
            download_model "$model_id" "$local_dir" "$description"
            IFS='|' read -r model_id local_dir description <<< "${MODELS[reranker]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        8)
            echo "Downloading Prod Bundle (Llama 4 Maverick + Embedding + Reranker)..."
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llama4_maverick]}"
            download_model "$model_id" "$local_dir" "$description"
            IFS='|' read -r model_id local_dir description <<< "${MODELS[embedding]}"
            download_model "$model_id" "$local_dir" "$description"
            IFS='|' read -r model_id local_dir description <<< "${MODELS[reranker]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        9)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid choice"
            return 1
            ;;
    esac
}

# Quick download mode (non-interactive)
quick_download() {
    local model_type=$1

    case $model_type in
        "llama4-mini")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llama4_mini]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "llama4-maverick")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llama4_maverick]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "embedding")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[embedding]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "reranker")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[reranker]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "llm-8b"|"llama3-8b")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_8b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "llm-70b"|"llama3-70b")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_70b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "dev-bundle")
            download_selected 7
            ;;
        "prod-bundle")
            download_selected 8
            ;;
        *)
            echo "Unknown model type: $model_type"
            echo ""
            echo "Available model types:"
            echo "  Llama 4:   llama4-mini, llama4-maverick"
            echo "  Llama 3:   llama3-8b, llama3-70b"
            echo "  Embedding: embedding, reranker"
            echo "  Bundles:   dev-bundle, prod-bundle"
            exit 1
            ;;
    esac
}

# Main execution
main() {
    check_hf_cli
    mkdir -p "${MODELS_DIR}"

    # Non-interactive mode
    if [ -n "$1" ]; then
        quick_download "$1"
        exit 0
    fi

    # Interactive mode
    while true; do
        show_menu
        read -p "Select option (1-9): " choice
        download_selected "$choice"
    done
}

main "$@"
