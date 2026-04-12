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
    // Signal hook scripts to skip processing — permissions handled via stream-json
    env['CLAUDE_BUBBLE_SKIP_HOOK'] = '1'

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
    const innerResponse: Record<string, unknown> = {
      behavior: result.behavior,
    }

    if (result.behavior === 'allow') {
      // Claude Code requires updatedInput — echo back original input or empty object
      innerResponse.updatedInput = result.updatedInput ?? {}
    } else if (result.behavior === 'deny') {
      innerResponse.message = result.message ?? 'Permission denied.'
    }

    const resp = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: innerResponse,
      },
    }

    console.log('[stream-json] sending control_response:', JSON.stringify(resp))
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
      case 'stream_event':
        this._handleStreamEvent(raw)
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
      case 'tool_progress':
        this._handleToolProgress(raw)
        break
      case 'tool_use_summary':
        this._handleToolSummary(raw)
        break
      case 'rate_limit_event':
        this._handleRateLimit(raw)
        break
      default:
        console.log('[stream-json] unknown event type:', eventType)
    }
  }

  private _handleSystem(raw: Record<string, unknown>): void {
    const sid = raw.session_id as string | undefined
    if (sid) this._sessionId = sid

    const subtype = raw.subtype as string | undefined
    switch (subtype) {
      case 'init':
        console.log('[stream-json] system init, session_id:', sid)
        break
      case 'session_state_changed':
        this._emit({
          type: 'session_state',
          state: raw.state as 'idle' | 'running' | 'requires_action',
        })
        break
      case 'status':
        if (raw.status === 'compacting') {
          this._emit({ type: 'system_status', statusKind: 'compacting' })
        }
        break
      case 'compact_boundary':
        this._emit({ type: 'system_status', statusKind: 'compacted' })
        break
      case 'api_retry':
        this._emit({
          type: 'system_status',
          statusKind: 'api_retry',
          attempt: raw.attempt as number,
          maxRetries: raw.max_retries as number,
          delayMs: raw.retry_delay_ms as number,
        })
        break
      default:
        break
    }
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
      durationMs: typeof raw.duration_ms === 'number' ? raw.duration_ms : undefined,
      durationApiMs: typeof raw.duration_api_ms === 'number' ? raw.duration_api_ms : undefined,
      costUsd: typeof raw.total_cost_usd === 'number' ? raw.total_cost_usd : undefined,
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

  private _handleStreamEvent(raw: Record<string, unknown>): void {
    const event = raw.event as Record<string, unknown> | undefined
    if (!event) return

    const eventType = event.type as string
    if (eventType !== 'content_block_delta') return

    const delta = event.delta as Record<string, unknown> | undefined
    if (delta?.type !== 'text_delta') return

    this._emit({
      type: 'text_delta',
      content: delta.text as string,
    })
  }

  private _handleToolProgress(raw: Record<string, unknown>): void {
    this._emit({
      type: 'tool_progress',
      toolUseId: raw.tool_use_id as string,
      toolName: raw.tool_name as string,
      elapsedSeconds: raw.elapsed_time_seconds as number,
    })
  }

  private _handleToolSummary(raw: Record<string, unknown>): void {
    this._emit({
      type: 'tool_summary',
      summary: raw.summary as string,
    })
  }

  private _handleRateLimit(raw: Record<string, unknown>): void {
    const info = raw.rate_limit_info as Record<string, unknown> | undefined
    this._emit({
      type: 'rate_limit',
      rateLimitStatus: info?.status as string | undefined,
      resetsAt: info?.resetsAt as number | undefined,
    })
  }

  /** Serialized JSON write to stdin — prevents concurrent writes */
  private _writeJSON(obj: Record<string, unknown>): void {
    this._writeQueue = this._writeQueue
      .catch(() => {}) // recover from previous rejection to keep queue alive
      .then(() => {
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
