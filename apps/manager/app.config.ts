import { defineConfig } from '@tanstack/react-start/config'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import tsConfigPaths from 'vite-tsconfig-paths'
import { cloudflare } from '@cloudflare/unenv-preset'

export default defineConfig({
  tsr: {
    appDirectory: 'src',
  },
  vite: {
    ssr: { 
      external: ['pino-pretty', 'lokijs', 'encoding'],
    },
    plugins: [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      vanillaExtractPlugin(),
    ],
  },
  server: {
    minify: false,
    preset: 'cloudflare-pages',
    unenv: {
      ...cloudflare,
      alias: {
          ...cloudflare.alias,
          "string_decoder/": "node:string_decoder",
      },
    },
    commonJS: {
      // This fixes pngjs stream import but could break other modules in the future
      // We may need to switch to a function that checks the importing file's id
      requireReturnsDefault: "preferred",
    }
  }
})
