import { json } from './lib.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  return json(res, 200, { app: 'timmy', ready: Boolean(process.env.OPENAI_API_KEY && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY), timestamp: new Date().toISOString() });
}
