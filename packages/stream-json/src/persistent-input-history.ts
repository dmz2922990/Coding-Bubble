import { appendFile, readFile } from 'fs/promises'
import { InputHistory } from './input-history'
import type { HistoryEntry } from './input-history'

/**
 * InputHistory with JSONL file persistence.
 *
 * Entries are appended asynchronously so writes never block the caller.
 * Corrupted lines in the history file are silently skipped on load.
 */
export class PersistentInputHistory extends InputHistory {
  private _filePath: string

  /** @param filePath absolute path to the JSONL history file */
  constructor(filePath: string, maxItems?: number) {
    super(maxItems)
    this._filePath = filePath
  }

  /**
   * Load history from the JSONL file.
   * Sorts entries newest-first and trims to `maxItems`.
   * Silently ignores missing files and corrupted lines.
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this._filePath, 'utf8')
      const lines = content.trim().split('\n').filter(Boolean)
      const entries: HistoryEntry[] = []

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as HistoryEntry
          if (entry.display && typeof entry.timestamp === 'number') {
            entries.push(entry)
          }
        } catch {
          // skip corrupted lines
        }
      }

      this._entries = entries
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this._maxItems)
    } catch {
      // file not found or unreadable — start empty
    }
  }

  /** Record input and asynchronously append to the history file. */
  add(input: string): void {
    super.add(input)
    const entry: HistoryEntry = { display: input, timestamp: Date.now() }
    void appendFile(this._filePath, JSON.stringify(entry) + '\n')
  }
}
