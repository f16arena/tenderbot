-- TenderBot — начальная схема для Supabase Postgres
-- Применяется в Supabase Dashboard → SQL Editor → run, или через `supabase db push`.

-- ─── Лоты — общий каталог, читают все авторизованные ────────────────────
create table if not exists public.lots (
  id            bigserial primary key,
  lot_id        text unique not null,
  platform      text not null,
  title         text,
  category      text,
  region        text,
  price         numeric,
  deadline      timestamptz,
  url           text,
  requirements  jsonb,       -- структурированные требования из ТЗ (Фаза 2)
  customer_org  text,        -- организация-заказчик
  status        text default 'new',
  created_at    timestamptz default now()
);
create index if not exists lots_created_at_idx on public.lots(created_at desc);
create index if not exists lots_platform_idx   on public.lots(platform);
create index if not exists lots_category_idx   on public.lots(category);
create index if not exists lots_region_idx     on public.lots(region);
create index if not exists lots_price_idx      on public.lots(price);

-- ─── Тарифы ────────────────────────────────────────────────────────────
create table if not exists public.plans (
  id                bigserial primary key,
  code              text unique not null,
  name              text not null,
  price_kzt         integer not null,
  trial_days        integer default 7,
  max_filters       integer default 1,            -- 0 = безлимит
  channels_allowed  text[] default '{}',          -- {telegram,email,whatsapp,sms,dashboard}
  api_access        boolean default false,
  description       text,
  sort_order        integer default 0
);

insert into public.plans (code, name, price_kzt, trial_days, max_filters, channels_allowed, api_access, description, sort_order) values
 ('starter',    'Starter',    10000,  7, 1, array['telegram','dashboard'],                            false, 'Один фильтр, уведомления в Telegram. Для ИП и микро.',   1),
 ('pro',        'Pro',        30000,  7, 0, array['telegram','email','dashboard'],                     false, 'Безлимит фильтров, Telegram + Email. Для МСБ.',           2),
 ('enterprise', 'Enterprise', 100000, 14, 0, array['telegram','email','whatsapp','sms','dashboard'], true,  'Pro + WhatsApp/SMS + REST API + AI-анализ лота.',         3)
on conflict (code) do nothing;

-- ─── Профиль пользователя (расширение auth.users Supabase) ──────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  company       text,
  bin           text,
  phone         text,
  role          text default 'client',  -- client | admin
  created_at    timestamptz default now()
);

-- авто-создание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  -- + триальная подписка Starter на 7 дней
  insert into public.subscriptions (user_id, plan_id, status, started_at, expires_at)
  select new.id, p.id, 'trial', now(), now() + interval '7 days'
  from public.plans p where p.code = 'starter';
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Подписки ──────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_id     bigint not null references public.plans(id),
  status      text default 'trial',     -- trial | active | expired | cancelled | pending_payment
  started_at  timestamptz default now(),
  expires_at  timestamptz,
  payment_ref text,
  auto_renew  boolean default false,
  created_at  timestamptz default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

-- ─── Фильтры клиента ───────────────────────────────────────────────────
create table if not exists public.filters (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Без названия',
  categories  text[] default '{}',
  regions     text[] default '{}',
  platforms   text[] default '{}',
  keywords    text default '',
  min_price   numeric default 0,
  max_price   numeric default 1000000000,
  enabled     boolean default true,
  created_at  timestamptz default now()
);
create index if not exists filters_user_idx on public.filters(user_id);

-- ─── Каналы уведомлений ────────────────────────────────────────────────
create table if not exists public.notification_channels (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null,         -- telegram | email | whatsapp | sms
  target      text,                  -- chat_id | email | phone
  link_code   text,                  -- для привязки Telegram через /start <code>
  verified    boolean default false,
  enabled     boolean default true,
  created_at  timestamptz default now()
);
create index if not exists nc_user_idx on public.notification_channels(user_id);
create index if not exists nc_linkcode_idx on public.notification_channels(link_code);

-- ─── Лог отправленных уведомлений (для дедупа) ──────────────────────────
create table if not exists public.sent_notifications (
  id      bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lot_id  text not null,
  channel text not null,
  sent_at timestamptz default now()
);
create unique index if not exists sent_unique_idx
  on public.sent_notifications(user_id, lot_id, channel);

-- ═══ Row Level Security ═════════════════════════════════════════════════
-- Каждый клиент видит/правит ТОЛЬКО свои данные.

alter table public.profiles              enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.filters               enable row level security;
alter table public.notification_channels enable row level security;
alter table public.sent_notifications    enable row level security;
alter table public.lots                  enable row level security;
alter table public.plans                 enable row level security;

-- профили: SELECT/UPDATE свои; INSERT — только триггер handle_new_user (security definer обходит RLS).
create policy "profiles select own"  on public.profiles for select using (auth.uid() = id);
create policy "profiles update own"  on public.profiles for update using (auth.uid() = id);
-- INSERT-policy на случай ручного создания через service_role (не блокирующая, для прозрачности).
create policy "profiles insert self" on public.profiles for insert with check (auth.uid() = id);

-- подписки: клиент только смотрит свои; ВСЕ изменения (триал, оплата, продление) — через service_role
-- из defined-функций (handle_new_user, /api/cron, /api/payment-webhook). Никакого INSERT/UPDATE/DELETE
-- от лица клиента — это защищает от self-upgrade без оплаты.
create policy "subs select own" on public.subscriptions for select using (auth.uid() = user_id);

-- фильтры — полный CRUD под своими
create policy "filters select own" on public.filters for select using (auth.uid() = user_id);
create policy "filters insert own" on public.filters for insert with check (auth.uid() = user_id);
create policy "filters update own" on public.filters for update using (auth.uid() = user_id);
create policy "filters delete own" on public.filters for delete using (auth.uid() = user_id);

-- каналы
create policy "ch select own" on public.notification_channels for select using (auth.uid() = user_id);
create policy "ch insert own" on public.notification_channels for insert with check (auth.uid() = user_id);
create policy "ch update own" on public.notification_channels for update using (auth.uid() = user_id);
create policy "ch delete own" on public.notification_channels for delete using (auth.uid() = user_id);

-- лоты публично читаемы (для авторизованных); пишет только service_role
create policy "lots read all" on public.lots for select using (auth.role() = 'authenticated');

-- тарифы — публично читаемы
create policy "plans read all" on public.plans for select using (true);
