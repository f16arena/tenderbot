// Vercel Cron Job → POST /api/cron/scan
// Дёргается по расписанию из vercel.json. Делает скан площадок,
// вставляет новые лоты в БД, для подходящих рассылает уведомления.
//
// На MVP — заглушка с одним демо-лотом. Реальные парсеры подключим в Фазе 2:
//   - Goszakup GraphQL (когда токен от ЦЭФ)
//   - Browserless.io для парсинга закрытых площадок
//
// Защита: Vercel передаёт заголовок Authorization: Bearer <CRON_SECRET>.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60; // секунд

export async function GET(req: Request) {
  // ── auth: deny by default ──
  // Vercel Cron шлёт заголовок Authorization: Bearer <CRON_SECRET>.
  // Если переменная не задана — endpoint считается небезопасным и не пускает никого.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET not configured — /api/cron/scan locked");
    return NextResponse.json({ error: "cron_secret_missing" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary: Record<string, number> = {};

  // ── housekeeping: помечаем истекшие подписки expired ──
  try {
    const { data: expired } = await admin
      .from("subscriptions")
      .update({ status: "expired" })
      .in("status", ["trial", "active"])
      .lt("expires_at", new Date().toISOString())
      .select("id");
    summary.subscriptions_expired = expired?.length || 0;
  } catch (e) {
    console.error("subscriptions housekeeping failed", e);
  }

  // ── Goszakup GraphQL ──
  if (process.env.GOSZAKUP_TOKEN) {
    try {
      const r = await fetch("https://ows.goszakup.gov.kz/v3/graphql", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GOSZAKUP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query { Announcements(limit: 50) {
            id nameRu totalSum publishDate endDate
          }}`,
        }),
      });
      const j = await r.json();
      const items = j?.data?.Announcements || [];
      const rows = items.map((it: { id: string; nameRu: string; totalSum: number; endDate: string }) => ({
        lot_id: `GZ-${it.id}`,
        platform: "GOZ",
        title: it.nameRu,
        price: Number(it.totalSum) || 0,
        deadline: it.endDate || null,
        url: `https://goszakup.gov.kz/ru/announcement/index/${it.id}`,
        category: detectCategory(it.nameRu),
      }));
      if (rows.length) {
        await admin.from("lots").upsert(rows, { onConflict: "lot_id", ignoreDuplicates: true });
      }
      summary.goszakup = rows.length;
    } catch (e) {
      summary.goszakup_error = 1;
      console.error("goszakup scan failed", e);
    }
  } else {
    summary.goszakup_skipped_no_token = 1;
  }

  // ── Парсеры закрытых площадок — пока заглушка ──
  // TODO Фаза 2: подключить Browserless.io / агент-браузер
  summary.samruk_pending = 1;
  summary.etk_pending = 1;
  summary.etp_pending = 1;
  summary.btk_pending = 1;
  summary.kazatomprom_pending = 1;

  // ── Dispatcher уведомлений ──
  // Для каждого активного клиента с verified Telegram-каналом находим лоты под включённые
  // фильтры за последние 24 часа, исключаем уже отправленные, шлём в чат, пишем дедуп-лог.
  try {
    summary.notifications_sent = await dispatchNotifications(admin);
  } catch (e) {
    console.error("notification dispatch failed", e);
    summary.notifications_error = 1;
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), summary });
}

// ──────────────────────────────────────────────────────────────────────────
// Notification dispatcher
// ──────────────────────────────────────────────────────────────────────────

type Channel = { user_id: string; target: string };
type Filter = {
  user_id: string;
  categories: string[]; regions: string[]; platforms: string[];
  keywords: string; min_price: number; max_price: number;
};
type Lot = {
  lot_id: string; platform: string; title: string;
  category: string; region: string; price: number;
  deadline: string | null; url: string;
};

