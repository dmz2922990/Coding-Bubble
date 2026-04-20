import WebSocket from 'ws'
import * as fs from 'fs'
import * as crypto from 'crypto'
import type { ClientMessage, ServerMessage, ListDirectoryMessage, ListDirectoryResultMessage, DirEntry } from '../shared/protocol'

export interface RemoteServerConfig {
  id: string
  name: string
  host: string
  port: number
  token?: string
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ConnectionInfo {
  config: RemoteServerConfig
  state: ConnectionState
  nextReconnectAt?: number
}

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

export type ServerMessageHandler = (serverId: string, message: ServerMessage) => void
export type StateChangeHandler = (serverId: string, state: ConnectionState, extra?: { nextReconnectAt?: number }) => void

export class RemoteManager {
  private _connections = new Map<string, {
    config: RemoteServerConfig
    ws: WebSocket | null
    state: ConnectionState
    reconnectTimer: ReturnType<typeof setTimeout> | null
    reconnectAttempt: number
    nextReconnectAt: number | null
    pendingRequests: Map<string, PendingRequest<unknown>>
    serverVersion?: string
  }>()

  private _messageHandlers: ServerMessageHandler[] = []
  private _stateChangeHandler: StateChangeHandler | null = null
  private _bundledServerPath: string | null = null

  setBundledServerPath(filePath: string): void {
    this._bundledServerPath = filePath
  }

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
      nextReconnectAt: c.nextReconnectAt ?? undefined,
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
      nextReconnectAt: null,
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
    if (conn.state === 'reconnecting') {
      this._clearReconnectTimer(serverId)
      conn.nextReconnectAt = null
    }
    this._connect(serverId)
  }

  disconnect(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn) return
    this._clearReconnectTimer(serverId)
    this._rejectAllPending(conn, new Error('Disconnected'))
    conn.reconnectAttempt = 0
    conn.nextReconnectAt = null
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

  // ── Auto Update ────────────────────────────────────────────

  private _checkAndUpdate(serverId: string, serverVersion?: string): void {
    if (!this._bundledServerPath) {
      console.log(`[remote-manager] update check skipped: no bundled server path`)
      return
    }
    if (!fs.existsSync(this._bundledServerPath)) {
      console.log(`[remote-manager] update check skipped: bundled file not found at ${this._bundledServerPath}`)
      return
    }

    const bundledVersion = __BUNDLED_REMOTE_SERVER_VERSION__
    const remoteVersion = serverVersion || '0.0.0'
    console.log(`[remote-manager] version check: bundle=${bundledVersion}, server=${remoteVersion}`)
    if (this._compareVersions(bundledVersion, remoteVersion) <= 0) return

    console.log(`[remote-manager] server v${remoteVersion} < bundle v${bundledVersion}, sending update`)
    this._sendUpdate(serverId)
  }

  private _compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0
      const nb = pb[i] || 0
      if (na !== nb) return na - nb
    }
    return 0
  }

  private _sendUpdate(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn?.ws || conn.ws.readyState !== WebSocket.OPEN) return
    if (!this._bundledServerPath) return
    if (!fs.existsSync(this._bundledServerPath)) return

    const filePath = this._bundledServerPath
    const fileContent = fs.readFileSync(filePath)
    const checksum = crypto.createHash('sha256').update(fileContent).digest('hex')

    // Send update offer
    conn.ws.send(JSON.stringify({
      type: 'update_offer',
      version: __BUNDLED_REMOTE_SERVER_VERSION__,
      size: fileContent.length,
      checksum,
    }))

    // Wait for accept, then send chunks
    const chunkHandler = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString('utf-8')) as ServerMessage
        if (msg.type === 'update_accept') {
          conn.ws!.off('message', chunkHandler)

          // Send file in 64KB chunks
          const CHUNK_SIZE = 64 * 1024
          let offset = 0
          let sequence = 0

          while (offset < fileContent.length) {
            const chunk = fileContent.subarray(offset, offset + CHUNK_SIZE)
            conn.ws!.send(JSON.stringify({
              type: 'update_chunk',
              sequence: sequence++,
              data: chunk.toString('base64'),
            }))
            offset += CHUNK_SIZE
          }

          conn.ws!.send(JSON.stringify({ type: 'update_complete' }))
          console.log(`[remote-manager] update sent (${sequence} chunks)`)
        } else if (msg.type === 'update_reject') {
          conn.ws!.off('message', chunkHandler)
          console.log(`[remote-manager] update rejected: ${msg.reason}`)
        }
      } catch { /* ignore parse errors */ }
    }

    conn.ws.on('message', chunkHandler)
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
    const extra = state === 'reconnecting' && conn.nextReconnectAt
      ? { nextReconnectAt: conn.nextReconnectAt }
      : undefined
    this._stateChangeHandler?.(serverId, state, extra)
  }

  private _connect(serverId: string): void {
    const conn = this._connections.get(serverId)
    if (!conn) return

    this._setState(serverId, 'connecting')
    const { host, port, token } = conn.config
    const url = `ws://${host}:${port}`

    console.log(`[remote-manager] connecting to ${url}`)
    const ws = new WebSocket(url)
    conn.ws = ws

    ws.on('open', () => {
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

      // Handle server_info — check version and trigger update
      if (msg.type === 'server_info') {
        conn.serverVersion = msg.version
        this._checkAndUpdate(serverId, msg.version)
        return
      }

      // Handle update_result
      if (msg.type === 'update_result') {
        if (msg.success) {
          console.log(`[remote-manager] remote server updated successfully`)
        } else {
          console.error(`[remote-manager] remote server update failed: ${msg.error}`)
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
    conn.nextReconnectAt = Date.now() + delay
    console.log(`[remote-manager] reconnecting in ${delay}ms (attempt ${conn.reconnectAttempt})`)

    this._setState(serverId, 'reconnecting')

    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null
      conn.nextReconnectAt = null
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
