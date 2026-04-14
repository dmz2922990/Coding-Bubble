import WebSocket from 'ws'
import type { ClientMessage, ServerMessage, ListDirectoryMessage, ListDirectoryResultMessage, DirEntry } from '../shared/protocol'

export interface RemoteServerConfig {
  id: string
  name: string
  host: string
  port: number
  token?: string
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface ConnectionInfo {
  config: RemoteServerConfig
  state: ConnectionState
}

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

export type ServerMessageHandler = (serverId: string, message: ServerMessage) => void
export type StateChangeHandler = (serverId: string, state: ConnectionState) => void

export class RemoteManager {
  private _connections = new Map<string, {
    config: RemoteServerConfig
    ws: WebSocket | null
    state: ConnectionState
    reconnectTimer: ReturnType<typeof setTimeout> | null
    reconnectAttempt: number
    pendingRequests: Map<string, PendingRequest<unknown>>
  }>()

  private _messageHandlers: ServerMessageHandler[] = []
  private _stateChangeHandler: StateChangeHandler | null = null

  onMessage(handler: ServerMessageHandler): void {
    this._messageHandlers.push(handler)
  }

  onStateChange(handler: StateChangeHandler): void {
    this._stateChangeHandler = handler
  }

  getConnections(): ConnectionInfo[] {
    return Array.from(this._connections.values()).map(c => ({
      config: c.config,
      state: c.state,
    }))
  }

  getConnection(serverId: string): ConnectionInfo | undefined {
    const conn = this._connections.get(serverId)
    if (!conn) return undefined
    return { config: conn.config, state: conn.state }
  }

  addServer(config: RemoteServerConfig): void {
    if (this._connections.has(config.id)) return
    this._connections.set(config.id, {
      config,
      ws: null,
      state: 'disconnected',
      reconnectTimer: null,
      reconnectAttempt: 0,
      pendingRequests: new Map(),
    })
    this._connect(config.id)
  }

  removeServer(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn) return
    this._clearReconnectTimer(serverId)
    this._rejectAllPending(conn, new Error('Server removed'))
    if (conn.ws) {
      conn.ws.close()
    }
    this._connections.delete(serverId)
  }

  connect(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn || conn.state === 'connected' || conn.state === 'connecting') return
    this._connect(serverId)
  }

  disconnect(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn) return
    this._clearReconnectTimer(serverId)
    this._rejectAllPending(conn, new Error('Disconnected'))
    conn.reconnectAttempt = 0
    if (conn.ws) {
      conn.ws.close()
      conn.ws = null
    }
    this._setState(serverId, 'disconnected')
  }

  send(serverId: string, message: ClientMessage): void {
    const conn = this._connections.get(serverId)
    if (!conn?.ws || conn.ws.readyState !== WebSocket.OPEN) return
    conn.ws.send(JSON.stringify(message))
  }

  async listDirectory(serverId: string, dirPath?: string): Promise<DirEntry[]> {
    const requestId = `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const message: ListDirectoryMessage = {
      type: 'list_directory',
      requestId,
      path: dirPath,
    }

    return this._sendWithResponse<ListDirectoryResultMessage>(serverId, message, requestId)
      .then(result => {
        if (result.error) throw new Error(result.error)
        return result.entries
      })
  }

  sendToAll(message: ClientMessage): void {
    for (const conn of this._connections.values()) {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify(message))
      }
    }
  }

  async close(): Promise<void> {
    for (const [id] of this._connections) {
      this.removeServer(id)
    }
  }

  // ── Private ──────────────────────────────────────────────

  private _setState(serverId: string, state: ConnectionState): void {
    const conn = this._connections.get(serverId)
    if (!conn) return
    conn.state = state
    this._stateChangeHandler?.(serverId, state)
  }

  private _connect(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn) return

    this._setState(serverId, 'connecting')
    const { host, port, token } = conn.config
    const url = `ws://${host}:${port}`

    console.log(`[remote-manager] connecting to ${url}`)
    const ws = new WebSocket(url)

    ws.on('open', () => {
      conn.ws = ws
      // Send auth
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }))
      } else {
        ws.send(JSON.stringify({ type: 'auth', token: '' }))
      }
    })

    ws.on('message', (data) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(data.toString('utf-8')) as ServerMessage
      } catch {
        return
      }

      // Handle auth_result
      if (msg.type === 'auth_result') {
        if (msg.success) {
          this._setState(serverId, 'connected')
          conn.reconnectAttempt = 0
          console.log(`[remote-manager] connected to ${url}`)
        } else {
          this._setState(serverId, 'disconnected')
          console.error(`[remote-manager] auth failed: ${msg.error}`)
          ws.close()
        }
        return
      }

      // Resolve pending requests
      if ('requestId' in msg && msg.requestId) {
        const pending = conn.pendingRequests.get(msg.requestId as string)
        if (pending) {
          clearTimeout(pending.timer)
          conn.pendingRequests.delete(msg.requestId as string)
          pending.resolve(msg)
          return
        }
      }

      // Dispatch to handlers
      for (const handler of this._messageHandlers) {
        handler(serverId, msg)
      }
    })

    ws.on('close', () => {
      if (conn.ws === ws) {
        conn.ws = null
        this._setState(serverId, 'disconnected')
        this._rejectAllPending(conn, new Error('Connection closed'))
        this._scheduleReconnect(serverId)
      }
    })

    ws.on('error', (err) => {
      console.error(`[remote-manager] connection error:`, (err as Error).message)
    })
  }

  private _scheduleReconnect(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn) return

    this._clearReconnectTimer(serverId)
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, conn.reconnectAttempt), RECONNECT_MAX_MS)
    conn.reconnectAttempt++
    console.log(`[remote-manager] reconnecting in ${delay}ms (attempt ${conn.reconnectAttempt})`)

    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null
      this._connect(serverId)
    }, delay)
  }

  private _clearReconnectTimer(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (conn?.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = null
    }
  }

  private _sendWithResponse<T>(serverId: string, message: ClientMessage, requestId: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const conn = this._connections.get(serverId)
      if (!conn?.ws || conn.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'))
        return
      }

      const timer = setTimeout(() => {
        conn.pendingRequests.delete(requestId)
        reject(new Error('Request timeout'))
      }, 10_000)

      conn.pendingRequests.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer })
      conn.ws.send(JSON.stringify(message))
    })
  }

  private _rejectAllPending(conn: { pendingRequests: Map<string, PendingRequest<unknown>> }, error: Error): void {
    for (const [, pending] of conn.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    conn.pendingRequests.clear()
  }
}
