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

  // "openrouter/free" auto-routes to whichever free-tier model is
  // currently available, so this keeps working even as OpenRouter
  // rotates which specific model is free.
  const model = "openrouter/free";
  const url = "https://openrouter.ai/api/v1/chat/completions";

  try {
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
      console.error("OpenRouter API error:", data);
      return res.status(orResponse.status).json({ error: "Scoring service error", details: data });
    }

        let text = data.choices?.[0]?.message?.content || "";

    // Some free models prepend reasoning text or wrap the JSON in
    // markdown code fences instead of returning pure JSON, even with
    // response_format: json_object. Extract just the {...} object.
    text = text.trim();

    // Strip ```json ... ``` or ``` ... ``` fences if present.
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }

    // If there's still text before/after the JSON object, cut down to
    // the first "{" through the last "}".
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }

    // Validate it's actually parseable JSON before sending it on —
    // if not, ask the model to retry once with a stricter instruction.
    try {
      JSON.parse(text);
    } catch (parseErr) {
      console.error("Model returned non-JSON, raw text was:", data.choices?.[0]?.message?.content);
      return res.status(502).json({
        error: "Model returned invalid JSON",
        details: "The AI's response could not be parsed. Please try again.",
      });
    }

    // Reshape into the same {content:[{type:"text", text}]} shape the
    // frontend already expects, so index.html needs no changes.
    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Scoring request failed" });
  }
}
