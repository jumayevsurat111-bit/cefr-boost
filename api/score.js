// This file runs on Vercel's server, never in the browser.
// It uses OpenRouter (https://openrouter.ai) free-tier models.
// Set the key in Vercel: Project Settings → Environment Variables → OPENROUTER_API_KEY.
// The frontend never sees this key — it only talks to /api/score.
//
// Why this version exists:
// Free models on OpenRouter are renamed/removed every few weeks, so hardcoded
// model names stop working. This version asks OpenRouter which free text models
// exist right now, tries several of them (plus the "openrouter/free" router as
// a last resort), and only accepts a reply that parses as a JSON object.

export const config = { maxDuration: 60 };

const OR_BASE = "https://openrouter.ai/api/v1";
const TOTAL_BUDGET_MS = 55000; // stay under Vercel's 60s limit
const PER_MODEL_MAX_MS = 30000; // one slow model must not eat the whole budget
const MAX_FREE_MODELS = 5; // how many free models to try before the router

// Cached between requests while the serverless instance is warm.
let modelCache = { at: 0, list: [] };

async function getFreeModels() {
  const TEN_MIN = 10 * 60 * 1000;
  if (modelCache.list.length && Date.now() - modelCache.at < TEN_MIN) {
    return modelCache.list;
  }
  try {
    const r = await fetch(`${OR_BASE}/models`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const list = (j.data || [])
      .filter((m) => typeof m.id === "string" && m.id.endsWith(":free"))
      .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
      .filter((m) => {
        const out = m.architecture?.output_modalities;
        return !out || (out.length === 1 && out[0] === "text");
      })
      .filter((m) => {
        const inp = m.architecture?.input_modalities;
        return !inp || inp.includes("text");
      })
      .filter((m) => !/(coder|-vl|vision|audio|lyria|embed|guard|safeguard)/i.test(m.id))
      .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
      .map((m) => m.id);
    if (list.length) modelCache = { at: Date.now(), list };
    return list;
  } catch (err) {
    console.error("Could not load free model list:", err.message);
    return modelCache.list; // may be empty — handled by the caller
  }
}

// Pulls one JSON object out of a model reply, tolerating ```json fences,
// text before/after the object, and trailing commas.
function extractJson(rawText) {
  let text = (rawText || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("no JSON object found in reply");
  text = text.slice(first, last + 1);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    parsed = JSON.parse(text.replace(/,\s*([}\]])/g, "$1"));
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("reply is not a JSON object");
  }
  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing OPENROUTER_API_KEY. Set it in Vercel project settings." });
  }

  const { system, messages, max_tokens } = req.body || {};
  if (!system || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Request must include 'system' and a 'messages' array." });
  }

  const started = Date.now();
  const userText = messages.map((m) => m.content).join("\n\n");
  const strictSystem =
    system +
    "\n\nIMPORTANT OUTPUT RULES: Reply with ONE valid JSON object and nothing else. " +
    "No markdown fences, no text before or after the JSON. Keep every string short. " +
    "List at most 5 errors per task.";

  async function callModel(model, timeoutMs) {
    const orResponse = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Title": "CEFR Boost",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: strictSystem },
          { role: "user", content: userText },
        ],
        max_tokens: Math.min(max_tokens || 1500, 4000),
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = await orResponse.json();
    if (!orResponse.ok) {
      throw new Error("OpenRouter error " + orResponse.status + ": " + JSON.stringify(data).slice(0, 300));
    }

    const choice = data.choices?.[0];
    const content = choice?.message?.content || "";
    const reasoning = choice?.message?.reasoning || "";
    console.error(
      `[${model}] finish_reason=${choice?.finish_reason} content_len=${content.length} reasoning_len=${reasoning.length}`
    );

    try {
      return extractJson(content);
    } catch (errContent) {
      if (choice?.finish_reason === "length") {
        throw new Error("reply cut off by max_tokens (" + errContent.message + ")");
      }
      if (reasoning) return extractJson(reasoning); // some models put the answer here
      throw errContent;
    }
  }

  const free = await getFreeModels();
  const models = [...new Set([...free.slice(0, MAX_FREE_MODELS), "openrouter/free"])];
  const attempts = [];

  for (const model of models) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    if (remaining < 8000) break;
    try {
      const parsed = await callModel(model, Math.min(PER_MODEL_MAX_MS, remaining - 1000));
      return res.status(200).json({
        content: [{ type: "text", text: JSON.stringify(parsed) }],
      });
    } catch (err) {
      const msg = String(err.message || err).slice(0, 200);
      attempts.push({ model, error: msg });
      console.error(`Model ${model} failed:`, msg);
    }
  }

  console.error("All models failed:", JSON.stringify(attempts));
  return res.status(502).json({
    error: "Model returned invalid JSON after multiple attempts",
    details: "The AI's response could not be parsed. Please try again.",
    attempts,
  });
}
