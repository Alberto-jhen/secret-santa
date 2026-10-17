create type public.group_state as enum ('setup', 'open', 'drawn', 'cancelled');
create type public.group_member_role as enum ('organizer', 'participant');
create type public.group_member_state as enum ('invited', 'active', 'declined', 'left');
create type public.invitation_state as enum ('pending', 'accepted', 'declined', 'revoked', 'expired');
create type public.draw_state as enum ('draft', 'running', 'completed', 'cancelled');
create type public.notification_state as enum ('queued', 'sent', 'failed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := left(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      ''
    ),
    80
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();
insert into public.profiles (id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(u.raw_user_meta_data ->> 'name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      ''
    ),
    80
  )
from auth.users as u
on conflict (id) do nothing;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  state public.group_state not null default 'setup',
  minimum_budget numeric(10, 2) check (minimum_budget is null or minimum_budget >= 0),
  maximum_budget numeric(10, 2) check (maximum_budget is null or maximum_budget >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    minimum_budget is null
    or maximum_budget is null
    or minimum_budget <= maximum_budget
  )
);

create index groups_owner_id_idx on public.groups (owner_id);

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  email text not null check (char_length(email) <= 254),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role public.group_member_role not null default 'participant',
  state public.group_member_state not null default 'invited',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (group_id, id),
  unique (group_id, user_id)
);

create unique index group_members_email_unique
on public.group_members (group_id, lower(email));

create index group_members_user_id_idx
on public.group_members (user_id)
where user_id is not null;

create function public.add_group_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name text;
begin
  select u.email, p.display_name
  into v_email, v_name
  from auth.users as u
  join public.profiles as p on p.id = u.id
  where u.id = new.owner_id;

  insert into public.group_members (
    group_id,
    user_id,
    email,
    display_name,
    role,
    state,
    accepted_at
  )
  values (
    new.id,
    new.owner_id,
    coalesce(v_email, ''),
    coalesce(nullif(v_name, ''), 'Organizador'),
    'organizer',
    'active',
    now()
  );

  return new;
end;
$$;

create trigger groups_add_owner_membership
after insert on public.groups
for each row execute function public.add_group_owner_as_member();

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete restrict,
  email text not null check (char_length(email) <= 254),
  token_hash text not null unique check (char_length(token_hash) = 64),
  state public.invitation_state not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz
);

create index group_invitations_group_state_idx
on public.group_invitations (group_id, state, expires_at);

create table public.group_exclusions (
  group_id uuid not null references public.groups (id) on delete cascade,
  giver_member_id uuid not null,
  excluded_member_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, giver_member_id, excluded_member_id),
  check (giver_member_id <> excluded_member_id),
  foreign key (group_id, giver_member_id)
    references public.group_members (group_id, id) on delete cascade,
  foreign key (group_id, excluded_member_id)
    references public.group_members (group_id, id) on delete cascade
);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  state public.draw_state not null default 'draft',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, group_id)
);

create unique index draws_one_non_cancelled_per_group
on public.draws (group_id)
where state <> 'cancelled';

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null,
  group_id uuid not null,
  giver_member_id uuid not null,
  receiver_member_id uuid not null,
  created_at timestamptz not null default now(),
  check (giver_member_id <> receiver_member_id),
  unique (draw_id, giver_member_id),
  unique (draw_id, receiver_member_id),
  foreign key (draw_id, group_id)
    references public.draws (id, group_id) on delete cascade,
  foreign key (group_id, giver_member_id)
    references public.group_members (group_id, id) on delete cascade,
  foreign key (group_id, receiver_member_id)
    references public.group_members (group_id, id) on delete cascade
);

create table public.gift_ideas (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  member_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  url text check (url is null or char_length(url) <= 2048),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, member_id)
    references public.group_members (group_id, id) on delete cascade
);

create index gift_ideas_member_idx on public.gift_ideas (group_id, member_id);

create trigger gift_ideas_set_updated_at
before update on public.gift_ideas
for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('invitation', 'draw_ready', 'group_update')),
  state public.notification_state not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_recipient_created_idx
on public.notifications (recipient_user_id, created_at desc);

create function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.state = 'active'
  );
$$;

create function public.is_group_organizer(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.role = 'organizer'
      and gm.state = 'active'
  );
$$;

