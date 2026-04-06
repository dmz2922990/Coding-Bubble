import { readFileSync, existsSync, createReadStream } from 'fs'
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

/** Extract a display ID from a JSONL message */
function extractId(msg: Record<string, unknown>, index: number): string {
  if (typeof msg.id === 'string') return msg.id
  if (typeof msg.uuid === 'string') return msg.uuid
  return `msg_${index}`
}

/** Extract timestamp */
function extractTimestamp(msg: Record<string, unknown>): number {
  if (typeof msg.timestamp === 'number') return msg.timestamp
  if (typeof msg.created === 'number') return msg.created * 1000
  return Date.now()
}

function generateId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Parse a single JSONL message into ChatHistoryItem(s) */
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
      // Handle type-based messages (SubagentStop, etc.)
      if (type === 'subagent_stop') {
        return [{ id: extractId(msg, index), type: 'interrupted', timestamp: extractTimestamp(msg) }]
      }
      return []
  }
}

function parseAssistantMessage(msg: Record<string, unknown>, index: number): ChatHistoryItem[] {
  const items: ChatHistoryItem[] = []
  const ts = extractTimestamp(msg)

  // Content can be string or array of content blocks
  const content = msg.content
  if (typeof content === 'string' && content.length > 0) {
    items.push({ id: extractId(msg, index), type: 'assistant', content, timestamp: ts })
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as Record<string, unknown>
      const blockType = b.type as string | undefined

      switch (blockType) {
        case 'text': {
          const text = b.text as string | undefined
          if (text && text.length > 0) {
            items.push({ id: generateId(), type: 'assistant', content: text, timestamp: ts })
          }
          break
        }
        case 'tool_use': {
          const toolId = b.id as string | undefined
          const toolName = b.name as string | undefined
          const toolInput = b.input as Record<string, string> | undefined
          if (toolName) {
            items.push({
              id: generateId(),
              type: 'toolCall',
              tool: {
                name: toolName,
                input: toolInput ?? {},
                status: 'running',
                result: undefined
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
    })
    return textBlocks.map((b: Record<string, unknown>) => b.text as string).join('\n')
  }
  return ''
}

export function parseFullConversation(sessionId: string, cwd: string): ChatHistoryItem[] {
  const path = resolveJsonlPath(sessionId, cwd)
  if (!path || !existsSync(path)) return []

  const content = readFileSync(path, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim().length > 0)

  const items: ChatHistoryItem[] = []
  for (let i = 0; i < lines.length; i++) {
    try {
      const msg = JSON.parse(lines[i]) as Record<string, unknown>
      items.push(...parseMessage(msg, i))
    } catch {
      // skip malformed lines
    }
  }
  return items
}

interface ParseIncrementalResult {
  newItems: ChatHistoryItem[]
  completedTools: number
}

const fileOffsets = new Map<string, number>()

export function parseIncremental(sessionId: string, cwd: string): ParseIncrementalResult {
  const path = resolveJsonlPath(sessionId, cwd)
  if (!path || !existsSync(path)) return { newItems: [], completedTools: 0 }

  const stats = require('fs').statSync(path)
  const offset = fileOffsets.get(path) ?? 0

  if (stats.size <= offset) return { newItems: [], completedTools: 0 }

  const stream = createReadStream(path, {
    encoding: 'utf-8',
    start: offset,
    end: stats.size - 1
  })

  let buffer = ''
  let completedTools = 0
  let newItems: ChatHistoryItem[] = []
  let lineIndex = 0

  stream.readSync && void 0 // not used, just to ensure types check

  // Read synchronously for simplicity
  const content = readFileSync(path, 'utf-8')
  const allLines = content.split('\n').filter(line => line.trim().length > 0)
  const newLines = allLines.slice(offset > 0 ? Math.floor(offset / 100) : 0)

  for (let i = 0; i < newLines.length; i++) {
    try {
      const msg = JSON.parse(newLines[i]) as Record<string, unknown>
      const parsed = parseMessage(msg, lineIndex++)
      newItems.push(...parsed)
      // Count completed tools
      for (const item of parsed) {
        if (item.type === 'toolCall' && item.tool.status === 'success') {
          completedTools++
        }
      }
    } catch {
      // skip
    }
  }

  fileOffsets.set(path, stats.size)

  return { newItems, completedTools: 0 }
}

export function resetOffset(path: string): void {
  fileOffsets.delete(path)
}
