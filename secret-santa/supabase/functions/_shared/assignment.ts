import type { DrawParticipant } from '../../../src/models.ts'

export type RandomIndex = (maxExclusive: number) => number

export class DrawConstraintError extends Error {
  readonly code: 'invalid_participants' | 'impossible_assignment'

  constructor(code: DrawConstraintError['code']) {
    super(code)
    this.name = 'DrawConstraintError'
    this.code = code
  }
}

function secureRandomIndex(maxExclusive: number): number {
  const range = 0x1_0000_0000
  const limit = Math.floor(range / maxExclusive) * maxExclusive
  const value = new Uint32Array(1)

  do {
    globalThis.crypto.getRandomValues(value)
  } while (value[0] >= limit)

  return value[0] % maxExclusive
}

function shuffle<T>(items: readonly T[], randomIndex: RandomIndex): T[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1)

    if (!Number.isInteger(target) || target < 0 || target > index) {
      throw new RangeError('randomIndex must return an index in range')
    }

    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }

  return shuffled
}

/**
 * Finds a one-to-one derangement while respecting directed exclusions.
 * A maximum bipartite matching detects globally impossible rules instead of
 * relying on a greedy shuffle that can fail even when a valid draw exists.
 */
export function assignRecipients(
  participants: readonly DrawParticipant[],
  randomIndex: RandomIndex = secureRandomIndex,
): Map<string, string> {
  if (
    participants.length < 2 ||
    participants.length > 50 ||
    participants.some(({ id }) => id.trim().length === 0) ||
    new Set(participants.map(({ id }) => id)).size !== participants.length
  ) {
    throw new DrawConstraintError('invalid_participants')
  }

  const participantIds = participants.map(({ id }) => id)
  const participantIdSet = new Set(participantIds)
  const exclusions = new Map<string, Set<string>>()

  for (const participant of participants) {
    const excludedIds = new Set(participant.excludedIds)

    if (
      [...excludedIds].some(
        (excludedId) => !participantIdSet.has(excludedId),
      )
    ) {
      throw new DrawConstraintError('invalid_participants')
    }

    exclusions.set(participant.id, excludedIds)
  }

  const candidateIds = new Map<string, string[]>()

  for (const giverId of participantIds) {
    const candidates = participantIds.filter(
      (recipientId) =>
        recipientId !== giverId &&
        !exclusions.get(giverId)?.has(recipientId),
    )

    if (candidates.length === 0) {
      throw new DrawConstraintError('impossible_assignment')
    }

    candidateIds.set(giverId, shuffle(candidates, randomIndex))
  }

  const giverOrder = shuffle(participantIds, randomIndex).sort(
    (firstId, secondId) =>
      candidateIds.get(firstId)!.length - candidateIds.get(secondId)!.length,
  )
  const giverByRecipient = new Map<string, string>()

  function findRecipient(giverId: string, visited: Set<string>): boolean {
    for (const recipientId of candidateIds.get(giverId)!) {
      if (visited.has(recipientId)) {
        continue
      }

      visited.add(recipientId)
      const previousGiverId = giverByRecipient.get(recipientId)

      if (
        previousGiverId === undefined ||
        findRecipient(previousGiverId, visited)
      ) {
        giverByRecipient.set(recipientId, giverId)
        return true
      }
    }

    return false
  }

  for (const giverId of giverOrder) {
    if (!findRecipient(giverId, new Set())) {
      throw new DrawConstraintError('impossible_assignment')
    }
  }

  const recipientByGiver = new Map<string, string>()

  for (const [recipientId, giverId] of giverByRecipient) {
    recipientByGiver.set(giverId, recipientId)
  }

  if (recipientByGiver.size !== participants.length) {
    throw new DrawConstraintError('impossible_assignment')
  }

  return recipientByGiver
}
