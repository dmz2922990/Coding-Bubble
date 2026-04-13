import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@coding-bubble/stream-json', '@coding-bubble/remote'] })],
    resolve: {
      alias: {
        '@coding-bubble/backend': resolve(__dirname, '../../packages/backend/src/index.ts'),
        '@coding-bubble/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@coding-bubble/session-monitor': resolve(__dirname, '../../packages/session-monitor/src/index.ts'),
        '@coding-bubble/stream-json': resolve(__dirname, '../../packages/stream-json/src/index.ts'),
        '@coding-bubble/remote': resolve(__dirname, '../../packages/remote/src/client/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
