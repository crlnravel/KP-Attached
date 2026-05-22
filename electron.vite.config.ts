import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const debugEnabled = env.DEBUG === 'true' || env.VITE_DEBUG === 'true'
  const remoteAuthRequestUrl = (env.ATTACHED_REMOTE_AUTH_REQUEST_URL ?? '').trim()
  const remoteAuthSignInUrl = (env.ATTACHED_REMOTE_AUTH_SIGN_IN_URL ?? '').trim()
  const remoteAuthTimeoutMs = Number.parseInt(env.ATTACHED_REMOTE_AUTH_TIMEOUT_MS ?? '15000', 10)
  const define = {
    __APP_DEBUG__: JSON.stringify(debugEnabled),
    __ATTACHED_REMOTE_AUTH_REQUEST_URL__: JSON.stringify(remoteAuthRequestUrl),
    __ATTACHED_REMOTE_AUTH_SIGN_IN_URL__: JSON.stringify(remoteAuthSignInUrl),
    __ATTACHED_REMOTE_AUTH_TIMEOUT_MS__: JSON.stringify(
      Number.isFinite(remoteAuthTimeoutMs) && remoteAuthTimeoutMs > 0 ? remoteAuthTimeoutMs : 15000
    )
  }

  return {
    main: {
      define
    },
    preload: {
      define
    },
    renderer: {
      define,
      resolve: {
        alias: {
          '@': resolve('src/renderer/src'),
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react(), tailwindcss()]
    }
  }
})
