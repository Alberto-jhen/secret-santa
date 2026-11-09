import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignRecipients,
  DrawConstraintError,
  isValidGroupMemberCount,
} from '../supabase/functions/_shared/assignment.ts'
import { deriveGroupInvitationToken } from '../supabase/functions/_shared/security.ts'
import { toSafeHttpUrl } from '../src/lib/safeHttpUrl.ts'

const deterministicRandom = (maxExclusive: number) =>
  maxExclusive > 1 ? maxExclusive - 1 : 0

test('assigns every participant exactly once without self-assignments', () => {
  const participants = ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    excludedIds: [],
  }))

  const assignments = assignRecipients(participants, deterministicRandom)

  assert.equal(assignments.size, participants.length)
  assert.deepEqual(new Set(assignments.keys()), new Set(['a', 'b', 'c', 'd']))
  assert.deepEqual(
    new Set(assignments.values()),
    new Set(['a', 'b', 'c', 'd']),
  )

  for (const [giverId, recipientId] of assignments) {
    assert.notEqual(giverId, recipientId)
  }
})

test('gift idea links accept only HTTP(S) URLs without embedded credentials', () => {
  assert.equal(toSafeHttpUrl('https://example.com/gift'), 'https://example.com/gift')
  assert.equal(toSafeHttpUrl('http://example.com/gift'), 'http://example.com/gift')
  assert.equal(toSafeHttpUrl('javascript:alert(1)'), null)
  assert.equal(toSafeHttpUrl('data:text/html,hello'), null)
  assert.equal(toSafeHttpUrl('ftp://example.com/gift'), null)
  assert.equal(toSafeHttpUrl('//example.com/gift'), null)
  assert.equal(toSafeHttpUrl('https://user:password@example.com/gift'), null)
})

test('respects directed exclusions', () => {
  const participants = [
    { id: 'a', excludedIds: ['b'] },
    { id: 'b', excludedIds: ['c'] },
    { id: 'c', excludedIds: [] },
    { id: 'd', excludedIds: ['a'] },
  ]

  const assignments = assignRecipients(participants, deterministicRandom)

  for (const participant of participants) {
    assert.ok(!participant.excludedIds.includes(assignments.get(participant.id)!))
  }
})

test('detects impossible constraints instead of returning a partial draw', () => {
  const participants = [
    { id: 'a', excludedIds: ['b', 'c'] },
    { id: 'b', excludedIds: [] },
    { id: 'c', excludedIds: [] },
  ]

  assert.throws(
    () => assignRecipients(participants, deterministicRandom),
    (error: unknown) =>
      error instanceof DrawConstraintError &&
      error.code === 'impossible_assignment',
  )
})

test('supports the maximum guest-draw size', () => {
  const participants = Array.from({ length: 50 }, (_, index) => ({
    id: `participant-${index}`,
    excludedIds: [],
  }))
  const assignments = assignRecipients(participants, deterministicRandom)

  assert.equal(assignments.size, 50)
  assert.equal(new Set(assignments.values()).size, 50)
})
test('rejects duplicate participant ids and unknown exclusions', () => {
  assert.throws(
    () =>
      assignRecipients(
        [
          { id: 'same', excludedIds: [] },
          { id: 'same', excludedIds: [] },
        ],
        deterministicRandom,
      ),
    (error: unknown) =>
      error instanceof DrawConstraintError &&
      error.code === 'invalid_participants',
  )

  assert.throws(
    () =>
      assignRecipients(
        [
          { id: 'a', excludedIds: ['missing'] },
          { id: 'b', excludedIds: [] },
        ],
        deterministicRandom,
      ),
    (error: unknown) =>
      error instanceof DrawConstraintError &&
      error.code === 'invalid_participants',
  )
})

test('group draws require between 3 and 50 whole participants', () => {
  assert.equal(isValidGroupMemberCount(2), false)
  assert.equal(isValidGroupMemberCount(3), true)
  assert.equal(isValidGroupMemberCount(50), true)
  assert.equal(isValidGroupMemberCount(51), false)
  assert.equal(isValidGroupMemberCount(3.5), false)
})

test('group invitation tokens are deterministic base64url HMACs', async () => {
  const originalDeno = Reflect.get(globalThis, 'Deno')
  const testSecret = 'test-secret-that-is-at-least-thirty-two-characters'
  Reflect.set(globalThis, 'Deno', {
    env: {
      get: (name: string) =>
        name === 'GROUP_INVITATION_TOKEN_SECRET' ? testSecret : undefined,
    },
  })

  try {
    const invitationId = '123e4567-e89b-42d3-a456-426614174000'
    const token = await deriveGroupInvitationToken(invitationId)

    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(token, await deriveGroupInvitationToken(invitationId))
    assert.notEqual(
      token,
      await deriveGroupInvitationToken('123e4567-e89b-42d3-a456-426614174001'),
    )
  } finally {
    if (originalDeno === undefined) {
      Reflect.deleteProperty(globalThis, 'Deno')
    } else {
      Reflect.set(globalThis, 'Deno', originalDeno)
    }
  }
})
