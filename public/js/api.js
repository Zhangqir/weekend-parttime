// API 调用层：命名与后端端点一一对应（/api/auth /api/jobs /api/applications /api/reviews）
const TOKEN_KEY = 'wp_token';
const USER_KEY = 'wp_user';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
export function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
export function setUser(u) { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); }

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch { /* 空响应 */ }

  if (!res.ok) {
    if (res.status === 401) { setToken(null); setUser(null); }
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}
