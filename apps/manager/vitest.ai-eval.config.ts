import { fileURLToPath } from 'node:url'
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Deliberately independent of happy-dom setup and the app config's process.env
// replacement. Live credentials never enter Vite define or any client bundle.
export default defineConfig({
  plugins: [
    viteReact(),
    lingui(),
    babel({ presets: [linguiTransformerBabelPreset()] }),
  ],
  test: {
    environment: 'node',
    include: ['evals/ai/*.test.ts', 'evals/ai/*.eval.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@':
        process.env.AI_EVAL_SOURCE_ROOT ??
        fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
