import { spawn, ChildProcess } from 'child_process'
import * as readline from 'readline'
import { EventEmitter } from 'events'
import type { StreamEvent, StreamSessionOptions, PermissionResult } from './types'

export interface StreamSessionEvents {
  event: (event: StreamEvent) => void
}

const MAX_LINE_BYTES = 10 * 1024 * 1024 // 10MB

export class StreamSession {
  private _proc: ChildProcess | null = null
  private _sessionId: string | null = null
  private _writeQueue: Promise<void> = Promise.resolve()
  private _rl: readline.Interface | null = null
  private readonly _emitter = new EventEmitter()

  get sessionId(): string | null {
    return this._sessionId
  }

  get alive(): boolean {
    return this._proc !== null && this._proc.exitCode === null
  }

  get pid(): number | undefined {
    return this._proc?.pid
  }

  on<K extends keyof StreamSessionEvents>(event: K, listener: StreamSessionEvents[K]): void {
    this._emitter.on(event, listener)
  }

  off<K extends keyof StreamSessionEvents>(event: K, listener: StreamSessionEvents[K]): void {
    this._emitter.off(event, listener)
  }

  spawn(options: StreamSessionOptions): void {
    const args = [
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',
      '--verbose',
    ]

    if (options.sessionId === 'continue') {
      args.push('--continue', '--fork-session')
    } else if (options.sessionId) {
      args.push('--resume', options.sessionId)
    }

    if (options.model) {
      args.push('--model', options.model)
    }

    if (options.permissionMode) {
      args.push('--permission-mode', options.permissionMode)
    }

    // Filter CLAUDECODE env vars to prevent nested session detection
    const env: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('CLAUDECODE')) {
        env[key] = value
      }
    }

    this._proc = spawn('claude', args, {
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this._proc.on('error', (err) => {
      this._emit({ type: 'error', error: err })
    })

    this._proc.on('exit', (code, signal) => {
      this._emit({ type: 'exit', exitCode: code, signal })
      this._cleanup()
    })

    // Read stderr for debug logging
    if (this._proc.stderr) {
      this._proc.stderr.on('data', (chunk: Buffer) => {
        console.error('[stream-json] stderr:', chunk.toString('utf-8').trim())
      })
    }

    // Read stdout line by line
    if (this._proc.stdout) {
      this._rl = readline.createInterface({
        input: this._proc.stdout,
        crlfDelay: Infinity,
      })

      let lineBytes = 0
      this._rl.on('line', (line: string) => {
        lineBytes = Buffer.byteLength(line, 'utf-8')
        if (lineBytes > MAX_LINE_BYTES) {
          console.warn(`[stream-json] line exceeded ${MAX_LINE_BYTES} bytes, skipping`)
          return
        }
        this._handleLine(line)
      })
    }
  }

  send(text: string): void {
    const msg = {
      type: 'user',
      message: { role: 'user', content: text },
    }
    this._writeJSON(msg)
  }

  respondPermission(requestId: string, result: PermissionResult): void {
    const resp: Record<string, unknown> = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: result.behavior,
        },
      },
    }

    if (result.behavior === 'allow' && result.updatedInput) {
      (resp.response as Record<string, unknown>).response = {
        behavior: 'allow',
        updatedInput: result.updatedInput,
      }
    } else if (result.behavior === 'deny') {
      (resp.response as Record<string, unknown>).response = {
        behavior: 'deny',
        message: result.message ?? 'Permission denied.',
      }
    }

    this._writeJSON(resp)
  }

  async close(): Promise<void> {
    if (!this._proc || this._proc.exitCode !== null) return

    // Phase 1: close stdin, wait up to 120s
    try {
      this._proc.stdin?.end()
      await this._waitExit(120_000)
      return
    } catch {
      // timed out, proceed to phase 2
    }

    // Phase 2: SIGTERM, wait 5s
    try {
      this._proc.kill('SIGTERM')
      await this._waitExit(5_000)
      return
    } catch {
      // timed out, proceed to phase 3
    }

    // Phase 3: SIGKILL
    this._proc.kill('SIGKILL')
    await this._waitExit(5_000).catch(() => {})
  }

  // ── Private ──────────────────────────────────────────────

  private _emit(event: StreamEvent): void {
    this._emitter.emit('event', event)
  }

  private _handleLine(line: string): void {
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(line) as Record<string, unknown>
    } catch {
      console.warn('[stream-json] failed to parse JSON line, skipping')
      return
    }

    const eventType = raw.type as string

    switch (eventType) {
      case 'system':
        this._handleSystem(raw)
        break
      case 'assistant':
        this._handleAssistant(raw)
        break
      case 'user':
        // tool results from Claude Code — logged only
        break
      case 'result':
        this._handleResult(raw)
        break
      case 'control_request':
        this._handleControlRequest(raw)
        break
      case 'control_cancel_request':
        console.log('[stream-json] control_cancel_request:', raw.request_id)
        break
      default:
        console.log('[stream-json] unknown event type:', eventType)
    }
  }

  private _handleSystem(raw: Record<string, unknown>): void {
    const sid = raw.session_id as string | undefined
    if (sid) {
      this._sessionId = sid
    }
    console.log('[stream-json] system init, session_id:', sid)
  }

  private _handleAssistant(raw: Record<string, unknown>): void {
    const message = raw.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined
    if (!content) return

    for (const block of content) {
      const blockType = block.type as string
      switch (blockType) {
        case 'text':
          this._emit({
            type: 'text',
            content: block.text as string,
          })
          break
        case 'tool_use':
          this._emit({
            type: 'tool_use',
            toolName: block.name as string,
            toolInput: block.input as Record<string, unknown>,
            toolUseId: block.id as string,
          })
          break
        case 'thinking':
          this._emit({
            type: 'thinking',
            content: block.thinking as string,
          })
          break
      }
    }
  }

  private _handleResult(raw: Record<string, unknown>): void {
    const sid = raw.session_id as string | undefined
    if (sid) this._sessionId = sid

    const usage = raw.usage as Record<string, unknown> | undefined

    this._emit({
      type: 'result',
      content: raw.result as string,
      sessionId: sid ?? this._sessionId ?? undefined,
      done: true,
      inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : undefined,
      outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : undefined,
    })
  }

  private _handleControlRequest(raw: Record<string, unknown>): void {
    const request = raw.request as Record<string, unknown> | undefined
    const subtype = request?.subtype as string | undefined

    if (subtype !== 'can_use_tool') {
      console.log('[stream-json] ignoring control_request subtype:', subtype)
      return
    }

    this._emit({
      type: 'permission_request',
      requestId: raw.request_id as string,
      toolName: request?.tool_name as string,
      toolInput: request?.input as Record<string, unknown>,
    })
  }

  /** Serialized JSON write to stdin — prevents concurrent writes */
  private _writeJSON(obj: Record<string, unknown>): void {
    this._writeQueue = this._writeQueue.then(() => {
      return new Promise<void>((resolve, reject) => {
        if (!this._proc?.stdin?.writable) {
          reject(new Error('stdin not writable'))
          return
        }
        const data = JSON.stringify(obj) + '\n'
        this._proc.stdin!.write(data, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    })
  }

  private _waitExit(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._proc || this._proc.exitCode !== null) {
        resolve()
        return
      }
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      this._proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private _cleanup(): void {
    this._rl?.close()
    this._rl = null
    this._proc = null
  }
}
