begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select ok(
  not has_table_privilege('authenticated', 'public.group_members', 'SELECT'),
  'authenticated clients cannot read group member rows directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_group_draw_service(uuid,uuid,timestamptz,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute the server-only draw operation'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_group_draw_service(uuid,uuid,timestamptz,jsonb)',
    'EXECUTE'
  ),
  'the service role can execute the draw operation'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'assignments'
      and policyname = 'assignments_select_only_giver'
      and coalesce(qual, '') like '%is_assignment_giver%'
  ),
  'assignment reads are scoped to the giver policy'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'group_activity'
      and policyname = 'group_activity_select_members'
      and coalesce(qual, '') like '%is_group_member%'
  ),
  'group activity reads are scoped to group members'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gift_ideas'::regclass
      and conname = 'gift_ideas_url_http_check'
  ),
  'gift idea URLs have a server-side HTTP(S) check constraint'
);

insert into auth.users (id, email)
values
  ('11000000-0000-4000-8000-000000000001', 'organizer@group-test.invalid'),
  ('11000000-0000-4000-8000-000000000002', 'mia@group-test.invalid'),
  ('11000000-0000-4000-8000-000000000003', 'noah@group-test.invalid'),
  ('11000000-0000-4000-8000-000000000004', 'outsider@group-test.invalid');

insert into public.groups (
  id, owner_id, name, state, locale, exclusions_enabled
)
values (
  '22000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Group privacy test',
  'open',
  'en',
  false
);

update public.group_members
set
  id = '33000000-0000-4000-8000-000000000001',
  display_name = 'Organizer'
where group_id = '22000000-0000-4000-8000-000000000001'
  and user_id = '11000000-0000-4000-8000-000000000001';

insert into public.group_members (
  id, group_id, user_id, email, display_name, role, state, accepted_at
)
values
  (
    '33000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002',
    'mia@group-test.invalid',
    'Mia',
    'participant',
    'active',
    now()
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000003',
    'noah@group-test.invalid',
    'Noah',
    'participant',
    'active',
    now()
  );

insert into public.gift_ideas (group_id, member_id, title, url)
values
  (
    '22000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000001',
    'Organizer idea',
    'https://example.com/organizer'
  ),
  (
    '22000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000002',
    'Mia idea',
    'https://example.com/mia'
  ),
  (
    '22000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000003',
    'Noah idea',
    'https://example.com/noah'
  );

select *
from public.complete_group_draw_service(
  '22000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  (
    select last_activity_at
    from public.groups
    where id = '22000000-0000-4000-8000-000000000001'
  ),
  '[
    {
      "giver_member_id": "33000000-0000-4000-8000-000000000001",
      "receiver_member_id": "33000000-0000-4000-8000-000000000002"
    },
    {
      "giver_member_id": "33000000-0000-4000-8000-000000000002",
      "receiver_member_id": "33000000-0000-4000-8000-000000000003"
    },
    {
      "giver_member_id": "33000000-0000-4000-8000-000000000003",
      "receiver_member_id": "33000000-0000-4000-8000-000000000001"
    }
  ]'::jsonb
);

update public.groups
set last_activity_at = '2999-12-31 00:00:00+00'::timestamptz
where id = '22000000-0000-4000-8000-000000000001';

select public.record_group_activity(
  '22000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  'group_updated',
  '{}'::jsonb
);
select is(
  (
    select last_activity_at
    from public.groups
    where id = '22000000-0000-4000-8000-000000000001'
  ),
  '2999-12-31 00:00:00+00'::timestamptz,
  'group activity timestamps never move backward'
);
set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)::integer
    from public.get_group_members('22000000-0000-4000-8000-000000000001')
    where email is not null
  ),
  3,
  'the organizer can see group member email addresses'
);
select is(
  (
    select assigned_name
    from public.get_my_group_assignment('22000000-0000-4000-8000-000000000001')
  ),
  'Mia',
  'the organizer can retrieve only their own assignment'
);
select is(
  (
    select count(*)::integer
    from public.assignments
    where group_id = '22000000-0000-4000-8000-000000000001'
  ),
  1,
  'the organizer sees one assignment row rather than the full draw'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000002';

select is(
  (
    select count(*)::integer
    from public.get_group_members('22000000-0000-4000-8000-000000000001')
    where email is not null
  ),
  0,
  'participants cannot see member email addresses'
);
select is(
  (
    select assigned_name
    from public.get_my_group_assignment('22000000-0000-4000-8000-000000000001')
  ),
  'Noah',
  'a participant receives their own assignment'
);
select is(
  (
    select count(*)::integer
    from public.assignments
    where group_id = '22000000-0000-4000-8000-000000000001'
  ),
  1,
  'a participant sees only their own assignment row'
);
select is(
  (
    select count(*)::integer
    from public.get_group_gift_ideas(
      '22000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000002'
    )
  ),
  1,
  'a participant can see their own gift ideas'
);
select is(
  (
    select count(*)::integer
    from public.get_group_gift_ideas(
      '22000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000003'
    )
  ),
  1,
  'a participant can see their assigned recipient gift ideas'
);
select is(
  (
    select count(*)::integer
    from public.get_group_gift_ideas(
      '22000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'a participant cannot see an unassigned member gift list'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where group_id = '22000000-0000-4000-8000-000000000001'
  ),
  1,
  'a participant sees only their own group notifications'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000004';

select is(
  (
    select count(*)::integer
    from public.groups
    where id = '22000000-0000-4000-8000-000000000001'
  ),
  0,
  'a non-member cannot read another group'
);
select is(
  (
    select count(*)::integer
    from public.get_group_members('22000000-0000-4000-8000-000000000001')
  ),
  0,
  'a non-member cannot enumerate group members'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where group_id = '22000000-0000-4000-8000-000000000001'
  ),
  0,
  'a non-member cannot read group notifications'
);

reset role;
create temporary table group_draw_claim_test (
  outbox_id uuid not null
) on commit drop;

insert into group_draw_claim_test (outbox_id)
select outbox_id
from public.claim_group_email_outbox_service(
  '44000000-0000-4000-8000-000000000001',
  1,
  '22000000-0000-4000-8000-000000000001',
  null
)
where kind = 'draw_result';

select is(
  (select count(*)::integer from group_draw_claim_test),
  1,
  'a pending draw result can be claimed for delivery'
);
select ok(
  public.assert_group_draw_result_delivery_service(
    (select outbox_id from group_draw_claim_test),
    '44000000-0000-4000-8000-000000000001'
  ),
  'a claimed draw result is deliverable while the draw remains active'
);

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';
select public.cancel_group_draw('22000000-0000-4000-8000-000000000001');

reset role;

select ok(
  not public.assert_group_draw_result_delivery_service(
    (select outbox_id from group_draw_claim_test),
    '44000000-0000-4000-8000-000000000001'
  ),
  'cancelling a draw invalidates already claimed result email work'
);

select throws_ok(
  $$
    insert into public.gift_ideas (group_id, member_id, title, url)
    values (
      '22000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000002',
      'Unsafe URL',
      'javascript:alert(1)'
    )
  $$,
  '23514',
  'new row for relation "gift_ideas" violates check constraint "gift_ideas_url_http_check"',
  'the database rejects unsafe gift idea URL schemes'
);

select * from finish();
rollback;
