import { defineConfig } from 'tsup'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const hookScriptPath = resolve(
  __dirname,
  '../session-monitor/resources/claude-bubble-state.js'
)

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  entry: { 'coding-bubble-remote-server': 'src/server/index.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // Bundle everything (ws, workspace packages) except Node built-ins
  noExternal: [/^@coding-bubble\//, 'ws'],
  // Inline hook script and version as string constants
  define: {
    __HOOK_SCRIPT__: JSON.stringify(readFileSync(hookScriptPath, 'utf-8')),
    __REMOTE_SERVER_VERSION__: JSON.stringify(pkg.version),
  },
})
