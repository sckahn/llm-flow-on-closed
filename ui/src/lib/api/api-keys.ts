import api from './client';

export interface ApiKey {
  id: string;
  name: string;
  token: string;
  last_used_at?: number;
  created_at: number;
}

export interface ApiKeyListResponse {
  data: ApiKey[];
}

export async function getApiKeys(appId: string): Promise<ApiKeyListResponse> {
  return api.get<ApiKeyListResponse>(`/console/api/apps/${appId}/api-keys`);
}

export async function createApiKey(appId: string): Promise<ApiKey> {
  return api.post<ApiKey>(`/console/api/apps/${appId}/api-keys`);
}

export async function deleteApiKey(appId: string, keyId: string): Promise<void> {
  await api.delete(`/console/api/apps/${appId}/api-keys/${keyId}`);
}
