import api from './client';
import type {
  App,
  AppListResponse,
  CreateAppRequest,
  AppConfig,
  ModelProviderResponse,
} from '@/types/api';

export async function getApps(page = 1, limit = 20): Promise<AppListResponse> {
  return api.get<AppListResponse>('/console/api/apps', {
    page: String(page),
    limit: String(limit),
  });
}

export async function getApp(id: string): Promise<App> {
  return api.get<App>(`/console/api/apps/${id}`);
}

export async function createApp(data: CreateAppRequest): Promise<App> {
  return api.post<App>('/console/api/apps', data);
}

export async function updateApp(
  id: string,
  data: Partial<CreateAppRequest>
): Promise<App> {
  return api.put<App>(`/console/api/apps/${id}`, data);
}

export async function deleteApp(id: string): Promise<void> {
  await api.delete(`/console/api/apps/${id}`);
}

export async function copyApp(id: string): Promise<App> {
  return api.post<App>(`/console/api/apps/${id}/copy`);
}

// App Configuration APIs
export async function getAppConfig(appId: string): Promise<AppConfig> {
  return api.get<AppConfig>(`/console/api/apps/${appId}/model-config`);
}

export async function updateAppConfig(
  appId: string,
  config: Partial<AppConfig>
): Promise<void> {
  await api.post(`/console/api/apps/${appId}/model-config`, config);
}

// Model Provider APIs
export async function getModelProviders(): Promise<ModelProviderResponse> {
  return api.get<ModelProviderResponse>('/console/api/workspaces/current/model-providers');
}

export async function getProviderModels(provider: string): Promise<{
  data: Array<{
    model: string;
    label: string;
    model_type: string;
  }>;
}> {
  return api.get(`/console/api/workspaces/current/model-providers/${provider}/models`);
}
