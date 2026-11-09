alter table public.groups
  add column exclusions_enabled boolean not null default false,
  add column locale text not null default 'es'
    check (locale in ('es', 'en')),
  add column last_activity_at timestamptz not null default now();

alter table public.gift_ideas
  add constraint gift_ideas_url_http_check
  check (
    url is null
    or url ~* '^https?://[^[:space:]]+$'
  )
  not valid;
update public.groups as group_record
set exclusions_enabled = true
where exists (
  select 1
  from public.group_exclusions as exclusion
  where exclusion.group_id = group_record.id
);

alter table public.group_invitations
  add column member_id uuid,
  add column delivery_state public.notification_state not null default 'queued';

update public.group_invitations as invitation
set member_id = member.id
from public.group_members as member
where member.group_id = invitation.group_id
  and lower(member.email) = lower(invitation.email)
  and invitation.member_id is null;

alter table public.group_invitations
  add constraint group_invitations_member_fk
  foreign key (group_id, member_id)
  references public.group_members (group_id, id)
  on delete cascade;

with ranked_exclusions as (
  select
    ctid,
    row_number() over (
      partition by group_id, giver_member_id
      order by created_at desc, excluded_member_id
    ) as row_number
  from public.group_exclusions
)
delete from public.group_exclusions as exclusion
using ranked_exclusions as ranked
where exclusion.ctid = ranked.ctid
  and ranked.row_number > 1;

create unique index group_exclusions_one_per_giver
on public.group_exclusions (group_id, giver_member_id);

create table public.group_activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_member_id uuid references public.group_members (id) on delete set null,
  actor_display_name text not null,
  event_type text not null check (
    event_type in (
      'group_created',
      'group_updated',
      'group_cancelled',
      'member_invited',
      'member_accepted',
      'member_declined',
      'member_removed',
      'member_left',
      'exclusion_updated',
      'draw_completed',
      'draw_cancelled',
      'gift_idea_changed'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index group_activity_group_created_idx
on public.group_activity (group_id, created_at desc);

create table public.group_email_outbox (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  draw_id uuid,
  invitation_id uuid references public.group_invitations (id) on delete cascade,
  member_id uuid references public.group_members (id) on delete cascade,
  kind text not null check (kind in ('invitation', 'draw_result')),
  recipient_email text not null check (
    char_length(recipient_email) between 3 and 254
  ),
  recipient_name text not null check (
    char_length(btrim(recipient_name)) between 1 and 80
  ),
  locale text not null check (locale in ('es', 'en')),
  payload jsonb not null default '{}'::jsonb,
  state public.notification_state not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 80),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((claim_token is null) = (claimed_at is null)),
  check (
    (kind = 'invitation' and invitation_id is not null and draw_id is null
      and member_id is not null)
    or (kind = 'draw_result' and invitation_id is null and draw_id is not null
      and member_id is not null)
  ),
  foreign key (draw_id, group_id)
    references public.draws (id, group_id) on delete cascade
);

create unique index group_email_outbox_invitation_unique
on public.group_email_outbox (invitation_id)
where kind = 'invitation';

create unique index group_email_outbox_draw_recipient_unique
on public.group_email_outbox (draw_id, member_id)
where kind = 'draw_result';

create index group_email_outbox_pending_idx
on public.group_email_outbox (available_at, created_at)
where state in ('queued', 'failed');

alter table public.group_activity enable row level security;
alter table public.group_email_outbox enable row level security;

drop policy if exists group_members_select_members on public.group_members;
revoke all on public.group_members from public, anon, authenticated;

drop policy if exists group_exclusions_select_members
on public.group_exclusions;
create policy group_exclusions_select_members
on public.group_exclusions for select to authenticated
using (public.is_group_member(group_id));

revoke insert, update, delete on public.groups
from public, anon, authenticated;
grant select on public.groups to authenticated;

revoke insert, update, delete on public.group_exclusions
from public, anon, authenticated;
grant select on public.group_exclusions to authenticated;

revoke all on public.group_invitations, public.group_activity,
  public.group_email_outbox
from public, anon, authenticated;
grant select on public.group_activity to authenticated;
grant all on public.group_invitations, public.group_activity,
  public.group_email_outbox
to service_role;

create policy group_activity_select_members
on public.group_activity for select to authenticated
using (public.is_group_member(group_id));

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_activity'
  ) then
    execute 'alter publication supabase_realtime add table public.group_activity';
  end if;
end;
$$;

create or replace function public.can_manage_gift_idea(
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
    from public.group_members as member
    join public.groups as group_record on group_record.id = member.group_id
    where member.group_id = p_group_id
      and member.id = p_member_id
      and member.user_id = (select auth.uid())
      and member.state = 'active'
      and group_record.state <> 'cancelled'
  );
$$;

create or replace function public.can_view_gift_idea(
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
      from public.draws as draw
      join public.assignments as assignment on assignment.draw_id = draw.id
      join public.group_members as giver on giver.id = assignment.giver_member_id
      join public.groups as group_record on group_record.id = draw.group_id
      where draw.group_id = p_group_id
        and draw.state = 'completed'
        and group_record.state <> 'cancelled'
        and assignment.receiver_member_id = p_member_id
        and giver.user_id = (select auth.uid())
        and giver.state = 'active'
    );
$$;

