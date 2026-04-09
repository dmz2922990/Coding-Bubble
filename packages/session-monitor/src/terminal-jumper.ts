import { execFile } from 'child_process'
import * as util from 'util'
import type { SessionState } from './types'

const execFileAsync = util.promisify(execFile)

// ═─ Types ────────────────────────────────────────────────────

export interface TerminalInfo {
  name: string
  bundleId: string
  tty?: string
}

export interface PlatformTerminalJumper {
  detectTerminal(pid: number): Promise<TerminalInfo | null>
  focusTerminal(info: TerminalInfo, session: SessionState): Promise<boolean>
}

// ═─ Terminal Registry ────────────────────────────────────────

const TERMINAL_REGISTRY = new Map<string, string>([
  ['Ghostty', 'com.mitchellh.ghostty'],
  ['ghostty', 'com.mitchellh.ghostty'],
  ['iTerm2', 'com.googlecode.iterm2'],
  ['Terminal', 'com.apple.Terminal'],
  ['Warp', 'dev.warp.Warp-Stable'],
  ['kitty', 'net.kovidgoyal.kitty'],
  ['wezterm', 'com.github.wez.wezterm'],
  ['Alacritty', 'org.alacritty'],
  ['cmux', 'com.cmux.app'],
  ['Code Helper', 'com.microsoft.VSCode'],
  ['Cursor', 'com.todesktop.230313mzl4w4u92'],
  ['zed', 'dev.zed.Zed'],
])

// Priority-ordered fallback when no terminal detected
const FALLBACK_TERMINALS = [
  { name: 'Ghostty', bundleId: 'com.mitchellh.ghostty' },
  { name: 'iTerm2', bundleId: 'com.googlecode.iterm2' },
  { name: 'Terminal', bundleId: 'com.apple.Terminal' },
  { name: 'Warp', bundleId: 'dev.warp.Warp-Stable' },
  { name: 'kitty', bundleId: 'net.kovidgoyal.kitty' },
]

// ═─ Helpers ──────────────────────────────────────────────────

function runAppleScript(script: string): Promise<string> {
  return execFileAsync('osascript', ['-e', script], { timeout: 5000 })
    .then(({ stdout }) => stdout.trim())
}

function findTerminalInPath(comm: string): TerminalInfo | null {
  const basename = comm.split('/').pop() ?? ''
  const lowerBasename = basename.toLowerCase()
  const lowerComm = comm.toLowerCase()
  for (const [name, bundleId] of TERMINAL_REGISTRY) {
    const lowerName = name.toLowerCase()
    if (lowerBasename === lowerName || lowerComm.endsWith(`/${lowerName}`)) {
      return { name, bundleId }
    }
  }
  return null
}

// ═─ Process Tree Tracing ─────────────────────────────────────

function traceToTerminal(
  tree: Map<number, { ppid: number; tty: string; comm: string }>,
  startPid: number
): TerminalInfo | null {
  let current = startPid
  let lastTty: string | undefined
  while (current && current > 1) {
    const proc = tree.get(current)
    if (!proc) break
    const info = findTerminalInPath(proc.comm)
    if (info) {
      return { ...info, tty: lastTty || (proc.tty !== '??' ? proc.tty : undefined) }
    }
    lastTty = proc.tty !== '??' ? proc.tty : lastTty
    current = proc.ppid
  }
  return null
}

// ═─ macOS Process Tree Detection ─────────────────────────────

async function detectTerminalMacOS(pid: number): Promise<TerminalInfo | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,ppid,tty,comm'], { timeout: 3000 })
    const lines = stdout.trim().split('\n')

    const tree = new Map<number, { ppid: number; tty: string; comm: string }>()
    for (const line of lines.slice(1)) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S*)\s+(.+)$/)
      if (!match) continue
      const entryPid = parseInt(match[1], 10)
      tree.set(entryPid, {
        ppid: parseInt(match[2], 10),
        tty: match[3],
        comm: match[4].trim()
      })
    }

    // Trace ancestors from pid until a known terminal is found
    const info = traceToTerminal(tree, pid)
    if (info) return info

    // Fallback: stored PID may be dead, scan for claude processes and trace from them
    for (const [procPid, proc] of tree) {
      const basename = proc.comm.split('/').pop() ?? ''
      if (basename === 'claude' && proc.tty && proc.tty !== '??') {
        const fallbackInfo = traceToTerminal(tree, procPid)
        if (fallbackInfo) return fallbackInfo
      }
    }

    return null
  } catch {
    return null
  }
}

