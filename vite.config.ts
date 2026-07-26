import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
) as { version: string; name: string }

const APP_VERSION = pkg.version
const CACHE_VERSION = `ebq-v2-v${APP_VERSION}`

/** public/sw.js · fresh.html 플레이스홀더를 빌드 산출물에 버전 주입 */
function injectAppVersion(): Plugin {
  const replaceInDist = (fileName: string) => {
    const filePath = resolve(__dirname, 'dist', fileName)
    try {
      let text = readFileSync(filePath, 'utf8')
      text = text
        .replaceAll('__EBQ_CACHE_VERSION__', CACHE_VERSION)
        .replaceAll('__EBQ_APP_VERSION__', APP_VERSION)
      writeFileSync(filePath, text)
    } catch {
      /* optional file */
    }
  }

  return {
    name: 'ebq-inject-app-version',
    apply: 'build',
    closeBundle() {
      replaceInDist('sw.js')
      replaceInDist('fresh.html')
      writeFileSync(
        resolve(__dirname, 'dist', 'version.json'),
        JSON.stringify(
          {
            version: APP_VERSION,
            cache: CACHE_VERSION,
            releasedAt: new Date().toISOString().slice(0, 10),
            name: 'English Brain Quest',
          },
          null,
          2
        )
      )
    },
  }
}

// GitHub Pages: VITE_BASE=/english-brain-quest-v2/ npm run build
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __CACHE_VERSION__: JSON.stringify(CACHE_VERSION),
  },
  plugins: [react(), injectAppVersion()],
})
