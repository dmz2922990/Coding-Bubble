import { defineConfig } from 'tsup'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const hookScriptPath = resolve(
  __dirname,
  '../session-monitor/resources/claude-bubble-state.js'
)

export default defineConfig({
  entry: { 'coding-bubble-remote-server': 'src/server/index.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // Bundle everything (ws, workspace packages) except Node built-ins
  noExternal: [/^@coding-bubble\//, 'ws'],
  // Inline hook script as a string constant
  define: {
    __HOOK_SCRIPT__: JSON.stringify(readFileSync(hookScriptPath, 'utf-8')),
  },
})
