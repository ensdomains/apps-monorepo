import type { ChangedFile, FileStatus, LineRange } from './types.ts'

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/** The lines a hunk adds, from its `@@ -a,b +c,d @@` header. */
export const hunkRange = (header: string): LineRange | undefined => {
  const match = HUNK_HEADER.exec(header)
  if (match === null) return undefined
  const start = Number(match[1])
  const count = match[2] === undefined ? 1 : Number(match[2])
  return count === 0 ? undefined : { start, end: start + count - 1 }
}

const ESCAPES: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  '\\': 92,
}

/** Undoes git's C-style quoting of a path (`"a/caf\303\251.ts"`). */
export const unquotePath = (raw: string): string => {
  if (!(raw.startsWith('"') && raw.endsWith('"'))) return raw
  const body = raw.slice(1, -1)
  const bytes = [...body.matchAll(/\\([0-7]{3})|\\(.)|([^\\]+)/gsu)].flatMap(
    ([, octal, escaped, text]) => {
      if (octal !== undefined) return [Number.parseInt(octal, 8)]
      if (escaped !== undefined)
        return [ESCAPES[escaped] ?? escaped.charCodeAt(0)]
      return [...new TextEncoder().encode(text ?? '')]
    },
  )
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

const stripSide = (path: string, side: 'a/' | 'b/'): string => {
  const unquoted = unquotePath(path)
  return unquoted.startsWith(side) ? unquoted.slice(side.length) : unquoted
}

const after = (
  lines: ReadonlyArray<string>,
  prefix: string,
): string | undefined =>
  lines.find((line) => line.startsWith(prefix))?.slice(prefix.length)

/** The new path: from the `+++` line, else the rename target, else the header. */
const pathOf = (
  header: ReadonlyArray<string>,
  renameTo: string | undefined,
  firstLine: string,
): string | undefined => {
  const plusPath = after(header, '+++ ')
  if (plusPath !== undefined && plusPath !== '/dev/null') {
    return stripSide(plusPath, 'b/')
  }
  if (renameTo !== undefined) return unquotePath(renameTo)
  return headerPath(firstLine)
}

const statusOf = (
  header: ReadonlyArray<string>,
  renameTo: string | undefined,
): FileStatus => {
  if (header.some((l) => l.startsWith('new file mode'))) return 'added'
  if (renameTo !== undefined) return 'renamed'
  return 'modified'
}

const parseSection = (
  lines: ReadonlyArray<string>,
): ChangedFile | undefined => {
  const firstHunk = lines.findIndex((l) => l.startsWith('@@'))
  const header = firstHunk === -1 ? lines : lines.slice(0, firstHunk)
  if (header.some((l) => l.startsWith('Binary files '))) return undefined
  if (header.some((l) => l.startsWith('deleted file mode'))) return undefined

  const renameFrom = after(header, 'rename from ')
  const renameTo = after(header, 'rename to ')
  const newPath = pathOf(header, renameTo, lines[0] ?? '')
  if (newPath === undefined) return undefined

  const status = statusOf(header, renameTo)
  const ranges = lines.flatMap((line) => {
    const range = line.startsWith('@@') ? hunkRange(line) : undefined
    return range === undefined ? [] : [range]
  })
  return renameFrom === undefined
    ? { path: newPath, status, ranges }
    : { path: newPath, status, oldPath: unquotePath(renameFrom), ranges }
}

/** The new path from `diff --git a/x b/x`, used when no `+++` line exists. */
const headerPath = (line: string): string | undefined => {
  const rest = line.slice('diff --git '.length)
  const quoted = /^".*?(?<!\\)" (".*")$/u.exec(rest)
  if (quoted?.[1] !== undefined) return stripSide(quoted[1], 'b/')
  // Unquoted paths can hold spaces, but both sides name the same file
  // whenever no rename line exists, so split the text in half.
  const half = (rest.length - 1) / 2
  return Number.isInteger(half)
    ? stripSide(rest.slice(half + 1), 'b/')
    : undefined
}

/**
 * Reads `git diff -U0` output into the files it touches and, for each, the
 * lines of the new version that the diff added or changed. Deleted and binary
 * files are left out: there is nothing left to lint in them.
 */
export const parseDiff = (text: string): ReadonlyArray<ChangedFile> => {
  const lines = text.split('\n')
  const starts = lines.flatMap((line, i) =>
    line.startsWith('diff --git ') ? [i] : [],
  )
  return starts.flatMap((start, k) => {
    const file = parseSection(lines.slice(start, starts[k + 1] ?? lines.length))
    return file === undefined ? [] : [file]
  })
}
