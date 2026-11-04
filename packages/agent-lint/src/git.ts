import { execFileSync } from 'node:child_process'
import { parseDiff } from './diff.ts'
import type { ChangedFile } from './types.ts'

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync(
    'git',
    ['--no-optional-locks', '-C', root, '-c', 'core.quotePath=false', ...args],
    {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  )

export const repoRoot = (dir: string): string =>
  git(dir, ['rev-parse', '--show-toplevel']).trim()

const refExists = (root: string, ref: string): boolean => {
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    // rev-parse --verify fails when the ref does not exist.
    return false
  }
}

/**
 * The commit a change is measured from: where HEAD split from `ref`.
 * Defaults to origin/main, falling back to main.
 */
export const resolveBase = (root: string, ref: string | undefined): string => {
  const target =
    ref ?? (refExists(root, 'origin/main') ? 'origin/main' : 'main')
  return git(root, ['merge-base', 'HEAD', target]).trim()
}

/**
 * Every file the working tree changes against the base, committed or not,
 * plus untracked files that git does not ignore.
 */
export const changedFiles = (
  root: string,
  base: string,
): ReadonlyArray<ChangedFile> => {
  const tracked = parseDiff(
    git(root, [
      'diff',
      '-U0',
      '--no-color',
      '--no-ext-diff',
      '--minimal',
      '--find-renames',
      '--diff-filter=ACMR',
      base,
    ]),
  )
  const untracked = git(root, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .split('\0')
    .filter((path) => path !== '')
    .map(
      (path): ChangedFile => ({
        path,
        status: 'added',
        ranges: [{ start: 1, end: Number.MAX_SAFE_INTEGER }],
      }),
    )
  return [...tracked, ...untracked]
}

/** A file's content at a commit, or undefined when it did not exist there. */
export const fileAt = (
  root: string,
  rev: string,
  path: string,
): string | undefined => {
  try {
    return execFileSync(
      'git',
      ['--no-optional-locks', '-C', root, 'show', `${rev}:${path}`],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
  } catch {
    // git show fails when the file did not exist at that commit.
    return undefined
  }
}
