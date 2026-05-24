"use client";
// Логин/регистрация через Supabase Auth (email + пароль).
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-slate-400">…</div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const search = useSearchParams();
  const router = useRouter();
  const initialMode = search.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [bin, setBin] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { full_name: "", company, bin, phone },
            emailRedirectTo: `${location.origin}/app`,
          },
        });
        if (error) throw error;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) router.push("/app");
        else setErr("✅ Регистрация принята. Проверьте email — придёт подтверждение.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/app");
        router.refresh();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      setErr(
        msg.includes("Invalid login") ? "Неверный email или пароль" :
        msg.includes("already registered") ? "Этот email уже зарегистрирован" :
        msg
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "radial-gradient(1200px 600px at 80% -10%, #16203a 0%, #0b0f1a 55%)" }}>
      <div className="w-full max-w-md text-slate-100">
        <Link href="/" className="flex items-center gap-2 mb-6 text-slate-400 hover:text-slate-200 text-sm">
          ← TenderBot
        </Link>
        <div className="rounded-2xl border border-slate-800 p-7" style={{ background: "#131a2b" }}>
          <h1 className="text-2xl font-bold mb-5">
            {mode === "signup" ? "Регистрация" : "Войти"}
          </h1>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Email">
              <input type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputCls} />
            </Field>
            <Field label="Пароль (≥6 символов)">
              <input type="password" required minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputCls} />
            </Field>
            {mode === "signup" && (
              <>
                <Field label="Компания (опционально)">
                  <input value={company} onChange={(e) => setCompany(e.target.value)}
                    placeholder="ТОО ..." className={inputCls} />
                </Field>
                <Field label="БИН (опционально)">
                  <input value={bin} onChange={(e) => setBin(e.target.value)}
                    className={inputCls} />
                </Field>
                <Field label="Телефон (опционально)">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7..." className={inputCls} />
                </Field>
              </>
            )}
            {err && <div className="text-sm text-red-400">{err}</div>}
            <button type="submit" disabled={loading}
              className="w-full mt-2 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 font-semibold">
              {loading ? "..." : mode === "signup" ? "Создать и начать триал" : "Войти"}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-slate-400">
            {mode === "signup" ? (
              <>Уже есть аккаунт? <button onClick={() => setMode("login")} className="text-blue-400 hover:underline">Войти</button></>
            ) : (
              <>Нет аккаунта? <button onClick={() => setMode("signup")} className="text-blue-400 hover:underline">Регистрация</button></>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

const inputCls = "w-full bg-[#1a2336] border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
