import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { join } from 'path';

// Models directory
const MODELS_DIR = process.env.MODELS_DIR || '/home/lsc/llm-flow-on-closed/models';

// Track active downloads
const activeDownloads = new Map<string, { progress: number; status: string }>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model_id, token } = body;

    if (!model_id) {
      return NextResponse.json(
        { error: 'model_id is required' },
        { status: 400 }
      );
    }

    // Validate model_id format (org/model or model)
    if (!/^[\w\-\.]+\/[\w\-\.]+$|^[\w\-\.]+$/.test(model_id)) {
      return NextResponse.json(
        { error: 'Invalid model_id format' },
        { status: 400 }
      );
    }

    // Check if already downloading
    if (activeDownloads.has(model_id)) {
      return NextResponse.json(
        { message: 'Download already in progress', ...activeDownloads.get(model_id) },
        { status: 409 }
      );
    }

    // Ensure models directory exists
    await mkdir(MODELS_DIR, { recursive: true });

    // Start download in background using huggingface-cli
    const args = ['download', model_id, '--local-dir-use-symlinks', 'False'];
    if (token) {
      args.push('--token', token);
    }

    const env = {
      ...process.env,
      HF_HOME: MODELS_DIR,
      HF_HUB_CACHE: join(MODELS_DIR, 'hub'),
    };

    const downloadProcess = spawn('huggingface-cli', args, { env });

    activeDownloads.set(model_id, { progress: 0, status: 'downloading' });

    downloadProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Download ${model_id}] ${output}`);

      // Try to parse progress from huggingface-cli output
      const progressMatch = output.match(/(\d+)%/);
      if (progressMatch) {
        activeDownloads.set(model_id, {
          progress: parseInt(progressMatch[1]),
          status: 'downloading',
        });
      }
    });

    downloadProcess.stderr.on('data', (data) => {
      console.error(`[Download ${model_id}] ${data}`);
    });

    downloadProcess.on('close', (code) => {
      if (code === 0) {
        activeDownloads.set(model_id, { progress: 100, status: 'completed' });
        console.log(`[Download ${model_id}] Completed successfully`);
      } else {
        activeDownloads.set(model_id, { progress: 0, status: 'error' });
        console.error(`[Download ${model_id}] Failed with code ${code}`);
      }

      // Clean up after 5 minutes
      setTimeout(() => {
        activeDownloads.delete(model_id);
      }, 5 * 60 * 1000);
    });

    return NextResponse.json({
      message: 'Download started',
      model_id,
      status: 'downloading',
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Download failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return status of all active downloads
  const downloads: Record<string, { progress: number; status: string }> = {};
  activeDownloads.forEach((value, key) => {
    downloads[key] = value;
  });
  return NextResponse.json({ downloads });
}
