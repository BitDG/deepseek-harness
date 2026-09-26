/** CSS checks for semantic spacing inside the conversation flow. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/chat/${name}`, import.meta.url)), 'utf8')

describe('conversation flow spacing', () => {
  it('groups consecutive context rows without changing surrounding flow spacing', () => {
    const chat = read('ChatView.module.css')
    const contextPair = /\.flowItem\[data-chat-flow-kind='context'\]\s*\+ \.flowItem\[data-chat-flow-kind='context'\]/s
    expect(chat).toMatch(contextPair)
    expect(chat).toMatch(/--dsh-chat-flow-gap:\s*4px/s)
  })

  it('combines the flow and footer offsets around turn-tail content', () => {
    expect(read('ChatView.module.css')).toMatch(/margin-top:\s*var\(--dsh-chat-flow-gap, 16px\)/)
    const tail = read('TurnTailNodeView.module.css')
    expect(tail).toMatch(/\.root\s*\{[^}]*gap:\s*16px/s)
    expect(tail).toMatch(/\.actions\s*\{[^}]*margin-top:\s*4px/s)
  })
})
