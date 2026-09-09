// api/telegram-webhook.js
// Telegram bot webhook handler for CEFR Boost
// Env vars needed on Vercel:
//   TELEGRAM_BOT_TOKEN      - from @BotFather
//   SUPABASE_URL            - your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (server-side only, NOT anon key)
//   SITE_URL                - e.g. https://cefr-boost-xi.vercel.app

import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SITE_URL = process.env.SITE_URL || 'https://cefr-boost-xi.vercel.app';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendMessage(chatId, text, replyMarkup) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  });
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🌐 Saytga o\'tish', url: SITE_URL }],
      [{ text: '📊 Natijalarim', url: `${SITE_URL}?open=results` }],
      [{ text: '🔗 Hisobni bog\'lash', callback_data: 'link_help' }],
    ],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('CEFR Boost bot webhook is alive');
  }

  const update = req.body;

  try {
    // Handle button presses
    if (update.callback_query) {
      const chatId = update.callback_query.message.chat.id;
      const data = update.callback_query.data;

      if (data === 'link_help') {
        await sendMessage(
          chatId,
          `Hisobingizni bog'lash uchun:\n1. Saytga kiring\n2. Profil bo'limini oching\n3. "Telegram orqali xabar olish" tugmasini bosing\n4. U yerda chiqqan link orqali botga qayting`
        );
      }
      return res.status(200).json({ ok: true });
    }

    const message = update.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text || '';

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const code = parts[1]; // deep-link payload, e.g. /start ab12cd

      if (code) {
        // Look up the link code in Supabase
        const { data: linkRow, error } = await supabase
          .from('telegram_link_codes')
          .select('user_id, used')
          .eq('code', code)
          .single();

        if (error || !linkRow) {
          await sendMessage(chatId, `❌ Kod topilmadi yoki eskirgan. Saytdan qaytadan urinib ko'ring.`);
        } else if (linkRow.used) {
          await sendMessage(chatId, `Bu kod allaqachon ishlatilgan.`);
        } else {
          // Save the link
          await supabase.from('telegram_links').upsert({
            user_id: linkRow.user_id,
            chat_id: chatId,
          });
          await supabase
            .from('telegram_link_codes')
            .update({ used: true })
            .eq('code', code);

          await sendMessage(
            chatId,
            `✅ Hisobingiz muvaffaqiyatli bog'landi! Endi natijalaringiz tayyor bo'lganda shu yerga xabar beraman.`,
            mainMenu()
          );
        }
      } else {
        await sendMessage(
          chatId,
          `👋 Assalomu alaykum! CEFR Boost botiga xush kelibsiz.\n\nBu bot orqali sayt bilan bog'lanishingiz, natijalaringizni ko'rishingiz va yangi natijalar haqida xabar olishingiz mumkin.`,
          mainMenu()
        );
      }
      return res.status(200).json({ ok: true });
    }

    // Any other text -> just show the menu again
    await sendMessage(chatId, `Quyidagi menyudan foydalaning 👇`, mainMenu());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(200).json({ ok: true }); // always 200 so Telegram doesn't retry-storm
  }
}
