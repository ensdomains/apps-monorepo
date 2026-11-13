import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { expect, it, vi } from 'vitest'
import { sourceMapsPlugin } from './sourceMapsPlugin'

it.each([0, 1])(
  'keeps the build working and removes maps when the upload CLI exits %s',
  async (exitCode) => {
    const directory = await mkdtemp(join(tmpdir(), 'ens-posthog-upload-'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const entry = join(directory, 'entry.js')
      const cli = join(directory, 'cli.js')
      await writeFile(entry, 'export const value = 1')
      await writeFile(cli, `#!/usr/bin/env node\nprocess.exit(${exitCode})`)
      await chmod(cli, 0o755)
      const output = join(directory, 'dist')
      await build({
        configFile: false,
        publicDir: false,
        logLevel: 'silent',
        plugins: [
          sourceMapsPlugin({
            personalApiKey: 'test-only',
            projectId: '1',
            cliBinaryPath: cli,
            sourcemaps: { releaseMode: 'symbol-set', deleteAfterUpload: true },
          }),
        ],
        build: {
          outDir: output,
          lib: { entry, formats: ['es'], fileName: () => 'entry.js' },
          minify: false,
        },
      })
      expect(await readdir(output)).toEqual(['entry.js'])
      const code = await readFile(join(output, 'entry.js'), 'utf8')
      expect(code).toContain('//# chunkId=')
      expect(code).not.toContain('sourceMappingURL')
      if (exitCode !== 0)
        expect(warning).toHaveBeenCalledWith(
          '[posthog] Source-map upload failed; continuing without symbolication.',
        )
    } finally {
      warning.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
