import api from './client';
import type { Dataset, DatasetListResponse, Document, DocumentListResponse } from '@/types/api';

export async function getDatasets(page = 1, limit = 20): Promise<DatasetListResponse> {
  return api.get<DatasetListResponse>('/console/api/datasets', {
    page: String(page),
    limit: String(limit),
  });
}

export async function getDataset(id: string): Promise<Dataset> {
  return api.get<Dataset>(`/console/api/datasets/${id}`);
}

export async function createDataset(data: {
  name: string;
  description?: string;
  indexing_technique?: 'high_quality' | 'economy';
}): Promise<Dataset> {
  return api.post<Dataset>('/console/api/datasets', {
    ...data,
    indexing_technique: data.indexing_technique || 'high_quality',
  });
}

export async function updateDataset(
  id: string,
  data: { name?: string; description?: string }
): Promise<Dataset> {
  return api.put<Dataset>(`/console/api/datasets/${id}`, data);
}

export async function deleteDataset(id: string): Promise<void> {
  await api.delete(`/console/api/datasets/${id}`);
}

export async function getDocuments(
  datasetId: string,
  page = 1,
  limit = 20
): Promise<DocumentListResponse> {
  return api.get<DocumentListResponse>(`/console/api/datasets/${datasetId}/documents`, {
    page: String(page),
    limit: String(limit),
    fetch: 'true',
  });
}

export async function uploadDocument(
  datasetId: string,
  file: File,
  options?: {
    indexing_technique?: string;
    process_rule?: Record<string, unknown>;
  }
): Promise<{ document: Document }> {
  const token = localStorage.getItem('access_token');

  // Step 1: Upload file
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
  const formData = new FormData();
  formData.append('file', file);

  const uploadResponse = await fetch(`${apiUrl}/console/api/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.json().catch(() => ({ message: 'File upload failed' }));
    throw new Error(error.message || 'File upload failed');
  }

  const uploadedFile = await uploadResponse.json();

  // Step 2: Create document from uploaded file
  const createResponse = await fetch(
    `${apiUrl}/console/api/datasets/${datasetId}/documents`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data_source: {
          type: 'upload_file',
          info_list: {
            file_info_list: {
              file_ids: [uploadedFile.id],
            },
          },
        },
        indexing_technique: options?.indexing_technique || 'high_quality',
        process_rule: options?.process_rule || {
          mode: 'automatic',
        },
      }),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({ message: 'Document creation failed' }));
    throw new Error(error.message || 'Document creation failed');
  }

  return createResponse.json();
}

export async function deleteDocument(datasetId: string, documentId: string): Promise<void> {
  await api.delete(`/console/api/datasets/${datasetId}/documents/${documentId}`);
}

export async function getDocumentSegments(
  datasetId: string,
  documentId: string
): Promise<{ data: Array<{ id: string; content: string; keywords: string[] }> }> {
  // Fetch all segments with pagination
  const allSegments: Array<{ id: string; content: string; keywords: string[] }> = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await api.get<{
      data: Array<{ id: string; content: string; keywords: string[] }>;
      has_more: boolean;
      total: number;
    }>(`/console/api/datasets/${datasetId}/documents/${documentId}/segments`, {
      page: String(page),
      limit: String(limit),
    });

    if (response.data && response.data.length > 0) {
      allSegments.push(...response.data);
      hasMore = response.has_more ?? (response.data.length === limit);
      page++;
    } else {
      hasMore = false;
    }
  }

  return { data: allSegments };
}

export async function retryDocumentIndexing(
  datasetId: string,
  documentId: string
): Promise<{ result: string }> {
  // Use retry endpoint with document_ids array
  return api.post(`/console/api/datasets/${datasetId}/retry`, {
    document_ids: [documentId],
  });
}

// Document progress types
export interface DocumentProgress {
  document_id: string;
  stage: 'parsing' | 'splitting' | 'indexing' | 'completed' | 'error' | 'paused' | 'unknown';
  progress: number;
  message: string;
  total_pages?: number;
  current_page?: number;
  updated_at?: string;
}

export async function getDocumentProgress(
  datasetId: string,
  documentId: string
): Promise<DocumentProgress> {
  return api.get<DocumentProgress>(
    `/console/api/datasets/${datasetId}/documents/${documentId}/progress`
  );
}

export async function getDocumentsProgress(
  datasetId: string,
  documentIds: string[]
): Promise<{ data: Record<string, DocumentProgress | null> }> {
  return api.get(
    `/console/api/datasets/${datasetId}/documents-progress`,
    { document_ids: documentIds.join(',') }
  );
}
