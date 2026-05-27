// Кабинет клиента — серверная страница, рендерит данные из Supabase под текущего юзера.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppClient from "./AppClient";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nowIso = new Date().toISOString();
  const [{ data: profile }, { data: filters }, { data: subs }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("filters").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("subscriptions").select("*, plan:plans(*)")
      .eq("user_id", user.id)
      .in("status", ["trial", "active"])
      // Не показывать истёкшие подписки даже если статус не обновлён.
      // Воркер позже обновит status='expired'; до тех пор фильтруем по дате.
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("started_at", { ascending: false })
      .limit(1),
    supabase.from("plans").select("*").order("sort_order"),
  ]);

  return (
    <AppClient
      userEmail={user.email!}
      profile={profile}
      initialFilters={filters || []}
      activeSubscription={subs?.[0] || null}
      plans={plans || []}
    />
  );
}
