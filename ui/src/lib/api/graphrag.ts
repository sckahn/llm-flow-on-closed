const GRAPHRAG_API_URL = process.env.NEXT_PUBLIC_GRAPHRAG_API_URL || 'http://localhost:8082';

export interface GraphRAGStats {
  dataset_id: string;
  graph: {
    entity_count: number;
    relationship_count: number;
  };
  vector: {
    count: number;
  };
}

export interface IngestDocumentRequest {
  text: string;
  document_id: string;
  dataset_id: string;
  chunk_size?: number;
}

export interface IngestDocumentResponse {
  document_id: string;
  entity_count: number;
  relationship_count: number;
  processing_time_ms: number;
  message: string;
}

export interface BuildGraphRAGProgress {
  dataset_id: string;
  status: 'idle' | 'building' | 'completed' | 'error';
  total_documents: number;
  completed_documents: number;
  total_segments: number;
  completed_segments: number;
  current_document: string;
  entities_extracted: number;
  relationships_extracted: number;
  error?: string;
}

export interface BuildRequest {
  dataset_id: string;
  dify_api_url?: string;
  dify_api_key?: string;
  chunk_size?: number;
  batch_size?: number;
}

export interface EntitySource {
  id: string;
  name?: string;
  type?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
  x?: number;
  y?: number;
  color?: string;
  size?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NarrativeResponse {
  question: string;
  answer: string;
  narrative?: string;
  graph?: GraphData;
  sources: EntitySource[];
  cypher_query?: string;
  processing_time_ms: number;
}

export interface DatasetSummary {
  dataset_id: string;
  summary: string;
  key_entities: EntitySource[];
  entity_count: number;
  relationship_count: number;
}

class GraphRAGClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 86400000 // 24 hours - practically no timeout
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getStats(datasetId: string): Promise<GraphRAGStats> {
    return this.request<GraphRAGStats>(`/api/graphrag/ingest/stats/${datasetId}`);
  }

  async getGlobalStats(): Promise<{ graph: object; vector: object }> {
    return this.request(`/api/graphrag/stats`);
  }

  async ingestDocument(request: IngestDocumentRequest): Promise<IngestDocumentResponse> {
    return this.request<IngestDocumentResponse>('/api/graphrag/ingest/document', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteDataset(datasetId: string): Promise<{ deleted_entities: number; deleted_vectors: number }> {
    return this.request('/api/graphrag/ingest/dataset', {
      method: 'DELETE',
      body: JSON.stringify({ dataset_id: datasetId }),
    });
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.request('/health');
  }

  async askNaturalLanguage(
    question: string,
    options?: { dataset_id?: string; include_narrative?: boolean }
  ): Promise<NarrativeResponse> {
    return this.request<NarrativeResponse>('/api/graphrag/search/nl-query', {
      method: 'POST',
      body: JSON.stringify({
        question,
        dataset_id: options?.dataset_id,
        include_narrative: options?.include_narrative ?? true,
      }),
    });
  }

  async getQuerySuggestions(datasetId?: string): Promise<string[]> {
    const url = datasetId
      ? `/api/graphrag/search/suggestions?dataset_id=${datasetId}`
      : '/api/graphrag/search/suggestions';
    const result = await this.request<{ suggestions: string[] }>(url);
    return result.suggestions;
  }

  async getDatasetSummary(datasetId: string): Promise<DatasetSummary> {
    return this.request<DatasetSummary>(`/api/graphrag/search/dataset/${datasetId}/summary`);
  }

  async getEntityStory(entityId: string, maxDepth = 2): Promise<NarrativeResponse> {
    return this.request<NarrativeResponse>(
      `/api/graphrag/search/entity/${entityId}/story?max_depth=${maxDepth}`
    );
  }

  async getDatasetGraph(datasetId: string, limit = 100): Promise<GraphData> {
    return this.request<GraphData>(
      `/api/graphrag/visualize/graph/${datasetId}?limit=${limit}`
    );
  }

  async exportDataset(datasetId: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/graphrag/backup/export/${datasetId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Export failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.blob();
  }

  async importDataset(file: File, targetDatasetId?: string, merge = false): Promise<{
    success: boolean;
    dataset_id: string;
    imported_entities: number;
    imported_relationships: number;
    message: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    if (targetDatasetId) {
      formData.append('target_dataset_id', targetDatasetId);
    }
    formData.append('merge', String(merge));

    const response = await fetch(`${this.baseUrl}/api/graphrag/backup/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Import failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Build API - server-side processing to avoid browser OOM
  async startBuild(request: BuildRequest): Promise<{ dataset_id: string; status: string; message: string }> {
    // Get auth token from localStorage
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';

    return this.request('/api/graphrag/build/start', {
      method: 'POST',
      body: JSON.stringify({
        dataset_id: request.dataset_id,
        dify_api_url: request.dify_api_url || 'http://dify-api:5001',
        dify_api_key: token || request.dify_api_key || '',
        chunk_size: request.chunk_size || 4000,
        batch_size: request.batch_size || 5,
      }),
    });
  }

  async getBuildProgress(datasetId: string): Promise<BuildGraphRAGProgress> {
    return this.request<BuildGraphRAGProgress>(`/api/graphrag/build/progress/${datasetId}`);
  }

  async clearBuildProgress(datasetId: string): Promise<{ message: string }> {
    return this.request(`/api/graphrag/build/progress/${datasetId}`, {
      method: 'DELETE',
    });
  }
}

export const graphragApi = new GraphRAGClient(GRAPHRAG_API_URL);

// Helper functions for direct import
export async function askNaturalLanguage(
  question: string,
  options?: { dataset_id?: string; include_narrative?: boolean }
): Promise<NarrativeResponse> {
  return graphragApi.askNaturalLanguage(question, options);
}

export async function getQuerySuggestions(datasetId?: string): Promise<string[]> {
  return graphragApi.getQuerySuggestions(datasetId);
}

export async function getDatasetSummary(datasetId: string): Promise<DatasetSummary> {
  return graphragApi.getDatasetSummary(datasetId);
}

export async function getEntityStory(entityId: string, maxDepth = 2): Promise<NarrativeResponse> {
  return graphragApi.getEntityStory(entityId, maxDepth);
}

export async function getDatasetGraph(datasetId: string, limit = 100): Promise<GraphData> {
  return graphragApi.getDatasetGraph(datasetId, limit);
}

export async function getGraphStats(datasetId?: string): Promise<GraphRAGStats | { graph: object; vector: object }> {
  if (datasetId) {
    return graphragApi.getStats(datasetId);
  }
  return graphragApi.getGlobalStats();
}

export default graphragApi;
