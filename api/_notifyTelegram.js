// api/_notifyTelegram.js
// Import and call this from api/score.js right after you save a result to Supabase.
//
// Usage inside score.js:
//   import { notifyResultReady } from './_notifyTelegram.js';
//   ...
//   await notifyResultReady(supabase, userId, { mockName, certificateScore, cefrLevel });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SITE_URL = process.env.SITE_URL || 'https://cefr-boost-xi.vercel.app';

export async function notifyResultReady(supabase, userId, result) {
  try {
    const { data: link } = await supabase
      .from('telegram_links')
      .select('chat_id')
      .eq('user_id', userId)
      .single();

    if (!link || !link.chat_id) return; // user hasn't linked Telegram, skip silently

    const text =
      `✅ <b>${result.mockName}</b> natijangiz tayyor!\n\n` +
      `📈 Ball: <b>${result.certificateScore}</b>\n` +
      `🎯 CEFR daraja: <b>${result.cefrLevel}</b>\n\n` +
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
  } catch (err) {
    console.error('notifyResultReady error:', err);
    // never throw - notification failure must not break the scoring flow
  }
}
