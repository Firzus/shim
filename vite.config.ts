import { defineConfig } from 'vite-plus'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],

  server: {
    host: '127.0.0.1',
    port: 3221,
    strictPort: true,
    // Allow the Cloudflare tunnel public hostname so Cursor BYOK requests
    // reach the dev server without Vite's anti-DNS-rebinding guard tripping.
    allowedHosts: ['shim.lprieu.dev', '.lprieu.dev'],
  },

  preview: {
    host: '127.0.0.1',
    port: 3221,
    strictPort: true,
  },

  test: {
    environment: 'jsdom',
    globals: true,
  },

  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },

  fmt: {
    singleQuote: true,
    semi: false,
  },

  staged: {
    '*.{js,ts,tsx,jsx,css}': 'vp check --fix',
  },
})
