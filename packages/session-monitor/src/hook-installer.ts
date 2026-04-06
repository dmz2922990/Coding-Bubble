import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export function resolveClaudeDir(): string {
  return join(homedir(), '.claude')
}

export function resolveHookPath(): string {
  return join(resolveClaudeDir(), 'hooks', 'claude-bubble-state.py')
}

export function resolveSettingsPath(): string {
  return join(resolveClaudeDir(), 'settings.json')
}

const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact'
]

const BUBBLE_HOOK_ID = 'claude-bubble-state'

/**
 * Reads the Python hook script from the app's resource directory.
 * In production the app bundles this file; in dev we resolve relative to package.
 */
function loadHookScript(): string {
  const candidates = [
    join(__dirname, '..', 'resources', 'claude-bubble-state.py'),
    join(__dirname, '..', '..', '..', '..', 'packages', 'session-monitor', 'resources', 'claude-bubble-state.py')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }
  throw new Error(`hook script not found in any of: ${candidates.join(', ')}`)
}

export function installHooks(): void {
  const hookDir = join(resolveClaudeDir(), 'hooks')
  if (!existsSync(hookDir)) mkdirSync(hookDir, { recursive: true })

  writeFileSync(resolveHookPath(), loadHookScript(), { mode: 0o755 })

  const settingsPath = resolveSettingsPath()
  const settings: Record<string, unknown> = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, 'utf-8'))
    : {}

  const hooks: Record<string, unknown[]> = (settings.hooks as Record<string, unknown[]>) ?? {}

  const command = `python3 ${resolveHookPath()}`
  for (const event of HOOK_EVENTS) {
    const hookEntry = {
      hooks: [{
        type: 'command',
        command
      }]
    }
    // Remove any previous bubble hook entries for this event
    const existing = (hooks[event] as Array<Record<string, unknown>>) ?? []
    hooks[event] = [
      ...existing.filter((e) => {
        const inner = (e.hooks as Array<Record<string, unknown>>) ?? []
        return !inner.some((h) => (h.command as string)?.includes('claude-bubble-state'))
      }),
      hookEntry
    ]
  }

  settings.hooks = hooks as unknown as Record<string, unknown>
  const settingsDir = join(settingsPath, '..')
  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function uninstallHooks(): void {
  const hookPath = resolveHookPath()
  if (existsSync(hookPath)) {
    try { require('fs').unlinkSync(hookPath) } catch { /* ignore */ }
  }

  const settingsPath = resolveSettingsPath()
  if (!existsSync(settingsPath)) return

  try {
    const settings: Record<string, unknown> = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const hooks = settings.hooks as Record<string, unknown[]> | undefined
    if (!hooks) return

    for (const event of HOOK_EVENTS) {
      const entries = hooks[event]
      if (!Array.isArray(entries)) continue
      hooks[event] = entries.filter((e) => {
        const inner = ((e as Record<string, unknown>).hooks as Array<Record<string, unknown>>) ?? []
        return !inner.some((h) => (h.command as string)?.includes('claude-bubble-state'))
      })
      if (hooks[event].length === 0) delete hooks[event]
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export function hooksInstalled(): boolean {
  return existsSync(resolveHookPath())
}
