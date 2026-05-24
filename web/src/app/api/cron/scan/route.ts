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
  // ── auth ──
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary: Record<string, number> = {};

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

  return NextResponse.json({ ok: true, at: new Date().toISOString(), summary });
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
