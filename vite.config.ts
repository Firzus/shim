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

  build: {
    target: 'es2022',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
    // Note: manualChunks is ignored by Vite+/Rolldown because codeSplitting is
    // already enabled by the TanStack Start plugin. The bundler does automatic
    // per-library splitting (.output/_libs/<pkg>.mjs) which is what we'd want
    // anyway. If we ever need finer control we'd configure it via
    // `codeSplitting` instead of `rollupOptions.output.manualChunks`.
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
