import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  define: {
    'process.env': {},
  },
  build: {
    commonjsOptions: {
      // Include workspace packages
      include: [/@ens-apps\/transaction-manager/, /node_modules/],
    },
  },
  optimizeDeps: {
    // Force include the local workspace package and its dependencies
    include: [
      '@ens-apps/transaction-manager',
      'react',
      'react-dom',
      'xstate',
      '@xstate/react',
      'viem',
    ],
  },
  resolve: {
    // Ensure we're using the same deduplicated versions of peer dependencies
    dedupe: ['react', 'react-dom', 'xstate', 'viem'],
  },
})
