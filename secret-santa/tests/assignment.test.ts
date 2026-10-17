import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignRecipients,
  DrawConstraintError,
} from '../supabase/functions/_shared/assignment.ts'

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
