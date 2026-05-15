import { defineConfig, loadEnv } from 'vite-plus'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'

/**
 * Hosts the dev server accepts (Vite's anti-DNS-rebinding guard). Cursor BYOK
 * requests reach the dev server through the Cloudflare tunnel under its public
 * hostname, derived here from `CLOUDFLARE_TUNNEL_URL`.
 *
 * `loadEnv` is called at module scope (not inside a `defineConfig` callback) so
 * the exported config stays a static object literal — Vite+ statically parses
 * the `lint`/`fmt`/`staged` blocks and cannot see through a function.
 */
function resolveAllowedHosts(env: Record<string, string>): string[] {
  const tunnelUrl = env.CLOUDFLARE_TUNNEL_URL?.trim()
  if (!tunnelUrl) return []
  try {
    return [new URL(tunnelUrl).hostname]
  } catch {
    // Malformed URL — the dev server simply won't allow any external host.
    return []
  }
}

// `.env` is always loaded regardless of mode; the mode only adds `.env.[mode]`
// files, which this project does not use.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '')

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    // Compiles messages/*.json into the tree-shakeable, type-safe runtime under
    // src/paraglide. Cookie strategy only — no `urlPatterns`, so the /v1 + /api
    // proxy routes Cursor depends on are never rewritten.
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'PARAGLIDE_LOCALE',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],

  server: {
    host: '127.0.0.1',
    port: 3221,
    strictPort: true,
    allowedHosts: resolveAllowedHosts(env),
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
