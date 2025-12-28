import { NextRequest, NextResponse } from 'next/server';

// Server-side: use internal Docker network URL
const API_BASE_URL = process.env.DIFY_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Route segment config for large file uploads
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');
  const url = new URL(request.url);
  const targetUrl = `${API_BASE_URL}/${targetPath}${url.search}`;

  const headers: HeadersInit = {};
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers,
  });

  const data = await response.text();
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');
  const url = new URL(request.url);
  const targetUrl = `${API_BASE_URL}/${targetPath}${url.search}`;

  const contentType = request.headers.get('content-type') || '';
  const headers: HeadersInit = {};

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  let body: BodyInit;
  if (contentType.includes('multipart/form-data')) {
    body = await request.formData();
  } else {
    headers['Content-Type'] = contentType;
    body = await request.text();
  }

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body,
  });

  const data = await response.text();
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');
  const url = new URL(request.url);
  const targetUrl = `${API_BASE_URL}/${targetPath}${url.search}`;

  const contentType = request.headers.get('content-type') || 'application/json';
  const headers: HeadersInit = {
    'Content-Type': contentType,
  };

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(targetUrl, {
    method: 'PUT',
    headers,
    body: await request.text(),
  });

  const data = await response.text();
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');
  const url = new URL(request.url);
  const targetUrl = `${API_BASE_URL}/${targetPath}${url.search}`;

  const headers: HeadersInit = {};
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(targetUrl, {
    method: 'DELETE',
    headers,
  });

  const data = await response.text();
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}
