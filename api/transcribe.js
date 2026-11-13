import { HttpError, json, method, getUser, errorResponse } from './lib.js';
const allowedMime = new Map([
  ['audio/webm','webm'], ['audio/mp4','mp4'], ['audio/mpeg','mp3'],
  ['audio/wav','wav'], ['audio/ogg','ogg'], ['audio/aac','aac'], ['audio/x-m4a','m4a']
]);
export async function transcriptionHandler(req, res) {
  try {
    method(req);
    if (!process.env.OPENAI_API_KEY) throw new HttpError(503, 'Transcription is not configured');
    await getUser(req);
    const {audio, mime} = req.body || {};
    const type = typeof mime === 'string' ? mime.split(';')[0].trim() : '';
    if (!allowedMime.has(type) || typeof audio !== 'string' || audio.length > 5_600_000 || audio.length < 100) {
      throw new HttpError(400, 'Unsupported recording or recording exceeds 4 MB');
    }
    if (!/^[\w+/=]+$/.test(audio)) throw new HttpError(400, 'Invalid recording');
    const bytes = Buffer.from(audio, 'base64');
    if (bytes.length > 4_200_000) throw new HttpError(400, 'Recording too long');
    const body = new FormData();
    body.append('model', 'whisper-1');
    body.append('file', new Blob([bytes], {type}), `timmy.${allowedMime.get(type)}`);
    let response;
    try { response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, body,
      signal:AbortSignal.timeout(26000)
    }); } catch { throw new HttpError(502, 'Speech service unavailable'); }
    if (!response.ok) throw new HttpError(502, 'Speech transcription failed');
    const data = await response.json();
    const text = typeof data.text === 'string' ? data.text.trim().slice(0, 6000) : '';
    return json(res, 200, {text});
  } catch (e) { return errorResponse(res, e); }
}
export default transcriptionHandler;