// ═─ tmux Strategy ────────────────────────────────────────────

async function isTmuxAvailable(): Promise<boolean> {
  try {
    await execFileAsync('which', ['tmux'], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

async function isYabaiAvailable(): Promise<boolean> {
  try {
    await execFileAsync('which', ['yabai'], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

async function findTmuxTarget(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('tmux', ['list-panes', '-a', '-F', '#{pane_pid} #{session_name}:#{window_index}.#{pane_index}'], { timeout: 3000 })
    for (const line of stdout.trim().split('\n')) {
      const [panePid, target] = line.split(' ')
      if (!panePid || !target) continue
      // Check direct match and child processes
      if (parseInt(panePid, 10) === pid) return target

      // Check if pid is a child of the pane's shell
      try {
        const { stdout: pstree } = await execFileAsync('ps', ['-o', 'pid=', '-p', String(pid)], { timeout: 1000 })
        if (pstree.trim()) {
          // Verify the pane process is an ancestor of our pid
          const { stdout: tree } = await execFileAsync('ps', ['-eo', 'pid,ppid'], { timeout: 1000 })
          let current = pid
          const ancestorMap = new Map<number, number>()
          for (const row of tree.trim().split('\n').slice(1)) {
            const parts = row.trim().split(/\s+/)
            if (parts.length >= 2) {
              ancestorMap.set(parseInt(parts[0], 10), parseInt(parts[1], 10))
            }
          }
          while (current && current > 1) {
            if (current === parseInt(panePid, 10)) return target
            current = ancestorMap.get(current) ?? 0
          }
        }
      } catch {
        // Ignore, just try next pane
      }
    }
    return null
  } catch {
    return null
  }
}

async function activateTmux(target: string): Promise<boolean> {
  const [sessionWindow, paneStr] = target.split('.')
  if (!sessionWindow || paneStr === undefined) return false

  try {
    await execFileAsync('tmux', ['select-window', '-t', sessionWindow], { timeout: 2000 })
    await execFileAsync('tmux', ['select-pane', '-t', target], { timeout: 2000 })

    if (await isYabaiAvailable()) {
      try {
        await execFileAsync('yabai', ['-m', 'window', '--focus', 'mouse'], { timeout: 2000 })
      } catch {
        // yabai focus may fail if window manager isn't managing the space
      }
    }
    return true
  } catch {
    return false
  }
}

// ═─ iTerm2 Strategy ──────────────────────────────────────────

async function activateITerm2(tty: string | undefined): Promise<boolean> {
  if (!tty) return false
  const ttyBasename = tty.replace(/^\/dev\//, '')
  const script = `
tell application "iTerm2"
  activate
  repeat with aWin in windows
    repeat with aTab in tabs of aWin
      repeat with aSession in sessions of aTab
        if tty of aSession contains "${ttyBasename}" then
          set miniaturized of aWin to false
          set index of aWin to 1
          tell aTab to select
          return true
        end if
      end repeat
    end repeat
  end repeat
end tell
return false`
  try {
    await runAppleScript(script)
    return true
  } catch {
    return false
  }
}

// ═─ Ghostty Strategy ─────────────────────────────────────────

async function activateGhostty(cwd: string): Promise<boolean> {
  const escapedCwd = cwd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const script = `
tell application "Ghostty"
  repeat with aWin in windows
    repeat with aTab in tabs of aWin
      repeat with aTerm in terminals of aTab
        if working directory of aTerm is "${escapedCwd}" then
          activate window aWin
          select tab aTab
          focus aTerm
          return true
        end if
      end repeat
    end repeat
  end repeat
end tell
return false`
  try {
    const result = await runAppleScript(script)
    if (result === 'true') return true
    // Fallback: activate Ghostty without tab selection
    await execFileAsync('open', ['-a', 'Ghostty'], { timeout: 3000 })
    return true
  } catch {
    try {
      await execFileAsync('open', ['-a', 'Ghostty'], { timeout: 3000 })
      return true
    } catch {
      return false
    }
  }
}

// ═─ Terminal.app Strategy ────────────────────────────────────

async function activateTerminalApp(tty: string | undefined): Promise<boolean> {
  if (!tty) {
    try {
      await runAppleScript('tell application "Terminal" to activate')
      return true
    } catch {
      return false
    }
  }
  const ttyBasename = tty.replace(/^\/dev\//, '')
  const script = `
tell application "Terminal"
  activate
  repeat with aWin in windows
    repeat with aTab in tabs of aWin
      if tty of aTab contains "${ttyBasename}" then
        set miniaturized of aWin to false
        set index of aWin to 1
        set selected tab of aWin to aTab
        return true
      end if
    end repeat
  end repeat
end tell
return false`
  try {
    await runAppleScript(script)
    return true
  } catch {
    return false
  }
}

// ═─ Kitty Strategy ───────────────────────────────────────────

async function activateKitty(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('kitty', ['@', 'focus-window', '--match', `cwd:${cwd}`], { timeout: 3000 })
    return true
  } catch {
    // kitty @ may not be available or remote control not enabled
    try {
      await runAppleScript('tell application "kitty" to activate')
      return true
    } catch {
      return false
    }
  }
}

// ═─ WezTerm Strategy ─────────────────────────────────────────

async function activateWezTerm(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('wezterm', ['cli', 'list', '--format', 'json'], { timeout: 3000 })
    const panes = JSON.parse(stdout) as Array<{ cwd?: string; pane_id: string }>
    const match = panes.find(p => p.cwd === cwd)
    if (match) {
      await execFileAsync('wezterm', ['cli', 'activate-pane', '--pane-id', match.pane_id], { timeout: 2000 })
    }
    await runAppleScript('tell application "WezTerm" to activate')
    return true
  } catch {
    try {
      await runAppleScript('tell application "WezTerm" to activate')
      return true
    } catch {
      return false
    }
  }
}

// ═─ cmux Strategy ────────────────────────────────────────────

async function activateCmux(): Promise<boolean> {
  try {
    await execFileAsync('cmux', ['find-window', '--content', '--select'], { timeout: 3000 })
    return true
  } catch {
    try {
      await runAppleScript('tell application "cmux" to activate')
      return true
    } catch {
      return false
    }
  }
}

// ═─ Bundle ID Fallback ───────────────────────────────────────

async function activateByBundleId(bundleId: string): Promise<boolean> {
  const script = `tell application id "${bundleId}" to activate`
  try {
    await runAppleScript(script)
    return true
  } catch {
    return false
  }
}

async function fallbackActivate(): Promise<boolean> {
  for (const term of FALLBACK_TERMINALS) {
    if (await activateByBundleId(term.bundleId)) return true
  }
  return false
}

// ═─ TerminalJumper Class ─────────────────────────────────────

export class TerminalJumper {
  private platform: PlatformTerminalJumper

  constructor() {
    this.platform = process.platform === 'darwin'
      ? new MacOSTerminalJumper()
      : new NoOpTerminalJumper()
  }

  async jump(session: SessionState): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Terminal jump is only supported on macOS' }
    }

    if (!session.pid) {
      return { success: false, error: 'No PID available for this session' }
    }

    try {
      // Strategy 1: tmux + yabai
      if (await isTmuxAvailable()) {
        const target = await findTmuxTarget(session.pid)
        if (target && await activateTmux(target)) {
          return { success: true }
        }
      }

      // Detect which terminal hosts this session
      const info = await this.platform.detectTerminal(session.pid)

      if (info) {
        // Strategy 2: Terminal-specific activation
        if (await this.platform.focusTerminal(info, session)) {
          return { success: true }
        }

        // Strategy 3: Bundle ID fallback for detected terminal
        if (await activateByBundleId(info.bundleId)) {
          return { success: true }
        }
      }

      // Fallback: try common terminals in priority order
      if (await fallbackActivate()) {
        return { success: true }
      }

      return { success: false, error: 'Could not activate any terminal' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}

// ═─ macOS Implementation ─────────────────────────────────────

class MacOSTerminalJumper implements PlatformTerminalJumper {
  async detectTerminal(pid: number): Promise<TerminalInfo | null> {
    return detectTerminalMacOS(pid)
  }

  async focusTerminal(info: TerminalInfo, session: SessionState): Promise<boolean> {
    switch (info.name) {
      case 'iTerm2':
        return activateITerm2(info.tty)
      case 'Ghostty':
        return activateGhostty(session.cwd)
      case 'Terminal':
        return activateTerminalApp(info.tty)
      case 'kitty':
        return activateKitty(session.cwd)
      case 'wezterm':
        return activateWezTerm(session.cwd)
      case 'cmux':
        return activateCmux()
      default:
        return activateByBundleId(info.bundleId)
    }
  }
}

// ═─ No-Op for Unsupported Platforms ──────────────────────────

class NoOpTerminalJumper implements PlatformTerminalJumper {
  async detectTerminal(): Promise<null> {
    return null
  }

  async focusTerminal(): Promise<boolean> {
    return false
  }
}
