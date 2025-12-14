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
  const formData = new FormData();
  formData.append('file', file);

  if (options?.indexing_technique) {
    formData.append('indexing_technique', options.indexing_technique);
  }

  if (options?.process_rule) {
    formData.append('process_rule', JSON.stringify(options.process_rule));
  }

  // Use direct fetch for file upload
  const token = localStorage.getItem('access_token');
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/console/api/datasets/${datasetId}/document/create-by-file`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.message || 'Upload failed');
  }

  return response.json();
}

export async function deleteDocument(datasetId: string, documentId: string): Promise<void> {
  await api.delete(`/console/api/datasets/${datasetId}/documents/${documentId}`);
}

export async function getDocumentSegments(
  datasetId: string,
  documentId: string
): Promise<{ data: Array<{ id: string; content: string; keywords: string[] }> }> {
  return api.get(`/console/api/datasets/${datasetId}/documents/${documentId}/segments`);
}
