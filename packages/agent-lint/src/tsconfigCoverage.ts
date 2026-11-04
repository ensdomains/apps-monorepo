import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const CONFIG_FILE = 'tsconfig.json'

/** Repo-relative paths, split by whether a tsconfig.json covers them. */
export type CoverageSplit = {
  readonly covered: ReadonlyArray<string>
  readonly uncovered: ReadonlyArray<string>
}

export type ParsedConfig = {
  readonly path: string
  readonly rootNames: ReadonlyArray<string>
  /** The files its `include`, `files` and `exclude` lists name. */
  readonly listed: ReadonlySet<string>
  readonly options: ts.CompilerOptions
  /** The tsconfig files it references, as a solution-style config does. */
  readonly references: ReadonlyArray<string>
}

type Configs = ReadonlyMap<string, ParsedConfig>

/** Two spellings of one file's case are one file on a case-insensitive disk. */
const keyOf = (path: string): string =>
  ts.sys.useCaseSensitiveFileNames ? path : path.toLowerCase()

/** The folders from the one holding `path` up to the repo root, nearest first; '' is the root. */
const foldersAbove = (path: string): ReadonlyArray<string> => {
  const parent = dirname(path)
  return parent === '.' ? [''] : [parent, ...foldersAbove(parent)]
}

const parseConfig = (path: string): ParsedConfig => {
  const read = ts.readConfigFile(path, ts.sys.readFile)
  if (read.error !== undefined) {
    return {
      path,
      rootNames: [],
      listed: new Set(),
      options: {},
      references: [],
    }
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(path),
    undefined,
    path,
  )
  return {
    path,
    rootNames: parsed.fileNames,
    listed: new Set(parsed.fileNames.map(keyOf)),
    options: parsed.options,
    references: (parsed.projectReferences ?? []).map((reference) =>
      ts.resolveProjectReferencePath(reference),
    ),
  }
}

/** Parses each config once, and the configs they reference. */
const loadConfigs = (
  paths: ReadonlyArray<string>,
  loaded: Configs = new Map(),
): Configs => {
  const fresh = [...new Set(paths)].filter((path) => !loaded.has(path))
  if (fresh.length === 0) return loaded
  const parsed = fresh.map(parseConfig)
  return loadConfigs(
    parsed.flatMap((config) => config.references),
    new Map([
      ...loaded,
      ...parsed.map((config) => [config.path, config] as const),
    ]),
  )
}

/** The configs at `paths` and every config they reference, directly or not. */
const withReferences = (
  configs: Configs,
  paths: ReadonlyArray<string>,
  found: ReadonlySet<string> = new Set(),
): ReadonlySet<string> => {
  const fresh = [...new Set(paths)].filter((path) => !found.has(path))
  if (fresh.length === 0) return found
  return withReferences(
    configs,
    fresh.flatMap((path) => configs.get(path)?.references ?? []),
    new Set([...found, ...fresh]),
  )
}

/** Whether the config at `path`, or one it references, has `file` among the names `namesOf` gives. */
const reaches = (
  configs: Configs,
  namesOf: (config: ParsedConfig) => ReadonlySet<string>,
  path: string,
  file: string,
  seen: ReadonlySet<string> = new Set(),
): boolean => {
  const config = configs.get(path)
  if (config === undefined || seen.has(path)) return false
  return (
    namesOf(config).has(file) ||
    config.references.some((reference) =>
      reaches(configs, namesOf, reference, file, new Set([...seen, path])),
    )
  )
}

/** Every file TypeScript puts in the program for a config: the files it lists and what they import. */
export const programFiles = (config: ParsedConfig): ReadonlySet<string> =>
  new Set(
    ts
      .createProgram({
        rootNames: [...config.rootNames],
        options: { ...config.options, noEmit: true },
      })
      .getSourceFiles()
      .map((source) => keyOf(source.fileName)),
  )

/**
 * Splits `files` (repo-relative) by whether the TypeScript project service
 * finds them in a project, which is how typescript-eslint gets type
 * information: it takes the tsconfig.json in a file's folder, then in each
 * folder above, with the configs they reference. A config covers a file its
 * lists name, and also a file outside them that a listed file imports,
 * because TypeScript puts imported files into the program too.
 *
 * Reading a config only lists files. A program is built (by `programFilesOf`)
 * only for the configs above files that no config lists, to see whether any
 * of them is imported.
 */
export const splitByTsconfig = (
  root: string,
  files: ReadonlyArray<string>,
  programFilesOf: (config: ParsedConfig) => ReadonlySet<string> = programFiles,
): CoverageSplit => {
  const hasConfig = new Map(
    [...new Set(files.flatMap(foldersAbove))].map((folder) => [
      folder,
      existsSync(join(root, folder, CONFIG_FILE)),
    ]),
  )
  const configsAbove = (file: string): ReadonlyArray<string> =>
    foldersAbove(file)
      .filter((folder) => hasConfig.get(folder) === true)
      .map((folder) => join(root, folder, CONFIG_FILE))
  const absolute = (file: string): string => keyOf(join(root, file))

  const configs = loadConfigs(files.flatMap(configsAbove))
  const unlisted = files.filter(
    (file) =>
      !configsAbove(file).some((path) =>
        reaches(configs, (config) => config.listed, path, absolute(file)),
      ),
  )
  const programs = new Map(
    [...withReferences(configs, unlisted.flatMap(configsAbove))].flatMap(
      (path) => {
        const config = configs.get(path)
        return config === undefined
          ? []
          : [[path, programFilesOf(config)] as const]
      },
    ),
  )
  const outside: ReadonlySet<string> = new Set(
    unlisted.filter(
      (file) =>
        !configsAbove(file).some((path) =>
          reaches(
            configs,
            (config) => programs.get(config.path) ?? new Set(),
            path,
            absolute(file),
          ),
        ),
    ),
  )
  return {
    covered: files.filter((file) => !outside.has(file)),
    uncovered: files.filter((file) => outside.has(file)),
  }
}
