// api/notify-result.js
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SITE_URL = process.env.SITE_URL || 'https://cefr-boost-xi.vercel.app';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, mockName, certificateScore, cefrLevel } = req.body;
    if (!userId) return res.status(200).json({ skipped: true });

    const { data: link } = await supabase
      .from('telegram_links')
      .select('chat_id')
      .eq('user_id', userId)
      .single();

    if (!link || !link.chat_id) {
      return res.status(200).json({ skipped: true });
    }

    const text =
      `✅ <b>${mockName || 'Test'}</b> natijangiz tayyor!\n\n` +
      `📈 Ball: <b>${certificateScore ?? '-'}</b>\n` +
      `🎯 CEFR daraja: <b>${cefrLevel ?? '-'}</b>\n\n` +
      `Batafsil ko'rish uchun saytga o'ting 👇`;

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: link.chat_id,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '📊 Natijalarni ko\'rish', url: `${SITE_URL}?open=results` }]],
        },
      }),
    });

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('notify-result error:', err);
    return res.status(200).json({ error: 'failed' });
  }
}