create function public.record_group_activity(
  p_group_id uuid,
  p_actor_member_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_activity_at timestamptz;
begin
  select member.display_name
  into v_actor_name
  from public.group_members as member
  where member.group_id = p_group_id
    and member.id = p_actor_member_id;

  update public.groups
  set last_activity_at = greatest(last_activity_at, clock_timestamp())
  where id = p_group_id
  returning last_activity_at into v_activity_at;

  insert into public.group_activity (
    group_id,
    actor_member_id,
    actor_display_name,
    event_type,
    details,
    created_at
  )
  values (
    p_group_id,
    p_actor_member_id,
    coalesce(nullif(v_actor_name, ''), 'Remigo'),
    p_event_type,
    coalesce(p_details, '{}'::jsonb),
    v_activity_at
  );
end;
$$;

create function public.touch_group_activity_on_gift_idea_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_member_id uuid;
  v_actor_member_id uuid;
begin
  if tg_op = 'DELETE' then
    v_group_id := old.group_id;
    v_member_id := old.member_id;
  else
    v_group_id := new.group_id;
    v_member_id := new.member_id;
  end if;

  select member.id into v_actor_member_id
  from public.group_members as member
  where member.group_id = v_group_id
    and member.id = v_member_id
    and member.user_id = (select auth.uid())
    and member.state = 'active';

  perform public.record_group_activity(
    v_group_id,
    v_actor_member_id,
    'gift_idea_changed',
    jsonb_build_object('member_id', v_member_id)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger gift_ideas_touch_group_activity
after insert or update or delete on public.gift_ideas
for each row execute function public.touch_group_activity_on_gift_idea_change();
create function public.create_group(
  p_name text,
  p_event_date date default null,
  p_minimum_budget numeric default null,
  p_maximum_budget numeric default null,
  p_locale text default 'es',
  p_exclusions_enabled boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_owner_member_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  if p_locale is null or p_locale not in ('es', 'en') then
    raise exception 'invalid_locale' using errcode = '22023';
  end if;
  if p_minimum_budget < 0 or p_maximum_budget < 0
    or (p_minimum_budget is not null and p_maximum_budget is not null
      and p_minimum_budget > p_maximum_budget) then
    raise exception 'invalid_budget' using errcode = '22023';
  end if;

  insert into public.groups (
    owner_id,
    name,
    state,
    minimum_budget,
    maximum_budget,
    currency,
    event_date,
    exclusions_enabled,
    locale
  )
  values (
    (select auth.uid()),
    btrim(p_name),
    'open',
    p_minimum_budget,
    p_maximum_budget,
    'EUR',
    p_event_date,
    coalesce(p_exclusions_enabled, false),
    p_locale
  )
  returning id into v_group_id;

  select member.id
  into v_owner_member_id
  from public.group_members as member
  where member.group_id = v_group_id
    and member.user_id = (select auth.uid())
    and member.role = 'organizer';

  perform public.record_group_activity(
    v_group_id,
    v_owner_member_id,
    'group_created',
    jsonb_build_object('name', btrim(p_name))
  );

  return v_group_id;
end;
$$;

create function public.update_group_settings(
  p_group_id uuid,
  p_name text,
  p_event_date date,
  p_minimum_budget numeric,
  p_maximum_budget numeric,
  p_locale text,
  p_exclusions_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.group_state;
  v_actor_member_id uuid;
begin
  select group_record.state
  into v_state
  from public.groups as group_record
  where group_record.id = p_group_id
  for update;

  if not found or not public.is_group_organizer(p_group_id) then
    raise exception 'group_not_found_or_forbidden' using errcode = '42501';
  end if;
  if v_state not in ('setup', 'open') then
    raise exception 'group_is_locked' using errcode = '55000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  if p_locale not in ('es', 'en') then
    raise exception 'invalid_locale' using errcode = '22023';
  end if;
  if p_minimum_budget < 0 or p_maximum_budget < 0
    or (p_minimum_budget is not null and p_maximum_budget is not null
      and p_minimum_budget > p_maximum_budget) then
    raise exception 'invalid_budget' using errcode = '22023';
  end if;

  update public.groups
  set
    name = btrim(p_name),
    event_date = p_event_date,
    minimum_budget = p_minimum_budget,
    maximum_budget = p_maximum_budget,
    locale = p_locale,
    exclusions_enabled = coalesce(p_exclusions_enabled, false)
  where id = p_group_id;

  if not coalesce(p_exclusions_enabled, false) then
    delete from public.group_exclusions
    where group_id = p_group_id;
  end if;

  select member.id into v_actor_member_id
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = (select auth.uid())
    and member.role = 'organizer'
    and member.state = 'active';

  perform public.record_group_activity(
    p_group_id,
    v_actor_member_id,
    'group_updated',
    jsonb_build_object(
      'name', btrim(p_name),
      'minimum_budget', p_minimum_budget,
      'maximum_budget', p_maximum_budget,
      'exclusions_enabled', coalesce(p_exclusions_enabled, false)
    )
  );
end;
$$;

create function public.cancel_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.group_state;
  v_actor_member_id uuid;
begin
  select group_record.state
  into v_state
  from public.groups as group_record
  where group_record.id = p_group_id
  for update;

  if not found or not public.is_group_organizer(p_group_id) then
    raise exception 'group_not_found_or_forbidden' using errcode = '42501';
  end if;
  if v_state = 'drawn' then
    raise exception 'cancel_draw_before_cancelling_group' using errcode = '55000';
  end if;
  if v_state = 'cancelled' then
    return;
  end if;

  update public.groups set state = 'cancelled' where id = p_group_id;
  update public.group_invitations
  set state = 'revoked', responded_at = now()
  where group_id = p_group_id and state = 'pending';
  update public.group_members
  set state = 'left'
  where group_id = p_group_id and state = 'invited';
  update public.group_email_outbox
  set state = 'failed', last_error = 'group_cancelled',
      claim_token = null, claimed_at = null
  where group_id = p_group_id and kind = 'invitation'
    and state in ('queued', 'failed');

  select member.id into v_actor_member_id
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = (select auth.uid())
    and member.role = 'organizer';

  perform public.record_group_activity(
    p_group_id,
    v_actor_member_id,
    'group_cancelled',
    '{}'::jsonb
  );
end;
$$;

create function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_role public.group_member_role;
  v_state public.group_state;
begin
  select group_record.state into v_state
  from public.groups as group_record
  where group_record.id = p_group_id
  for update;

  select member.id, member.role
  into v_member_id, v_role
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = (select auth.uid())
    and member.state = 'active'
  for update;

  if v_member_id is null then
    raise exception 'active_membership_required' using errcode = '42501';
  end if;
  if v_role = 'organizer' then
    raise exception 'organizer_cannot_leave_group' using errcode = '55000';
  end if;
  if v_state not in ('setup', 'open') then
    raise exception 'group_is_locked' using errcode = '55000';
  end if;

  update public.group_members set state = 'left' where id = v_member_id;
  delete from public.group_exclusions
  where group_id = p_group_id
    and (giver_member_id = v_member_id or excluded_member_id = v_member_id);

  perform public.record_group_activity(
    p_group_id,
    v_member_id,
    'member_left',
    jsonb_build_object('member_id', v_member_id)
  );
end;
$$;

create function public.remove_group_member(
  p_group_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.group_state;
  v_target_role public.group_member_role;
  v_actor_member_id uuid;
begin
  select group_record.state into v_state
  from public.groups as group_record
  where group_record.id = p_group_id
  for update;

  if not found or not public.is_group_organizer(p_group_id) then
    raise exception 'group_not_found_or_forbidden' using errcode = '42501';
  end if;
  if v_state not in ('setup', 'open') then
    raise exception 'group_is_locked' using errcode = '55000';
  end if;

  select member.role into v_target_role
  from public.group_members as member
  where member.group_id = p_group_id
    and member.id = p_member_id
    and member.state in ('active', 'invited')
  for update;

  if not found or v_target_role = 'organizer' then
    raise exception 'member_not_removable' using errcode = '22023';
  end if;

  update public.group_members set state = 'left' where id = p_member_id;
  update public.group_invitations
  set state = 'revoked', responded_at = now()
  where member_id = p_member_id and state = 'pending';
  update public.group_email_outbox
  set state = 'failed', last_error = 'invitation_revoked',
      claim_token = null, claimed_at = null
  where member_id = p_member_id and kind = 'invitation'
    and state in ('queued', 'failed');
  delete from public.group_exclusions
  where group_id = p_group_id
    and (giver_member_id = p_member_id or excluded_member_id = p_member_id);

  select member.id into v_actor_member_id
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = (select auth.uid())
    and member.role = 'organizer'
    and member.state = 'active';

  perform public.record_group_activity(
    p_group_id,
    v_actor_member_id,
    'member_removed',
    jsonb_build_object('member_id', p_member_id)
  );
end;
$$;

create function public.set_group_exclusion(
  p_group_id uuid,
  p_giver_member_id uuid,
  p_excluded_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id uuid;
  v_giver_member_id uuid;
  v_is_organizer boolean;
  v_enabled boolean;
  v_state public.group_state;
begin
  select group_record.exclusions_enabled, group_record.state
  into v_enabled, v_state
  from public.groups as group_record
  where group_record.id = p_group_id
  for update;

  if not found or not public.is_group_member(p_group_id) then
    raise exception 'active_membership_required' using errcode = '42501';
  end if;
  if not v_enabled then
    raise exception 'exclusions_disabled' using errcode = '55000';
  end if;
  if v_state not in ('setup', 'open') then
    raise exception 'group_is_locked' using errcode = '55000';
  end if;

  select member.id, member.role = 'organizer'
  into v_actor_member_id, v_is_organizer
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = (select auth.uid())
    and member.state = 'active';

  if p_giver_member_id is null then
    v_giver_member_id := v_actor_member_id;
  else
    v_giver_member_id := p_giver_member_id;
  end if;

  if v_giver_member_id is null
    or (not coalesce(v_is_organizer, false)
      and v_giver_member_id <> v_actor_member_id) then
    raise exception 'exclusion_edit_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.group_members as member
    where member.group_id = p_group_id
      and member.id = v_giver_member_id
      and member.state = 'active'
  ) then
    raise exception 'giver_not_active' using errcode = '22023';
  end if;
  if p_excluded_member_id is not null and (
    p_excluded_member_id = v_giver_member_id
    or not exists (
      select 1 from public.group_members as member
      where member.group_id = p_group_id
        and member.id = p_excluded_member_id
        and member.state = 'active'
    )
  ) then
    raise exception 'invalid_exclusion' using errcode = '22023';
  end if;

  delete from public.group_exclusions
  where group_id = p_group_id
    and giver_member_id = v_giver_member_id;
  if p_excluded_member_id is not null then
    insert into public.group_exclusions (
      group_id, giver_member_id, excluded_member_id
    )
    values (p_group_id, v_giver_member_id, p_excluded_member_id);
  end if;

  perform public.record_group_activity(
    p_group_id,
    v_actor_member_id,
    'exclusion_updated',
    jsonb_build_object(
      'giver_member_id', v_giver_member_id,
      'excluded_member_id', p_excluded_member_id
    )
  );
end;
$$;

create function public.get_my_groups()
returns table (
  group_id uuid,
  name text,
  state public.group_state,
  minimum_budget numeric,
  maximum_budget numeric,
  currency text,
  event_date date,
  locale text,
  exclusions_enabled boolean,
  member_role public.group_member_role,
  active_member_count integer,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    group_record.id,
    group_record.name,
    group_record.state,
    group_record.minimum_budget,
    group_record.maximum_budget,
    group_record.currency,
    group_record.event_date,
    group_record.locale,
    group_record.exclusions_enabled,
    member.role,
    (
      select count(*)::integer
      from public.group_members as active_member
      where active_member.group_id = group_record.id
        and active_member.state = 'active'
    ),
    group_record.last_activity_at
  from public.groups as group_record
  join public.group_members as member
    on member.group_id = group_record.id
  where member.user_id = (select auth.uid())
    and member.state = 'active'
  order by group_record.last_activity_at desc;
$$;

create function public.get_group_members(p_group_id uuid)
returns table (
  member_id uuid,
  display_name text,
  role public.group_member_role,
  state public.group_member_state,
  email text,
  invited_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.id,
    member.display_name,
    member.role,
    member.state,
    case
      when public.is_group_organizer(p_group_id) then member.email
      else null
    end,
    member.invited_at,
    member.accepted_at
  from public.group_members as member
  where member.group_id = p_group_id
    and public.is_group_member(p_group_id)
    and (member.state <> 'left' or public.is_group_organizer(p_group_id))
  order by
    case when member.role = 'organizer' then 0 else 1 end,
    member.display_name;
$$;

create function public.get_my_group_membership(p_group_id uuid)
returns table (
  member_id uuid,
  display_name text,
  role public.group_member_role,
  state public.group_member_state
)
language sql
stable
security definer
set search_path = ''
as $$
  select member.id, member.display_name, member.role, member.state
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = (select auth.uid())
    and member.state = 'active';
$$;
create function public.get_group_invitations(p_group_id uuid)
returns table (
  invitation_id uuid,
  member_id uuid,
  email text,
  display_name text,
  state public.invitation_state,
  delivery_state public.notification_state,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invitation.id,
    invitation.member_id,
    invitation.email,
    member.display_name,
    case
      when invitation.state = 'pending' and invitation.expires_at <= now()
        then 'expired'::public.invitation_state
      else invitation.state
    end,
    invitation.delivery_state,
    invitation.created_at,
    invitation.expires_at
  from public.group_invitations as invitation
  join public.group_members as member
    on member.group_id = invitation.group_id
    and member.id = invitation.member_id
  where invitation.group_id = p_group_id
    and public.is_group_organizer(p_group_id)
  order by invitation.created_at desc;
$$;

create function public.get_group_exclusions(p_group_id uuid)
returns table (giver_member_id uuid, excluded_member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select exclusion.giver_member_id, exclusion.excluded_member_id
  from public.group_exclusions as exclusion
  join public.groups as group_record on group_record.id = exclusion.group_id
  where exclusion.group_id = p_group_id
    and group_record.exclusions_enabled
    and public.is_group_member(p_group_id);
$$;

create function public.get_group_activity(
  p_group_id uuid,
  p_limit integer default 50
)
returns table (
  activity_id uuid,
  actor_display_name text,
  event_type text,
  details jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    activity.id,
    activity.actor_display_name,
    activity.event_type,
    activity.details,
    activity.created_at
  from public.group_activity as activity
  where activity.group_id = p_group_id
    and public.is_group_member(p_group_id)
  order by activity.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create function public.get_my_group_assignment(p_group_id uuid)
returns table (
  draw_id uuid,
  assigned_member_id uuid,
  assigned_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select draw.id, receiver.id, receiver.display_name
  from public.draws as draw
  join public.assignments as assignment
    on assignment.draw_id = draw.id
    and assignment.group_id = draw.group_id
  join public.group_members as giver
    on giver.group_id = draw.group_id
    and giver.id = assignment.giver_member_id
  join public.group_members as receiver
    on receiver.group_id = draw.group_id
    and receiver.id = assignment.receiver_member_id
  where draw.group_id = p_group_id
    and draw.state = 'completed'
    and giver.user_id = (select auth.uid())
    and giver.state = 'active'
    and public.is_group_member(p_group_id);
$$;

create function public.get_group_gift_ideas(
  p_group_id uuid,
  p_member_id uuid
)
returns table (
  id uuid,
  title text,
  url text,
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select idea.id, idea.title, idea.url, idea.note,
    idea.created_at, idea.updated_at
  from public.gift_ideas as idea
  where idea.group_id = p_group_id
    and idea.member_id = p_member_id
    and public.can_view_gift_idea(p_group_id, p_member_id);
$$;

create function public.cancel_group_draw(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw_id uuid;
  v_actor_member_id uuid;
begin
  perform 1 from public.groups
  where id = p_group_id and state = 'drawn'
  for update;

  if not found or not public.is_group_organizer(p_group_id) then
    raise exception 'draw_not_cancellable' using errcode = '42501';
  end if;

  select draw.id into v_draw_id
  from public.draws as draw
  where draw.group_id = p_group_id and draw.state = 'completed'
  for update;

  if v_draw_id is null then
    raise exception 'completed_draw_not_found' using errcode = '22023';
  end if;

  delete from public.assignments where draw_id = v_draw_id;
  update public.draws set state = 'cancelled' where id = v_draw_id;
  update public.groups set state = 'open' where id = p_group_id;
  update public.group_email_outbox
  set state = 'failed', last_error = 'draw_cancelled',
      claim_token = null, claimed_at = null
  where draw_id = v_draw_id and state in ('queued', 'failed');
  update public.notifications
  set state = 'failed'
  where group_id = p_group_id
    and kind = 'draw_ready'
    and state = 'queued'
    and payload ->> 'draw_id' = v_draw_id::text;

  select member.id into v_actor_member_id
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = (select auth.uid())
    and member.role = 'organizer'
    and member.state = 'active';

  perform public.record_group_activity(
    p_group_id,
    v_actor_member_id,
    'draw_cancelled',
    jsonb_build_object('draw_id', v_draw_id)
  );
end;
$$;

create function public.issue_group_invitation_service(
  p_invitation_id uuid,
  p_group_id uuid,
  p_actor_id uuid,
  p_email text,
  p_display_name text,
  p_token_hash text
)
returns table (
  invitation_id uuid,
  group_id uuid,
  group_name text,
  recipient_email text,
  recipient_name text,
  locale text,
  expires_at timestamptz,
  outbox_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_member_id uuid;
  v_member_state public.group_member_state;
  v_actor_member_id uuid;
  v_active_and_invited integer;
  v_outbox_id uuid;
  v_normalized_email text := lower(btrim(p_email));
begin
  if p_invitation_id is null
    or p_actor_id is null
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_email is null
    or v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_display_name is null
    or char_length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  select group_record.* into v_group
  from public.groups as group_record
  where group_record.id = p_group_id
  for update;

  if not found
    or v_group.state not in ('setup', 'open')
    or not exists (
      select 1
      from public.group_members as member
      where member.group_id = p_group_id
        and member.user_id = p_actor_id
        and member.role = 'organizer'
        and member.state = 'active'
    ) then
    raise exception 'group_invite_forbidden' using errcode = '42501';
  end if;

  select member.id, member.state
  into v_member_id, v_member_state
  from public.group_members as member
  where member.group_id = p_group_id
    and lower(member.email) = v_normalized_email
  for update;

  if v_member_id is not null and v_member_state = 'active' then
    raise exception 'email_already_in_group' using errcode = '23505';
  end if;

  select count(*)::integer into v_active_and_invited
  from public.group_members as member
  where member.group_id = p_group_id
    and member.state in ('active', 'invited')
    and member.id is distinct from v_member_id;

  if v_active_and_invited >= 50 then
    raise exception 'group_member_limit' using errcode = '22023';
  end if;

  if v_member_id is null then
    insert into public.group_members (
      group_id, email, display_name, role, state
    )
    values (
      p_group_id, v_normalized_email, btrim(p_display_name),
      'participant', 'invited'
    )
    returning id into v_member_id;
  else
    update public.group_members
    set
      email = v_normalized_email,
      display_name = btrim(p_display_name),
      user_id = null,
      role = 'participant',
      state = 'invited',
      invited_at = now(),
      accepted_at = null
    where id = v_member_id;
  end if;

  update public.group_invitations
  set state = 'revoked', responded_at = now()
  where group_id = p_group_id
    and lower(email) = v_normalized_email
    and state = 'pending';

  update public.group_email_outbox
  set state = 'failed', last_error = 'invitation_replaced',
      claim_token = null, claimed_at = null
  where group_id = p_group_id
    and member_id = v_member_id
    and kind = 'invitation'
    and state in ('queued', 'failed');

  insert into public.group_invitations (
    id, group_id, member_id, invited_by, email, token_hash, state,
    delivery_state, expires_at
  )
  values (
    p_invitation_id, p_group_id, v_member_id, p_actor_id,
    v_normalized_email, p_token_hash, 'pending', 'queued',
    now() + interval '14 days'
  );

  insert into public.group_email_outbox (
    group_id, invitation_id, member_id, kind,
    recipient_email, recipient_name, locale, payload
  )
  values (
    p_group_id, p_invitation_id, v_member_id, 'invitation',
    v_normalized_email, btrim(p_display_name), v_group.locale,
    jsonb_build_object('group_name', v_group.name)
  )
  returning id into v_outbox_id;

  select member.id into v_actor_member_id
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = p_actor_id
    and member.role = 'organizer'
    and member.state = 'active';

  perform public.record_group_activity(
    p_group_id,
    v_actor_member_id,
    'member_invited',
    jsonb_build_object(
      'member_id', v_member_id,
      'display_name', btrim(p_display_name)
    )
  );

  return query
  select
    p_invitation_id,
    p_group_id,
    v_group.name,
    v_normalized_email,
    btrim(p_display_name),
    v_group.locale,
    now() + interval '14 days',
    v_outbox_id;
end;
$$;

create function public.preview_group_invitation_service(p_token_hash text)
returns table (
  invitation_id uuid,
  group_id uuid,
  group_name text,
  invited_email text,
  invited_display_name text,
  expires_at timestamptz,
  locale text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invitation.id,
    invitation.group_id,
    group_record.name,
    invitation.email,
    member.display_name,
    invitation.expires_at,
    group_record.locale
  from public.group_invitations as invitation
  join public.groups as group_record on group_record.id = invitation.group_id
  join public.group_members as member
    on member.group_id = invitation.group_id
    and member.id = invitation.member_id
  where invitation.token_hash = p_token_hash
    and invitation.state = 'pending'
    and invitation.expires_at > now()
    and group_record.state in ('setup', 'open');
$$;

create function public.respond_group_invitation_service(
  p_token_hash text,
  p_actor_id uuid,
  p_actor_email text,
  p_accept boolean
)
returns table (group_id uuid, group_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.group_invitations%rowtype;
  v_group_id uuid;
  v_group_name text;
  v_owner_id uuid;
begin
  if p_actor_id is null or p_actor_email is null or p_accept is null then
    raise exception 'invalid_invitation_response' using errcode = '22023';
  end if;

  select invitation.group_id into v_group_id
  from public.group_invitations as invitation
  where invitation.token_hash = p_token_hash
    and invitation.state = 'pending'
    and invitation.expires_at > now();

  if not found then
    raise exception 'invitation_not_found_or_expired' using errcode = '22023';
  end if;

  select group_record.name, group_record.owner_id
  into v_group_name, v_owner_id
  from public.groups as group_record
  where group_record.id = v_group_id
    and group_record.state in ('setup', 'open')
  for update;

  if not found then
    raise exception 'group_not_open' using errcode = '55000';
  end if;

  select invitation.* into v_invitation
  from public.group_invitations as invitation
  where invitation.token_hash = p_token_hash
    and invitation.group_id = v_group_id
    and invitation.state = 'pending'
    and invitation.expires_at > now()
  for update;

  if not found then
    raise exception 'invitation_not_found_or_expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> lower(btrim(p_actor_email)) then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;
  if p_accept and exists (
    select 1 from public.group_members as member
    where member.group_id = v_invitation.group_id
      and member.user_id = p_actor_id
      and member.id <> v_invitation.member_id
      and member.state = 'active'
  ) then
    raise exception 'already_a_group_member' using errcode = '23505';
  end if;

  update public.group_invitations
  set
    state = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now()
  where id = v_invitation.id;

  update public.group_members
  set
    user_id = case when p_accept then p_actor_id else null end,
    state = case when p_accept then 'active' else 'declined' end,
    accepted_at = case when p_accept then now() else null end
  where id = v_invitation.member_id;

  if p_accept then
    insert into public.notifications (
      group_id, recipient_user_id, kind, state, payload
    )
    values (
      v_invitation.group_id,
      v_owner_id,
      'group_update',
      'queued',
      jsonb_build_object('event', 'member_accepted')
    );
  end if;

  perform public.record_group_activity(
    v_invitation.group_id,
    v_invitation.member_id,
    case when p_accept then 'member_accepted' else 'member_declined' end,
    jsonb_build_object('member_id', v_invitation.member_id)
  );

  return query select v_invitation.group_id, v_group_name;
end;
$$;

create function public.get_group_draw_input_service(
  p_group_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
begin
  select group_record.* into v_group
  from public.groups as group_record
  where group_record.id = p_group_id
    and group_record.state in ('setup', 'open')
    and exists (
      select 1
      from public.group_members as member
      where member.group_id = p_group_id
        and member.user_id = p_actor_id
        and member.role = 'organizer'
        and member.state = 'active'
    );

  if not found then
    raise exception 'group_draw_forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'group_id', v_group.id,
    'name', v_group.name,
    'locale', v_group.locale,
    'event_date', v_group.event_date,
    'exclusions_enabled', v_group.exclusions_enabled,
    'last_activity_at', v_group.last_activity_at,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', member.id,
          'display_name', member.display_name,
          'email', member.email
        )
        order by member.id
      )
      from public.group_members as member
      where member.group_id = p_group_id
        and member.state = 'active'
    ), '[]'::jsonb),
    'exclusions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'giver_member_id', exclusion.giver_member_id,
          'excluded_member_id', exclusion.excluded_member_id
        )
        order by exclusion.giver_member_id
      )
      from public.group_exclusions as exclusion
      where exclusion.group_id = p_group_id
    ), '[]'::jsonb)
  );
end;
$$;

create function public.complete_group_draw_service(
  p_group_id uuid,
  p_actor_id uuid,
  p_expected_last_activity_at timestamptz,
  p_assignments jsonb
)
returns table (draw_id uuid, email_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_actor_member_id uuid;
  v_draw_id uuid;
  v_member_count integer;
  v_assignment_count integer;
  v_unique_givers integer;
  v_unique_receivers integer;
  v_email_count integer;
begin
  select group_record.* into v_group
  from public.groups as group_record
  where group_record.id = p_group_id
  for update;

  if not found
    or v_group.state not in ('setup', 'open')
    or not exists (
      select 1
      from public.group_members as member
      where member.group_id = p_group_id
        and member.user_id = p_actor_id
        and member.role = 'organizer'
        and member.state = 'active'
    ) then
    raise exception 'group_draw_forbidden' using errcode = '42501';
  end if;
  if v_group.last_activity_at is distinct from p_expected_last_activity_at then
    raise exception 'group_changed_during_draw' using errcode = '40001';
  end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'invalid_assignments' using errcode = '22023';
  end if;

  select count(*)::integer into v_member_count
  from public.group_members as member
  where member.group_id = p_group_id and member.state = 'active';

  if v_member_count < 3 or v_member_count > 50 then
    raise exception 'invalid_group_member_count' using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(distinct (assignment.value ->> 'giver_member_id')::uuid)::integer,
    count(distinct (assignment.value ->> 'receiver_member_id')::uuid)::integer
  into v_assignment_count, v_unique_givers, v_unique_receivers
  from jsonb_array_elements(p_assignments) as assignment(value);

  if v_assignment_count <> v_member_count
    or v_unique_givers <> v_member_count
    or v_unique_receivers <> v_member_count then
    raise exception 'invalid_assignment_count' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments)
      as assignment(giver_member_id uuid, receiver_member_id uuid)
    where assignment.giver_member_id = assignment.receiver_member_id
      or not exists (
        select 1 from public.group_members as member
        where member.group_id = p_group_id
          and member.id = assignment.giver_member_id
          and member.state = 'active'
      )
      or not exists (
        select 1 from public.group_members as member
        where member.group_id = p_group_id
          and member.id = assignment.receiver_member_id
          and member.state = 'active'
      )
      or exists (
        select 1 from public.group_exclusions as exclusion
        where exclusion.group_id = p_group_id
          and exclusion.giver_member_id = assignment.giver_member_id
          and exclusion.excluded_member_id = assignment.receiver_member_id
      )
  ) then
    raise exception 'assignment_violates_group_rules' using errcode = '22023';
  end if;

  if not v_group.exclusions_enabled and exists (
    select 1 from public.group_exclusions as exclusion
    where exclusion.group_id = p_group_id
  ) then
    raise exception 'exclusions_disabled' using errcode = '22023';
  end if;

  select member.id into v_actor_member_id
  from public.group_members as member
  where member.group_id = p_group_id
    and member.user_id = p_actor_id
    and member.role = 'organizer'
    and member.state = 'active';

  insert into public.draws (group_id, state, started_at)
  values (p_group_id, 'running', now())
  returning id into v_draw_id;

  insert into public.assignments (
    draw_id, group_id, giver_member_id, receiver_member_id
  )
  select
    v_draw_id,
    p_group_id,
    assignment.giver_member_id,
    assignment.receiver_member_id
  from jsonb_to_recordset(p_assignments)
    as assignment(giver_member_id uuid, receiver_member_id uuid);

  update public.draws
  set state = 'completed', completed_at = now()
  where id = v_draw_id;
  update public.groups set state = 'drawn' where id = p_group_id;

  update public.group_invitations
  set state = 'revoked', responded_at = now()
  where group_id = p_group_id and state = 'pending';
  update public.group_members
  set state = 'left', user_id = null
  where group_id = p_group_id and state = 'invited';
  update public.group_email_outbox
  set state = 'failed', last_error = 'invitation_revoked',
      claim_token = null, claimed_at = null
  where group_id = p_group_id
    and kind = 'invitation'
    and state in ('queued', 'failed');

  insert into public.group_email_outbox (
    group_id, draw_id, member_id, kind, recipient_email,
    recipient_name, locale, payload
  )
  select
    p_group_id,
    v_draw_id,
    giver.id,
    'draw_result',
    giver.email,
    giver.display_name,
    v_group.locale,
    jsonb_build_object(
      'group_name', v_group.name,
      'assigned_name', receiver.display_name,
      'event_date', v_group.event_date,
      'minimum_budget', v_group.minimum_budget,
      'maximum_budget', v_group.maximum_budget
    )
  from public.group_members as giver
  join public.assignments as assignment
    on assignment.draw_id = v_draw_id
    and assignment.giver_member_id = giver.id
  join public.group_members as receiver
    on receiver.group_id = p_group_id
    and receiver.id = assignment.receiver_member_id
  where giver.group_id = p_group_id and giver.state = 'active';

  get diagnostics v_email_count = row_count;

  insert into public.notifications (
    group_id, recipient_user_id, kind, state, payload
  )
  select
    p_group_id,
    member.user_id,
    'draw_ready',
    'queued',
    jsonb_build_object('group_id', p_group_id, 'draw_id', v_draw_id)
  from public.group_members as member
  where member.group_id = p_group_id
    and member.state = 'active'
    and member.user_id is not null;

  perform public.record_group_activity(
    p_group_id,
    v_actor_member_id,
    'draw_completed',
    jsonb_build_object('draw_id', v_draw_id)
  );

  return query select v_draw_id, v_email_count;
end;
$$;

create function public.assert_group_invitation_token_service(
  p_invitation_id uuid,
  p_token_hash text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_invitations as invitation
    where invitation.id = p_invitation_id
      and invitation.token_hash = p_token_hash
      and invitation.state = 'pending'
      and invitation.expires_at > now()
  );
$$;

create function public.assert_group_draw_result_delivery_service(
  p_outbox_id uuid,
  p_claim_token uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_email_outbox as delivery
    join public.draws as draw
      on draw.id = delivery.draw_id
      and draw.group_id = delivery.group_id
    join public.groups as group_record
      on group_record.id = delivery.group_id
    where delivery.id = p_outbox_id
      and delivery.kind = 'draw_result'
      and delivery.claim_token = p_claim_token
      and delivery.state in ('queued', 'failed')
      and draw.state = 'completed'
      and group_record.state = 'drawn'
  );
$$;
create function public.claim_group_email_outbox_service(
  p_claim_token uuid,
  p_limit integer default 50,
  p_group_id uuid default null,
  p_outbox_id uuid default null
)
returns table (
  outbox_id uuid,
  kind text,
  group_id uuid,
  draw_id uuid,
  invitation_id uuid,
  member_id uuid,
  recipient_email text,
  recipient_name text,
  locale text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_claim_token is null then
    raise exception 'invalid_group_email_claim' using errcode = '22023';
  end if;

  update public.group_email_outbox as delivery
  set
    state = 'failed',
    last_error = 'invitation_no_longer_pending',
    claim_token = null,
    claimed_at = null
  where delivery.kind = 'invitation'
    and delivery.state in ('queued', 'failed')
    and delivery.claim_token is null
    and not exists (
      select 1 from public.group_invitations as invitation
      where invitation.id = delivery.invitation_id
        and invitation.state = 'pending'
        and invitation.expires_at > now()
    );

  return query
  with candidates as (
    select delivery.id
    from public.group_email_outbox as delivery
    where delivery.state in ('queued', 'failed')
      and delivery.attempts < 5
      and delivery.available_at <= now()
      and (delivery.claimed_at is null
        or delivery.claimed_at < now() - interval '15 minutes')
      and (p_group_id is null or delivery.group_id = p_group_id)
      and (p_outbox_id is null or delivery.id = p_outbox_id)
      and (
        delivery.kind <> 'invitation'
        or exists (
          select 1 from public.group_invitations as invitation
          where invitation.id = delivery.invitation_id
            and invitation.state = 'pending'
            and invitation.expires_at > now()
        )
      )
      and (
        delivery.kind <> 'draw_result'
        or exists (
          select 1 from public.draws as draw
          where draw.id = delivery.draw_id
            and draw.group_id = delivery.group_id
            and draw.state = 'completed'
        )
      )
      order by delivery.created_at, delivery.id
      limit least(greatest(coalesce(p_limit, 50), 1), 50)
      for update of delivery skip locked
  ),
  claimed as (
    update public.group_email_outbox as delivery
    set claim_token = p_claim_token, claimed_at = now()
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select
    claimed.id,
    claimed.kind,
    claimed.group_id,
    claimed.draw_id,
    claimed.invitation_id,
    claimed.member_id,
    claimed.recipient_email,
    claimed.recipient_name,
    claimed.locale,
    claimed.payload
  from claimed;
end;
$$;

create function public.mark_group_email_outbox_service(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_delivery_state public.notification_state,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation_id uuid;
begin
  if p_delivery_state not in ('sent', 'failed') then
    raise exception 'invalid_group_delivery_state' using errcode = '22023';
  end if;
  select delivery.invitation_id
  into v_invitation_id
  from public.group_email_outbox as delivery
  where delivery.id = p_outbox_id
    and delivery.claim_token = p_claim_token;

  if v_invitation_id is not null then
    update public.group_invitations
    set delivery_state = p_delivery_state
    where id = v_invitation_id;
  end if;

  update public.group_email_outbox
  set
    state = p_delivery_state,
    attempts = attempts + 1,
    claim_token = null,
    claimed_at = null,
    last_error = case
      when p_delivery_state = 'failed'
        then left(coalesce(p_error_code, 'delivery_failed'), 80)
      else null
    end,
    available_at = case
      when p_delivery_state = 'failed'
        then now() + make_interval(secs => least(
          3600::double precision,
          (60 * power(2::numeric, least(attempts, 6)))::double precision
        ))
      else available_at
    end,
    sent_at = case when p_delivery_state = 'sent' then now() else sent_at end
  where id = p_outbox_id and claim_token = p_claim_token
  returning invitation_id into v_invitation_id;
end;
$$;

create function public.release_group_email_claims_service(p_claim_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer;
begin
  update public.group_email_outbox
  set claim_token = null, claimed_at = null
  where claim_token = p_claim_token
    and state in ('queued', 'failed');
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

create or replace function public.purge_expired_guest_draws()
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

  update public.group_invitations
  set state = 'expired', responded_at = now()
  where state = 'pending' and expires_at <= now();

  delete from public.groups
  where last_activity_at < now() - interval '18 months';

  return v_deleted;
end;
$$;

revoke all on function public.can_manage_gift_idea(uuid, uuid)
from public, anon;
revoke all on function public.can_view_gift_idea(uuid, uuid)
from public, anon;
grant execute on function public.can_manage_gift_idea(uuid, uuid)
to authenticated;
grant execute on function public.can_view_gift_idea(uuid, uuid)
to authenticated;

revoke all on function public.record_group_activity(uuid, uuid, text, jsonb)
from public, anon, authenticated;
revoke all on function public.touch_group_activity_on_gift_idea_change()
from public, anon, authenticated;
revoke all on function public.create_group(text, date, numeric, numeric, text, boolean)
from public, anon;
revoke all on function public.update_group_settings(uuid, text, date, numeric, numeric, text, boolean)
from public, anon;
revoke all on function public.cancel_group(uuid)
from public, anon;
revoke all on function public.leave_group(uuid)
from public, anon;
revoke all on function public.remove_group_member(uuid, uuid)
from public, anon;
revoke all on function public.set_group_exclusion(uuid, uuid, uuid)
from public, anon;
revoke all on function public.get_my_groups()
from public, anon;
revoke all on function public.get_group_members(uuid)
from public, anon;
revoke all on function public.get_my_group_membership(uuid)
from public, anon;
revoke all on function public.get_group_invitations(uuid)
from public, anon;
revoke all on function public.get_group_exclusions(uuid)
from public, anon;
revoke all on function public.get_group_activity(uuid, integer)
from public, anon;
revoke all on function public.get_my_group_assignment(uuid)
from public, anon;
revoke all on function public.get_group_gift_ideas(uuid, uuid)
from public, anon;
revoke all on function public.cancel_group_draw(uuid)
from public, anon;

grant execute on function public.create_group(text, date, numeric, numeric, text, boolean)
to authenticated;
grant execute on function public.update_group_settings(uuid, text, date, numeric, numeric, text, boolean)
to authenticated;
grant execute on function public.cancel_group(uuid)
to authenticated;
grant execute on function public.leave_group(uuid)
to authenticated;
grant execute on function public.remove_group_member(uuid, uuid)
to authenticated;
grant execute on function public.set_group_exclusion(uuid, uuid, uuid)
to authenticated;
grant execute on function public.get_my_groups()
to authenticated;
grant execute on function public.get_group_members(uuid)
to authenticated;
grant execute on function public.get_my_group_membership(uuid)
to authenticated;
grant execute on function public.get_group_invitations(uuid)
to authenticated;
grant execute on function public.get_group_exclusions(uuid)
to authenticated;
grant execute on function public.get_group_activity(uuid, integer)
to authenticated;
grant execute on function public.get_my_group_assignment(uuid)
to authenticated;
grant execute on function public.get_group_gift_ideas(uuid, uuid)
to authenticated;
grant execute on function public.cancel_group_draw(uuid)
to authenticated;

revoke all on function public.issue_group_invitation_service(uuid, uuid, uuid, text, text, text)
from public, anon, authenticated;
revoke all on function public.preview_group_invitation_service(text)
from public, anon, authenticated;
revoke all on function public.respond_group_invitation_service(text, uuid, text, boolean)
from public, anon, authenticated;
revoke all on function public.get_group_draw_input_service(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.complete_group_draw_service(uuid, uuid, timestamptz, jsonb)
from public, anon, authenticated;
revoke all on function public.assert_group_invitation_token_service(uuid, text)
from public, anon, authenticated;
revoke all on function public.assert_group_draw_result_delivery_service(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.claim_group_email_outbox_service(uuid, integer, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.mark_group_email_outbox_service(uuid, uuid, public.notification_state, text)
from public, anon, authenticated;
revoke all on function public.release_group_email_claims_service(uuid)
from public, anon, authenticated;

grant execute on function public.issue_group_invitation_service(uuid, uuid, uuid, text, text, text)
to service_role;
grant execute on function public.preview_group_invitation_service(text)
to service_role;
grant execute on function public.respond_group_invitation_service(text, uuid, text, boolean)
to service_role;
grant execute on function public.get_group_draw_input_service(uuid, uuid)
to service_role;
grant execute on function public.complete_group_draw_service(uuid, uuid, timestamptz, jsonb)
to service_role;
grant execute on function public.assert_group_invitation_token_service(uuid, text)
to service_role;
grant execute on function public.assert_group_draw_result_delivery_service(uuid, uuid)
to service_role;
grant execute on function public.claim_group_email_outbox_service(uuid, integer, uuid, uuid)
to service_role;
grant execute on function public.mark_group_email_outbox_service(uuid, uuid, public.notification_state, text)
to service_role;
grant execute on function public.release_group_email_claims_service(uuid)
to service_role;
