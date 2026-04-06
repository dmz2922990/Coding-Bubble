import * as net from 'net'
import * as fs from 'fs'
import type { HookEvent, HookResponse } from './types'

const DEFAULT_SOCKET_PATH = '/tmp/claude-bubble.sock'

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
  onEvent: (event: HookEvent) => void
  onPermissionRequest: (
    sessionId: string,
    toolUseId: string | undefined,
    toolName: string,
    toolInput: Record<string, unknown> | null
  ) => Promise<HookResponse>
}

export interface SocketServer {
  close: () => Promise<void>
}

export function createSocketServer(options: SocketServerOptions): SocketServer {
  const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH
  const cache = new ToolUseIdCache()

  // Remove stale socket if it exists
  try {
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath)
  } catch {
    // ignore
  }

  const server = net.createServer((socket) => {
    let buffer = ''

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8')

      try {
        const event: HookEvent = JSON.parse(buffer.trim())
        const payload = event.payload as Record<string, unknown> | undefined

        if (event.hook_event_name === 'PermissionRequest') {
          // Keep socket open; wait for renderer decision
          const toolName = (payload?.tool_name as string) ?? (payload?.tool as string) ?? 'unknown'
          const toolInput = (payload?.tool_input as Record<string, unknown>) ?? (payload?.input as Record<string, unknown>) ?? null
          const key = ToolUseIdCache.makeKey(event.session_id, toolName, toolInput)
          const toolUseId = cache.pop(key)

          options.onPermissionRequest(
            event.session_id,
            toolUseId,
            toolName,
            toolInput
          ).then((response) => {
            socket.write(JSON.stringify(response) + '\n')
            socket.end()
          }).catch((err) => {
            console.error('[socket-server] permission handler error:', err)
            socket.write(JSON.stringify({ decision: 'allow', reason: 'handler error' }) + '\n')
            socket.end()
          })
        } else {
          // Cache tool_use_id from PreToolUse for later PermissionRequest correlation
          if (event.hook_event_name === 'PreToolUse' && payload?.tool_use_id) {
            const toolName = (payload.tool_name as string) ?? (payload.tool as string) ?? ''
            const toolInput = (payload.tool_input as Record<string, unknown>) ?? (payload.input as Record<string, unknown>) ?? null
            const key = ToolUseIdCache.makeKey(event.session_id, toolName, toolInput)
            cache.push(key, payload.tool_use_id as string)
          }

          options.onEvent(event)
          socket.end()
        }
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

  server.listen(socketPath, () => {
    console.log(`[socket-server] listening on ${socketPath}`)
  })

  server.on('error', (err) => {
    console.error('[socket-server] server error:', err)
  })

  return {
    close: async () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          try { fs.unlinkSync(socketPath) } catch { /* ignore */ }
          resolve()
        })
      })
    }
  }
}
