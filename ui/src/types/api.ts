// Auth types
export interface LoginRequest {
  email: string;
  password: string;
  language?: string;
  remember_me?: boolean;
}

export interface LoginResponse {
  result: string;
  data: {
    access_token: string;
    refresh_token: string;
  };
}

export interface SetupRequest {
  email: string;
  name: string;
  password: string;
}

export interface SetupStatusResponse {
  step: 'not_started' | 'finished';
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

// App types
export type AppMode = 'chat' | 'completion' | 'agent-chat' | 'workflow';

export interface App {
  id: string;
  name: string;
  description?: string;
  mode: AppMode;
  icon?: string;
  icon_background?: string;
  created_at: string;
  updated_at: string;
}

export interface AppListResponse {
  data: App[];
  has_more: boolean;
  limit: number;
  page: number;
  total: number;
}

export interface CreateAppRequest {
  name: string;
  mode: AppMode;
  icon?: string;
  icon_background?: string;
  description?: string;
}

// Chat types
export interface ChatMessage {
  id: string;
  conversation_id: string;
  query: string;
  answer: string;
  created_at: number;
  feedback?: {
    rating: 'like' | 'dislike';
  };
}

export interface ChatRequest {
  inputs: Record<string, string>;
  query: string;
  response_mode: 'streaming' | 'blocking';
  conversation_id?: string;
  user: string;
}

export interface Conversation {
  id: string;
  name: string;
  inputs: Record<string, string>;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface ConversationListResponse {
  data: Conversation[];
  has_more: boolean;
  limit: number;
}

// Dataset types
export interface Dataset {
  id: string;
  name: string;
  description?: string;
  provider: string;
  permission: string;
  data_source_type: string;
  indexing_technique: string;
  app_count: number;
  document_count: number;
  word_count: number;
  created_at: number;
  updated_at: number;
}

export interface DatasetListResponse {
  data: Dataset[];
  has_more: boolean;
  limit: number;
  page: number;
  total: number;
}

export interface Document {
  id: string;
  name: string;
  data_source_type: string;
  word_count: number;
  tokens: number;
  indexing_status: 'waiting' | 'parsing' | 'indexing' | 'completed' | 'error';
  enabled: boolean;
  created_at: number;
}

export interface DocumentListResponse {
  data: Document[];
  has_more: boolean;
  limit: number;
  total: number;
}

// Workflow types
export interface WorkflowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface Workflow {
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  features?: Record<string, unknown>;
}

export interface WorkflowRunRequest {
  inputs: Record<string, string>;
}

export interface WorkflowRunResponse {
  task_id: string;
  workflow_run_id: string;
  data: {
    id: string;
    workflow_id: string;
    status: string;
    outputs?: Record<string, unknown>;
  };
}

// Model Configuration types
export interface ModelProvider {
  provider: string;
  label: string;
  icon?: string;
  models: ModelConfig[];
}

export interface ModelConfig {
  model: string;
  label: string;
  model_type: 'llm' | 'text-embedding' | 'speech2text' | 'tts' | 'rerank';
}

export interface ModelParameters {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop?: string[];
}

export interface PromptTemplate {
  prompt_type: 'simple' | 'advanced';
  simple_prompt_template?: string;
  advanced_chat_prompt_template?: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      text: string;
    }>;
  };
}

export interface InputVariable {
  variable: string;
  label: string;
  type: 'text-input' | 'paragraph' | 'select' | 'number';
  required: boolean;
  max_length?: number;
  options?: string[];
  default?: string;
}

export interface AppModelConfig {
  provider: string;
  model_id: string;
  model_name?: string;
  mode?: 'chat' | 'completion';
  completion_params: ModelParameters;
}

export interface DatasetConfig {
  dataset_id: string;
  enabled: boolean;
  retrieval_model?: {
    search_method: 'semantic' | 'full_text' | 'hybrid';
    top_k: number;
    score_threshold?: number;
  };
}

export interface AppConfig {
  pre_prompt?: string;
  prompt_type: 'simple' | 'advanced';
  chat_prompt_config?: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      text: string;
    }>;
  };
  user_input_form?: InputVariable[];
  model?: AppModelConfig;
  dataset_configs?: DatasetConfig[];
  opening_statement?: string;
  suggested_questions?: string[];
  more_like_this?: {
    enabled: boolean;
  };
  sensitive_word_avoidance?: {
    enabled: boolean;
    type?: string;
    configs?: Record<string, unknown>;
  };
  file_upload?: {
    enabled: boolean;
    allowed_file_types?: string[];
    max_file_size_mb?: number;
  };
}

export interface ModelProviderResponse {
  data: ModelProvider[];
}

// API Response wrapper
export interface ApiResponse<T> {
  result?: string;
  data?: T;
}
