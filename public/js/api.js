import { TAB_ID } from './realtime.js';

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-VOCML-Origin': TAB_ID };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : null;
  if (res.status === 401 && !path.startsWith('/auth')) {
    window.dispatchEvent(new Event('vocml:unauth'));
  }
  if (!res.ok) throw new Error(data?.error || `Gagal (HTTP ${res.status})`);
  return data;
}
