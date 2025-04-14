import { defineConfig } from '@tanstack/react-start/config'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  tsr: {
    appDirectory: 'src',
  },
  vite: {
    plugins: [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      vanillaExtractPlugin(),
    ],
  },
})
