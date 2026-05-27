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
            Найти первые тендера за минуту →
          </Link>
          <Link href="#plans" className="px-5 py-2.5 rounded-lg border border-slate-700 hover:border-slate-500">
            Тарифы
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-3">7 дней бесплатно, без карты при регистрации</p>
        <div className="flex flex-wrap gap-4 mt-8 text-sm text-slate-400">
          <span>✓ 6+ площадок</span>
          <span>✓ Уведомления &lt;30 сек</span>
          <span>✓ Без ЭЦП для просмотра</span>
          <span>✓ Доступ по подписке</span>
        </div>
      </section>

      {/* ─── Как это работает ─── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-8 text-center">Как это работает</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { n: "1", t: "Регистрируетесь", d: "Email и пароль. 30 секунд.", time: "30 сек" },
            { n: "2", t: "Настраиваете фильтр", d: "Какие категории, регионы, ценовой диапазон вам интересны.", time: "1 минута" },
            { n: "3", t: "Получаете лоты", d: "Свежие тендера приходят в Telegram и в кабинет. Без вашего участия.", time: "автоматически" },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-slate-800 p-6"
              style={{ background: "#131a2b" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-full grid place-items-center font-bold text-lg"
                  style={{ background: "linear-gradient(135deg,#4f8cff,#7c5cff)" }}>
                  {s.n}
                </div>
                <span className="text-xs text-slate-500">{s.time}</span>
              </div>
              <h3 className="font-semibold mb-1.5">{s.t}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Тарифы ─── */}
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
              <p className="text-xs text-green-400 leading-relaxed">
                {p.code === "starter" && "💡 Окупается с одного лота от 200 000 ₸"}
                {p.code === "pro" && "💡 Окупается с лота от 600 000 ₸ — типичный лот МСБ"}
                {p.code === "enterprise" && "💡 Окупается с одного крупного лота. Полная аналитика."}
              </p>
              <Link href="/login?mode=signup"
                className="mt-auto px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-center font-semibold text-white">
                Начать бесплатно
              </Link>
            </div>
          )) || <div className="text-slate-500">Тарифы загружаются (применена ли SQL-миграция в Supabase?)…</div>}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold mb-8 text-center">Частые вопросы</h2>
        <div className="space-y-3">
          {[
            { q: "Откуда вы берёте данные?",
              a: "Из официального API Госзакупок (goszakup.gov.kz) и публичных карточек других площадок: Самрук-Казына, ЕТК, ЭТП, БТК, Казатомпром. Все источники — открытые." },
            { q: "Нужна ли мне ЭЦП?",
              a: "Нет. Для просмотра лотов в нашем сервисе — нет. ЭЦП понадобится только когда вы решите подать заявку — это вы делаете самостоятельно на площадке." },
            { q: "Помогаете ли подавать заявки?",
              a: "Нет. Мы — каталог и поисковик. Подача заявки происходит на самой площадке (где у вас уже есть аккаунт)." },
            { q: "Что если хочу отписаться?",
              a: "Можно в любой момент в кабинете → «Тариф» → «Отменить подписку». Возврат за неиспользованный период не делаем, но списания прекращаются." },
            { q: "Где хранятся мои данные?",
              a: "В защищённой PostgreSQL через сервис Supabase (на инфраструктуре AWS). Каждый клиент видит только свои данные — изоляция на уровне БД." },
            { q: "Сколько лотов появляется в день?",
              a: "По всем площадкам Казахстана — 100–500 новых лотов ежедневно. Конкретно ваших, под фильтр — обычно 3–15 в день." },
            { q: "Можно ли вернуть деньги, если не подошло?",
              a: "Первые 7 дней — бесплатный пробный период, ничего не списываем. После оплаты возврата за неиспользованный месяц не делаем." },
            { q: "Где найти юр.реквизиты?",
              a: <>ТОО «Turanix», БИН 260540022744. Полные условия — в <Link href="/offer" className="text-blue-400 hover:underline">оферте</Link>.</> },
          ].map((item, i) => (
            <details key={i} className="rounded-xl border border-slate-800 p-4 group"
              style={{ background: "#131a2b" }}>
              <summary className="cursor-pointer font-medium list-none flex justify-between items-center">
                <span>{item.q}</span>
                <span className="text-slate-500 text-xl group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-sm text-slate-400 mt-3 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="text-center text-slate-500 text-xs py-8 border-t border-slate-800 space-y-2">
        <div>TenderBot © Turanix · мониторинг тендеров Казахстана</div>
        <div>ТОО «Turanix» · БИН 260540022744 · <a href="mailto:info@turanix.kz" className="hover:text-slate-300">info@turanix.kz</a></div>
        <div className="space-x-3">
          <Link href="/offer" className="hover:text-slate-300">Оферта</Link>
          <Link href="/privacy" className="hover:text-slate-300">Политика конфиденциальности</Link>
        </div>
      </footer>
    </main>
  );
}
