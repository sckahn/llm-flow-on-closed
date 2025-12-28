#!/bin/bash
# LLMFlow Model Downloader
# Downloads models from HuggingFace to /models directory

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
MODELS_DIR="/home/lsc/llm-flow-on-closed/models"
HF_CACHE="${MODELS_DIR}/hub"

# Ensure models directory exists
mkdir -p "$MODELS_DIR"
mkdir -p "$HF_CACHE"

show_help() {
    echo "Usage: $0 <model_repo> [options]"
    echo ""
    echo "Examples:"
    echo "  $0 LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct"
    echo "  $0 meta-llama/Llama-3.1-8B-Instruct"
    echo "  $0 Qwen/Qwen2.5-7B-Instruct"
    echo ""
    echo "Options:"
    echo "  --token <HF_TOKEN>  HuggingFace token for gated models"
    echo "  --list              List downloaded models"
    echo "  --help              Show this help"
    echo ""
    echo "Downloaded models are stored in: $MODELS_DIR"
}

list_models() {
    echo -e "${BLUE}Downloaded Models:${NC}"
    echo "===================="
    if [ -d "$HF_CACHE" ]; then
        for dir in "$HF_CACHE"/models--*; do
            if [ -d "$dir" ]; then
                model_name=$(basename "$dir" | sed 's/models--//' | sed 's/--/\//g')
                size=$(du -sh "$dir" 2>/dev/null | cut -f1)
                echo -e "  ${GREEN}$model_name${NC} ($size)"
            fi
        done
    else
        echo "  No models downloaded yet."
    fi
}

download_model() {
    local repo="$1"
    local token="$2"

    echo -e "${BLUE}Downloading model: ${GREEN}$repo${NC}"
    echo "Destination: $MODELS_DIR"
    echo ""

    # Check if huggingface-cli is available
    if ! command -v huggingface-cli &> /dev/null; then
        echo -e "${YELLOW}Installing huggingface_hub...${NC}"
        pip install -q huggingface_hub
    fi

    # Set HF cache
    export HF_HOME="$MODELS_DIR"
    export HF_HUB_CACHE="$HF_CACHE"

    # Download with or without token
    if [ -n "$token" ]; then
        echo -e "${YELLOW}Using provided HuggingFace token${NC}"
        huggingface-cli download "$repo" --token "$token" --local-dir-use-symlinks False
    else
        huggingface-cli download "$repo" --local-dir-use-symlinks False
    fi

    echo ""
    echo -e "${GREEN}✓ Download complete!${NC}"
    echo ""
    echo "To use this model, update docker/.env:"
    echo -e "  ${YELLOW}VLLM_MODEL_PATH=$repo${NC}"
    echo -e "  ${YELLOW}VLLM_MODEL_NAME=$repo${NC}"
    echo ""
    echo "Then restart vLLM:"
    echo -e "  ${YELLOW}cd docker && docker compose up -d vllm${NC}"
}

# Parse arguments
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

TOKEN=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            exit 0
            ;;
        --list|-l)
            list_models
            exit 0
            ;;
        --token|-t)
            TOKEN="$2"
            shift 2
            ;;
        *)
            REPO="$1"
            shift
            ;;
    esac
done

if [ -z "$REPO" ]; then
    echo -e "${RED}Error: No model repository specified${NC}"
    show_help
    exit 1
fi

download_model "$REPO" "$TOKEN"
