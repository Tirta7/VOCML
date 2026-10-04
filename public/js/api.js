export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
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
