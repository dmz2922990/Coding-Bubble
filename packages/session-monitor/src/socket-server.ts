import * as net from 'net'
import * as fs from 'fs'
import type { HookEvent, HookResponse } from './types'

const DEFAULT_SOCKET_PATH = '/tmp/claude-bubble.sock'

export interface SocketServerOptions {
  socketPath?: string
  onEvent: (event: HookEvent) => void
  onPermissionRequest: (
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown> | null
  ) => Promise<HookResponse>
}

export interface SocketServer {
  close: () => Promise<void>
}

export function createSocketServer(options: SocketServerOptions): SocketServer {
  const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH

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

      // For PermissionRequest, we keep the connection open and wait for renderer decision
      // For other events, process immediately and close
      try {
        const event: HookEvent = JSON.parse(buffer.trim())

        if (event.hook_event_name === 'PermissionRequest') {
          // Keep socket open; store it for later decision
          const payload = event.payload as Record<string, unknown> | undefined
          const toolName = (payload?.tool as string) ?? 'unknown'
          const toolInput = (payload?.input as Record<string, unknown>) ?? null

          options.onPermissionRequest(
            event.session_id,
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
          options.onEvent(event)
          socket.end()
        }
      } catch {
        // Incomplete data not yet — wait for more
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
