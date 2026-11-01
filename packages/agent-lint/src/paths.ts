import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const biomeIn = (dir: string): string =>
  join(dir, 'node_modules', '.bin', 'biome')

/**
 * This package pins Biome, but the workspace root depends on Biome too and
 * pnpm links one copy of a version both ask for at the root only, so the
 * launcher is looked up in the package first and then at the workspace root.
 */
export const biomeBin =
  [packageDir, resolve(packageDir, '..', '..')]
    .map(biomeIn)
    .find((candidate) => existsSync(candidate)) ?? biomeIn(packageDir)

export const biomeConfig = join(packageDir, 'biome', 'agent.jsonc')
export const fixturesDir = join(packageDir, 'fixtures')
