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
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (mode === "signup" && !agreed) {
      setErr("Подтвердите согласие с офертой и политикой");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/app` },
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
        msg.includes("Email not confirmed") ? "Подтвердите email — мы отправили письмо со ссылкой" :
        msg
      );
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    if (!email) { setErr("Введите email — на него придёт ссылка для сброса"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/login`,
      });
      if (error) throw error;
      setErr("✅ Письмо со ссылкой для сброса пароля отправлено на " + email);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка");
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
            <Field label="Пароль (≥8 символов)">
              <input type="password" required minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputCls} />
            </Field>
            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 accent-blue-500" />
                <span>
                  Я согласен с{" "}
                  <Link href="/offer" target="_blank" className="text-blue-400 hover:underline">офертой</Link>
                  {" "}и{" "}
                  <Link href="/privacy" target="_blank" className="text-blue-400 hover:underline">политикой персональных данных</Link>
                </span>
              </label>
            )}
            {mode === "login" && (
              <div className="text-right">
                <button type="button" onClick={forgotPassword}
                  className="text-xs text-blue-400 hover:underline">
                  Забыли пароль?
                </button>
              </div>
            )}
            {err && <div className={`text-sm ${err.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{err}</div>}
            <button type="submit" disabled={loading}
              className="w-full mt-2 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 font-semibold">
              {loading ? "..." : mode === "signup" ? "Начать бесплатно — 7 дней" : "Войти"}
            </button>
            {mode === "signup" && (
              <p className="text-xs text-slate-500 text-center mt-2">
                Реквизиты компании заполните после первого захода
              </p>
            )}
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
