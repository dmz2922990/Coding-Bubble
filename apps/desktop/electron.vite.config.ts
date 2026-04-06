import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@coding-bubble/backend', '@coding-bubble/shared'] })],
    resolve: {
      alias: {
        '@coding-bubble/backend': resolve(__dirname, '../../packages/backend/src/index.ts'),
        '@coding-bubble/shared': resolve(__dirname, '../../packages/shared/src/index.ts')
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
