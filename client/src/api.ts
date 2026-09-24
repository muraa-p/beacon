import type { Check, Monitor, MonitorEvent, MonitorInput, Settings } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : res.statusText
    throw new ApiError(res.status, message)
  }
  return data as T
}

export const api = {
  me: () => request<{ username: string }>('/api/me'),
  login: (username: string, password: string) =>
    request<{ ok: boolean; username: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST', body: '{}' }),
  monitors: () => request<Monitor[]>('/api/monitors'),
  monitor: (id: number) => request<Monitor>(`/api/monitors/${id}`),
  createMonitor: (input: MonitorInput) =>
    request<Monitor>('/api/monitors', { method: 'POST', body: JSON.stringify(input) }),
  updateMonitor: (id: number, input: MonitorInput) =>
    request<Monitor>(`/api/monitors/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteMonitor: (id: number) =>
    request<{ ok: boolean }>(`/api/monitors/${id}`, { method: 'DELETE' }),
  checks: (id: number, limit = 200) =>
    request<{ checks: Check[] }>(`/api/monitors/${id}/checks?limit=${limit}`),
  events: (id: number) =>
    request<{ events: MonitorEvent[] }>(`/api/monitors/${id}/events`),
  settings: () => request<Settings>('/api/settings'),
  updateSettings: (settings: Settings) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
}