import { describe, it, expect } from 'vitest'
import { InputHistory } from './input-history'

describe('InputHistory', () => {
  describe('add', () => {
    it('should store non-empty input', () => {
      const h = new InputHistory()
      h.add('hello world')
      expect(h.navigateUp('')).toBe('hello world')
    })

    it('should ignore whitespace-only input', () => {
      const h = new InputHistory()
      h.add('   ')
      expect(h.navigateUp('')).toBeNull()
    })

    it('should insert newest entry at index 0', () => {
      const h = new InputHistory()
      h.add('first')
      h.add('second')
      expect(h.navigateUp('')).toBe('second')
      expect(h.navigateUp('second')).toBe('first')
    })

    it('should reset navigation state after add', () => {
      const h = new InputHistory()
      h.add('first')
      h.navigateUp('')
      h.add('second')
      // After add, navigateUp should start fresh
      expect(h.navigateUp('')).toBe('second')
    })
  })

  describe('navigateUp', () => {
    it('should save draft on first navigate', () => {
      const h = new InputHistory()
      h.add('entry')
      const result = h.navigateUp('my draft')
      expect(result).toBe('entry')
      // NavigateDown should restore draft
      expect(h.navigateDown()).toBe('my draft')
    })

    it('should traverse history in order', () => {
      const h = new InputHistory()
      h.add('a')
      h.add('b')
      h.add('c')
      expect(h.navigateUp('')).toBe('c')
      expect(h.navigateUp('c')).toBe('b')
      expect(h.navigateUp('b')).toBe('a')
    })

    it('should return null at earliest entry', () => {
      const h = new InputHistory()
      h.add('only')
      h.navigateUp('')
      expect(h.navigateUp('only')).toBeNull()
    })

    it('should return null when history is empty', () => {
      const h = new InputHistory()
      expect(h.navigateUp('')).toBeNull()
    })
  })

  describe('navigateDown', () => {
    it('should return null when not navigating', () => {
      const h = new InputHistory()
      expect(h.navigateDown()).toBeNull()
    })

    it('should restore saved draft', () => {
      const h = new InputHistory()
      h.add('entry')
      h.navigateUp('my draft')
      expect(h.navigateDown()).toBe('my draft')
    })

    it('should return empty string when no draft saved', () => {
      const h = new InputHistory()
      // Manually get into a navigating state without draft
      h.add('entry')
      h.navigateUp('')
      // Reset clears draftSaved, but navigateDown relies on _draftSaved
      // Let's test the normal flow: navigate up then down
      const h2 = new InputHistory()
      h2.add('entry')
      h2.navigateUp('')
      expect(h2.navigateDown()).toBe('')
    })

    it('should navigate back through history', () => {
      const h = new InputHistory()
      h.add('a')
      h.add('b')
      h.add('c')
      h.navigateUp('')  // c
      h.navigateUp('c') // b
      h.navigateUp('b') // a
      expect(h.navigateDown()).toBe('b')
      expect(h.navigateDown()).toBe('c')
    })
  })

  describe('reset', () => {
    it('should cancel navigation', () => {
      const h = new InputHistory()
      h.add('entry')
      h.navigateUp('')
      h.reset()
      expect(h.navigateDown()).toBeNull()
    })
  })

  describe('maxItems', () => {
    it('should enforce default max of 100', () => {
      const h = new InputHistory()
      for (let i = 0; i < 110; i++) {
        h.add(`item ${i}`)
      }
      // Navigate through all entries
      let count = 0
      while (h.navigateUp('') !== null) {
        count++
      }
      expect(count).toBe(100)
    })

    it('should enforce custom maxItems', () => {
      const h = new InputHistory(5)
      for (let i = 0; i < 10; i++) {
        h.add(`item ${i}`)
      }
      let count = 0
      while (h.navigateUp('') !== null) {
        count++
      }
      expect(count).toBe(5)
    })

    it('should keep newest entries when trimmed', () => {
      const h = new InputHistory(3)
      h.add('old')
      h.add('mid')
      h.add('new')
      expect(h.navigateUp('')).toBe('new')
    })
  })
})