create function public.can_manage_group_exclusion(
  p_group_id uuid,
  p_giver_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.groups as g
      where g.id = p_group_id
        and g.state in ('setup', 'open')
    )
    and not exists (
      select 1
      from public.draws as d
      where d.group_id = p_group_id
        and d.state in ('running', 'completed')
    )
    and (
      public.is_group_organizer(p_group_id)
      or exists (
        select 1
        from public.group_members as gm
        where gm.id = p_giver_member_id
          and gm.group_id = p_group_id
          and gm.user_id = (select auth.uid())
          and gm.state = 'active'
      )
    );
$$;

create function public.is_assignment_giver(
  p_draw_id uuid,
  p_giver_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.draws as d
    join public.group_members as gm on gm.group_id = d.group_id
    where d.id = p_draw_id
      and d.state = 'completed'
      and gm.id = p_giver_member_id
      and gm.user_id = (select auth.uid())
      and gm.state = 'active'
  );
$$;

create function public.can_manage_gift_idea(
  p_group_id uuid,
  p_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.id = p_member_id
      and gm.user_id = (select auth.uid())
      and gm.state = 'active'
  );
$$;

create function public.can_view_gift_idea(
  p_group_id uuid,
  p_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_gift_idea(p_group_id, p_member_id)
    or exists (
      select 1
      from public.draws as d
      join public.assignments as a on a.draw_id = d.id
      join public.group_members as giver on giver.id = a.giver_member_id
      where d.group_id = p_group_id
        and d.state = 'completed'
        and a.receiver_member_id = p_member_id
        and giver.user_id = (select auth.uid())
        and giver.state = 'active'
    );
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_exclusions enable row level security;
alter table public.draws enable row level security;
alter table public.assignments enable row level security;
alter table public.gift_ideas enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_self
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy profiles_update_self
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy groups_select_members
on public.groups for select to authenticated
using (public.is_group_member(id));

create policy groups_insert_owner
on public.groups for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy group_members_select_members
on public.group_members for select to authenticated
using (
  public.is_group_member(group_id)
  or user_id = (select auth.uid())
);

create policy group_exclusions_select_members
on public.group_exclusions for select to authenticated
using (
  public.can_manage_group_exclusion(group_id, giver_member_id)
);

create policy group_exclusions_insert_authorized
on public.group_exclusions for insert to authenticated
with check (
  public.can_manage_group_exclusion(group_id, giver_member_id)
);

create policy group_exclusions_update_authorized
on public.group_exclusions for update to authenticated
using (public.can_manage_group_exclusion(group_id, giver_member_id))
with check (public.can_manage_group_exclusion(group_id, giver_member_id));

create policy group_exclusions_delete_authorized
on public.group_exclusions for delete to authenticated
using (public.can_manage_group_exclusion(group_id, giver_member_id));

create policy draws_select_members
on public.draws for select to authenticated
using (public.is_group_member(group_id));

create policy assignments_select_only_giver
on public.assignments for select to authenticated
using (public.is_assignment_giver(draw_id, giver_member_id));

create policy gift_ideas_select_assigned_giver
on public.gift_ideas for select to authenticated
using (public.can_view_gift_idea(group_id, member_id));

create policy gift_ideas_insert_owner
on public.gift_ideas for insert to authenticated
with check (public.can_manage_gift_idea(group_id, member_id));

create policy gift_ideas_update_owner
on public.gift_ideas for update to authenticated
using (public.can_manage_gift_idea(group_id, member_id))
with check (public.can_manage_gift_idea(group_id, member_id));

create policy gift_ideas_delete_owner
on public.gift_ideas for delete to authenticated
using (public.can_manage_gift_idea(group_id, member_id));

create policy notifications_select_recipient
on public.notifications for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  and (group_id is null or public.is_group_member(group_id))
);

revoke all on public.profiles,
  public.groups,
  public.group_members,
  public.group_invitations,
  public.group_exclusions,
  public.draws,
  public.assignments,
  public.gift_ideas,
  public.notifications
from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.groups to authenticated;
grant select on public.group_members, public.draws, public.assignments, public.notifications
to authenticated;
grant select, insert, update, delete on public.group_exclusions, public.gift_ideas
to authenticated;
grant all on public.profiles,
  public.groups,
  public.group_members,
  public.group_invitations,
  public.group_exclusions,
  public.draws,
  public.assignments,
  public.gift_ideas,
  public.notifications
