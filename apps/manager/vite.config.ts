import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Dev-only: send `Cache-Control: no-store` on the SSR HTML document.
 *
 * Vite serves optimised deps as `immutable`, but the document itself has no
 * caching headers, so a normal browser can heuristically reuse a stale HTML
 * shell that points at dep chunk hashes the server has since rotated — which
 * loads as a blank page (incognito has no cache, so it always works). Forcing
 * `no-store` on the document guarantees every load fetches fresh HTML carrying
 * the current `?v=hash` references. Scoped to `serve`; never ships to the
 * built worker, so production caching is untouched.
 */
function devNoStoreHtml(): Plugin {
  return {
    name: 'dev-no-store-html',
    apply: 'serve',
    configureServer(server) {
      // Proxied upstreams (see `server.proxy`) own their own caching headers —
      // never rewrite those. This plugin only concerns the SSR document.
      const PROXIED_PREFIXES = [
        '/api',
        '/rpc',
        '/bundler',
        '/paymaster',
        '/orchestrator',
        '/indexer',
      ]
      server.middlewares.use((req, res, next) => {
        const accept = req.headers.accept ?? ''
        const url = req.url ?? ''
        const isProxied = PROXIED_PREFIXES.some(
          (prefix) => url === prefix || url.startsWith(`${prefix}/`),
        )
        if (
          !isProxied &&
          req.method === 'GET' &&
          accept.includes('text/html')
        ) {
          // Set now, and re-assert on writeHead: the cloudflare SSR middleware
          // produces the response downstream and merges (not clears) headers,
          // but re-asserting guards against a writeHead that omits ours.
          res.setHeader('Cache-Control', 'no-store')
          const writeHead = res.writeHead.bind(res)
          res.writeHead = ((...args: Parameters<typeof writeHead>) => {
            res.setHeader('Cache-Control', 'no-store')
            return writeHead(...args)
          }) as typeof writeHead
        }
        next()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:2999',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Local E2E: proxy RPC to Anvil fork.
      '/rpc': {
        target: 'http://127.0.0.1:8545',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
      },
      // Local E2E: proxy bundler + paymaster to avoid CORS.
      '/bundler': {
        target: 'http://127.0.0.1:4337',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bundler/, ''),
      },
      '/paymaster': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/paymaster/, ''),
      },
      '/orchestrator': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/orchestrator/, ''),
      },
      '/indexer': {
        target: 'http://127.0.0.1:5655',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/indexer/, ''),
      },
    },
  },
  plugins: [
    devNoStoreHtml(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
    }),
    tanstackStart(),
    viteReact(),
    lingui(),
    babel({
      presets: [linguiTransformerBabelPreset()],
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    // Pre-bundle deps that Vite discovers late (during route navigation).
    // Without this, Vite re-optimises mid-session and triggers a full page
    // reload, which can crash React (especially in headless CI browsers).
    include: [
      'buffer',
      '@rhinestone/sdk',
      '@rhinestone/sdk/actions/smart-sessions',
      '@rhinestone/sdk/errors',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      experimental: {
        lazyBarrel: true, // Reduces compiled modules for barrel exports
      },
    },
  },
})
