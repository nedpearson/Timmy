import { config, json, errorResponse } from './_lib.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { url, key } = config();
    return json(res, 200, { supabaseUrl: url, supabaseKey: key });
  } catch (e) { return errorResponse(res, e); }
}
