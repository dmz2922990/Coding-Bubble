import { WebSocketServer, WebSocket } from 'ws'
import * as os from 'os'
import type { ClientMessage, ServerMessage } from '../shared/protocol'
import { ErrorCodes } from '../shared/errors'

const AUTH_TIMEOUT_MS = 5000
const DEFAULT_PORT = 9527

export interface RemoteServerOptions {
  port?: number
  token?: string
}

export interface RemoteServerHandlers {
  onAuth?: () => void
  onDisconnect?: () => void
  onMessage: (ws: WebSocket, message: ClientMessage) => void
}

export class RemoteServer {
  private _wss: WebSocketServer | null = null
  private _client: WebSocket | null = null
  private _options: RemoteServerOptions
  private _handlers: RemoteServerHandlers
  private _authTimer: ReturnType<typeof setTimeout> | null = null
  private _authenticated = false

  constructor(options: RemoteServerOptions, handlers: RemoteServerHandlers) {
    this._options = options
    this._handlers = handlers
  }

  get hasClient(): boolean {
    return this._client !== null && this._client.readyState === WebSocket.OPEN && this._authenticated
  }

  send(message: ServerMessage): void {
    if (!this._client || this._client.readyState !== WebSocket.OPEN) return
    this._client.send(JSON.stringify(message))
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this._options.port ?? DEFAULT_PORT
      this._wss = new WebSocketServer({ port })

      this._wss.on('error', (err) => {
        console.error('[remote-server] server error:', err)
        reject(err)
      })

      this._wss.on('listening', () => {
        console.log(`[remote-server] listening on port ${port}`)
        resolve()
      })

      this._wss.on('connection', (ws) => {
        this._handleConnection(ws)
      })
    })
  }

  async close(): Promise<void> {
    this._clearAuthTimer()
    if (this._client) {
      this._client.close()
      this._client = null
      this._authenticated = false
    }
    if (this._wss) {
      return new Promise((resolve) => {
        this._wss!.close(() => resolve())
        this._wss = null
      })
    }
  }

  private _handleConnection(ws: WebSocket): void {
    // Enforce single client
    if (this._client && this._client.readyState === WebSocket.OPEN) {
      this._sendError(ws, ErrorCodes.ALREADY_CONNECTED, 'A client is already connected')
      ws.close()
      return
    }

    this._client = ws
    this._authenticated = false

    // Set auth timeout
    if (this._options.token) {
      this._authTimer = setTimeout(() => {
        if (!this._authenticated) {
          this._sendError(ws, ErrorCodes.AUTH_TIMEOUT, 'Authentication timeout')
          ws.close()
          this._client = null
        }
      }, AUTH_TIMEOUT_MS)
    } else {
      // No token required — authenticate immediately
      this._authenticated = true
      this._sendServerInfo()
      this._handlers.onAuth?.()
    }

    ws.on('message', (data) => {
      this._handleMessage(ws, data)
    })

    ws.on('close', () => {
      this._clearAuthTimer()
      if (this._client === ws) {
        this._client = null
        this._authenticated = false
        this._handlers.onDisconnect?.()
      }
    })

    ws.on('error', (err) => {
      console.error('[remote-server] client error:', err)
    })
  }

  private _handleMessage(ws: WebSocket, data: WebSocket.Data): void {
    let raw: unknown
    try {
      const str = typeof data === 'string' ? data : data.toString('utf-8')
      raw = JSON.parse(str)
    } catch {
      this._sendError(ws, ErrorCodes.INVALID_MESSAGE, 'Failed to parse message')
      return
    }

    if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
      this._sendError(ws, ErrorCodes.INVALID_MESSAGE, 'Message must have a type field')
      return
    }

    const message = raw as ClientMessage

    // Handle auth specially
    if (message.type === 'auth') {
      this._handleAuth(ws, message.token)
      return
    }

    // Require auth for all other messages
    if (!this._authenticated) {
      this._sendError(ws, ErrorCodes.AUTH_FAILED, 'Not authenticated')
      return
    }

    this._handlers.onMessage(ws, message)
  }

  private _handleAuth(ws: WebSocket, token: string): void {
    this._clearAuthTimer()

    if (!this._options.token || token === this._options.token) {
      this._authenticated = true
      ws.send(JSON.stringify({ type: 'auth_result', success: true }))
      this._sendServerInfo()
      this._handlers.onAuth?.()
    } else {
      this._sendError(ws, ErrorCodes.AUTH_FAILED, 'Invalid token')
      ws.send(JSON.stringify({ type: 'auth_result', success: false, error: 'Invalid token' }))
      ws.close()
      this._client = null
      this._authenticated = false
    }
  }

  private _sendServerInfo(): void {
    this.send({
      type: 'server_info',
      hostname: os.hostname(),
      platform: process.platform,
      pid: process.pid,
    })
  }

  private _sendError(ws: WebSocket, code: string, message: string): void {
    const error: ServerMessage = { type: 'error', code, message }
    ws.send(JSON.stringify(error))
  }

  private _clearAuthTimer(): void {
    if (this._authTimer) {
      clearTimeout(this._authTimer)
      this._authTimer = null
    }
  }
}
