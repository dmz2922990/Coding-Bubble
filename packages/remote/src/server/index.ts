import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { RemoteServer } from './server'
import { HookCollector } from './hook-collector'
import { StreamHandler } from './stream-handler'
import type { ClientMessage } from '../shared/protocol'
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
        const dirPath = message.path ?? os.homedir()
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
