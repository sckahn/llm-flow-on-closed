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
    # LLM Models (choose one based on GPU memory)
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
    echo "  1) LLaMA 3.1 8B Instruct (Recommended for single GPU, 16GB+ VRAM)"
    echo "  2) LLaMA 3.1 70B Instruct (Multi-GPU required, 80GB+ VRAM)"
    echo "  3) BGE-M3 Embedding Model (Required for RAG)"
    echo "  4) BGE Reranker v2 M3 (Required for reranking)"
    echo "  5) All essential models (8B + Embedding + Reranker)"
    echo "  6) Exit"
    echo ""
}

# Download selected model
download_selected() {
    local choice=$1

    case $choice in
        1)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_8b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        2)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_70b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        3)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[embedding]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        4)
            IFS='|' read -r model_id local_dir description <<< "${MODELS[reranker]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        5)
            echo "Downloading all essential models..."
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_8b]}"
            download_model "$model_id" "$local_dir" "$description"
            IFS='|' read -r model_id local_dir description <<< "${MODELS[embedding]}"
            download_model "$model_id" "$local_dir" "$description"
            IFS='|' read -r model_id local_dir description <<< "${MODELS[reranker]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        6)
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
        "embedding")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[embedding]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "reranker")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[reranker]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "llm-8b")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_8b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "llm-70b")
            IFS='|' read -r model_id local_dir description <<< "${MODELS[llm_70b]}"
            download_model "$model_id" "$local_dir" "$description"
            ;;
        "essential")
            download_selected 5
            ;;
        *)
            echo "Unknown model type: $model_type"
            echo "Available: embedding, reranker, llm-8b, llm-70b, essential"
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
        read -p "Select option (1-6): " choice
        download_selected "$choice"
    done
}

main "$@"
