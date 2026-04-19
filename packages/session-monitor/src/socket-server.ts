import * as net from 'net'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { HookEvent, HookResponse, PermissionSuggestion } from './types'
import { mergeSuggestions } from './types'

const WINDOWS_TCP_PORT = 19527

function getDefaultSocketPath(): string {
  return path.join(os.tmpdir(), 'claude-bubble.sock')
}

const DEFAULT_SOCKET_PATH = getDefaultSocketPath()

/**
 * Tool Use ID Cache
 * PermissionRequest events don't include tool_use_id. We cache it from the
 * preceding PreToolUse event using a composite key so we can correlate them.
 */
class ToolUseIdCache {
  /** Map<"sessionId:toolName:serializedInput", string[]> */
  private _cache = new Map<string, string[]>()

  push(key: string, toolUseId: string): void {
    const queue = this._cache.get(key) ?? []
    queue.push(toolUseId)
    this._cache.set(key, queue)
  }

  pop(key: string): string | undefined {
    const queue = this._cache.get(key)
    if (!queue?.length) return undefined
    const id = queue.shift()!
    if (queue.length === 0) this._cache.delete(key)
    return id
  }

  /** Build a deterministic cache key from session + tool metadata */
  static makeKey(sessionId: string, toolName: string, input: Record<string, unknown> | null): string {
    const serialized = input ? JSON.stringify(input, Object.keys(input).sort()) : ''
    return `${sessionId}:${toolName}:${serialized}`
  }
}

export interface SocketServerOptions {
  socketPath?: string
  /** Return true to ignore events from this PID (e.g. stream-managed processes) */
  isManagedPid?: (pid: number) => boolean
  onEvent: (event: HookEvent) => void
  onPermissionRequest: (
    sessionId: string,
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown> | null,
    suggestions: PermissionSuggestion[]
  ) => Promise<HookResponse>
  /** Called when hook script disconnects before permission was resolved (user answered in terminal) */
  onPermissionCancel?: (sessionId: string) => void
}

export interface SocketServer {
  close: () => Promise<void>
}

export function createSocketServer(options: SocketServerOptions): SocketServer {
  const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH
  const cache = new ToolUseIdCache()

  const isWindows = process.platform === 'win32'

  // Remove stale socket if it exists (Unix only)
  if (!isWindows) {
    try {
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath)
    } catch {
      // ignore
    }
  }

  const server = net.createServer((socket) => {
    let buffer = ''

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8')

      try {
        const event: HookEvent = JSON.parse(buffer.trim())
        const payload = event.payload as Record<string, unknown> | undefined

        // Ignore events from stream-managed processes (hooks skipped via CLAUDE_BUBBLE_SKIP_HOOK env var)
        if (event.pid && options.isManagedPid?.(event.pid)) {
          console.log('[socket-server] ignoring event from managed PID:', event.pid)
          socket.end()
          return
        }

        // PermissionRequest - wait for user decision
        if (event.hook_event_name === 'PermissionRequest') {
          console.log('[socket-server] PermissionRequest received for session:', event.session_id)
          const toolName = (payload?.tool_name as string) ?? (payload?.tool as string) ?? 'unknown'
          const toolInput = (payload?.tool_input as Record<string, unknown>) ?? (payload?.input as Record<string, unknown>) ?? null
          const rawSuggestions = Array.isArray(payload?.permission_suggestions)
            ? (payload!.permission_suggestions as PermissionSuggestion[])
            : [] as PermissionSuggestion[]
          const suggestions = mergeSuggestions(rawSuggestions)
          const key = ToolUseIdCache.makeKey(event.session_id, toolName, toolInput)
          console.log('[socket-server] cache key:', key)
          const toolUseId = cache.pop(key)
          console.log('[socket-server] toolUseId from cache:', toolUseId)

          // Keep socket open; wait for renderer decision
          let permissionResolved = false
          options.onPermissionRequest(
            event.session_id,
            toolUseId ?? '',
            toolName,
            toolInput,
            suggestions
          ).then((response) => {
            permissionResolved = true
            console.log('[socket-server] sending response:', JSON.stringify(response))
            socket.write(JSON.stringify(response) + '\n')
            socket.end()
          }).catch((err) => {
            permissionResolved = true
            console.error('[socket-server] permission handler error:', err)
            if (!socket.destroyed) {
              socket.write(JSON.stringify({ decision: 'deny', reason: 'handler error' }) + '\n')
              socket.end()
            }
          })

          // Hook script disconnected before we resolved — user answered in terminal
          socket.on('close', () => {
            if (!permissionResolved) {
              console.log('[socket-server] hook disconnected during PermissionRequest, cancelling:', event.session_id)
              options.onPermissionCancel?.(event.session_id)
            }
          })
          return
        }

        // Cache tool_use_id from PreToolUse for later PermissionRequest correlation
        if (event.hook_event_name === 'PreToolUse' && payload?.tool_use_id) {
          const toolName = (payload.tool_name as string) ?? (payload.tool as string) ?? ''
          const toolInput = (payload.tool_input as Record<string, unknown>) ?? (payload.input as Record<string, unknown>) ?? null
          const key = ToolUseIdCache.makeKey(event.session_id, toolName, toolInput)
          cache.push(key, payload.tool_use_id as string)
          console.log('[socket-server] PreToolUse cached toolUseId for key:', key)
        }

        options.onEvent(event)
        socket.end()
      } catch {
        // Incomplete JSON — wait for more data
        if (buffer.length > 65536) {
          socket.end()
        }
      }
    })

    socket.on('error', (err) => {
      console.error('[socket-server] socket error:', err)
    })
  })

  if (isWindows) {
    server.listen(WINDOWS_TCP_PORT, '127.0.0.1', () => {
      console.log(`[socket-server] listening on TCP port ${WINDOWS_TCP_PORT}`)
    })
  } else {
    server.listen(socketPath, () => {
      console.log(`[socket-server] listening on ${socketPath}`)
    })
  }

  server.on('error', (err) => {
    console.error('[socket-server] server error:', err)
  })

  return {
    close: async () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          if (!isWindows) {
            try { fs.unlinkSync(socketPath) } catch { /* ignore */ }
          }
          resolve()
        })
      })
    }
  }
}
