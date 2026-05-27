// Telegram Webhook — Telegram POSTит сюда апдейты.
// На MVP только привязка через /start <link_code>.
//
// Подключение:
//   curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://tenderbot.turanix.kz/api/telegram/webhook&secret_token=$WEBHOOK_SECRET"

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type TgUpdate = {
  message?: { text?: string; chat?: { id: number; type: string } };
};

export async function POST(req: Request) {
  // защита secret-токеном (Telegram шлёт его в X-Telegram-Bot-Api-Secret-Token).
  // Deny by default — если переменная не задана, webhook не активен (предотвращает спам/инъекции).
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "webhook_secret_missing" }, { status: 503 });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => ({}))) as TgUpdate;
  const text = update.message?.text || "";
  const chatId = update.message?.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true });

  const match = text.match(/^\/start\s+([A-Z0-9_-]{6,32})/i);
  if (match) {
    const code = match[1];
    const admin = createAdminClient();
    const { data: ch } = await admin
      .from("notification_channels")
      .select("id, user_id")
      .eq("link_code", code)
      .eq("channel", "telegram")
      .maybeSingle();
    if (ch) {
      await admin.from("notification_channels")
        .update({ target: String(chatId), verified: true, link_code: null })
        .eq("id", ch.id);
      await sendTelegram(chatId, "✅ Аккаунт привязан. Будете получать сюда лоты под ваши фильтры.");
    } else {
      await sendTelegram(chatId, "Не нашёл такой код привязки. Сгенерируйте новый в кабинете.");
    }
  } else if (text === "/start") {
    await sendTelegram(chatId,
      "Привет! Я TenderBot — присылаю свежие тендера РК под ваши фильтры.\n\n" +
      "Чтобы получать уведомления, зайдите в кабинет на tenderbot.turanix.kz → " +
      "вкладка «Уведомления» → «Привязать Telegram» → отправьте мне выданный код."
    );
  }

  return NextResponse.json({ ok: true });
}

async function sendTelegram(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
