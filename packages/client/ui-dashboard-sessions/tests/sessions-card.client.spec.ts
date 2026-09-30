import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { recentSessions } from '../src/client/SessionsCard.tsx'

describe('recent dashboard sessions', () => {
  it('orders visible top-level sessions by update time and excludes blanks and subagents', () => {
    const list = {
      ids: ['old', 'new', 'blank', 'subagent'],
      byId: {
        old: { id: 'old', displayTitle: 'Older', updatedAt: 10, blank: false },
        new: { id: 'new', displayTitle: 'Newer', updatedAt: 30, blank: false },
        blank: { id: 'blank', displayTitle: 'New Session', updatedAt: 40, blank: true },
        subagent: { id: 'subagent', displayTitle: 'Child', updatedAt: 50, blank: false, origin: 'subagent' },
      },
    } as unknown as SessionListState
    expect(recentSessions(list, ['old'] as never).map(row => row.displayTitle)).toEqual(['Newer'])
  })
})
