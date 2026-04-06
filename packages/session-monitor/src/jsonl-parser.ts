import { readFileSync, existsSync, statSync, watch, FSWatcher } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ChatHistoryItem } from './types'

function resolveJsonlPath(sessionId: string, cwd: string): string | null {
  const projectDir = cwd.includes('/') ? cwd.split('/').filter(Boolean).pop() : cwd
  const candidates = [
    join(homedir(), '.claude', 'projects', projectDir ?? '', `${sessionId}.jsonl`)
  ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function extractId(msg: Record<string, unknown>, index: number): string {
  if (typeof msg.id === 'string') return msg.id
  if (typeof msg.uuid === 'string') return msg.uuid
  return `msg_${index}`
}

function extractTimestamp(msg: Record<string, unknown>): number {
  if (typeof msg.timestamp === 'number') return msg.timestamp
  if (typeof msg.created === 'number') return msg.created * 1000
  return Date.now()
}

function generateId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function parseMessage(msg: Record<string, unknown>, index: number): ChatHistoryItem[] {
  const role = msg.role as string | undefined
  const type = msg.type as string | undefined

  switch (role) {
    case 'user': {
      const content = extractTextContent(msg)
      if (!content) return []
      return [{ id: extractId(msg, index), type: 'user', content, timestamp: extractTimestamp(msg) }]
    }
    case 'assistant': {
      return parseAssistantMessage(msg, index)
    }
    default:
      if (type === 'subagent_stop') {
        return [{ id: extractId(msg, index), type: 'interrupted', timestamp: extractTimestamp(msg) }]
      }
      return []
  }
}

function parseAssistantMessage(msg: Record<string, unknown>, index: number): ChatHistoryItem[] {
  const items: ChatHistoryItem[] = []
  const ts = extractTimestamp(msg)

  const content = msg.content
  if (typeof content === 'string' && content.length > 0) {
    items.push({ id: extractId(msg, index), type: 'assistant', content, timestamp: ts })
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as Record<string, unknown>

      switch (b.type as string | undefined) {
        case 'text': {
          const text = b.text as string | undefined
          if (text && text.length > 0) {
            items.push({ id: generateId(), type: 'assistant', content: text, timestamp: ts })
          }
          break
        }
        case 'tool_use': {
          const toolName = b.name as string | undefined
          if (toolName) {
            items.push({
              id: generateId(),
              type: 'toolCall',
              tool: {
                name: toolName,
                input: (b.input as Record<string, string>) ?? {},
                status: 'running'
              },
              timestamp: ts
            })
          }
          break
        }
        case 'thinking': {
          const thinking = b.thinking as string | undefined
          if (thinking && thinking.length > 0) {
            items.push({ id: generateId(), type: 'thinking', content: thinking, timestamp: ts })
          }
          break
        }
        case 'tool_result': {
          const toolUseId = b.tool_use_id as string | undefined
          const content = b.content
          const isInterrupted = typeof content === 'string' && content.includes('interrupted')
          items.push({
            id: toolUseId ?? generateId(),
            type: 'interrupted',
            timestamp: ts
          })
          break
        }
      }
    }
  }

  return items
}

function extractTextContent(msg: Record<string, unknown>): string {
  const content = msg.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textBlocks = content.filter((b: unknown) => {
      if (!b || typeof b !== 'object') return false
      return (b as Record<string, unknown>).type === 'text'
    }) as Record<string, unknown>[]
    return textBlocks.map((b) => b.text as string).join('\n')
  }
  return ''
}

export function parseFullConversation(sessionId: string, cwd: string): ChatHistoryItem[] {
  const path = resolveJsonlPath(sessionId, cwd)
  if (!path || !existsSync(path)) return []

  const lines = readFileSync(path, 'utf-8').split('\n').filter(line => line.trim().length > 0)
  const items: ChatHistoryItem[] = []
  for (let i = 0; i < lines.length; i++) {
    try {
      const msg = JSON.parse(lines[i]) as Record<string, unknown>
      items.push(...parseMessage(msg, i))
    } catch { /* skip */ }
  }
  return items
}

/** Parse only new lines since last offset */
export function parseIncremental(sessionId: string, cwd: string): ChatHistoryItem[] {
  const path = resolveJsonlPath(sessionId, cwd)
  if (!path || !existsSync(path)) return []

  const stats = statSync(path)
  const offset = fileOffsets.get(path) ?? 0

  if (stats.size <= offset) return []

  const content = readFileSync(path, 'utf-8')

  // Recalculate line offset based on byte position
  const lines = content.split('\n')
  const byteToLineOffset = estimateLineOffset(content, offset)
  const newLines = lines.slice(byteToLineOffset)

  const newItems: ChatHistoryItem[] = []
  for (let i = 0; i < newLines.length; i++) {
    try {
      const msg = JSON.parse(newLines[i]) as Record<string, unknown>
      newItems.push(...parseMessage(msg, byteToLineOffset + i))
    } catch { /* skip */ }
  }

  fileOffsets.set(path, stats.size)
  return newItems
}

/** Estimate which line number corresponds to a byte offset */
function estimateLineOffset(content: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0
  const lines = content.slice(0, byteOffset).split('\n')
  return lines.length - 1
}

export function resetOffset(path: string): void {
  fileOffsets.delete(path)
}

/** Track file offsets per session */
const fileOffsets = new Map<string, number>()

// ── File Watcher ─────────────────────────────────────────────

const DEBOUNCE_MS = 100

export interface JsonlWatcher {
  stop: () => void
}

/**
 * Watch a JSONL file for changes and call onUpdated with new ChatHistoryItems.
 * Debounced at 100ms to avoid excessive re-parsing.
 */
export function watchJsonlFile(
  sessionId: string,
  cwd: string,
  onUpdated: (sessionId: string, newItems: ChatHistoryItem[]) => void
): JsonlWatcher {
  const path = resolveJsonlPath(sessionId, cwd)
  if (!path) return { stop: () => {} }

  let timer: ReturnType<typeof setTimeout> | null = null

  const doParse = () => {
    const items = parseIncremental(sessionId, cwd)
    if (items.length > 0) onUpdated(sessionId, items)
  }

  const handler = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(doParse, DEBOUNCE_MS)
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(path, { persistent: false }, handler)
  } catch {
    // file may not exist yet — will be retried on demand
  }

  return {
    stop: () => {
      if (timer) clearTimeout(timer)
      watcher?.close()
    }
  }
}
