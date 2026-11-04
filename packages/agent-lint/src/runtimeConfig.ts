import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { biomeConfig, packageDir } from './paths.ts'

/** The agent config with its relative plugin paths made absolute. */
export const withAbsolutePlugins = (text: string, pluginsDir: string): string =>
  text
    .replaceAll('"./plugins/', `"${pluginsDir}/`)
    .replace(/^\s*"\$schema":.*\n/mu, '')

/**
 * Biome treats a config file that lives inside the checked repo as part of
 * that repo's project: the repo's nested biome.jsonc files then join in, and
 * override globs for files under them resolve from the nested folder. A copy
 * outside every checkout behaves the same for this repo and for any other
 * checkout agent-lint is pointed at, so Biome always reads that copy.
 */
export const runtimeBiomeConfig = (): string => {
  const text = withAbsolutePlugins(
    readFileSync(biomeConfig, 'utf8'),
    join(packageDir, 'biome', 'plugins'),
  )
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16)
  const dir = join(tmpdir(), `agent-lint-config-${hash}`)
  const file = join(dir, 'biome.jsonc')
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, text)
  }
  return file
}
