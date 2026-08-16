async function request(path, body) {
  let response;
  try {
    response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Cannot connect to the AutoFA API. Start the server with "npm run dev" and try again.');
  }
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { /* Preserve a useful HTTP error below. */ }
  if (!response.ok && import.meta.env.DEV) {
    console.error('[AutoFA API error]', JSON.stringify({
      path,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: text,
    }));
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `The AutoFA API returned ${response.status}. Please try again.`);
  if (!payload.data) throw new Error('The AutoFA API returned an incomplete response. Please try again.');
  return payload.data;
}

export const generateAutomaton = input => request('/api/generate', input);
export const simulateAutomaton = input => request('/api/simulate', input);
export const convertNfaToDfa = input => request('/api/convert-nfa', input);
