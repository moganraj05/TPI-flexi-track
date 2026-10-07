import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// After a production build, writes the list of every built file under
// /assets/ (JS chunks of every page, CSS, fonts) into dist/sw.js, plus a
// cache version derived from those file names. The service worker downloads
// them all at install, so the whole site works offline — not just the pages
// someone happened to open — and each deploy replaces the previous cache.
function precacheManifest() {
  let outDir = 'dist'
  return {
    name: 'flexitrack-precache-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const assetsDir = path.join(outDir, 'assets')
      const swPath = path.join(outDir, 'sw.js')
      if (!fs.existsSync(assetsDir) || !fs.existsSync(swPath)) return
      const files = fs
        .readdirSync(assetsDir)
        .filter((f) => !f.endsWith('.map'))
        .sort()
        .map((f) => `/assets/${f}`)
      const version = crypto.createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12)
      const versionLine = "const CACHE_VERSION = 'flexitrack-shell-dev';"
      const assetsLine = 'const PRECACHE_ASSETS = [];'
      let sw = fs.readFileSync(swPath, 'utf8')
      // Fail the build rather than ship a worker that can't work offline.
      if (!sw.includes(versionLine) || !sw.includes(assetsLine)) {
        throw new Error('public/sw.js: CACHE_VERSION / PRECACHE_ASSETS placeholders not found')
      }
      sw = sw
        .replace(versionLine, `const CACHE_VERSION = 'flexitrack-${version}';`)
        .replace(assetsLine, `const PRECACHE_ASSETS = ${JSON.stringify(files)};`)
      fs.writeFileSync(swPath, sw)
      console.log(`[precache] ${files.length} files, cache flexitrack-${version}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads .env files plus real environment variables (Vercel, Docker build
  // args). Vite only exposes VITE_-prefixed variables to the browser by
  // default; API_URL is passed through explicitly instead, so no other
  // unprefixed variable (secrets included) can leak into the bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), precacheManifest()],
    define: {
      'import.meta.env.API_URL': JSON.stringify(env.API_URL || ''),
    },
    server: {
      host: true, // listen on 0.0.0.0 so phones on the same Wi-Fi can reach the dev server
      port: 5174,
    },
  }
})
