import { NextRequest, NextResponse } from 'next/server';
import { rm } from 'fs/promises';
import { join } from 'path';

// Models directory
const MODELS_DIR = process.env.MODELS_DIR || '/home/lsc/llm-flow-on-closed/models';
const HUB_DIR = join(MODELS_DIR, 'hub');

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // URL decode the model ID (e.g., "LGAI-EXAONE%2FEXAONE-3.5-7.8B-Instruct")
    const modelId = decodeURIComponent(id);

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      );
    }

    // Convert model ID to directory name format
    // e.g., "LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct" -> "models--LGAI-EXAONE--EXAONE-3.5-7.8B-Instruct"
    const dirName = `models--${modelId.replace(/\//g, '--')}`;
    const modelPath = join(HUB_DIR, dirName);

    // Delete the model directory
    await rm(modelPath, { recursive: true, force: true });

    return NextResponse.json({
      message: 'Model deleted successfully',
      model_id: modelId,
    });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Could be used to get details about a specific model
  const { id } = await params;
  const modelId = decodeURIComponent(id);

  return NextResponse.json({
    model_id: modelId,
  });
}
