async function post(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || '请求失败');
  return j;
}

export async function me() {
  const r = await fetch('/api/auth/me');
  return r.ok ? r.json() : null;
}
export const login = (email, password) => post('/api/auth/login', { email, password });
export const register = (email, password) => post('/api/auth/register', { email, password });
export const logout = () => post('/api/auth/logout');
