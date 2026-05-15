const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export async function uploadResume(file) {
  const form = new FormData();
  form.append('resume', file);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data; // { sessionId, charCount }
}

export async function swapResume(sessionId, file) {
  const form = new FormData();
  form.append('resume', file);
  const res = await fetch(`${BASE}/session/${sessionId}/resume`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Resume swap failed');
  return data; // { fileName, charCount }
}

export async function sendMessage(sessionId, message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90s

  try {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chat request failed');
    return data; // { turns, warning? }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — the analysis is taking too long. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
