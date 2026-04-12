/**
 * InputHistory integration example.
 *
 * Demonstrates ↑/↓ key navigation with InputHistory
 * and sending user messages to a Claude Code StreamSession.
 *
 * Run: npx tsx examples/input-history.ts
 */
import * as readline from 'readline'
import { InputHistory } from '../src/input-history'

const history = new InputHistory()
let currentInput = ''

// ── Keyboard Input ────────────────────────────────────────

readline.emitKeypressEvents(process.stdin)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}

function renderInput(text: string): void {
  if (!process.stdout.isTTY) return
  process.stdout.clearLine(0)
  process.stdout.cursorTo(0)
  process.stdout.write(`> ${text}`)
}

process.stdin.on('keypress', (str: string, key: readline.Key) => {
  if (key.name === 'up') {
    const entry = history.navigateUp(currentInput)
    if (entry !== null) {
      currentInput = entry
      renderInput(currentInput)
    }
  } else if (key.name === 'down') {
    const entry = history.navigateDown()
    if (entry !== null) {
      currentInput = entry
      renderInput(currentInput)
    }
  } else if (key.name === 'return') {
    process.stdout.write('\n')
    if (currentInput.trim()) {
      // In real usage: session.send(currentInput)
      console.log('[example] sending:', currentInput)
      history.add(currentInput)
    }
    currentInput = ''
    renderInput(currentInput)
  } else if (key.name === 'escape') {
    history.reset()
    currentInput = ''
    renderInput(currentInput)
  } else if (key.name === 'backspace') {
    currentInput = currentInput.slice(0, -1)
    renderInput(currentInput)
  } else if (key.ctrl && key.name === 'c') {
    process.exit(0)
  } else if (str && !key.ctrl && !key.meta) {
    currentInput += str
    renderInput(currentInput)
  }
})

console.log('InputHistory Example — type messages, ↑/↓ to navigate, Ctrl+C to exit')
renderInput('')
