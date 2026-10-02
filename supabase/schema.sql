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
  ('rice-5kg', 'Rice, 5kg bag', 'Long-grain parboiled rice. Clean, no stones.', 950000, '🍚', 'Staples', 1),
  ('oil-3l', 'Vegetable oil, 3L', 'Light frying and cooking oil.', 780000, '🫙', 'Staples', 2),
  ('indomie-carton', 'Indomie carton (40)', 'Chicken flavour, full carton of 40 packs.', 1150000, '🍜', 'Staples', 3),
  ('spaghetti-pack', 'Spaghetti, 500g', 'Golden Penny spaghetti pack.', 95000, '🍝', 'Staples', 4),
  ('milo-500', 'Milo, 500g tin', 'Chocolate malt drink.', 420000, '☕', 'Breakfast', 5),
  ('peak-milk', 'Peak milk, 400g tin', 'Full cream evaporated milk.', 55000, '🥛', 'Breakfast', 6),
  ('eggs-crate', 'Eggs, crate of 30', 'Fresh from the farm this week.', 480000, '🥚', 'Breakfast', 7),
  ('tomato-paste', 'Tomato paste, 6 sachets', 'Gino tomato paste, 70g each.', 180000, '🍅', 'Cooking', 8),
  ('detergent-1kg', 'Detergent, 1kg', 'Ariel washing powder.', 320000, '🧼', 'Household', 9),
  ('toilet-roll-12', 'Toilet roll, 12 pack', 'Soft 2-ply rolls.', 390000, '🧻', 'Household', 10)
on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price,
  emoji = excluded.emoji, category = excluded.category, sort = excluded.sort;
