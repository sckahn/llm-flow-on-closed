import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

// Models directory - mounted from host
const MODELS_DIR = process.env.MODELS_DIR || '/home/lsc/llm-flow-on-closed/models';
const HUB_DIR = join(MODELS_DIR, 'hub');

// vLLM API endpoint
const VLLM_API_URL = process.env.VLLM_API_URL || 'http://localhost:8000';

interface Model {
  id: string;
  name: string;
  size: string;
  status: 'ready' | 'downloading' | 'error';
  progress?: number;
  isActive?: boolean;
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const files = await readdir(dirPath, { withFileTypes: true, recursive: true });
    for (const file of files) {
      if (file.isFile()) {
        const filePath = join(file.parentPath || dirPath, file.name);
        try {
          const stats = await stat(filePath);
          totalSize += stats.size;
        } catch {
          // Skip files we can't access
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return totalSize;
}

function formatSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

async function getActiveModel(): Promise<string | null> {
  try {
    const response = await fetch(`${VLLM_API_URL}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      return data.data[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const models: Model[] = [];
    const activeModel = await getActiveModel();

    // Scan hub directory for downloaded models
    try {
      const hubContents = await readdir(HUB_DIR, { withFileTypes: true });

      for (const item of hubContents) {
        if (item.isDirectory() && item.name.startsWith('models--')) {
          // Convert directory name to model ID
          const modelId = item.name.replace('models--', '').replace(/--/g, '/');
          const modelPath = join(HUB_DIR, item.name);
          const size = await getDirectorySize(modelPath);

          // Check if model has snapshots (download complete)
          let status: 'ready' | 'downloading' | 'error' = 'ready';
          try {
            const snapshotsPath = join(modelPath, 'snapshots');
            await readdir(snapshotsPath);
          } catch {
            status = 'downloading';
          }

          models.push({
            id: modelId,
            name: modelId.split('/').pop() || modelId,
            size: formatSize(size),
            status,
            isActive: modelId === activeModel,
          });
        }
      }
    } catch {
      // Hub directory doesn't exist yet
    }

    return NextResponse.json({
      models,
      active_model: activeModel,
    });
  } catch (error) {
    console.error('Error listing models:', error);
    return NextResponse.json(
      { error: 'Failed to list models' },
      { status: 500 }
    );
  }
}
