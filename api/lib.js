export const WORKSPACES = Object.freeze([
  'personal', 'legal', 'bridgebox', 'window_world_assistant',
  'vow_os', 'delta_ridge', 'brickyard', 'scagscapes', 'boatpak'
]);
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\/[^/]+$/i.test(url)) {
    throw new HttpError(503, 'Database authentication has not been configured yet.');
  }
  return { url, key };
}
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}
export function method(req, expected = 'POST') {
  if (req.method !== expected) throw new HttpError(405, 'Method not allowed');
}
export function requireWorkspace(workspace) {
  if (!WORKSPACES.includes(workspace)) throw new HttpError(400, 'Invalid workspace');
  return workspace;
}
export function requireUuid(value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new HttpError(400, 'Invalid ID');
  return value;
}
export function bearer(req) {
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in to continue');
  return m[1];
}
export async function getUser(req) {
  const token = bearer(req);
  const { url, key } = config();
  let response;
  try { response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000)
  }); } catch { throw new HttpError(502, 'Authentication provider unavailable'); }
  if (!response.ok) throw new HttpError(401, 'Session expired. Please sign in again.');
  const user = await response.json();
  if (!user.id || !ID_RE.test(user.id)) throw new HttpError(401, 'Invalid session');
  return { token, id: user.id };
}
export async function dbRequest(user, table, { query = '', method: verb = 'GET', body, prefer } = {}) {
  const { url, key } = config();
  let response;
  try { response = await fetch(`${url}/rest/v1/${table}${query ? '?' + query : ''}`, {
    method: verb,
    headers: {
      apikey: key, Authorization: `Bearer ${user.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000)
  }); } catch { throw new HttpError(502, 'Database temporarily unavailable'); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new HttpError(403, 'Not authorized to access this data');
    // Never return SQL, schema, or provider errors to a client.
    throw new HttpError(502, 'Database request failed. Check deployment configuration and migrations.');
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
export function eq(value) { return `eq.${encodeURIComponent(value)}`; }
export function errorResponse(res, error) {
  if (!(error instanceof HttpError)) console.error('Timmy unhandled error', error?.message || 'unknown');
  return json(res, error instanceof HttpError ? error.status : 500,
    { error: error instanceof HttpError ? error.message : 'Unexpected server error' });
}
export function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  return (data?.output || []).flatMap(item => item.content || [])
    .filter(part => part.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text).join('\n').trim();
}
