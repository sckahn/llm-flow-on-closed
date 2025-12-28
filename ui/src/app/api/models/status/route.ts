import { NextResponse } from 'next/server';

// vLLM API endpoint
const VLLM_API_URL = process.env.VLLM_API_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const response = await fetch(`${VLLM_API_URL}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return NextResponse.json({
        status: 'offline',
        model: null,
        error: 'vLLM server not responding',
      });
    }

    const data = await response.json();
    const activeModel = data.data && data.data.length > 0 ? data.data[0].id : null;

    return NextResponse.json({
      status: 'online',
      model: activeModel,
    });
  } catch (error) {
    console.error('vLLM status check error:', error);
    return NextResponse.json({
      status: 'offline',
      model: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
