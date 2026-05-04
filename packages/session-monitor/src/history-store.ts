import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SessionState, SessionHistoryEntry, ChatHistoryItem } from './types'

const MAX_ENTRIES = 100
const SUMMARY_MAX_LENGTH = 100

function generateSummary(session: SessionState): string {
  const userItem = session.chatItems.find(
    (item: ChatHistoryItem): item is ChatHistoryItem & { type: 'user'; content: string } => item.type === 'user'
  )
  if (userItem?.content) {
    return userItem.content.length > SUMMARY_MAX_LENGTH
      ? userItem.content.slice(0, SUMMARY_MAX_LENGTH)
      : userItem.content
  }
  if (session.projectName) return session.projectName
  return 'Untitled Session'
}

export class HistoryStore {
  private _filePath: string
  private _entries: SessionHistoryEntry[] = []

  constructor(dataDir: string) {
    this._filePath = join(dataDir, 'history.json')
    this._load()
  }

  save(session: SessionState): void {
    const entry: SessionHistoryEntry = {
      sessionId: session.sessionId,
      projectName: session.projectName,
      cwd: session.cwd,
      source: session.source,
      summary: generateSummary(session),
      closedAt: Date.now(),
      createdAt: session.createdAt,
    }

    this._entries.unshift(entry)
    this._trimToLimit()
    this._write()
  }

  query(page: number, pageSize: number): { entries: SessionHistoryEntry[]; totalCount: number } {
    const totalCount = this._entries.length
    const start = (page - 1) * pageSize
    const entries = this._entries.slice(start, start + pageSize)
    return { entries, totalCount }
  }

  private _load(): void {
    if (!existsSync(this._filePath)) {
      this._entries = []
      return
    }
    try {
      const raw = readFileSync(this._filePath, 'utf-8')
      const data = JSON.parse(raw) as SessionHistoryEntry[]
      if (!Array.isArray(data)) {
        this._entries = []
        return
      }
      this._entries = data
      this._trimToLimit()
    } catch {
      this._entries = []
    }
  }

  private _trimToLimit(): void {
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries
        .sort((a, b) => b.closedAt - a.closedAt)
        .slice(0, MAX_ENTRIES)
    }
  }

  private _write(): void {
    const dir = join(this._filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this._filePath, JSON.stringify(this._entries, null, 2), 'utf-8')
  }
}
