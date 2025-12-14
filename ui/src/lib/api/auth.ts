import api from './client';
import type {
  LoginRequest,
  LoginResponse,
  SetupRequest,
  SetupStatusResponse,
  User,
} from '@/types/api';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>('/console/api/login', data);
}

export async function getSetupStatus(): Promise<SetupStatusResponse> {
  return api.get<SetupStatusResponse>('/console/api/setup');
}

export async function setup(data: SetupRequest): Promise<{ result: string }> {
  return api.post<{ result: string }>('/console/api/setup', data);
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<{ id: string; email: string; name: string; avatar?: string }>(
    '/console/api/account/profile'
  );
  return response;
}

export async function logout(): Promise<void> {
  await api.get('/console/api/logout');
}

export async function refreshToken(token: string): Promise<LoginResponse> {
  return api.post<LoginResponse>('/console/api/refresh-token', {
    refresh_token: token,
  });
}
