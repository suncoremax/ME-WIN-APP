-- ════════════════════════════════════════════════════════════════════
-- SHAKIB TRADERS — database schema (Supabase / PostgreSQL)
-- Run this ONCE in Supabase → SQL Editor on a brand-new project.
-- It is safe to run again: every statement is "if not exists" /
-- "create or replace", and it never deletes data.
-- ════════════════════════════════════════════════════════════════════

-- ── Companies (the 4–5 brands the client distributes) ───────────────
create table if not exists companies (
  id              bigint generated always as identity primary key,
  name            text    not null unique,
  color           text    not null default '#10B981',
  commission_pct  numeric(5,2) not null default 6,      -- Excel: কমিশন (6%)
  sort            int     not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── Users: one owner + SOs, each SO belongs to ONE company ──────────
-- PINs are never stored. pin_hash = HMAC-SHA256(AUTH_SECRET, pin).
create table if not exists app_users (
  id              bigint generated always as identity primary key,
  name            text    not null,
  role            text    not null check (role in ('owner','so')),
  company_id      bigint  references companies(id) on delete cascade,
  pin_hash        text    not null unique,
  must_change_pw  boolean not null default false,
  can_finance     boolean not null default false,   -- SO may see commission, expenses, paid-out ledger
  token_ver       int     not null default 0,       -- bump to sign a user out everywhere
  active          boolean not null default true,
  last_login      timestamptz,
  created_at      timestamptz not null default now(),
  check ((role = 'owner' and company_id is null) or (role = 'so' and company_id is not null))
);
create index if not exists app_users_company_idx on app_users(company_id);

-- ── Products (Excel: Master Product + Opening Stock) ────────────────
create table if not exists products (
  id           bigint generated always as identity primary key,
  company_id   bigint  not null references companies(id) on delete cascade,
  code         text    not null,
  code_key     text    generated always as (lower(btrim(code))) stored,
  name         text    not null,
  price        numeric(12,2) not null default 0,
  opening_qty  numeric(12,2) not null default 0,
  active       boolean not null default true,
  sort         int     not null default 0,
  created_at   timestamptz not null default now(),
  unique (company_id, code_key)
);

-- ── One row per company per day: the memo money + day-close lock ────
create table if not exists day_entries (
  company_id   bigint not null references companies(id) on delete cascade,
  entry_date   date   not null,
  memo_amount  numeric(14,2) not null default 0,       -- Excel: মেমো টাকা
  note         text,
  dmg_deduct   boolean not null default false,        -- subtract damage value from net sales
  closed       boolean not null default false,
  closed_by    text,
  closed_at    timestamptz,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  primary key (company_id, entry_date)
);

-- ── Every line of a day: sale / over-sale / return (stock back in) /
--    adjust (money-only deduction, e.g. "Damage", "Kom") / damage ──
create table if not exists day_lines (
  id          bigint generated always as identity primary key,
  company_id  bigint not null references companies(id) on delete cascade,
  entry_date  date   not null,
  section     text   not null check (section in ('sale','over','return','adjust','damage')),
  product_id  bigint references products(id) on delete set null,
  code        text   not null default '',
  name        text   not null default '',
  price       numeric(12,2) not null default 0,
  qty         numeric(12,2) not null default 0,
  amount      numeric(14,2) not null default 0,
  sort        int    not null default 0
);
create index if not exists day_lines_co_date_idx on day_lines(company_id, entry_date);
create index if not exists day_lines_product_idx on day_lines(product_id);

-- ── Stock in / out outside of sales (Excel: inout sheet) ────────────
create table if not exists stock_moves (
  id          bigint generated always as identity primary key,
  company_id  bigint not null references companies(id) on delete cascade,
  entry_date  date   not null,
  kind        text   not null check (kind in ('in','out')),
  product_id  bigint references products(id) on delete set null,
  code        text   not null default '',
  name        text   not null default '',
  qty         numeric(12,2) not null check (qty > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists stock_moves_co_idx on stock_moves(company_id, entry_date);

-- ── Money with each company (Excel: Code sheet) ─────────────────────
--   payout   = cash paid out to the company
--   received = value of product received from the company
--   opening  = opening code balance
create table if not exists ledger (
  id          bigint generated always as identity primary key,
  company_id  bigint not null references companies(id) on delete cascade,
  entry_date  date   not null,
  kind        text   not null check (kind in ('payout','received','opening')),
  amount      numeric(14,2) not null,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists ledger_co_idx on ledger(company_id, entry_date);

-- ── Expenses (Excel: খরচ হিসাব). company_id NULL = shared / owner-only
create table if not exists expenses (
  id          bigint generated always as identity primary key,
  company_id  bigint references companies(id) on delete cascade,
  entry_date  date   not null,
  name        text   not null,
  amount      numeric(14,2) not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_co_idx on expenses(company_id, entry_date);

-- ── Due clients (Excel: বাকি Clint / Due Clients) ───────────────────
create table if not exists clients (
  id          bigint generated always as identity primary key,
  company_id  bigint references companies(id) on delete cascade,
  name        text   not null,
  phone       text,
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists client_txns (
  id          bigint generated always as identity primary key,
  client_id   bigint not null references clients(id) on delete cascade,
  entry_date  date   not null,
  kind        text   not null check (kind in ('due','paid')),
  amount      numeric(14,2) not null check (amount > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists client_txns_idx on client_txns(client_id);

-- ── Who did what ────────────────────────────────────────────────────
create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     bigint,
  user_name   text,
  role        text,
  company_id  bigint,
  action      text not null,
  detail      jsonb
);
create index if not exists audit_at_idx on audit_log(at desc);

-- ── Login throttle (5-digit PINs must not be guessable) ─────────────
create table if not exists login_attempts (
  id   bigint generated always as identity primary key,
  ip   text not null,
  at   timestamptz not null default now(),
  ok   boolean not null default false
);
create index if not exists login_attempts_idx on login_attempts(ip, at desc);

-- ── Lock the tables from the public (anon) key ──────────────────────
-- The browser never talks to Supabase directly. Only the Vercel API,
-- using the service_role key, can read or write. RLS on + no policies
-- = the anon key sees nothing.
alter table companies      enable row level security;
alter table app_users      enable row level security;
alter table products       enable row level security;
alter table day_entries    enable row level security;
alter table day_lines      enable row level security;
alter table stock_moves    enable row level security;
alter table ledger         enable row level security;
alter table expenses       enable row level security;
alter table clients        enable row level security;
alter table client_txns    enable row level security;
alter table audit_log      enable row level security;
alter table login_attempts enable row level security;

-- ════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ════════════════════════════════════════════════════════════════════

-- Save a whole day for one company in ONE transaction.
-- p_lines = [{section, product_id, code, name, price, qty, amount?}, …]
create or replace function save_day(
  p_company  bigint,
  p_date     date,
  p_memo     numeric,
  p_note     text,
  p_lines    jsonb,
  p_user     text,
  p_override boolean default false,
  p_dmg_deduct boolean default false
) returns jsonb
language plpgsql as $$
declare
  was_closed boolean;
  x jsonb;
  n int := 0;
begin
  select closed into was_closed from day_entries
   where company_id = p_company and entry_date = p_date for update;
  if coalesce(was_closed, false) and not p_override then
    raise exception 'DAY_CLOSED';
  end if;

  insert into day_entries(company_id, entry_date, memo_amount, note, dmg_deduct, updated_by, updated_at)
  values (p_company, p_date, coalesce(p_memo, 0), p_note, coalesce(p_dmg_deduct,false), p_user, now())
  on conflict (company_id, entry_date)
  do update set memo_amount = excluded.memo_amount, note = excluded.note,
                dmg_deduct = excluded.dmg_deduct,
                updated_by = excluded.updated_by, updated_at = now();

  delete from day_lines where company_id = p_company and entry_date = p_date;

  for x in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    n := n + 1;
    insert into day_lines(company_id, entry_date, section, product_id, code, name, price, qty, amount, sort)
    values (
      p_company, p_date, x->>'section',
      nullif(x->>'product_id','')::bigint,
      coalesce(x->>'code',''), coalesce(x->>'name',''),
      coalesce((x->>'price')::numeric, 0),
      coalesce((x->>'qty')::numeric, 0),
      coalesce(nullif(x->>'amount','')::numeric,
               round(coalesce((x->>'price')::numeric,0) * coalesce((x->>'qty')::numeric,0), 2)),
      n
    );
  end loop;
  return jsonb_build_object('ok', true, 'lines', n);
end $$;

-- Per-day totals for one company (or all when p_company is null).
-- returns = product returns, adjust = money-only deductions; the app shows
-- both together as "ফেরত", exactly like the Excel sheet.
create or replace function daily_summary(p_company bigint, p_from date, p_to date)
returns table(company_id bigint, d date, sales numeric, returns numeric, adjust numeric,
              damage numeric, memo numeric, closed boolean, dmg_deduct boolean, line_count int)
language sql stable as $$
  with l as (
    select dl.company_id, dl.entry_date d,
           coalesce(sum(amount) filter (where section in ('sale','over')), 0) sales,
           coalesce(sum(amount) filter (where section = 'return'), 0) returns,
           coalesce(sum(amount) filter (where section = 'adjust'), 0) adjust,
           coalesce(sum(amount) filter (where section = 'damage'), 0) damage,
           count(*)::int line_count
      from day_lines dl
     where dl.entry_date between p_from and p_to
       and (p_company is null or dl.company_id = p_company)
     group by dl.company_id, dl.entry_date),
  e as (
    select de.company_id, de.entry_date d, de.memo_amount memo, de.closed, de.dmg_deduct
      from day_entries de
     where de.entry_date between p_from and p_to
       and (p_company is null or de.company_id = p_company))
  select coalesce(l.company_id, e.company_id), coalesce(l.d, e.d),
         coalesce(l.sales,0), coalesce(l.returns,0), coalesce(l.adjust,0), coalesce(l.damage,0),
         coalesce(e.memo,0), coalesce(e.closed,false), coalesce(e.dmg_deduct,false),
         coalesce(l.line_count,0)
    from l full join e on l.company_id = e.company_id and l.d = e.d
   order by 2, 1;
$$;

-- One row per company for a date range (the dashboard cards).
create or replace function company_totals(p_from date, p_to date)
returns table(company_id bigint, sales numeric, returns numeric, adjust numeric, damage numeric,
              damage_cut numeric, memo numeric, active_days int, last_day date)
language sql stable as $$
  select s.company_id, sum(s.sales), sum(s.returns), sum(s.adjust), sum(s.damage),
         coalesce(sum(s.damage) filter (where s.dmg_deduct), 0), sum(s.memo),
         (count(*) filter (where s.sales > 0 or s.memo > 0))::int,
         max(s.d) filter (where s.sales > 0 or s.memo > 0)
    from daily_summary(null, p_from, p_to) s
   group by s.company_id;
$$;

-- Live stock per product.  Same rule as the Excel "Opening Stock" sheet:
--   available = opening + stock-in − stock-out + returns − sales − over-sales
-- (damage is tracked separately and does not change stock, as in Excel).
create or replace function stock_view(p_company bigint, p_asof date default null)
returns table(product_id bigint, code text, name text, price numeric,
              opening numeric, stock_in numeric, stock_out numeric,
              returned numeric, sold numeric, damaged numeric,
              available numeric, sold_14d numeric, active boolean)
language sql stable as $$
  select p.id, p.code, p.name, p.price, p.opening_qty,
    coalesce((select sum(qty) from stock_moves m where m.product_id = p.id and m.kind = 'in'
              and (p_asof is null or m.entry_date <= p_asof)), 0),
    coalesce((select sum(qty) from stock_moves m where m.product_id = p.id and m.kind = 'out'
              and (p_asof is null or m.entry_date <= p_asof)), 0),
    coalesce((select sum(qty) from day_lines l where l.product_id = p.id and l.section = 'return'
              and (p_asof is null or l.entry_date <= p_asof)), 0),
    coalesce((select sum(qty) from day_lines l where l.product_id = p.id and l.section in ('sale','over')
              and (p_asof is null or l.entry_date <= p_asof)), 0),
    coalesce((select sum(qty) from day_lines l where l.product_id = p.id and l.section = 'damage'
              and (p_asof is null or l.entry_date <= p_asof)), 0),
    p.opening_qty
      + coalesce((select sum(qty) from stock_moves m where m.product_id = p.id and m.kind = 'in'
                  and (p_asof is null or m.entry_date <= p_asof)), 0)
      - coalesce((select sum(qty) from stock_moves m where m.product_id = p.id and m.kind = 'out'
                  and (p_asof is null or m.entry_date <= p_asof)), 0)
      + coalesce((select sum(qty) from day_lines l where l.product_id = p.id and l.section = 'return'
                  and (p_asof is null or l.entry_date <= p_asof)), 0)
      - coalesce((select sum(qty) from day_lines l where l.product_id = p.id and l.section in ('sale','over')
                  and (p_asof is null or l.entry_date <= p_asof)), 0),
    coalesce((select sum(qty) from day_lines l where l.product_id = p.id and l.section in ('sale','over')
              and l.entry_date > coalesce(p_asof, current_date) - 14
              and l.entry_date <= coalesce(p_asof, current_date)), 0),
    p.active
  from products p
  where p.company_id = p_company
  order by p.sort, p.id;
$$;

-- Product ranking for a date range (sold / returned / damaged).
create or replace function product_totals(p_company bigint, p_from date, p_to date)
returns table(product_id bigint, code text, name text,
              sold_qty numeric, sold_amount numeric,
              return_qty numeric, return_amount numeric,
              damage_qty numeric, damage_amount numeric)
language sql stable as $$
  select l.product_id, max(l.code), max(l.name),
    coalesce(sum(qty)    filter (where section in ('sale','over')), 0),
    coalesce(sum(amount) filter (where section in ('sale','over')), 0),
    coalesce(sum(qty)    filter (where section = 'return'), 0),
    coalesce(sum(amount) filter (where section = 'return'), 0),
    coalesce(sum(qty)    filter (where section = 'damage'), 0),
    coalesce(sum(amount) filter (where section = 'damage'), 0)
  from day_lines l
  where l.company_id = p_company and l.entry_date between p_from and p_to
  group by coalesce(l.product_id::text, 'x:' || lower(btrim(l.code))), l.product_id
  order by 5 desc;
$$;

-- Things that look wrong in the data, so mistakes are caught early.
create or replace function data_checks(p_company bigint, p_from date, p_to date)
returns table(kind text, d date, ref text, detail text, amount numeric)
language sql stable as $$
  -- memo money entered but no product lines
  select 'memo_no_lines'::text, e.entry_date, ''::text, 'memo'::text, e.memo_amount
    from day_entries e
   where e.company_id = p_company and e.entry_date between p_from and p_to
     and e.memo_amount > 0
     and not exists (select 1 from day_lines l where l.company_id = e.company_id
                      and l.entry_date = e.entry_date and l.section in ('sale','over'))
  union all
  -- memo far from the calculated total
  select 'memo_gap', s.d, '', 'gap', s.memo - s.sales
    from daily_summary(p_company, p_from, p_to) s
   where s.sales > 0 and abs(s.memo - s.sales) > greatest(300, s.sales * 0.03)
  union all
  -- line whose product is not in the product list
  select 'unknown_product', l.entry_date, l.code, l.section, l.amount
    from day_lines l
   where l.company_id = p_company and l.entry_date between p_from and p_to
     and l.product_id is null and l.section <> 'adjust' and l.code <> ''
  union all
  -- day total kept from Excel without item lines
  select 'unitemized', l.entry_date, l.name, l.section, l.amount
    from day_lines l
   where l.company_id = p_company and l.entry_date between p_from and p_to
     and l.section in ('sale','over') and l.code = '' and l.product_id is null
  union all
  -- quantity with no price
  select 'no_price', l.entry_date, l.code, l.section, l.qty
    from day_lines l
   where l.company_id = p_company and l.entry_date between p_from and p_to
     and l.product_id is not null and l.qty <> 0 and l.price = 0
  union all
  -- return/damage priced very differently from the sale price
  select 'price_mismatch', l.entry_date, l.code, l.section, l.price
    from day_lines l join products p on p.id = l.product_id
   where l.company_id = p_company and l.entry_date between p_from and p_to
     and l.section in ('return','damage') and p.price > 0 and l.price > 0
     and (l.price / p.price > 3 or l.price / p.price < 0.34)
  union all
  -- stock below zero right now
  select 'negative_stock', null::date, v.code, v.name, v.available
    from stock_view(p_company, null) v
   where v.available < 0 and v.active
  order by 2 nulls last, 1;
$$;

-- Import one company's month from Excel in ONE transaction.
-- p = { products:[{code,name,price,opening}], days:[{date,memo,lines:[…]}],
--       moves:[{date,kind,code,name,qty}], ledger:[{date,kind,amount,note}] }
create or replace function import_month(
  p_company bigint, p_from date, p_to date, p jsonb,
  p_replace boolean, p_set_opening boolean, p_user text
) returns jsonb
language plpgsql as $$
declare
  x jsonb; d jsonb; pid bigint; n_lines int := 0; n_days int := 0;
  n_prod int := 0; n_moves int := 0; n_led int := 0; srt int := 0;
begin
  if p_replace then
    delete from day_lines  where company_id = p_company and entry_date between p_from and p_to;
    delete from day_entries where company_id = p_company and entry_date between p_from and p_to;
    delete from stock_moves where company_id = p_company and entry_date between p_from and p_to;
    delete from ledger      where company_id = p_company and entry_date between p_from and p_to;
  end if;

  for x in select * from jsonb_array_elements(coalesce(p->'products', '[]'::jsonb)) loop
    srt := srt + 1;
    insert into products(company_id, code, name, price, opening_qty, sort)
    values (p_company, btrim(x->>'code'), coalesce(x->>'name', x->>'code'),
            coalesce((x->>'price')::numeric, 0),
            case when p_set_opening then coalesce((x->>'opening')::numeric, 0) else 0 end, srt)
    on conflict (company_id, code_key) do update
      set name = excluded.name,
          price = case when excluded.price > 0 then excluded.price else products.price end,
          opening_qty = case when p_set_opening then excluded.opening_qty else products.opening_qty end;
    n_prod := n_prod + 1;
  end loop;

  for d in select * from jsonb_array_elements(coalesce(p->'days', '[]'::jsonb)) loop
    insert into day_entries(company_id, entry_date, memo_amount, updated_by)
    values (p_company, (d->>'date')::date, coalesce((d->>'memo')::numeric, 0), p_user)
    on conflict (company_id, entry_date)
      do update set memo_amount = excluded.memo_amount, updated_by = excluded.updated_by, updated_at = now();
    n_days := n_days + 1;
    srt := 0;
    for x in select * from jsonb_array_elements(coalesce(d->'lines', '[]'::jsonb)) loop
      srt := srt + 1;
      select id into pid from products
       where company_id = p_company and code_key = lower(btrim(x->>'code'));
      insert into day_lines(company_id, entry_date, section, product_id, code, name, price, qty, amount, sort)
      values (p_company, (d->>'date')::date, x->>'section', pid,
              btrim(coalesce(x->>'code','')), coalesce(x->>'name',''),
              coalesce((x->>'price')::numeric, 0), coalesce((x->>'qty')::numeric, 0),
              coalesce(nullif(x->>'amount','')::numeric,
                       round(coalesce((x->>'price')::numeric,0) * coalesce((x->>'qty')::numeric,0), 2)),
              srt);
      n_lines := n_lines + 1;
    end loop;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p->'moves', '[]'::jsonb)) loop
    select id into pid from products
     where company_id = p_company and code_key = lower(btrim(x->>'code'));
    insert into stock_moves(company_id, entry_date, kind, product_id, code, name, qty, created_by)
    values (p_company, (x->>'date')::date, x->>'kind', pid, btrim(coalesce(x->>'code','')),
            coalesce(x->>'name',''), (x->>'qty')::numeric, p_user);
    n_moves := n_moves + 1;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p->'ledger', '[]'::jsonb)) loop
    insert into ledger(company_id, entry_date, kind, amount, note, created_by)
    values (p_company, (x->>'date')::date, x->>'kind', (x->>'amount')::numeric, x->>'note', p_user);
    n_led := n_led + 1;
  end loop;

  return jsonb_build_object('ok', true, 'products', n_prod, 'days', n_days,
    'lines', n_lines, 'moves', n_moves, 'ledger', n_led);
end $$;
