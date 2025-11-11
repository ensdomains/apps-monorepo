import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Disabled temporarily due to tsconfig issues
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    // Peer dependencies
    'react',
    'react-dom',
    'wagmi',
    '@tanstack/react-query',
    // Dependencies that should not be bundled
    'viem',
    'xstate',
    '@xstate/react',
    'neverthrow',
    'permissionless',
    '@rhinestone/sdk',
    '@rhinestone/module-sdk',
    'idb',
    // Workspace dependencies
    '@ens-apps/utils',
  ],
})
