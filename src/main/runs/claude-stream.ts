/**
 * Turns the `--output-format stream-json` messages of the Claude Code CLI into log entries.
 * Only top-level messages are shown. Of subagents, only what they do last is kept, for those
 * that work in the background, whose tool call returns at once.
 */

import { randomUUID } from 'node:crypto'
import type { AgentEntry, BackgroundTaskStatus } from '@shared/runs'
import { asRecord } from '@shared/validation'

/** Longest tool output kept per call, in characters. */
const maxOutputLength = 20_000
const maxInputLength = 20_000

export type StreamUpdate =
  | { kind: 'entry'; entry: AgentEntry }
  /** A tool returned: the entry with this ID gets its output. */
  | { kind: 'toolResult'; toolUseId: string; output: string; isError: boolean }
  | { kind: 'result'; text: string; isError: boolean; costUsd: number | null }
  /** A subagent started by the tool call with this ID works in the background. */
  | { kind: 'backgroundStarted'; toolUseId: string }
  /** A subagent did something: what, in one line. Sent for every subagent, also nested ones. */
  | { kind: 'subagentActivity'; toolUseId: string; text: string }
  | {
      kind: 'backgroundFinished'
      toolUseId: string
      status: BackgroundTaskStatus
      summary: string | null
    }

const maxActivityLength = 200

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > maxActivityLength ? `${line.slice(0, maxActivityLength)}…` : line
}

/** A tool call in one line, e.g. `Bash: Run the tests`. */
function describeToolUse(name: string, input: unknown): string {
  const record = asRecord(input) ?? {}
  const keys = ['description', 'command', 'file_path', 'pattern', 'url', 'query', 'skill']
  const detail = keys.map((key) => record[key]).find((value) => typeof value === 'string')
  return oneLine(typeof detail === 'string' ? `${name}: ${detail}` : name)
}

/** What a subagent's message shows it doing, or `null` if nothing worth showing. */
function subagentActivity(message: Record<string, unknown>): string | null {
  const content = asRecord(message['message'])?.['content']
  if (message['type'] !== 'assistant' || !Array.isArray(content)) return null
  for (const raw of [...content].reverse()) {
    const block = asRecord(raw)
    if (block?.['type'] === 'tool_use' && typeof block['name'] === 'string') {
      return describeToolUse(block['name'], block['input'])
    }
    if (block?.['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim()) {
      return oneLine(block['text'])
    }
  }
  return null
}

function taskStatus(value: unknown): BackgroundTaskStatus {
  if (value === 'completed') return 'completed'
  if (value === 'failed') return 'failed'
  return 'stopped'
}

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

  // Claude Code reports subagents that work in the background as tasks.
  if (message['type'] === 'system' && typeof message['tool_use_id'] === 'string') {
    const toolUseId = message['tool_use_id']
    if (message['subtype'] === 'task_started' && message['is_backgrounded'] === true) {
      return [{ kind: 'backgroundStarted', toolUseId }]
    }
    if (message['subtype'] === 'task_notification') {
      const summary = message['summary']
      return [
        {
          kind: 'backgroundFinished',
          toolUseId,
          status: taskStatus(message['status']),
          summary: typeof summary === 'string' && summary.trim() ? summary : null,
        },
      ]
    }
    return []
  }

  // Messages of subagents carry the ID of the tool call that started them.
  const parent = message['parent_tool_use_id']
  if (typeof parent === 'string' && parent) {
    const text = subagentActivity(message)
    return text ? [{ kind: 'subagentActivity', toolUseId: parent, text }] : []
  }
  if (parent) return []
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
              ...(asRecord(block['input'])?.['run_in_background'] === true
                ? {
                    background: {
                      status: 'running',
                      lastActivity: null,
                      lastActivityAt: null,
                      summary: null,
                    },
                  }
                : {}),
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
