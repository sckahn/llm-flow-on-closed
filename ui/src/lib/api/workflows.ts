import api from './client';
import type { AppListResponse, Workflow, WorkflowRunResponse } from '@/types/api';

export async function getWorkflowApps(page = 1, limit = 20): Promise<AppListResponse> {
  const response = await api.get<AppListResponse>('/console/api/apps', {
    page: String(page),
    limit: String(limit),
    mode: 'workflow',
  });
  return {
    ...response,
    data: response.data.filter((app) => app.mode === 'workflow'),
  };
}

export async function getWorkflowDraft(appId: string): Promise<Workflow> {
  return api.get<Workflow>(`/console/api/apps/${appId}/workflows/draft`);
}

export async function saveWorkflowDraft(appId: string, workflow: Workflow): Promise<void> {
  await api.post(`/console/api/apps/${appId}/workflows/draft`, workflow);
}

export async function publishWorkflow(appId: string): Promise<void> {
  await api.post(`/console/api/apps/${appId}/workflows/publish`);
}

export async function runWorkflow(
  appId: string,
  inputs: Record<string, string>
): Promise<WorkflowRunResponse> {
  return api.post<WorkflowRunResponse>(`/console/api/apps/${appId}/workflows/run`, {
    inputs,
  });
}

export async function getWorkflowRunHistory(
  appId: string
): Promise<{
  data: Array<{
    id: string;
    status: string;
    created_at: number;
    elapsed_time: number;
  }>;
}> {
  return api.get(`/console/api/apps/${appId}/workflow-runs`);
}
