import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./src/test-utils/setup.ts'],
    // Vitest defaults to `availableParallelism - 1` workers, which is a single
    // worker on CI's 2-vCPU runners, so every file ran one after another. The
    // main thread is mostly idle during a run, so use at least 2 workers.
    // Threads start faster than forks, which adds up with a fresh worker per
    // test file.
    pool: 'threads',
    maxWorkers: Math.max(availableParallelism() - 1, 2),
    // Split by environment: building a happy-dom window for every file cost
    // ~0.16s each, and most `.ts` tests never touch the DOM. Component tests
    // (`.tsx`) get happy-dom; everything else runs in plain Node. A `.ts` test
    // that needs a DOM (e.g. `renderHook`) opts in with a
    // `// @vitest-environment happy-dom` docblock.
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['src/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'clover', 'json'],
      exclude: [
        'node_modules/',
        'src/test-utils/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        '**/routeTree.gen.ts',
        'src/vite-env.d.ts',
        'vite.config.ts',
        'vitest.config.ts',
      ],
      // Uncomment to enforce coverage thresholds (will fail tests if not met)
      // thresholds: {
      //   statements: 50,
      //   branches: 50,
      //   functions: 50,
      //   lines: 50,
      // },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ens-apps/utils': fileURLToPath(
        new URL('../../packages/utils/src', import.meta.url),
      ),
      '@ens-apps/og': fileURLToPath(
        new URL('../../packages/og/src', import.meta.url),
      ),
      '@ens-apps/l2-primary': fileURLToPath(
        new URL('../../packages/l2-primary/src', import.meta.url),
      ),
      '@ens-apps/transaction-manager': fileURLToPath(
        new URL('../../packages/transaction-manager/src', import.meta.url),
      ),
    },
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
})
