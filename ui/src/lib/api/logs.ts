import api from './client';

export interface LogEntry {
  id: string;
  created_at: number;
  app_id: string;
  app_name?: string;
  conversation_id?: string;
  message_id?: string;
  query: string;
  answer: string;
  total_tokens: number;
  total_price: number;
  latency: number;
  status: 'succeeded' | 'failed' | 'stopped';
  error?: string;
  workflow_run_id?: string;
}

export interface LogListResponse {
  data: LogEntry[];
  has_more: boolean;
  limit: number;
  page: number;
}

export interface LogAnnotation {
  id: string;
  question: string;
  answer: string;
  created_at: number;
}

export interface MessageDetail {
  id: string;
  conversation_id: string;
  inputs: Record<string, unknown>;
  query: string;
  answer: string;
  message_files: Array<{
    id: string;
    type: string;
    url: string;
  }>;
  feedback?: {
    rating: 'like' | 'dislike';
    content?: string;
  };
  retriever_resources?: Array<{
    dataset_id: string;
    dataset_name: string;
    document_id: string;
    document_name: string;
    segment_id: string;
    content: string;
    score: number;
  }>;
  agent_thoughts?: Array<{
    id: string;
    position: number;
    thought: string;
    observation: string;
    tool: string;
    tool_input: string;
    created_at: number;
  }>;
  created_at: number;
}

export async function getLogs(
  appId: string,
  page = 1,
  limit = 20
): Promise<LogListResponse> {
  return api.get<LogListResponse>(`/console/api/apps/${appId}/messages`, {
    page: String(page),
    limit: String(limit),
  });
}

export async function getMessageDetail(
  appId: string,
  messageId: string
): Promise<MessageDetail> {
  return api.get<MessageDetail>(`/console/api/apps/${appId}/messages/${messageId}`);
}

export async function getAllLogs(page = 1, limit = 20): Promise<LogListResponse> {
  return api.get<LogListResponse>('/console/api/logs', {
    page: String(page),
    limit: String(limit),
  });
}
