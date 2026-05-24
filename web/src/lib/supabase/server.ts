// Серверный Supabase-клиент для Server Components, Route Handlers, Server Actions.
// Использует cookies для сессии — Supabase SSR.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component не может выставить cookie — игнорируем,
            // middleware перевыставит при следующем запросе.
          }
        },
      },
    }
  );
}

// Сервисный клиент (обходит RLS) — для cron, telegram webhook, миграций.
import { createClient as createServiceClient } from "@supabase/supabase-js";
export function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
