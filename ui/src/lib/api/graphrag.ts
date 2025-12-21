/**
 * GraphRAG API Client
 * Handles all communication with the GraphRAG backend service
 */

const GRAPHRAG_API_BASE = process.env.NEXT_PUBLIC_GRAPHRAG_API_URL || 'http://localhost:8082/api/graphrag';

export interface Entity {
  id: string;
  name: string;
  type: string;
  description?: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
  confidence?: number;
}

export interface Relationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_name?: string;
  target_entity_name?: string;
  type: string;
  description?: string;
  weight?: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: Record<string, unknown>;
  legend?: Record<string, string>;
}

export interface SearchResultItem {
  id: string;
  type: string;
  name: string;
  description?: string;
  score: number;
  source: string;
  properties?: Record<string, unknown>;
  connections?: Array<Record<string, unknown>>;
}

export interface SearchResult {
  query: string;
  mode: 'vector' | 'graph' | 'hybrid';
  results: SearchResultItem[];
  graph?: GraphData;
  total_count: number;
  processing_time_ms: number;
}

export interface NarrativeResponse {
  question: string;
  answer: string;
  narrative: string;
  graph?: GraphData;
  sources: Array<Record<string, unknown>>;
  cypher_query?: string;
  processing_time_ms: number;
}

export interface GraphStats {
  entity_count: number;
  relationship_count: number;
  entity_types: Record<string, number>;
  dataset_id?: string;
}

// API Functions

export async function searchGraph(
  query: string,
  options: {
    mode?: 'vector' | 'graph' | 'hybrid';
    dataset_id?: string;
    entity_types?: string[];
    top_k?: number;
    include_graph?: boolean;
    max_graph_depth?: number;
  } = {}
): Promise<SearchResult> {
  const response = await fetch(`${GRAPHRAG_API_BASE}/search/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      mode: options.mode || 'hybrid',
      dataset_id: options.dataset_id,
      entity_types: options.entity_types,
      top_k: options.top_k || 10,
      include_graph: options.include_graph !== false,
      max_graph_depth: options.max_graph_depth || 2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return response.json();
}

export async function askNaturalLanguage(
  question: string,
  options: {
    dataset_id?: string;
    include_narrative?: boolean;
  } = {}
): Promise<NarrativeResponse> {
  const response = await fetch(`${GRAPHRAG_API_BASE}/search/nl-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      dataset_id: options.dataset_id,
      include_narrative: options.include_narrative !== false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Query failed: ${response.statusText}`);
  }

  return response.json();
}

export async function getQuerySuggestions(dataset_id?: string): Promise<string[]> {
  const url = new URL(`${GRAPHRAG_API_BASE}/search/suggestions`);
  if (dataset_id) {
    url.searchParams.set('dataset_id', dataset_id);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to get suggestions: ${response.statusText}`);
  }

  const data = await response.json();
  return data.suggestions;
}

export async function getEntityStory(
  entity_id: string,
  max_depth: number = 2
): Promise<NarrativeResponse> {
  const response = await fetch(
    `${GRAPHRAG_API_BASE}/search/entity/${entity_id}/story?max_depth=${max_depth}`
  );

  if (!response.ok) {
    throw new Error(`Failed to get entity story: ${response.statusText}`);
  }

  return response.json();
}

export async function getDatasetSummary(dataset_id: string): Promise<{
  summary: string;
  stats: GraphStats;
  sample_graph?: GraphData;
  processing_time_ms: number;
}> {
  const response = await fetch(`${GRAPHRAG_API_BASE}/search/dataset/${dataset_id}/summary`);

  if (!response.ok) {
    throw new Error(`Failed to get dataset summary: ${response.statusText}`);
  }

  return response.json();
}

export async function getDatasetGraph(
  dataset_id: string,
  options: {
    limit?: number;
    include_styling?: boolean;
  } = {}
): Promise<GraphData> {
  const url = new URL(`${GRAPHRAG_API_BASE}/visualize/graph/${dataset_id}`);
  if (options.limit) {
    url.searchParams.set('limit', options.limit.toString());
  }
  if (options.include_styling !== undefined) {
    url.searchParams.set('include_styling', options.include_styling.toString());
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to get graph: ${response.statusText}`);
  }

  return response.json();
}

export async function getEntityGraph(
  entity_id: string,
  options: {
    max_depth?: number;
    limit?: number;
    include_styling?: boolean;
  } = {}
): Promise<GraphData> {
  const url = new URL(`${GRAPHRAG_API_BASE}/visualize/entity/${entity_id}`);
  if (options.max_depth) {
    url.searchParams.set('max_depth', options.max_depth.toString());
  }
  if (options.limit) {
    url.searchParams.set('limit', options.limit.toString());
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to get entity graph: ${response.statusText}`);
  }

  return response.json();
}

export async function findPath(
  source_id: string,
  target_id: string,
  max_depth: number = 5
): Promise<GraphData> {
  const response = await fetch(`${GRAPHRAG_API_BASE}/visualize/path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id,
      target_id,
      max_depth,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to find path: ${response.statusText}`);
  }

  return response.json();
}

export async function getGraphStats(dataset_id?: string): Promise<{
  dataset_id?: string;
  total_entities: number;
  total_relationships: number;
  type_distribution: Array<{ type: string; count: number; color: string }>;
  avg_connections: number;
}> {
  const url = dataset_id
    ? `${GRAPHRAG_API_BASE}/visualize/stats/${dataset_id}`
    : `${GRAPHRAG_API_BASE}/stats`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get stats: ${response.statusText}`);
  }

  return response.json();
}

export async function getColorPalette(): Promise<{
  entity_colors: Record<string, string>;
  entity_sizes: Record<string, number>;
}> {
  const response = await fetch(`${GRAPHRAG_API_BASE}/visualize/colors`);
  if (!response.ok) {
    throw new Error(`Failed to get color palette: ${response.statusText}`);
  }

  return response.json();
}

// Ingest APIs

export async function ingestDocument(
  text: string,
  document_id: string,
  dataset_id: string,
  chunk_size: number = 1000
): Promise<{
  document_id: string;
  entity_count: number;
  relationship_count: number;
  processing_time_ms: number;
  message: string;
}> {
  const response = await fetch(`${GRAPHRAG_API_BASE}/ingest/document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      document_id,
      dataset_id,
      chunk_size,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to ingest document: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteDataset(dataset_id: string): Promise<{
  dataset_id: string;
  deleted_entities: number;
  deleted_vectors: number;
  message: string;
}> {
  const response = await fetch(`${GRAPHRAG_API_BASE}/ingest/dataset`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_id }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete dataset: ${response.statusText}`);
  }

  return response.json();
}
