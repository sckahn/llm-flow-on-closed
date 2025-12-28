#!/usr/bin/env python3
"""
LLMFlow Model Downloader
Downloads models from HuggingFace Hub
"""

import os
import sys
import argparse
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def download_model(repo_id: str, models_dir: str, token: str = None):
    """Download a model from HuggingFace Hub"""
    from huggingface_hub import snapshot_download
    from tqdm import tqdm

    print(f"\n{'='*60}")
    print(f"Downloading: {repo_id}")
    print(f"Destination: {models_dir}")
    print(f"{'='*60}\n")

    # Set environment variables
    os.environ['HF_HOME'] = models_dir
    os.environ['HF_HUB_CACHE'] = os.path.join(models_dir, 'hub')

    try:
        local_path = snapshot_download(
            repo_id=repo_id,
            token=token,
            local_dir_use_symlinks=False,
            resume_download=True,
        )

        print(f"\n{'='*60}")
        print(f"✓ Download complete!")
        print(f"Model path: {local_path}")
        print(f"{'='*60}")
        print(f"\nTo use this model, update docker/.env:")
        print(f"  VLLM_MODEL_PATH={repo_id}")
        print(f"  VLLM_MODEL_NAME={repo_id}")
        print(f"\nThen restart vLLM:")
        print(f"  cd docker && docker compose up -d vllm")

        return local_path
    except Exception as e:
        print(f"\n✗ Error downloading model: {e}")
        return None


def list_models(models_dir: str):
    """List downloaded models"""
    hub_dir = Path(models_dir) / 'hub'

    print("\nDownloaded Models:")
    print("=" * 40)

    if not hub_dir.exists():
        print("  No models downloaded yet.")
        return

    for model_dir in hub_dir.glob('models--*'):
        if model_dir.is_dir():
            # Convert directory name to model name
            model_name = model_dir.name.replace('models--', '').replace('--', '/')
            # Get size
            size = sum(f.stat().st_size for f in model_dir.rglob('*') if f.is_file())
            size_gb = size / (1024**3)
            print(f"  {model_name} ({size_gb:.1f} GB)")


def main():
    parser = argparse.ArgumentParser(description='Download models from HuggingFace Hub')
    parser.add_argument('repo_id', nargs='?', help='HuggingFace model repository (e.g., LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct)')
    parser.add_argument('--token', '-t', help='HuggingFace token for gated models')
    parser.add_argument('--list', '-l', action='store_true', help='List downloaded models')
    parser.add_argument('--models-dir', '-d', default='/home/lsc/llm-flow-on-closed/models',
                       help='Directory to store models')

    args = parser.parse_args()

    if args.list:
        list_models(args.models_dir)
        return

    if not args.repo_id:
        parser.print_help()
        print("\n\nExamples:")
        print("  python3 download-model.py LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct")
        print("  python3 download-model.py meta-llama/Llama-3.1-8B-Instruct --token YOUR_TOKEN")
        print("  python3 download-model.py --list")
        return

    # Ensure models directory exists
    Path(args.models_dir).mkdir(parents=True, exist_ok=True)

    download_model(args.repo_id, args.models_dir, args.token)


if __name__ == '__main__':
    main()
