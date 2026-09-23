-- Household finances: monthly deposit/withdrawal totals per bank account.
-- No individual transactions are tracked. A missing monthly_flows row means
-- "not entered yet"; a row with zeros means "no activity that month".

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  institution text,
  type text not null default 'checking' check (type in ('checking', 'savings', 'credit', 'investment', 'other')),
  -- EUR only for now: drop this check and add FX handling to support other currencies.
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

-- Which household members hold an account. Informational only (labels,
-- per-person filters); access is governed by household membership.
create table public.account_holders (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (account_id, user_id)
);

create index account_holders_user_id_idx on public.account_holders (user_id);

create table public.monthly_flows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Always the first day of the month.
  month date not null check (extract(day from month) = 1),
  -- Human-readable 'YYYY-MM'. Built from extract() because to_char() is not immutable.
  period text generated always as (
    extract(year from month)::int::text || '-' || lpad(extract(month from month)::int::text, 2, '0')
  ) stored,
  deposits numeric(14, 2) not null default 0 check (deposits >= 0),
  withdrawals numeric(14, 2) not null default 0 check (withdrawals >= 0),
  -- Money moved between the household's own accounts; excluded from net.
  transfers_in numeric(14, 2) not null default 0 check (transfers_in >= 0),
  transfers_out numeric(14, 2) not null default 0 check (transfers_out >= 0),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, month)
);

create index monthly_flows_month_idx on public.monthly_flows (month);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------

create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = (select auth.uid())
  );
$$;

create function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create function public.account_household_id(aid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.accounts where id = aid;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for users that signed up before this migration.
insert into public.profiles (user_id, display_name, avatar_url)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (user_id) do nothing;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create function public.monthly_flows_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Client-supplied values only survive for service-role writes (no auth.uid()).
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create trigger monthly_flows_audit
before insert or update on public.monthly_flows
for each row execute function public.monthly_flows_audit();

-- A household must always keep at least one owner.
create function public.ensure_household_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
    and (tg_op = 'DELETE' or new.role <> 'owner')
    and exists (select 1 from public.households where id = old.household_id)
    and not exists (
      select 1 from public.household_members
      where household_id = old.household_id and role = 'owner' and user_id <> old.user_id
    )
  then
    raise exception 'A household must keep at least one owner';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger household_members_keep_owner
after update or delete on public.household_members
for each row execute function public.ensure_household_has_owner();

-- Account holders must belong to the account's household.
create function public.ensure_holder_is_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members m
    join public.accounts a on a.household_id = m.household_id
    where a.id = new.account_id and m.user_id = new.user_id
  ) then
    raise exception 'Account holder must be a member of the account''s household';
  end if;
  return new;
end;
$$;

create trigger account_holders_member_check
before insert or update on public.account_holders
for each row execute function public.ensure_holder_is_member();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.households (name) values (household_name) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, auth.uid(), 'owner');
  return hid;
end;
$$;

-- Adds an existing user (by email) to a household. Owners only.
create function public.add_household_member(hid uuid, member_email text, member_role text default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if not public.is_household_owner(hid) then
    raise exception 'Only household owners can add members';
  end if;

  select id into target from auth.users where lower(email) = lower(trim(member_email));
  if target is null then
    raise exception 'No user found with that email';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (hid, target, member_role)
  on conflict (household_id, user_id) do update set role = excluded.role;

  return target;
end;
$$;

revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.add_household_member(uuid, text, text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.add_household_member(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.account_holders enable row level security;
alter table public.monthly_flows enable row level security;

-- households: created through create_household()
create policy "Members can view their households" on public.households
for select to authenticated using (public.is_household_member(id));

create policy "Owners can rename households" on public.households
for update to authenticated using (public.is_household_owner(id)) with check (public.is_household_owner(id));

create policy "Owners can delete households" on public.households
for delete to authenticated using (public.is_household_owner(id));

-- household_members: added through add_household_member()
create policy "Members can view co-members" on public.household_members
for select to authenticated using (public.is_household_member(household_id));

create policy "Owners can change member roles" on public.household_members
for update to authenticated
using (public.is_household_owner(household_id))
with check (public.is_household_owner(household_id));

create policy "Owners can remove members, members can leave" on public.household_members
for delete to authenticated
using (public.is_household_owner(household_id) or user_id = (select auth.uid()));

-- profiles
create policy "Users can view own and co-member profiles" on public.profiles
for select to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.household_members m
    where m.user_id = profiles.user_id and public.is_household_member(m.household_id)
  )
);

create policy "Users can update own profile" on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- accounts: never deleted, archive via archived_at
create policy "Members can view household accounts" on public.accounts
for select to authenticated using (public.is_household_member(household_id));

create policy "Owners can create accounts" on public.accounts
for insert to authenticated with check (public.is_household_owner(household_id));

create policy "Owners can update accounts" on public.accounts
for update to authenticated
using (public.is_household_owner(household_id))
with check (public.is_household_owner(household_id));

-- account_holders
create policy "Members can view account holders" on public.account_holders
for select to authenticated using (public.is_household_member(public.account_household_id(account_id)));

create policy "Owners can add account holders" on public.account_holders
for insert to authenticated with check (public.is_household_owner(public.account_household_id(account_id)));

create policy "Owners can remove account holders" on public.account_holders
for delete to authenticated using (public.is_household_owner(public.account_household_id(account_id)));

-- monthly_flows: any member enters figures, owners can delete
create policy "Members can view monthly flows" on public.monthly_flows
for select to authenticated using (public.is_household_member(public.account_household_id(account_id)));

create policy "Members can add monthly flows" on public.monthly_flows
for insert to authenticated with check (public.is_household_member(public.account_household_id(account_id)));

create policy "Members can update monthly flows" on public.monthly_flows
for update to authenticated
using (public.is_household_member(public.account_household_id(account_id)))
with check (public.is_household_member(public.account_household_id(account_id)));

create policy "Owners can delete monthly flows" on public.monthly_flows
for delete to authenticated using (public.is_household_owner(public.account_household_id(account_id)));

-- ---------------------------------------------------------------------------
-- Views (security_invoker so the caller's RLS applies)
-- ---------------------------------------------------------------------------

create view public.monthly_account_summary
with (security_invoker = true)
as
select
  f.account_id,
  a.household_id,
  a.name as account_name,
  a.institution,
  a.type as account_type,
  f.month,
  f.period,
  f.deposits,
  f.withdrawals,
  f.transfers_in,
  f.transfers_out,
  f.deposits - f.withdrawals as net,
  f.deposits + f.transfers_in - f.withdrawals - f.transfers_out as net_with_transfers,
  f.note
from public.monthly_flows f
join public.accounts a on a.id = f.account_id;

create view public.monthly_household_summary
with (security_invoker = true)
as
select
  a.household_id,
  f.month,
  min(f.period) as period,
  count(*)::int as accounts_reported,
  sum(f.deposits) as deposits,
  sum(f.withdrawals) as withdrawals,
  sum(f.deposits) - sum(f.withdrawals) as net,
  -- Should be zero when every transfer stays inside the household.
  sum(f.transfers_in) - sum(f.transfers_out) as unmatched_transfers
from public.monthly_flows f
join public.accounts a on a.id = f.account_id
group by a.household_id, f.month;
