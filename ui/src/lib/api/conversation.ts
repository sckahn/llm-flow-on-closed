/**
 * Conversation Flow API Client
 *
 * 대화형 GraphRAG를 위한 API 클라이언트
 * - 멀티스텝 조건 흐름 기반 대화
 * - 세션 관리
 * - Flow 관리 (Intent, Condition, Action)
 */

const GRAPHRAG_API_URL = process.env.NEXT_PUBLIC_GRAPHRAG_API_URL || 'http://localhost:8082';

// =============================================================================
// Types
// =============================================================================

export type ConditionType =
  | 'select_one'
  | 'select_multi'
  | 'text_input'
  | 'date_input'
  | 'number_input'
  | 'yes_no'
  | 'auto_extract';

export type ActionType =
  | 'graph_search'
  | 'vector_search'
  | 'hybrid_search'
  | 'llm_generate'
  | 'api_call'
  | 'clarify';

export interface ConversationMessage {
  session_id?: string;
  message: string;
  selected_option?: string;
  dataset_id?: string;
}

export interface ConversationOption {
  value: string;
  label: string;
}

export interface ConversationResponse {
  session_id: string;
  message: string;
  needs_input: boolean;
  input_type?: ConditionType;
  options?: ConversationOption[];
  is_complete: boolean;
  answer?: string;
  graph?: GraphData;
  sources: Array<{ id: string; name: string; score: number }>;
  current_intent?: string;
  collected_values: Record<string, unknown>;
}

export interface ConversationState {
  session_id: string;
  current_intent?: string;
  current_node_id?: string;
  collected_values: Record<string, unknown>;
  conversation_history: Array<{ role: string; content: string; timestamp?: string }>;
  document_context?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Flow Management Types
export interface IntentNode {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  keywords: string[];
  examples: string[];
  priority: number;
  is_active: boolean;
}

export interface ConditionNode {
  id: string;
  name: string;
  display_name: string;
  condition_type: ConditionType;
  question_template: string;
  options?: ConversationOption[];
  options_from_graph?: string;
  validation_rule?: string;
  default_value?: string;
  is_required: boolean;
  order: number;
}

export interface ActionNode {
  id: string;
  name: string;
  action_type: ActionType;
  config: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  condition?: string;
  order: number;
}

export interface FlowGraph {
  intents: IntentNode[];
  conditions: ConditionNode[];
  actions: ActionNode[];
  responses: unknown[];
  edges: FlowEdge[];
}

export interface CreateIntentRequest {
  name: string;
  display_name: string;
  description?: string;
  keywords: string[];
  examples: string[];
}

export interface CreateConditionRequest {
  name: string;
  display_name: string;
  condition_type: ConditionType;
  question_template: string;
  options?: ConversationOption[];
  options_from_graph?: string;
  is_required?: boolean;
}

export interface CreateEdgeRequest {
  source_id: string;
  target_id: string;
  edge_type: string;
  condition?: string;
  order?: number;
}

// =============================================================================
// API Client
// =============================================================================

class ConversationClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 60000
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

  // =========================================================================
  // Chat API
  // =========================================================================

  async chat(message: ConversationMessage): Promise<ConversationResponse> {
    return this.request<ConversationResponse>('/conversation/chat', {
      method: 'POST',
      body: JSON.stringify(message),
    });
  }

  async getSession(sessionId: string): Promise<ConversationState> {
    return this.request<ConversationState>(`/conversation/session/${sessionId}`);
  }

  async resetSession(sessionId: string): Promise<{ message: string; session_id: string }> {
    return this.request(`/conversation/session/${sessionId}/reset`, {
      method: 'POST',
    });
  }

  async deleteSession(sessionId: string): Promise<{ message: string }> {
    return this.request(`/conversation/session/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async listSessions(limit = 100): Promise<{ sessions: string[]; count: number }> {
    return this.request(`/conversation/sessions?limit=${limit}`);
  }

  async debugSession(sessionId: string): Promise<{
    session_id: string;
    current_intent?: string;
    current_node_id?: string;
    collected_values: Record<string, unknown>;
    document_context?: string;
    history_count: number;
    ttl_seconds: number;
    created_at: string;
    updated_at: string;
  }> {
    return this.request(`/conversation/debug/state/${sessionId}`);
  }

  // =========================================================================
  // Flow Management API
  // =========================================================================

  async getFlowGraph(intentId?: string): Promise<FlowGraph> {
    const url = intentId
      ? `/conversation/flow?intent_id=${intentId}`
      : '/conversation/flow';
    return this.request<FlowGraph>(url);
  }

  async getIntents(activeOnly = true): Promise<IntentNode[]> {
    return this.request<IntentNode[]>(`/conversation/flow/intents?active_only=${activeOnly}`);
  }

  async createIntent(request: CreateIntentRequest): Promise<{ id: string; message: string }> {
    return this.request('/conversation/flow/intent', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async updateIntent(intentId: string, request: CreateIntentRequest): Promise<{ id: string; message: string }> {
    return this.request(`/conversation/flow/intent/${intentId}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    });
  }

  async deleteIntent(intentId: string): Promise<{ message: string }> {
    return this.request(`/conversation/flow/intent/${intentId}`, {
      method: 'DELETE',
    });
  }

  async createCondition(request: CreateConditionRequest): Promise<{ id: string; message: string }> {
    return this.request('/conversation/flow/condition', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteCondition(conditionId: string): Promise<{ message: string }> {
    return this.request(`/conversation/flow/condition/${conditionId}`, {
      method: 'DELETE',
    });
  }

  async createAction(
    name: string,
    actionType: ActionType,
    config?: Record<string, unknown>
  ): Promise<{ id: string; message: string }> {
    const params = new URLSearchParams({
      name,
      action_type: actionType,
    });
    return this.request(`/conversation/flow/action?${params}`, {
      method: 'POST',
      body: JSON.stringify(config || {}),
    });
  }

  async createEdge(request: CreateEdgeRequest): Promise<{ id: string; message: string }> {
    return this.request('/conversation/flow/edge', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteEdge(edgeId: string): Promise<{ message: string }> {
    return this.request(`/conversation/flow/edge/${edgeId}`, {
      method: 'DELETE',
    });
  }

  async seedFlowData(): Promise<{ message: string }> {
    return this.request('/conversation/flow/seed', {
      method: 'POST',
    });
  }
}

// =============================================================================
// Export
// =============================================================================

export const conversationApi = new ConversationClient(GRAPHRAG_API_URL);

// Helper functions
export async function chat(message: ConversationMessage): Promise<ConversationResponse> {
  return conversationApi.chat(message);
}

export async function getSession(sessionId: string): Promise<ConversationState> {
  return conversationApi.getSession(sessionId);
}

export async function getFlowGraph(intentId?: string): Promise<FlowGraph> {
  return conversationApi.getFlowGraph(intentId);
}

export async function getIntents(activeOnly = true): Promise<IntentNode[]> {
  return conversationApi.getIntents(activeOnly);
}

export default conversationApi;
