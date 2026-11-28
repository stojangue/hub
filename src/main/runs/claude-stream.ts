/**
 * Turns the `--output-format stream-json` messages of the Claude Code CLI into log entries.
 * Only top-level messages are shown; those of subagents are skipped.
 */

import { randomUUID } from 'node:crypto'
import type { AgentEntry } from '@shared/runs'
import { asRecord } from '@shared/validation'

/** Longest tool output kept per call, in characters. */
const maxOutputLength = 20_000
const maxInputLength = 20_000

export type StreamUpdate =
  | { kind: 'entry'; entry: AgentEntry }
  /** A tool returned: the entry with this ID gets its output. */
  | { kind: 'toolResult'; toolUseId: string; output: string; isError: boolean }
  | { kind: 'result'; text: string; isError: boolean; costUsd: number | null }

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…` : text
}

function shortenInput(value: unknown): unknown {
  const text = JSON.stringify(value) ?? ''
  return text.length > maxInputLength ? { truncated: truncate(text, maxInputLength) } : value
}

/** Tool results are either a string or a list of content blocks. */
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      const record = asRecord(block)
      if (record?.['type'] === 'text' && typeof record['text'] === 'string') return record['text']
      if (record?.['type'] === 'image') return '[image]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/** Parses one line of output. Lines that are not JSON or not of interest yield nothing. */
export function parseStreamLine(line: string): StreamUpdate[] {
  let message: Record<string, unknown> | null
  try {
    message = asRecord(JSON.parse(line))
  } catch {
    return []
  }
  if (!message) return []
  const at = new Date().toISOString()

  if (message['type'] === 'result') {
    const text = typeof message['result'] === 'string' ? message['result'] : ''
    const cost = message['total_cost_usd']
    return [
      {
        kind: 'result',
        text,
        isError: message['is_error'] === true || message['subtype'] !== 'success',
        costUsd: typeof cost === 'number' ? cost : null,
      },
    ]
  }

  // Messages of subagents carry the ID of the tool call that started them.
  if (message['parent_tool_use_id']) return []
  const content = asRecord(message['message'])?.['content']
  if (!Array.isArray(content)) return []
  const eventId = typeof message['uuid'] === 'string' ? message['uuid'] : randomUUID()

  if (message['type'] === 'assistant') {
    return content.flatMap((raw, index): StreamUpdate[] => {
      const block = asRecord(raw)
      if (block?.['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim()) {
        return [
          {
            kind: 'entry',
            entry: { id: `${eventId}:${index}`, at, kind: 'text', text: block['text'] },
          },
        ]
      }
      if (block?.['type'] === 'tool_use' && typeof block['id'] === 'string') {
        return [
          {
            kind: 'entry',
            entry: {
              id: block['id'],
              at,
              kind: 'tool',
              name: typeof block['name'] === 'string' ? block['name'] : 'Tool',
              input: shortenInput(block['input'] ?? null),
            },
          },
        ]
      }
      return []
    })
  }

  if (message['type'] === 'user') {
    return content.flatMap((raw): StreamUpdate[] => {
      const block = asRecord(raw)
      if (block?.['type'] !== 'tool_result' || typeof block['tool_use_id'] !== 'string') return []
      return [
        {
          kind: 'toolResult',
          toolUseId: block['tool_use_id'],
          output: truncate(contentToText(block['content']), maxOutputLength),
          isError: block['is_error'] === true,
        },
      ]
    })
  }
  return []
}
