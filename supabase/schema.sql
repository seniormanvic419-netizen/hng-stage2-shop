-- Basira Provisions schema. Run in the Supabase SQL editor.
create table if not exists public.products (
  id text primary key,
  name text not null,
  description text,
  price integer not null check (price >= 0), -- kobo
  emoji text,
  category text,
  in_stock boolean not null default true,
  sort integer not null default 0
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  customer_name text,
  address text,
  total integer not null check (total >= 0), -- kobo
  status text not null default 'confirmed',
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_created on public.orders(user_id, created_at desc);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id),
  name text not null,
  unit_price integer not null,
  quantity integer not null check (quantity > 0)
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "products are public" on public.products;
create policy "products are public" on public.products for select using (true);

drop policy if exists "own orders select" on public.orders;
create policy "own orders select" on public.orders for select using (auth.uid() = user_id);
drop policy if exists "own orders insert" on public.orders;
create policy "own orders insert" on public.orders for insert with check (auth.uid() = user_id);
drop policy if exists "own orders update" on public.orders;
create policy "own orders update" on public.orders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own items select" on public.order_items;
create policy "own items select" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists "own items insert" on public.order_items;
create policy "own items insert" on public.order_items for insert
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

insert into public.products (id, name, description, price, emoji, category, sort) values
  ('rice-5kg', 'Mama Gold Rice 5kg', 'Parboiled long-grain rice, stone-free.', 950000, '🍚', 'Staples', 1),
  ('oil-3l', 'Kings Groundnut Oil 3L', 'Pure vegetable oil for frying and stews.', 780000, '🫙', 'Staples', 2),
  ('indomie-carton', 'Indomie Chicken (carton of 40)', 'The classic. Ready in three minutes.', 1150000, '🍜', 'Staples', 3),
  ('spaghetti-pack', 'Golden Penny Spaghetti 500g', 'Pack of 500g. Buy five, get a smile.', 95000, '🍝', 'Staples', 4),
  ('milo-500', 'Milo 500g Tin', 'Chocolate malt drink for the morning.', 420000, '☕', 'Breakfast', 5),
  ('peak-milk', 'Peak Evaporated Milk (tin)', 'Full cream, perfect for tea and pap.', 55000, '🥛', 'Breakfast', 6),
  ('eggs-crate', 'Crate of Eggs (30)', 'Fresh from the farm every Tuesday and Friday.', 480000, '🥚', 'Fresh', 7),
  ('tomato-paste', 'Gino Tomato Paste (sachet pack of 10)', 'For the stew that makes the house smell right.', 180000, '🍅', 'Fresh', 8),
  ('detergent-1kg', 'Ariel Detergent 1kg', 'Machine and hand wash.', 320000, '🧼', 'Household', 9),
  ('toilet-roll-12', 'Toilet Roll (pack of 12)', 'Soft, two-ply, no arguments.', 390000, '🧻', 'Household', 10)
on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price,
  emoji = excluded.emoji, category = excluded.category, sort = excluded.sort;
