import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { spawn } from 'child_process'
import { RemoteServer } from './server'
import { HookCollector } from './hook-collector'
import { StreamHandler } from './stream-handler'
import type { ClientMessage, UpdateOfferMessage, UpdateChunkMessage } from '../shared/protocol'
import { ErrorCodes } from '../shared/errors'

// ── Directory Listing ─────────────────────────────────────────

function listDirectory(dirPath: string): { name: string; type: 'file' | 'directory'; path: string }[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' as const : 'file' as const,
        path: path.join(dirPath, e.name),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return []
  }
}

// ── CLI Argument Parsing ──────────────────────────────────────

function parseArgs(argv: string[]): { port: number; token?: string } {
  const args = { port: 9527, token: undefined as string | undefined }
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--port':
        args.port = parseInt(argv[++i], 10)
        break
      case '--token':
        args.token = argv[++i]
        break
    }
  }
  return args
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  const remoteServer = new RemoteServer(
    { port: args.port, token: args.token },
    {
      onAuth: () => {
        console.log('[remote] client connected and authenticated')
      },
      onDisconnect: () => {
        console.log('[remote] client disconnected')
        hookCollector.denyAllPending('Client disconnected')
      },
      onMessage: (ws, message: ClientMessage) => {
        handleMessage(message)
      },
    }
  )

  const hookCollector = new HookCollector(remoteServer)
  const streamHandler = new StreamHandler(remoteServer)

  // ── Update State ───────────────────────────────────────────
  let updateState: {
    version: string
    size: number
    checksum: string
    chunks: Buffer[]
    received: number
  } | null = null

  function handleMessage(message: ClientMessage): void {
    switch (message.type) {
      case 'hook_permission_response':
        hookCollector.handlePermissionResponse(message)
        break

      case 'hook_session_close':
        // Client requests closing a remote hook session — no server-side action needed
        // The hook session will end naturally when the Claude Code session ends
        break

      case 'stream_create':
        streamHandler.handleCreate(message)
        break

      case 'stream_send':
        streamHandler.handleSend(message)
        break

      case 'stream_interrupt':
        streamHandler.handleInterrupt(message)
        break

      case 'stream_destroy':
        streamHandler.handleDestroy(message)
        break

      case 'stream_permission_response':
        streamHandler.handlePermissionResponse(message)
        break

      case 'stream_set_permission_mode':
        streamHandler.handleSetPermissionMode(message)
        break

      case 'list_directory': {
        const rawPath = message.path
        const dirPath = (!rawPath || rawPath === '~') ? os.homedir() : rawPath
        try {
          fs.accessSync(dirPath, fs.constants.R_OK)
          const entries = listDirectory(dirPath)
          remoteServer.send({
            type: 'list_directory_result',
            requestId: message.requestId,
            entries,
          })
        } catch {
          remoteServer.send({
            type: 'list_directory_result',
            requestId: message.requestId,
            entries: [],
            error: 'Directory not found or not accessible',
          })
        }
        break
      }

      case 'update_offer':
        handleUpdateOffer(message)
        break

      case 'update_chunk':
        handleUpdateChunk(message)
        break

      case 'update_complete':
        handleUpdateComplete()
        break

      default: {
        const unknown = message as { type: string }
        remoteServer.send({
          type: 'error',
          code: ErrorCodes.UNKNOWN_TYPE,
          message: `Unknown message type: ${unknown.type}`,
        })
        break
      }
    }
  }

  // ── Update Handlers ────────────────────────────────────────

  function handleUpdateOffer(message: UpdateOfferMessage): void {
    if (hookCollector.hasActiveSessions || streamHandler.hasActiveSessions) {
      remoteServer.send({ type: 'update_reject', reason: 'active_sessions' })
      return
    }

    updateState = {
      version: message.version,
      size: message.size,
      checksum: message.checksum,
      chunks: [],
      received: 0,
    }
    remoteServer.send({ type: 'update_accept' })
    console.log(`[remote] accepting update to v${message.version} (${message.size} bytes)`)
  }

  function handleUpdateChunk(message: UpdateChunkMessage): void {
    if (!updateState) return
    const chunk = Buffer.from(message.data, 'base64')
    updateState.chunks.push(chunk)
    updateState.received += chunk.length
  }

  function handleUpdateComplete(): void {
    if (!updateState) return

    const state = updateState
    updateState = null

    const fileBuffer = Buffer.concat(state.chunks, state.received)

    // Validate size
    if (fileBuffer.length !== state.size) {
      remoteServer.send({ type: 'update_result', success: false, error: 'size_mismatch' })
      console.error(`[remote] update failed: size mismatch (expected ${state.size}, got ${fileBuffer.length})`)
      return
    }

    // Validate checksum
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    if (hash !== state.checksum) {
      remoteServer.send({ type: 'update_result', success: false, error: 'checksum_mismatch' })
      console.error(`[remote] update failed: checksum mismatch`)
      return
    }

    // Atomic replacement: write .tmp then rename
    const scriptPath = process.argv[1]
    const tmpPath = scriptPath + '.tmp'
    try {
      fs.writeFileSync(tmpPath, fileBuffer)
      fs.renameSync(tmpPath, scriptPath)
    } catch (err) {
      try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      remoteServer.send({ type: 'update_result', success: false, error: `write_failed: ${(err as Error).message}` })
      console.error(`[remote] update failed: write error`, err)
      return
    }

    console.log(`[remote] update to v${state.version} applied, restarting...`)
    remoteServer.send({ type: 'update_result', success: true })

    // Self-restart with same args
    const nodePath = process.execPath
    const newArgs = [scriptPath, ...process.argv.slice(2)]
    const child = spawn(nodePath, newArgs, {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    // Graceful exit after brief delay to ensure response is sent
    setTimeout(() => {
      streamHandler.destroyAll().then(() => {
        hookCollector.stop().then(() => {
          remoteServer.close().then(() => {
            process.exit(0)
          })
        })
      })
    }, 500)
  }

  // Start server and hook collector
  await remoteServer.start()
  await hookCollector.start()

  console.log(`[remote] server started on port ${args.port}`)
  console.log(`[remote] authentication: ${args.token ? 'token required' : 'open (no token)'}`)

  // Graceful shutdown
  let shuttingDown = false
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\n[remote] shutting down...')
    await streamHandler.destroyAll()
    await hookCollector.stop()
    await remoteServer.close()
    console.log('[remote] server stopped')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[remote] fatal error:', err)
  process.exit(1)
})
