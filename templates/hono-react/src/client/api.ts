/**
 * API 封装：fetch + 401 → /auth/login 跳转（与后端 requireAuth 302 策略闭环）。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 401) {
    window.location.href = `/auth/login?returnTo=${encodeURIComponent(location.pathname)}`
    throw new Error('unauthorized')
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export const api = {
  me: () => request<{ user: { sub: string; nickname?: string; avatarUrl?: string } | null }>('/api/me'),
  listTodos: () => request<{ todos: import('../shared/types.js').Todo[] }>('/api/todos'),
  createTodo: (title: string) =>
    request<{ todo: import('../shared/types.js').Todo }>('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  toggleTodo: (id: string) =>
    request<{ todo: import('../shared/types.js').Todo }>(`/api/todos/${id}`, { method: 'PATCH' }),
  deleteTodo: (id: string) => request<{ ok: true }>(`/api/todos/${id}`, { method: 'DELETE' }),
  capabilities: () =>
    request<{ name: string; capabilities: string[] }>('/api/platform/capabilities').catch(() => null),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  passwordLogin: (username: string, password: string) =>
    request<{ ok: true }>('/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  passwordRegister: (username: string, password: string, nickname?: string) =>
    request<{ ok: true }>('/auth/password/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, nickname }),
    }),
}
