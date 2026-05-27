"use client";
// Клиентская часть кабинета: вкладки, CRUD фильтров, отображение лотов.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Filter = {
  id: number;
  name: string;
  categories: string[];
  regions: string[];
  platforms: string[];
  keywords: string;
  min_price: number;
  max_price: number;
  enabled: boolean;
};

type Lot = {
  lot_id: string;
  platform: string;
  title: string;
  category: string;
  region: string;
  price: number;
  deadline: string | null;
  url: string;
};

type Plan = {
  code: string;
  name: string;
  price_kzt: number;
  max_filters: number;
  channels_allowed: string[];
  api_access: boolean;
  description: string;
};

type Subscription = {
  status: string;
  expires_at: string | null;
  plan: Plan;
};

const PLATFORM_NAMES: Record<string, string> = {
  GOZ: "Goszakup", SAM: "Самрук", ETK: "ЕТК", ETP: "ЭТП", BTK: "БТК", KAP: "Казатомпром",
};

function priceFmt(v: number | null) {
  if (!v) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".0", "") + " млн ₸";
  return v.toLocaleString("ru-RU") + " ₸";
}

export default function AppClient({
  userEmail,
  initialFilters,
  activeSubscription,
  plans,
}: {
  userEmail: string;
  profile: { company?: string; bin?: string } | null;
  initialFilters: Filter[];
  activeSubscription: Subscription | null;
  plans: Plan[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<"lots" | "filters" | "channels" | "billing">("lots");
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [lots, setLots] = useState<Lot[]>([]);
  const [editing, setEditing] = useState<Filter | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Onboarding-wizard: показываем, если у пользователя ещё нет ни одного фильтра
  const [showOnboarding, setShowOnboarding] = useState(initialFilters.length === 0);

  const loadLots = useCallback(async () => {
    const enabled = filters.filter(f => f.enabled);
    if (!enabled.length) { setLots([]); return; }
    // Собираем запрос: OR по фильтрам через комбинацию AND/OR
    // Простой подход: для каждого фильтра делаем отдельный select, потом мерджим уникальные.
    const seen = new Set<string>();
    const merged: Lot[] = [];
    for (const f of enabled) {
      let q = supabase.from("lots").select("*").limit(100);
      if (f.platforms?.length)  q = q.in("platform", f.platforms);
      if (f.categories?.length) q = q.in("category", f.categories);
      if (f.regions?.length)    q = q.in("region",   f.regions);
      if (f.min_price > 0)      q = q.gte("price",   f.min_price);
      if (f.max_price < 1e9)    q = q.lte("price",   f.max_price);
      if (f.keywords?.trim()) {
        const kws = f.keywords.split(",").map(s => s.trim()).filter(Boolean);
        if (kws.length) {
          const orStr = kws.map(k => `title.ilike.%${k}%`).join(",");
          q = q.or(orStr);
        }
      }
      const { data } = await q.order("created_at", { ascending: false });
      (data || []).forEach((l: Lot) => {
        if (!seen.has(l.lot_id)) { seen.add(l.lot_id); merged.push(l); }
      });
    }
    setLots(merged);
  }, [filters, supabase]);

  useEffect(() => { loadLots(); }, [loadLots]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function saveFilter(data: Partial<Filter>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing?.id) {
      const { data: updated } = await supabase.from("filters").update(data).eq("id", editing.id).select().single();
      if (updated) setFilters(fs => fs.map(f => f.id === updated.id ? updated as Filter : f));
    } else {
      // Проверка лимита фильтров
      const limit = activeSubscription?.plan.max_filters || 0;
      if (limit && filters.length >= limit) {
        alert(`Достигнут лимит фильтров вашего тарифа (${limit}). Обновите тариф.`);
        return;
      }
      const { data: created } = await supabase.from("filters").insert({ ...data, user_id: user.id }).select().single();
      if (created) setFilters(fs => [...fs, created as Filter]);
    }
    setShowModal(false); setEditing(null);
  }

  async function toggleFilter(f: Filter) {
    const { data } = await supabase.from("filters").update({ enabled: !f.enabled }).eq("id", f.id).select().single();
    if (data) setFilters(fs => fs.map(x => x.id === f.id ? data as Filter : x));
  }

  async function deleteFilter(f: Filter) {
    if (!confirm("Удалить фильтр?")) return;
    await supabase.from("filters").delete().eq("id", f.id);
    setFilters(fs => fs.filter(x => x.id !== f.id));
  }

  return (
    <main className="min-h-screen text-slate-100"
      style={{ background: "radial-gradient(1200px 600px at 80% -10%, #16203a 0%, #0b0f1a 55%)" }}>
      <header className="flex items-center justify-between px-7 py-4 border-b border-slate-800 sticky top-0 backdrop-blur bg-[rgba(11,15,26,0.85)] z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center text-lg"
            style={{ background: "linear-gradient(135deg,#4f8cff,#7c5cff)" }}>🤖</div>
          <div>
            <b>TenderBot</b>
            <div className="text-xs text-slate-400">кабинет</div>
          </div>
        </div>
        <div className="flex gap-2.5 items-center">
          <span className="text-sm text-slate-400">{userEmail}</span>
          <button onClick={logout} className="px-3 py-1.5 rounded-lg border border-slate-700 text-sm">Выйти</button>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 py-7">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Лотов под фильтры" value={lots.length} />
          <Stat label="Фильтров активно" value={filters.filter(f => f.enabled).length} />
          <Stat label="Тариф" value={activeSubscription?.plan.name || "—"} small />
          <Stat label="Подписка до" value={activeSubscription?.expires_at
            ? new Date(activeSubscription.expires_at).toLocaleDateString("ru-RU") : "—"} small />
        </div>

        <div className="flex gap-2 mb-5 border-b border-slate-800">
          {[
            { id: "lots", label: "📋 Мои лоты" },
            { id: "filters", label: "🎯 Фильтры" },
            { id: "channels", label: "📨 Уведомления" },
            { id: "billing", label: "💳 Тариф" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as never)}
              className={`px-4 py-2.5 text-sm border-b-2 ${tab === t.id ? "border-blue-500 text-slate-100" : "border-transparent text-slate-400"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "lots" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lots.length === 0 && (
              <div className="col-span-full text-center text-slate-500 py-16">
                Нет лотов под ваши фильтры. {filters.length === 0 ? "Создайте фильтр во вкладке «Фильтры»." : "Дождитесь следующего скана или измените фильтры."}
              </div>
            )}
            {lots.map(l => (
              <Link key={l.lot_id} href={`/app/lots/${l.lot_id}`}
                className="rounded-2xl border border-slate-800 p-4 flex flex-col gap-2.5 hover:border-slate-600 transition-colors group"
                style={{ background: "#131a2b" }}>
                <div className="flex justify-between gap-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-full border border-blue-500/40 text-blue-400">{l.category || "—"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-slate-400">{PLATFORM_NAMES[l.platform] || l.platform}</span>
                </div>
                <h4 className="text-sm font-semibold leading-snug group-hover:text-blue-300 transition-colors">
                  {l.title || "Без названия"}
                </h4>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>📍 {l.region || "—"}</span>
                  <span>⏱ {l.deadline ? new Date(l.deadline).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—"}</span>
                </div>
                <div className="text-xl font-bold text-green-400 mt-auto">{priceFmt(l.price)}</div>
                <div className="text-xs text-slate-500 group-hover:text-blue-400 transition-colors">
                  Подробнее →
                </div>
              </Link>
            ))}
          </div>
        )}

        {tab === "filters" && (
          <div>
            <div className="flex gap-3 items-center mb-4">
              <button onClick={() => { setEditing(null); setShowModal(true); }}
                className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 font-semibold">+ Создать фильтр</button>
              <span className="text-xs text-slate-400">
                Использовано {filters.length} из {activeSubscription?.plan.max_filters || "∞"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filters.length === 0 && (
                <div className="col-span-full text-center text-slate-500 py-12">
                  Создайте первый фильтр — и лоты начнут появляться у вас в кабинете и в уведомлениях.
                </div>
              )}
              {filters.map(f => (
                <div key={f.id} className="rounded-2xl border border-slate-800 p-4 flex flex-col gap-2"
                  style={{ background: "#131a2b" }}>
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold">{f.name}</h4>
                    <span className={`text-xs ${f.enabled ? "text-green-400" : "text-slate-500"}`}>
                      {f.enabled ? "вкл" : "выкл"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(f.platforms || []).map(p => <Tag key={p}>{PLATFORM_NAMES[p] || p}</Tag>)}
                    {(f.categories || []).map(c => <Tag key={c}>{c}</Tag>)}
                    {(f.regions || []).map(r => <Tag key={r}>📍 {r}</Tag>)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {f.keywords ? `🔍 ${f.keywords}` : ""}
                    {f.min_price > 0 || f.max_price < 1e9
                      ? ` · 💰 ${priceFmt(f.min_price)} – ${priceFmt(f.max_price)}` : ""}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => { setEditing(f); setShowModal(true); }}
                      className="text-xs px-2.5 py-1 rounded border border-slate-700">Изменить</button>
                    <button onClick={() => toggleFilter(f)}
                      className="text-xs px-2.5 py-1 rounded border border-slate-700">
                      {f.enabled ? "Выкл" : "Вкл"}
                    </button>
                    <button onClick={() => deleteFilter(f)}
                      className="text-xs px-2.5 py-1 rounded border border-red-900/50 text-red-400">Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "channels" && <ChannelsTab />}

        {tab === "billing" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(p => (
              <div key={p.code}
                className={`rounded-2xl border p-6 flex flex-col gap-3 ${activeSubscription?.plan.code === p.code ? "border-blue-500" : "border-slate-800"}`}
                style={{ background: "#131a2b" }}>
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="text-2xl font-extrabold">{p.price_kzt.toLocaleString("ru-RU")} <span className="text-sm text-slate-400 font-medium">₸/мес</span></div>
                <p className="text-xs text-slate-500">{p.description}</p>
                {activeSubscription?.plan.code === p.code ? (
                  <div className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-center text-sm">Ваш текущий тариф</div>
                ) : (
                  <button className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 font-semibold text-sm"
                    onClick={() => alert("Скоро здесь будет оплата через Kaspi Pay. Пока — пишите info@turanix.kz для счёта.")}>
                    Оформить
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <FilterModal
          initial={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSave={saveFilter}
        />
      )}

      {showOnboarding && (
        <OnboardingWizard
          onSkip={() => setShowOnboarding(false)}
          onComplete={async (data) => {
            await saveFilter(data);
            setShowOnboarding(false);
          }}
        />
      )}
    </main>
  );
}

function OnboardingWizard({
  onSkip,
  onComplete,
}: {
  onSkip: () => void;
  onComplete: (data: Partial<Filter>) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<"small" | "mid" | "big" | "any">("any");

  const CATEGORIES = [
    { id: "строительство", label: "🏗 Строительство", emoji: "" },
    { id: "ремонт", label: "🔧 Ремонт", emoji: "" },
    { id: "поставка", label: "📦 Поставка товаров", emoji: "" },
    { id: "ит", label: "💻 IT и ПО", emoji: "" },
    { id: "услуги", label: "🛠 Услуги", emoji: "" },
    { id: "проектирование", label: "📐 Проектирование", emoji: "" },
  ];

  const REGIONS = [
    "Алматы", "Астана", "Шымкент", "Караганда",
    "Актобе", "Атырау", "ВКО", "По всему Казахстану",
  ];

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  }

  function complete() {
    let min = 0, max = 1_000_000_000;
    if (priceRange === "small") { max = 10_000_000; }
    else if (priceRange === "mid") { min = 10_000_000; max = 100_000_000; }
    else if (priceRange === "big") { min = 100_000_000; }
    const allKz = regions.includes("По всему Казахстану");
    onComplete({
      name: "Мой первый фильтр",
      categories,
      regions: allKz ? [] : regions,
      platforms: [],
      keywords: "",
      min_price: min,
      max_price: max,
      enabled: true,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 p-8 text-slate-100"
        style={{ background: "#131a2b" }}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${
                i < step ? "w-8 bg-blue-500" : i === step ? "w-12 bg-blue-500" : "w-8 bg-slate-700"
              }`} />
            ))}
          </div>
          <button onClick={onSkip} className="text-xs text-slate-500 hover:text-slate-300">
            Пропустить →
          </button>
        </div>

        {step === 1 && (
          <>
            <h2 className="text-2xl font-bold mb-2">Что вас интересует?</h2>
            <p className="text-sm text-slate-400 mb-6">Можно выбрать несколько. Изменить — в любой момент.</p>
            <div className="grid grid-cols-2 gap-3 mb-7">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategories(toggle(categories, c.id))}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    categories.includes(c.id)
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-800 hover:border-slate-600"
                  }`}>
                  <div className="font-medium">{c.label}</div>
                </button>
              ))}
            </div>
            <button
              disabled={categories.length === 0}
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed font-semibold">
              Дальше →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-2xl font-bold mb-2">В каких регионах работаете?</h2>
            <p className="text-sm text-slate-400 mb-6">Будем показывать тендера только там, где они вам нужны.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-7">
              {REGIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setRegions(
                    r === "По всему Казахстану"
                      ? (regions.includes(r) ? [] : [r])
                      : toggle(regions.filter(x => x !== "По всему Казахстану"), r)
                  )}
                  className={`p-3 rounded-xl border text-sm transition-all ${
                    regions.includes(r)
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-800 hover:border-slate-600"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-4 py-3 rounded-lg border border-slate-700">←</button>
              <button
                disabled={regions.length === 0}
                onClick={() => setStep(3)}
                className="flex-1 py-3 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-30 font-semibold">
                Дальше →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-2xl font-bold mb-2">Размер интересующих лотов?</h2>
            <p className="text-sm text-slate-400 mb-6">Чтобы не показывать слишком мелкие или слишком крупные.</p>
            <div className="space-y-2 mb-7">
              {[
                { id: "small", label: "До 10 млн ₸", desc: "Маленькие лоты для ИП и микро" },
                { id: "mid",   label: "10–100 млн ₸", desc: "Типичный объём МСБ" },
                { id: "big",   label: "От 100 млн ₸", desc: "Крупные проекты" },
                { id: "any",   label: "Любые", desc: "Покажем все, отфильтруетесь сами" },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setPriceRange(opt.id as never)}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    priceRange === opt.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-800 hover:border-slate-600"
                  }`}>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-4 py-3 rounded-lg border border-slate-700">←</button>
              <button
                onClick={complete}
                className="flex-1 py-3 rounded-lg bg-blue-500 hover:bg-blue-400 font-semibold">
                ✨ Готово — показать лоты
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChannelsTab() {
  const [notified, setNotified] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-800 p-8" style={{ background: "#131a2b" }}>
      <div className="max-w-xl">
        <h3 className="text-xl font-semibold mb-2">Уведомления о новых лотах</h3>
        <p className="text-sm text-slate-400 mb-6">
          Скоро вы сможете получать свежие лоты под ваши фильтры в Telegram, на email
          и в WhatsApp (Enterprise). Сейчас лоты доступны во вкладке «Мои лоты» —
          обновляются автоматически.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[
            { icon: "📱", name: "Telegram", desc: "Мгновенные уведомления", soon: true },
            { icon: "✉️", name: "Email", desc: "Ежедневная подборка", soon: true },
            { icon: "💬", name: "WhatsApp", desc: "Enterprise", soon: true },
          ].map((c) => (
            <div key={c.name} className="rounded-xl border border-slate-700 p-4 opacity-70">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xl">{c.icon}</span>
                <b>{c.name}</b>
              </div>
              <div className="text-xs text-slate-500">{c.desc}</div>
              <div className="text-[10px] text-slate-600 mt-2 uppercase tracking-wide">Скоро</div>
            </div>
          ))}
        </div>

        {!notified ? (
          <button
            onClick={() => setNotified(true)}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 font-medium text-sm">
            Сообщить, когда заработает
          </button>
        ) : (
          <div className="text-sm text-green-400">
            ✅ Спасибо! Сообщим на email, как только канал заработает.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-800 px-4 py-3.5" style={{ background: "#131a2b" }}>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={small ? "text-lg font-bold" : "text-2xl font-bold"}>{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] bg-[#1a2336] border border-slate-700 px-2 py-0.5 rounded text-slate-400">{children}</span>;
}

function FilterModal({
  initial,
  onClose,
  onSave,
}: {
  initial: Filter | null;
  onClose: () => void;
  onSave: (data: Partial<Filter>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [categories, setCategories] = useState((initial?.categories || []).join(", "));
  const [regions, setRegions] = useState((initial?.regions || []).join(", "));
  const [platforms, setPlatforms] = useState((initial?.platforms || []).join(", "));
  const [keywords, setKeywords] = useState(initial?.keywords || "");
  const [minPrice, setMinPrice] = useState(String(initial?.min_price || ""));
  const [maxPrice, setMaxPrice] = useState(String(initial?.max_price || ""));

  const parseList = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 p-7 text-slate-100"
        style={{ background: "#131a2b" }}>
        <h3 className="text-xl font-bold mb-4">{initial ? "Изменить фильтр" : "Новый фильтр"}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Название" full>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Стройка Алматы" />
          </Field>
          <Field label="Категории (через запятую)" full>
            <input value={categories} onChange={e => setCategories(e.target.value)} className={inputCls} placeholder="строительство, ремонт" />
          </Field>
          <Field label="Регионы (через запятую)" full>
            <input value={regions} onChange={e => setRegions(e.target.value)} className={inputCls} placeholder="Алматы, Астана" />
          </Field>
          <Field label="Площадки" full>
            <input value={platforms} onChange={e => setPlatforms(e.target.value)} className={inputCls} placeholder="GOZ, SAM, ETK, ETP, BTK, KAP" />
          </Field>
          <Field label="Ключевые слова" full>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} className={inputCls} placeholder="котельная, серверы" />
          </Field>
          <Field label="Цена от, ₸">
            <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Цена до, ₸">
            <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-700">Отмена</button>
          <button onClick={() => onSave({
            name: name || "Без названия",
            categories: parseList(categories),
            regions: parseList(regions),
            platforms: parseList(platforms),
            keywords,
            min_price: Number(minPrice) || 0,
            max_price: Number(maxPrice) || 1_000_000_000,
          })}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 font-semibold">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="block text-xs text-slate-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full bg-[#1a2336] border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500";
