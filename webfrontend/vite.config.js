import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads .env files plus real environment variables (Vercel, Docker build
  // args). Vite only exposes VITE_-prefixed variables to the browser by
  // default; API_URL is passed through explicitly instead, so no other
  // unprefixed variable (secrets included) can leak into the bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      'import.meta.env.API_URL': JSON.stringify(env.API_URL || ''),
    },
    server: {
      host: true, // listen on 0.0.0.0 so phones on the same Wi-Fi can reach the dev server
      port: 5174,
    },
  }
})
