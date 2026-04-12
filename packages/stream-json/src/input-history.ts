/** A single history entry with the user's input and when it was recorded. */
export interface HistoryEntry {
  display: string
  timestamp: number
}

const DEFAULT_MAX_ITEMS = 100

/**
 * Client-side input history with ↑/↓ navigation.
 *
 * Stores submitted inputs locally and provides arrow-key navigation
 * with draft save/restore support. No server-side dependency.
 */
export class InputHistory {
  protected _entries: HistoryEntry[] = []
  protected _maxItems: number
  protected _historyIndex = -1
  protected _draft = ''
  protected _draftSaved = false

  /** @param maxItems maximum entries to keep (default 100) */
  constructor(maxItems = DEFAULT_MAX_ITEMS) {
    this._maxItems = maxItems
  }

  /**
   * Record a submitted input. Empty/whitespace input is ignored.
   * Resets any in-progress navigation.
   */
  add(input: string): void {
    if (input.trim() === '') return

    this._entries.unshift({
      display: input,
      timestamp: Date.now(),
    })

    if (this._entries.length > this._maxItems) {
      this._entries.pop()
    }

    this._historyIndex = -1
    this._draftSaved = false
  }

  /**
   * Navigate to an earlier (older) history entry.
   * On first call, saves `currentInput` as a draft for later restoration.
   *
   * @returns the history entry text, or `null` if already at the oldest entry.
   */
  navigateUp(currentInput: string): string | null {
    if (this._historyIndex === -1) {
      this._draft = currentInput
      this._draftSaved = true
    }

    if (this._historyIndex < this._entries.length - 1) {
      this._historyIndex++
      return this._entries[this._historyIndex]!.display
    }

    return null
  }

  /**
   * Navigate to a more recent history entry.
   * When returning to the initial position, restores the saved draft.
   *
   * @returns the history entry text, draft text, or `null` if not navigating.
   */
  navigateDown(): string | null {
    if (this._historyIndex > 0) {
      this._historyIndex--
      return this._entries[this._historyIndex]!.display
    }

    if (this._historyIndex === 0) {
      this._historyIndex = -1
      return this._draftSaved ? this._draft : ''
    }

    return null
  }

  /** Cancel any in-progress navigation and discard the saved draft. */
  reset(): void {
    this._historyIndex = -1
    this._draftSaved = false
  }

  /** Serialize entries for persistence. */
  toJSON(): HistoryEntry[] {
    return this._entries
  }

  /** Load entries from a previous `toJSON()` call. */
  loadEntries(entries: HistoryEntry[]): void {
    this._entries = entries.slice(0, this._maxItems)
    this._historyIndex = -1
    this._draftSaved = false
  }
}
