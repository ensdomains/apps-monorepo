import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** The stdout a failed child process left on its error, when Node attached one. */
export const stdoutOf = (error: unknown): string | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'stdout' in error &&
  typeof error.stdout === 'string'
    ? error.stdout
    : undefined

/**
 * Runs a command and returns its stdout whatever the exit code: checkers
 * exit non-zero when they find problems and still print their report.
 */
export const outputOf = async (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
): Promise<string> => {
  try {
    const { stdout } = await execFileAsync(command, [...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    return stdoutOf(error) ?? ''
  }
}
