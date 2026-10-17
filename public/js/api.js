async function request(method, url, body, { keepalive = false } = {}) {
  const init = { method, keepalive };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + url, init);
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).error || message; } catch { /* not json */ }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  patch: (url, body, opts) => request('PATCH', url, body, opts),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),

  async upload(file) {
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'file') },
      body: file,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
};
