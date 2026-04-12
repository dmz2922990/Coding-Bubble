import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PersistentInputHistory } from './persistent-input-history'

describe('PersistentInputHistory', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'history-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('load', () => {
    it('should load entries from existing file', async () => {
      const filePath = join(tempDir, 'history.jsonl')
      const { writeFileSync } = await import('fs')
      writeFileSync(filePath, [
        JSON.stringify({ display: 'first', timestamp: 1000 }),
        JSON.stringify({ display: 'second', timestamp: 2000 }),
      ].join('\n') + '\n')

      const h = new PersistentInputHistory(filePath)
      await h.load()

      expect(h.navigateUp('')).toBe('second') // newest first
      expect(h.navigateUp('second')).toBe('first')
    })

    it('should start empty when file does not exist', async () => {
      const filePath = join(tempDir, 'nonexistent.jsonl')
      const h = new PersistentInputHistory(filePath)
      await h.load()

      expect(h.navigateUp('')).toBeNull()
    })

    it('should skip corrupted lines', async () => {
      const filePath = join(tempDir, 'history.jsonl')
      const { writeFileSync } = await import('fs')
      writeFileSync(filePath, [
        JSON.stringify({ display: 'good', timestamp: 1000 }),
        'not valid json',
        JSON.stringify({ display: 'also good', timestamp: 2000 }),
      ].join('\n') + '\n')

      const h = new PersistentInputHistory(filePath)
      await h.load()

      let count = 0
      while (h.navigateUp('') !== null) count++
      expect(count).toBe(2)
    })

    it('should respect maxItems when loading', async () => {
      const filePath = join(tempDir, 'history.jsonl')
      const { writeFileSync } = await import('fs')
      const lines = []
      for (let i = 0; i < 10; i++) {
        lines.push(JSON.stringify({ display: `item ${i}`, timestamp: i * 1000 }))
      }
      writeFileSync(filePath, lines.join('\n') + '\n')

      const h = new PersistentInputHistory(filePath, 5)
      await h.load()

      let count = 0
      while (h.navigateUp('') !== null) count++
      expect(count).toBe(5)
    })
  })

  describe('add with persistence', () => {
    it('should append entry to file', async () => {
      const filePath = join(tempDir, 'history.jsonl')
      const h = new PersistentInputHistory(filePath)

      h.add('test command')
      // Allow async write to complete
      await new Promise((r) => setTimeout(r, 50))

      expect(existsSync(filePath)).toBe(true)
      const content = readFileSync(filePath, 'utf8').trim()
      const entry = JSON.parse(content)
      expect(entry.display).toBe('test command')
      expect(typeof entry.timestamp).toBe('number')
    })

    it('should append multiple entries as JSONL', async () => {
      const filePath = join(tempDir, 'history.jsonl')
      const h = new PersistentInputHistory(filePath)

      h.add('first')
      h.add('second')
      await new Promise((r) => setTimeout(r, 100))

      const lines = readFileSync(filePath, 'utf8').trim().split('\n')
      expect(lines.length).toBe(2)
      expect(JSON.parse(lines[0]!).display).toBe('first')
      expect(JSON.parse(lines[1]!).display).toBe('second')
    })
  })
})
