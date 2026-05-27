// Детальная страница лота — клиент видит ПОЛНУЮ информацию внутри сервиса,
// не уходя на сторонний сайт.
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LotRow = {
  lot_id: string;
  platform: string;
  title: string;
  category: string;
  region: string | null;
  price: number;
  deadline: string | null;
  url: string | null;
  customer_org: string | null;
  requirements: string[] | { items?: string[] } | null;
  status: string;
  created_at: string;
};

const PLATFORM_NAMES: Record<string, string> = {
  GOZ: "Goszakup", SAM: "Самрук-Казына", ETK: "ЕТК", ETP: "ЭТП", BTK: "БТК", KAP: "Казатомпром",
};

function priceFmt(v: number | null): string {
  if (!v) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".0", "") + " млн ₸";
  return v.toLocaleString("ru-RU") + " ₸";
}

export default async function LotDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lot } = await supabase
    .from("lots")
    .select("*")
    .eq("lot_id", id)
    .maybeSingle();

  if (!lot) notFound();
  const l = lot as LotRow;

  const reqs: string[] = Array.isArray(l.requirements)
    ? l.requirements
    : (l.requirements && typeof l.requirements === "object" && "items" in l.requirements && Array.isArray(l.requirements.items))
      ? l.requirements.items
      : [];

  return (
    <main className="min-h-screen text-slate-100"
      style={{ background: "radial-gradient(1200px 600px at 80% -10%, #16203a 0%, #0b0f1a 55%)" }}>
      <header className="flex items-center justify-between px-7 py-4 border-b border-slate-800 sticky top-0 backdrop-blur bg-[rgba(11,15,26,0.85)] z-10">
        <Link href="/app" className="text-sm text-slate-400 hover:text-slate-200">← Кабинет</Link>
        <span className="text-xs text-slate-500">{l.lot_id}</span>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge tone="accent">{l.category || "—"}</Badge>
          <Badge>{PLATFORM_NAMES[l.platform] || l.platform}</Badge>
          {l.region && <Badge>📍 {l.region}</Badge>}
          <Badge tone={l.status === "new" ? "blue" : "muted"}>
            {l.status === "new" ? "Новый" : l.status}
          </Badge>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold leading-snug mb-6">
          {l.title || "Без названия"}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <Stat label="Сумма лота" value={priceFmt(l.price)} accent />
          <Stat label="Дедлайн подачи"
            value={l.deadline ? new Date(l.deadline).toLocaleString("ru-RU", {
              day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
            }) : "—"} />
          <Stat label="Опубликовано"
            value={new Date(l.created_at).toLocaleDateString("ru-RU")} />
        </div>

        {l.customer_org && (
          <Section title="Заказчик">
            <p className="text-slate-300">{l.customer_org}</p>
          </Section>
        )}

        {reqs.length > 0 ? (
          <Section title="Требования">
            <ul className="space-y-2 text-slate-300">
              {reqs.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-blue-400 mt-0.5">✓</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Section title="Требования">
            <p className="text-slate-500 text-sm">
              Полный список требований доступен в оригинальном объявлении на площадке.
              Скоро мы будем извлекать их автоматически — следите за обновлениями.
            </p>
          </Section>
        )}

        <Section title="Действия">
          <div className="flex flex-col sm:flex-row gap-3">
            <a href={l.url || "#"} target="_blank" rel="noreferrer"
              className="flex-1 px-4 py-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-center font-semibold">
              🔗 Открыть оригинал на {PLATFORM_NAMES[l.platform] || l.platform}
            </a>
            <Link href="/app"
              className="flex-1 px-4 py-3 rounded-lg border border-slate-700 hover:border-slate-500 text-center font-medium">
              ← К списку лотов
            </Link>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            ⚠️ Подача заявки происходит на самой площадке. Сервис не подаёт заявки автоматически.
          </p>
        </Section>
      </section>
    </main>
  );
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "accent" | "blue" | "muted" }) {
  const cls =
    tone === "accent" ? "text-blue-400 border-blue-500/40" :
    tone === "blue"   ? "text-blue-300 bg-blue-500/10 border-blue-500/30" :
    tone === "muted"  ? "text-slate-500 border-slate-800" :
                        "text-slate-400 border-slate-700";
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border ${cls}`} style={{ background: "#131a2b" }}>
      {children}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-800 p-4" style={{ background: "#131a2b" }}>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`font-bold ${accent ? "text-2xl text-green-400" : "text-base text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 p-5 mb-4" style={{ background: "#131a2b" }}>
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </section>
  );
}
