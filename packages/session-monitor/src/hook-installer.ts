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

const HOOK_RESOURCE = 'packages/session-monitor/resources/claude-bubble-state.py'

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

/**
 * Reads the Python hook script from the app's resource directory.
 * In production the app bundles this file; in dev we resolve relative to package.
 */
function loadHookScript(): string {
  const candidates = [
    join(__dirname, '..', 'resources', 'claude-bubble-state.py'),
    join(__dirname, '..', '..', '..', '..', '..', 'packages', 'session-monitor', 'resources', 'claude-bubble-state.py')
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

  const hooks: Record<string, unknown> = (settings.hooks as Record<string, unknown>) ?? {}

  const eventConfigs: Array<Record<string, unknown>> = []
  for (const event of HOOK_EVENTS) {
    const config: Record<string, unknown> = {
      type: 'command',
      command: `python3 ${resolveHookPath()}`,
      hookEvent: event
    }
    if (event === 'PermissionRequest') {
      config.timeout = 86400 // 24 hours — don't let Claude time out while waiting
    }
    eventConfigs.push(config)
  }

  hooks.events = eventConfigs
  settings.hooks = hooks

  const settingsDir = join(settingsPath, '..')
  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function uninstallHooks(): void {
  const hookPath = resolveHookPath()
  if (existsSync(hookPath)) {
    try {
      const { unlinkSync } = require('fs')
      unlinkSync(hookPath)
    } catch {
      // ignore
    }
  }

  const settingsPath = resolveSettingsPath()
  if (existsSync(settingsPath)) {
    try {
      const settings: Record<string, unknown> = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (settings.hooks) delete settings.hooks
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    } catch {
      // ignore
    }
  }
}

export function hooksInstalled(): boolean {
  return existsSync(resolveHookPath())
}
