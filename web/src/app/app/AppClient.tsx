"use client";
// Клиентская часть кабинета: вкладки, CRUD фильтров, отображение лотов.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
              <div key={l.lot_id} className="rounded-2xl border border-slate-800 p-4 flex flex-col gap-2.5"
                style={{ background: "#131a2b" }}>
                <div className="flex justify-between gap-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-full border border-blue-500/40 text-blue-400">{l.category || "—"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-slate-400">{PLATFORM_NAMES[l.platform] || l.platform}</span>
                </div>
                <h4 className="text-sm font-semibold leading-snug">{l.title || "Без названия"}</h4>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>📍 {l.region || "—"}</span>
                  <span>⏱ {l.deadline ? new Date(l.deadline).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—"}</span>
                </div>
                <div className="text-xl font-bold text-green-400">{priceFmt(l.price)}</div>
                <a href={l.url || "#"} target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-center text-sm hover:border-slate-500">
                  🔗 Открыть на площадке
                </a>
              </div>
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

        {tab === "channels" && (
          <div className="text-center text-slate-500 py-16 rounded-2xl border border-slate-800"
            style={{ background: "#131a2b" }}>
            📨 Привязка Telegram/Email будет добавлена в Фазе 2 (после деплоя).<br />
            Сейчас лоты доступны во вкладке «Мои лоты».
          </div>
        )}

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
    </main>
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