to service_role;

create table public.guest_draws (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  payload_hash text not null check (char_length(payload_hash) = 64),
  event_date date,
  locale text not null check (locale in ('es', 'en')),
  state text not null default 'pending_delivery'
    check (state in ('pending_delivery', 'ready', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index guest_draws_expiry_idx on public.guest_draws (expires_at);

create table public.guest_participants (
  id uuid primary key,
  draw_id uuid not null references public.guest_draws (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254),
  access_token_hash text not null check (char_length(access_token_hash) = 64),
  delivery_state public.notification_state not null default 'queued',
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  delivery_claimed_at timestamptz,
  delivery_claim_token uuid,
  last_delivery_error text check (
    last_delivery_error is null or char_length(last_delivery_error) <= 80
  ),
  sent_at timestamptz,
  check ((delivery_claimed_at is null) = (delivery_claim_token is null)),
  unique (draw_id, id),
  unique (draw_id, access_token_hash)
);

create unique index guest_participants_email_unique
on public.guest_participants (draw_id, lower(email));

create table public.guest_exclusions (
  draw_id uuid not null,
  giver_id uuid not null,
  excluded_id uuid not null,
  primary key (draw_id, giver_id, excluded_id),
  check (giver_id <> excluded_id),
  foreign key (draw_id, giver_id)
    references public.guest_participants (draw_id, id) on delete cascade,
  foreign key (draw_id, excluded_id)
    references public.guest_participants (draw_id, id) on delete cascade
);

create table public.guest_assignments (
  draw_id uuid not null,
  giver_id uuid not null,
  receiver_id uuid not null,
  primary key (draw_id, giver_id),
  unique (draw_id, receiver_id),
  check (giver_id <> receiver_id),
  foreign key (draw_id, giver_id)
    references public.guest_participants (draw_id, id) on delete cascade,
  foreign key (draw_id, receiver_id)
    references public.guest_participants (draw_id, id) on delete cascade
);

create table public.guest_draw_rate_limits (
  key_hash text primary key check (char_length(key_hash) = 64),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

create table public.guest_email_daily_usage (
  usage_date date primary key,
  reserved_messages integer not null check (reserved_messages >= 0),
  updated_at timestamptz not null default now()
);

alter table public.guest_draws enable row level security;
alter table public.guest_participants enable row level security;
alter table public.guest_exclusions enable row level security;
alter table public.guest_assignments enable row level security;
alter table public.guest_draw_rate_limits enable row level security;
alter table public.guest_email_daily_usage enable row level security;

revoke all on public.guest_draws,
  public.guest_participants,
  public.guest_exclusions,
  public.guest_assignments,
  public.guest_draw_rate_limits,
  public.guest_email_daily_usage
from anon, authenticated;

grant all on public.guest_draws,
  public.guest_participants,
  public.guest_exclusions,
  public.guest_assignments,
  public.guest_draw_rate_limits,
  public.guest_email_daily_usage
to service_role;

create function public.consume_guest_draw_rate_limit(
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key_hash is null
    or p_max_requests is null
    or p_window_seconds is null
    or char_length(p_key_hash) <> 64
    or p_max_requests < 1
    or p_window_seconds < 60
    or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_parameters' using errcode = '22023';
  end if;

  insert into public.guest_draw_rate_limits as current_limit (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update
  set
    window_started_at = case
      when current_limit.window_started_at
        + make_interval(secs => p_window_seconds) <= now()
      then now()
      else current_limit.window_started_at
    end,
    request_count = case
      when current_limit.window_started_at
        + make_interval(secs => p_window_seconds) <= now()
      then 1
      else current_limit.request_count + 1
    end,
    updated_at = now()
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

create function public.reserve_guest_email_quota(p_amount integer default 1)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved integer;
  v_usage_date date := (now() at time zone 'UTC')::date;
begin
  if p_amount is null or p_amount < 1 or p_amount > 50 then
    raise exception 'invalid_email_quota_amount' using errcode = '22023';
  end if;

  insert into public.guest_email_daily_usage as current_usage (
    usage_date,
    reserved_messages,
    updated_at
  )
  values (v_usage_date, p_amount, now())
  on conflict (usage_date) do update
  set
    reserved_messages =
      current_usage.reserved_messages + excluded.reserved_messages,
    updated_at = now()
  where current_usage.reserved_messages + excluded.reserved_messages <= 400
  returning reserved_messages into v_reserved;

  return v_reserved is not null;
end;
$$;

create function public.create_guest_draw(
  p_request_id uuid,
  p_payload_hash text,
  p_event_date date,
  p_locale text,
  p_expires_at timestamptz,
  p_participants jsonb,
  p_exclusions jsonb,
  p_assignments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_existing_hash text;
  v_draw_id uuid;
  v_participant_count integer;
  v_assignment_count integer;
  v_distinct_givers integer;
  v_distinct_receivers integer;
begin
  if p_request_id is null
    or char_length(p_payload_hash) is distinct from 64
    or p_locale is null
    or p_locale not in ('es', 'en')
    or p_expires_at is null
    or p_expires_at <= now()
    or jsonb_typeof(p_participants) is distinct from 'array'
    or jsonb_typeof(p_exclusions) is distinct from 'array'
    or jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'invalid_guest_draw' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id::text));

  select gd.id, gd.payload_hash
  into v_existing_id, v_existing_hash
  from public.guest_draws as gd
  where gd.request_id = p_request_id;

  if found then
    if v_existing_hash <> p_payload_hash then
      raise exception 'idempotency_key_conflict' using errcode = '22023';
    end if;

    return v_existing_id;
  end if;

  select count(*) into v_participant_count
  from jsonb_array_elements(p_participants);

  if v_participant_count < 2 or v_participant_count > 50 then
    raise exception 'invalid_participant_count' using errcode = '22023';
  end if;

  select
    count(*),
    count(distinct (assignment.value ->> 'giver_id')::uuid),
    count(distinct (assignment.value ->> 'receiver_id')::uuid)
  into v_assignment_count, v_distinct_givers, v_distinct_receivers
  from jsonb_array_elements(p_assignments) as assignment(value);

  if v_assignment_count <> v_participant_count
    or v_distinct_givers <> v_participant_count
    or v_distinct_receivers <> v_participant_count then
    raise exception 'invalid_assignment_count' using errcode = '22023';
  end if;

  insert into public.guest_draws (
    id,
    request_id,
    payload_hash,
    event_date,
    locale,
    expires_at
  )
  values (
    p_request_id,
    p_request_id,
    p_payload_hash,
    p_event_date,
    p_locale,
    p_expires_at
  )
  returning id into v_draw_id;

  insert into public.guest_participants (
    id,
    draw_id,
    display_name,
    email,
    access_token_hash
  )
  select
    (participant.value ->> 'id')::uuid,
    v_draw_id,
    participant.value ->> 'display_name',
    lower(btrim(participant.value ->> 'email')),
    participant.value ->> 'access_token_hash'
  from jsonb_array_elements(p_participants) as participant(value);

  insert into public.guest_exclusions (draw_id, giver_id, excluded_id)
  select
    v_draw_id,
    (exclusion.value ->> 'giver_id')::uuid,
    (exclusion.value ->> 'excluded_id')::uuid
  from jsonb_array_elements(p_exclusions) as exclusion(value);

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments)
      as assignment(giver_id uuid, receiver_id uuid)
    where assignment.giver_id = assignment.receiver_id
      or exists (
        select 1
        from jsonb_to_recordset(p_exclusions)
          as exclusion(giver_id uuid, excluded_id uuid)
        where exclusion.giver_id = assignment.giver_id
          and exclusion.excluded_id = assignment.receiver_id
      )
  ) then
    raise exception 'assignment_violates_constraints' using errcode = '22023';
  end if;

  insert into public.guest_assignments (draw_id, giver_id, receiver_id)
  select
    v_draw_id,
    (assignment.value ->> 'giver_id')::uuid,
    (assignment.value ->> 'receiver_id')::uuid
  from jsonb_array_elements(p_assignments) as assignment(value);

  return v_draw_id;
end;
$$;

create function public.get_guest_draw_delivery(
  p_draw_id uuid,
  p_claim_token uuid
)
returns table (
  participant_id uuid,
  display_name text,
  email text,
  assigned_name text,
  delivery_state public.notification_state,
  claimed_by_request boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_draw_id is null or p_claim_token is null then
    raise exception 'invalid_guest_delivery_claim' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select giver.draw_id, giver.id
    from public.guest_participants as giver
    join public.guest_draws as draw on draw.id = giver.draw_id
    where giver.draw_id = p_draw_id
      and draw.expires_at > now()
      and giver.delivery_state in ('queued', 'failed')
      and (
        giver.delivery_claimed_at is null
        or giver.delivery_claimed_at < now() - interval '15 minutes'
      )
    order by giver.id
    for update of giver skip locked
  ),
  claimed as (
    update public.guest_participants as giver
    set
      delivery_claimed_at = now(),
      delivery_claim_token = p_claim_token
    from candidates
    where giver.draw_id = candidates.draw_id
      and giver.id = candidates.id
    returning giver.draw_id, giver.id as participant_id
  )
  select
    giver.id,
    giver.display_name,
    giver.email,
    receiver.display_name,
    giver.delivery_state,
    claimed.participant_id is not null
  from public.guest_participants as giver
  join public.guest_assignments as assignment
    on assignment.draw_id = giver.draw_id
    and assignment.giver_id = giver.id
  join public.guest_participants as receiver
    on receiver.draw_id = assignment.draw_id
    and receiver.id = assignment.receiver_id
  join public.guest_draws as draw
    on draw.id = giver.draw_id
  left join claimed
    on claimed.draw_id = giver.draw_id
    and claimed.participant_id = giver.id
  where giver.draw_id = p_draw_id
    and draw.expires_at > now();
end;
$$;

create function public.get_pending_guest_deliveries(
  p_claim_token uuid,
  p_limit integer default 50
)
returns table (
  draw_id uuid,
  participant_id uuid,
  display_name text,
  email text,
  assigned_name text,
  locale text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_claim_token is null then
    raise exception 'invalid_guest_delivery_claim' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select giver.draw_id, giver.id
    from public.guest_draws as draw
    join public.guest_participants as giver on giver.draw_id = draw.id
    where draw.state = 'pending_delivery'
      and draw.expires_at > now()
      and giver.delivery_state in ('queued', 'failed')
      and giver.delivery_attempts < 5
      and (
        giver.delivery_claimed_at is null
        or giver.delivery_claimed_at < now() - interval '15 minutes'
      )
    order by draw.created_at, giver.id
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update of giver skip locked
  ),
  claimed as (
    update public.guest_participants as giver
    set
      delivery_claimed_at = now(),
      delivery_claim_token = p_claim_token
    from candidates
    where giver.draw_id = candidates.draw_id
      and giver.id = candidates.id
    returning giver.draw_id, giver.id as participant_id
  )
  select
    draw.id,
    giver.id,
    giver.display_name,
    giver.email,
    receiver.display_name,
    draw.locale
  from claimed
  join public.guest_draws as draw on draw.id = claimed.draw_id
  join public.guest_participants as giver
    on giver.draw_id = claimed.draw_id
    and giver.id = claimed.participant_id
  join public.guest_assignments as assignment
    on assignment.draw_id = giver.draw_id
    and assignment.giver_id = giver.id
  join public.guest_participants as receiver
    on receiver.draw_id = assignment.draw_id
    and receiver.id = assignment.receiver_id;
$$;

create function public.get_guest_assignment(p_token_hash text)
returns table (
  draw_id uuid,
  participant_id uuid,
  display_name text,
  email text,
  assigned_name text,
  event_date date,
  locale text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    giver.draw_id,
    giver.id,
    giver.display_name,
    giver.email,
    receiver.display_name,
    draw.event_date,
    draw.locale,
    draw.expires_at
  from public.guest_participants as giver
  join public.guest_assignments as assignment
    on assignment.draw_id = giver.draw_id
    and assignment.giver_id = giver.id
  join public.guest_participants as receiver
    on receiver.draw_id = assignment.draw_id
    and receiver.id = assignment.receiver_id
  join public.guest_draws as draw
    on draw.id = giver.draw_id
  where giver.access_token_hash = p_token_hash
    and draw.expires_at > now()
    and draw.state <> 'expired';
$$;

create function public.mark_guest_notification_sent(
  p_draw_id uuid,
  p_participant_id uuid,
  p_claim_token uuid,
  p_delivery_state public.notification_state,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_claim_token is null
    or p_delivery_state is null
    or p_delivery_state not in ('sent', 'failed') then
    raise exception 'invalid_delivery_state' using errcode = '22023';
  end if;

  update public.guest_participants
  set
    delivery_state = p_delivery_state,
    delivery_attempts = delivery_attempts + 1,
    delivery_claimed_at = null,
    delivery_claim_token = null,
    last_delivery_error = case
      when p_delivery_state = 'failed'
      then left(coalesce(p_error_code, 'delivery_failed'), 80)
      else null
    end,
    sent_at = case when p_delivery_state = 'sent' then now() else sent_at end
  where draw_id = p_draw_id
    and id = p_participant_id
    and delivery_claim_token = p_claim_token;

  if not found then
    return;
  end if;

  update public.guest_draws as draw
  set state = case
    when not exists (
      select 1
      from public.guest_participants as participant
      where participant.draw_id = p_draw_id
        and participant.delivery_state <> 'sent'
    ) then 'ready'
    else 'pending_delivery'
  end
  where draw.id = p_draw_id;
end;
$$;

create function public.release_guest_delivery_claims(p_claim_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer;
begin
  if p_claim_token is null then
    raise exception 'invalid_guest_delivery_claim' using errcode = '22023';
  end if;

  update public.guest_participants
  set
    delivery_claimed_at = null,
    delivery_claim_token = null
  where delivery_claim_token = p_claim_token
    and delivery_state in ('queued', 'failed');
  get diagnostics v_released = row_count;

  return v_released;
end;
$$;
create function public.purge_expired_guest_draws()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.guest_draws
  where expires_at <= now();
  get diagnostics v_deleted = row_count;

  delete from public.guest_draw_rate_limits
  where updated_at < now() - interval '2 days';

  delete from public.guest_email_daily_usage
  where usage_date < (now() at time zone 'UTC')::date - 14;

  return v_deleted;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_auth_user_created() from public, anon, authenticated;
revoke all on function public.add_group_owner_as_member() from public, anon, authenticated;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_organizer(uuid) from public, anon;
revoke all on function public.can_manage_group_exclusion(uuid, uuid) from public, anon;
revoke all on function public.is_assignment_giver(uuid, uuid) from public, anon;
revoke all on function public.can_manage_gift_idea(uuid, uuid) from public, anon;
revoke all on function public.can_view_gift_idea(uuid, uuid) from public, anon;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_organizer(uuid) to authenticated;
grant execute on function public.can_manage_group_exclusion(uuid, uuid) to authenticated;
grant execute on function public.is_assignment_giver(uuid, uuid) to authenticated;
grant execute on function public.can_manage_gift_idea(uuid, uuid) to authenticated;
grant execute on function public.can_view_gift_idea(uuid, uuid) to authenticated;

revoke all on function public.consume_guest_draw_rate_limit(text, integer, integer)
from public, anon, authenticated;
revoke all on function public.reserve_guest_email_quota(integer)
from public, anon, authenticated;
revoke all on function public.create_guest_draw(uuid, text, date, text, timestamptz, jsonb, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.get_guest_draw_delivery(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.get_pending_guest_deliveries(uuid, integer)
from public, anon, authenticated;
revoke all on function public.get_guest_assignment(text)
from public, anon, authenticated;
revoke all on function public.mark_guest_notification_sent(uuid, uuid, uuid, public.notification_state, text)
from public, anon, authenticated;
revoke all on function public.release_guest_delivery_claims(uuid)
from public, anon, authenticated;
revoke all on function public.purge_expired_guest_draws()
from public, anon, authenticated;

grant execute on function public.consume_guest_draw_rate_limit(text, integer, integer)
to service_role;
grant execute on function public.reserve_guest_email_quota(integer)
to service_role;
grant execute on function public.create_guest_draw(uuid, text, date, text, timestamptz, jsonb, jsonb, jsonb)
to service_role;
grant execute on function public.get_guest_draw_delivery(uuid, uuid)
to service_role;
grant execute on function public.get_pending_guest_deliveries(uuid, integer)
to service_role;
grant execute on function public.get_guest_assignment(text)
to service_role;
grant execute on function public.mark_guest_notification_sent(uuid, uuid, uuid, public.notification_state, text)
to service_role;
grant execute on function public.release_guest_delivery_claims(uuid)
to service_role;
grant execute on function public.purge_expired_guest_draws()
to service_role;
