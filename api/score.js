// This file runs on Vercel's server, never in the browser.
// It uses OpenRouter (https://openrouter.ai), which offers free-tier
// models with no credit card and no age verification — just sign up
// with email or GitHub and grab an API key from openrouter.ai/keys.
// Set it in Vercel: Project Settings → Environment Variables → OPENROUTER_API_KEY.
// The frontend never sees this key — it only talks to /api/score.

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

  const userText = messages.map((m) => m.content).join("\n\n");
  const url = "https://openrouter.ai/api/v1/chat/completions";

  // Try a few different free models, in order, in case one is
  // currently overloaded or returning malformed output.
     const modelsToTry = [
     "deepseek/deepseek-chat-v3.1:free",
     "meta-llama/llama-3.3-70b-instruct:free",
     "google/gemini-2.0-flash-exp:free",
   ];

  function extractJson(rawText) {
    let text = (rawText || "").trim();
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) text = fenceMatch[1].trim();
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
    JSON.parse(text); // throws if still invalid
    return text;
  }

  async function tryModel(model) {
    const orResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
        max_tokens: Math.min(max_tokens || 1000, 3500),
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    const data = await orResponse.json();
    if (!orResponse.ok) {
      throw new Error("OpenRouter API error: " + JSON.stringify(data));
    }

       console.error(`RAW RESPONSE for ${model}:`, JSON.stringify(data));
    const rawText = data.choices?.[0]?.message?.content
      || data.choices?.[0]?.message?.reasoning
      || "";
    return extractJson(rawText);
  }

  let text;
  let lastErr;

  // Try each model up to 2 times before moving to the next one.
  outer:
  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        text = await tryModel(model);
        break outer; // success
      } catch (err) {
        lastErr = err;
        console.error(`Model ${model}, attempt ${attempt} failed:`, err.message);
      }
    }
  }

  if (text === undefined) {
    console.error("All models/attempts failed. Last error:", lastErr);
    return res.status(502).json({
      error: "Model returned invalid JSON after multiple attempts",
      details: "The AI's response could not be parsed. Please try again.",
    });
  }

  return res.status(200).json({ content: [{ type: "text", text }] });
}
