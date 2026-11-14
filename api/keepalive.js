export default async function handler(req, res) {
  try {
    const r = await fetch(
      "https://sgvfmqxwhypjoxcaxanh.supabase.co/rest/v1/mocks?select=id&limit=1",
      { headers: { apikey: "sb_publishable_RJM4SqD7iTiUX4wJLLMOTA_g5peTZAx" } }
    );
    res.status(200).json({ ok: true, status: r.status });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
