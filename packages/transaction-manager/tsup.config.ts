import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Disabled temporarily due to tsconfig issues
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'wagmi', '@tanstack/react-query'],
})
