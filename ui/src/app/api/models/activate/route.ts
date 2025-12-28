import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Docker compose directory
const DOCKER_DIR = process.env.DOCKER_DIR || '/home/lsc/llm-flow-on-closed/docker';
const ENV_FILE = join(DOCKER_DIR, '.env');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model_id } = body;

    if (!model_id) {
      return NextResponse.json(
        { error: 'model_id is required' },
        { status: 400 }
      );
    }

    // Read current .env file
    let envContent = await readFile(ENV_FILE, 'utf-8');

    // Update VLLM_MODEL_PATH and VLLM_MODEL_NAME
    envContent = envContent.replace(
      /^VLLM_MODEL_PATH=.*/m,
      `VLLM_MODEL_PATH=${model_id}`
    );
    envContent = envContent.replace(
      /^VLLM_MODEL_NAME=.*/m,
      `VLLM_MODEL_NAME=${model_id}`
    );

    // Write updated .env file
    await writeFile(ENV_FILE, envContent);

    return NextResponse.json({
      message: 'Model configuration updated',
      model_id,
      note: 'Restart vLLM container to apply changes: docker compose up -d vllm',
    });
  } catch (error) {
    console.error('Activate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Activation failed' },
      { status: 500 }
    );
  }
}
