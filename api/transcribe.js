// api/transcribe.js — turns one saved Speaking recording into text (Groq Whisper).
// Runs on Vercel's server. Needs the environment variable GROQ_API_KEY
// (free key from https://console.groq.com  ->  API Keys).
//
// The browser sends { path, token }:
//   path  = "<userId>/<mockId>/<part>.webm"  (where the audio was uploaded in Supabase Storage)
//   token = the logged-in user's Supabase access token
// The audio is downloaded with the USER'S token, so Supabase's own security rules
// (the storage policies) guarantee that people can only transcribe their own recordings.

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sgvfmqxwhypjoxcaxanh.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_RJM4SqD7iTiUX4wJLLMOTA_g5peTZAx";
const BUCKET = "speaking_audio";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_BYTES = 24 * 1024 * 1024;
const MIME = { webm: "audio/webm", mp4: "audio/mp4", ogg: "audio/ogg" };

const num = (n) => (Number.isFinite(n) ? n : null);
const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return res.status(500).json({ error: "Server is missing GROQ_API_KEY. Add it in Vercel → Settings → Environment Variables, then redeploy." });
  }

  const { path, token } = req.body || {};
  if (typeof path !== "string" || typeof token !== "string" || !/^[\w-]+\/[\w-]+\/\w+\.(webm|mp4|ogg)$/i.test(path)) {
    return res.status(400).json({ error: "Request must include a valid 'path' and 'token'." });
  }
  const ext = path.split(".").pop().toLowerCase();

  // 1) download the recording from Supabase Storage as the logged-in user
  let buf;
  try {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const dl = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${encoded}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!dl.ok) {
      return res.status(dl.status === 400 || dl.status === 404 ? 404 : 403).json({ error: `Could not read the recording (${dl.status}).` });
    }
    buf = Buffer.from(await dl.arrayBuffer());
  } catch (err) {
    return res.status(502).json({ error: "Could not download the recording: " + (err.message || err) });
  }
  if (buf.length > MAX_BYTES) return res.status(413).json({ error: "Recording is too large." });
  if (buf.length < 1500) {
    return res.status(200).json({ text: "", silent: true, wordCount: 0, duration: 0, wpm: 0, pauses: 0, longestPause: 0, confidence: null });
  }

  // 2) speech-to-text
  let j;
  try {
    const form = new FormData();
    form.append("file", new Blob([buf], { type: MIME[ext] || "audio/webm" }), "audio." + ext);
    form.append("model", GROQ_MODEL);
    form.append("response_format", "verbose_json");
    form.append("language", "en");
    form.append("temperature", "0");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j && j.error && j.error.message) || `Groq error ${r.status}`;
      return res.status(r.status === 429 ? 429 : 502).json({ error: msg });
    }
  } catch (err) {
    return res.status(502).json({ error: "Transcription failed: " + (err.message || err) });
  }

  // 3) text + simple speaking statistics (fluency hints for the AI examiner)
  const text = String(j.text || "").trim();
  const words = Array.isArray(j.words) ? j.words : [];
  const segs = Array.isArray(j.segments) ? j.segments : [];
  const wordCount = text ? text.split(/\s+/).length : 0;
  const duration =
    num(Number(j.duration)) ||
    (segs.length ? Number(segs[segs.length - 1].end) : 0) ||
    (words.length ? Number(words[words.length - 1].end) : 0) ||
    0;

  let pauses = 0;
  let longest = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = Number(words[i].start) - Number(words[i - 1].end);
    if (gap >= 1.0) {
      pauses++;
      if (gap > longest) longest = gap;
    }
  }
  const span = words.length ? Number(words[words.length - 1].end) - Number(words[0].start) : duration;
  const wpm = span > 3 ? Math.round((words.length || wordCount) / (span / 60)) : 0;
  const confidence = avg(segs.map((s) => Number(s.avg_logprob)).filter(Number.isFinite));
  const noSpeech = avg(segs.map((s) => Number(s.no_speech_prob)).filter(Number.isFinite));
  // Whisper sometimes invents a short phrase on silence — treat that as "no speech".
  const silent = wordCount < 3 || (noSpeech !== null && noSpeech > 0.7 && wordCount < 8);

  return res.status(200).json({
    text: silent ? "" : text,
    silent,
    wordCount,
    duration: round(duration, 1),
    wpm,
    pauses,
    longestPause: round(longest, 1) || 0,
    confidence: round(confidence, 2),
  });
}