async function dispatchNotifications(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 0;

  // 1. Активные клиенты с подтверждённым Telegram-каналом
  const { data: channels } = await admin
    .from("notification_channels")
    .select("user_id, target")
    .eq("channel", "telegram")
    .eq("verified", true)
    .eq("enabled", true);
  if (!channels?.length) return 0;

  const userIds = channels.map((c: Channel) => c.user_id);

  // 2. У них должна быть активная подписка
  const { data: activeSubs } = await admin
    .from("subscriptions")
    .select("user_id")
    .in("user_id", userIds)
    .in("status", ["trial", "active"])
    .gt("expires_at", new Date().toISOString());
  const activeUserIds = new Set((activeSubs || []).map((s: { user_id: string }) => s.user_id));
  const targets = channels.filter((c: Channel) => activeUserIds.has(c.user_id));
  if (!targets.length) return 0;

  // 3. Свежие лоты за 24 часа (для всех сразу — потом фильтруем в памяти)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: freshLots } = await admin
    .from("lots")
    .select("*")
    .gt("created_at", since)
    .limit(500);
  if (!freshLots?.length) return 0;

  // 4. Для каждого клиента — его фильтры
  const { data: filters } = await admin
    .from("filters")
    .select("*")
    .in("user_id", Array.from(activeUserIds))
    .eq("enabled", true);

  // 5. Дедуп — уже отправленное в Telegram за последние 7 дней
  const sinceDedup = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: alreadySent } = await admin
    .from("sent_notifications")
    .select("user_id, lot_id")
    .eq("channel", "telegram")
    .gt("sent_at", sinceDedup);
  const sentSet = new Set((alreadySent || []).map((s: { user_id: string; lot_id: string }) => `${s.user_id}:${s.lot_id}`));

  let totalSent = 0;
  for (const ch of targets) {
    const userFilters = (filters || []).filter((f: Filter) => f.user_id === ch.user_id);
    if (!userFilters.length) continue;
    for (const lot of freshLots as Lot[]) {
      const key = `${ch.user_id}:${lot.lot_id}`;
      if (sentSet.has(key)) continue;
      if (!matchesAnyFilter(lot, userFilters)) continue;
      const ok = await sendTelegramLot(token, ch.target, lot);
      if (ok) {
        await admin.from("sent_notifications").insert({
          user_id: ch.user_id, lot_id: lot.lot_id, channel: "telegram",
        });
        sentSet.add(key);
        totalSent++;
        // Ограничим до 10 уведомлений на клиента за один прогон, чтобы не флудить
        if (countSentInThisRun(sentSet, ch.user_id) >= 10) break;
      }
    }
  }
  return totalSent;
}

function matchesAnyFilter(lot: Lot, filters: Filter[]): boolean {
  return filters.some((f) => {
    if (f.min_price > 0 && lot.price < f.min_price) return false;
    if (f.max_price > 0 && f.max_price < 1e12 && lot.price > f.max_price) return false;
    if (f.platforms?.length && !f.platforms.includes(lot.platform)) return false;
    if (f.categories?.length && !f.categories.includes(lot.category)) return false;
    if (f.regions?.length && !f.regions.includes(lot.region)) return false;
    if (f.keywords?.trim()) {
      const kws = f.keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
      if (kws.length && !kws.some(k => (lot.title || "").toLowerCase().includes(k))) return false;
    }
    return true;
  });
}

function countSentInThisRun(set: Set<string>, userId: string): number {
  let n = 0;
  for (const k of set) if (k.startsWith(userId + ":")) n++;
  return n;
}

async function sendTelegramLot(token: string, chatId: string, lot: Lot): Promise<boolean> {
  const priceM = lot.price ? (lot.price / 1_000_000).toFixed(1).replace(".0", "") : "—";
  const platformName: Record<string, string> = {
    GOZ: "Goszakup", SAM: "Самрук", ETK: "ЕТК", ETP: "ЭТП", BTK: "БТК", KAP: "Казатомпром",
  };
  const text =
    `🔔 *Новый лот*\n\n` +
    `📋 ${escapeMd(lot.title || "Без названия").slice(0, 200)}\n` +
    `🏢 ${platformName[lot.platform] || lot.platform} · ${lot.category || "—"}\n` +
    `📍 ${lot.region || "—"}\n` +
    `💰 ${priceM} млн ₸\n` +
    (lot.deadline ? `⏱ до ${new Date(lot.deadline).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}\n` : "") +
    `\n🔗 ${lot.url || ""}`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
    });
    return r.ok;
  } catch (e) {
    console.error("telegram send failed", e);
    return false;
  }
}

function escapeMd(s: string): string {
  // Минимальный escape для Telegram Markdown
  return s.replace(/([*_`\[\]])/g, "\\$1");
}

function detectCategory(title: string): string {
  const t = (title || "").toLowerCase();
  if (/ремонт|техобслуживан/.test(t)) return "ремонт";
  if (/строит|монтаж|возведен/.test(t)) return "строительство";
  if (/поставк|приобретен|закупка товаров/.test(t)) return "поставка";
  if (/\bit\b|программ|разработк|сайт|система/.test(t)) return "ит";
  if (/проектирован|изыскан/.test(t)) return "проектирование";
  return "услуги";
}
