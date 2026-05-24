// Лендинг turanix.kz/tenderbot — публичная страница с тарифами.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Plan = {
  code: string;
  name: string;
  price_kzt: number;
  trial_days: number;
  max_filters: number;
  channels_allowed: string[];
  api_access: boolean;
  description: string;
};

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/app");

  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .order("sort_order");

  return (
    <main className="min-h-screen text-slate-100"
      style={{ background: "radial-gradient(1200px 600px at 80% -10%, #16203a 0%, #0b0f1a 55%)" }}>
      <header className="flex items-center justify-between px-7 py-4 border-b border-slate-800 sticky top-0 backdrop-blur bg-[rgba(11,15,26,0.85)] z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center text-lg"
            style={{ background: "linear-gradient(135deg,#4f8cff,#7c5cff)" }}>🤖</div>
          <div>
            <b className="text-base tracking-wide">TenderBot</b>
            <div className="text-xs text-slate-400">by Turanix · мониторинг тендеров РК</div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Link href="/login" className="px-3 py-1.5 rounded-lg border border-slate-700 text-sm">Войти</Link>
          <Link href="/login?mode=signup" className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-sm font-semibold">Подписаться</Link>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] mb-5">
          Мониторинг тендеров Казахстана<br />на автопилоте.
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mb-8 leading-relaxed">
          Один интерфейс для всех площадок: Goszakup, Самрук-Казына, ЕТК, ЭТП, БТК, Казатомпром.
          Свежие лоты под ваши фильтры — в Telegram, на email или в кабинете. Без рутины, без пропущенных сроков.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link href="/login?mode=signup" className="px-5 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 font-semibold">
            Попробовать бесплатно 7 дней
          </Link>
          <Link href="#plans" className="px-5 py-2.5 rounded-lg border border-slate-700 hover:border-slate-500">
            Тарифы →
          </Link>
        </div>
        <div className="flex flex-wrap gap-4 mt-8 text-sm text-slate-400">
          <span>✓ 6+ площадок</span>
          <span>✓ Уведомления &lt;30 сек</span>
          <span>✓ Без ЭЦП для просмотра</span>
          <span>✓ Доступ по подписке</span>
        </div>
      </section>

      <section id="plans" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold mb-7">Тарифы</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(plans as Plan[] | null)?.map((p) => (
            <div key={p.code}
              className={`rounded-2xl border p-6 flex flex-col gap-3 ${p.code === "pro" ? "border-blue-500 relative" : "border-slate-800"}`}
              style={{ background: "#131a2b" }}>
              {p.code === "pro" && (
                <span className="absolute -top-3 left-6 text-xs font-bold bg-blue-500 text-white px-2.5 py-1 rounded">
                  Популярный
                </span>
              )}
              <h3 className="text-2xl font-bold">{p.name}</h3>
              <div className="text-3xl font-extrabold">
                {p.price_kzt.toLocaleString("ru-RU")}{" "}
                <span className="text-sm text-slate-400 font-medium">₸/мес</span>
              </div>
              <ul className="text-sm text-slate-400 space-y-1.5">
                <li>✓ {p.max_filters === 0 ? "Безлимит фильтров" : `${p.max_filters} фильтр`}</li>
                {(p.channels_allowed || []).map((c) => (
                  <li key={c}>
                    ✓ {({telegram:"Telegram",email:"Email",whatsapp:"WhatsApp",sms:"SMS",dashboard:"Кабинет на сайте"} as Record<string,string>)[c] || c}
                  </li>
                ))}
                {p.api_access && <li>✓ REST API</li>}
                <li>✓ Триал {p.trial_days} дней</li>
              </ul>
              <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
              <Link href="/login?mode=signup"
                className="mt-auto px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-center font-semibold text-white">
                Начать бесплатно
              </Link>
            </div>
          )) || <div className="text-slate-500">Тарифы загружаются (применена ли SQL-миграция в Supabase?)…</div>}
        </div>
      </section>

      <footer className="text-center text-slate-500 text-xs py-8 border-t border-slate-800">
        TenderBot © Turanix · мониторинг тендеров Казахстана · info@turanix.kz
      </footer>
    </main>
  );
}
