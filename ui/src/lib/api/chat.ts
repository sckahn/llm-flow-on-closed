import type { ConversationListResponse, ChatMessage } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export async function getConversations(
  appId: string,
  limit = 20
): Promise<ConversationListResponse> {
  const token = getToken();
  const response = await fetch(
    `${API_BASE_URL}/console/api/apps/${appId}/conversations?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch conversations');
  }

  return response.json();
}

export async function getConversationMessages(
  appId: string,
  conversationId: string
): Promise<{ data: ChatMessage[] }> {
  const token = getToken();
  const response = await fetch(
    `${API_BASE_URL}/console/api/apps/${appId}/conversations/${conversationId}/messages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch messages');
  }

  return response.json();
}

export async function deleteConversation(
  appId: string,
  conversationId: string
): Promise<void> {
  const token = getToken();
  const response = await fetch(
    `${API_BASE_URL}/console/api/apps/${appId}/conversations/${conversationId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to delete conversation');
  }
}

export interface SendMessageOptions {
  appId: string;
  query: string;
  conversationId?: string;
  inputs?: Record<string, string>;
  onMessage: (data: {
    event: string;
    message_id?: string;
    conversation_id?: string;
    answer?: string;
  }) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

export async function sendMessage({
  appId,
  query,
  conversationId,
  inputs = {},
  onMessage,
  onError,
  onDone,
}: SendMessageOptions): Promise<void> {
  const token = getToken();

  try {
    const response = await fetch(
      `${API_BASE_URL}/console/api/apps/${appId}/chat-messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          inputs,
          query,
          response_mode: 'streaming',
          conversation_id: conversationId || '',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        onDone?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            onMessage(parsed);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error) {
    onError?.(error as Error);
  }
}
