/// <reference types="node" />
import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import posthog from '@posthog/rollup-plugin'
import type { Plugin } from 'vite'

/** Optional uploads must not fail releases; generated source maps stay private. */
export const sourceMapsPlugin = (
  options: Parameters<typeof posthog>[0],
): Plugin => {
  const plugin: Plugin = posthog({
    ...options,
    sourcemaps: { ...options.sourcemaps, deleteAfterUpload: true },
  })
  const writeBundle = plugin.writeBundle
  if (!writeBundle) return plugin
  const upload =
    typeof writeBundle === 'function' ? writeBundle : writeBundle.handler
  return {
    ...plugin,
    writeBundle: {
      sequential: true,
      async handler(output, bundle) {
        try {
          await upload.call(this, output, bundle)
        } catch {
          console.warn(
            '[posthog] Source-map upload failed; continuing without symbolication.',
          )
        } finally {
          const directory =
            output.dir ?? (output.file ? dirname(output.file) : undefined)
          if (directory) {
            const maps = Object.values(bundle).flatMap((chunk) =>
              chunk.type === 'chunk'
                ? [
                    resolve(
                      directory,
                      chunk.sourcemapFileName ?? `${chunk.fileName}.map`,
                    ),
                  ]
                : [],
            )
            const results = await Promise.allSettled(
              maps.map((path) => rm(path, { force: true })),
            )
            if (results.some((result) => result.status === 'rejected'))
              console.warn(
                '[posthog] Could not remove every generated source map; inspect build output before deployment.',
              )
          }
        }
      },
    },
  }
}
