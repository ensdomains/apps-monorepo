import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Artifact } from './types'
import {
  assertEmptyOutputDirectory,
  createLocalArtifactWriter,
  createR2ArtifactWriter,
} from './writers'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'nft-pipeline-'))
  temporaryDirectories.push(directory)
  return directory
}

const ARTIFACT: Artifact = {
  body: '{"ok":true}\n',
  cacheControl: 'public, max-age=31536000, immutable',
  contentType: 'application/json; charset=utf-8',
  key: 'eligibility/test address.json',
}

const R2_CONFIGURATION = {
  accountId: 'a'.repeat(32),
  accessKeyId: 'access',
  secretAccessKey: 'secret',
  bucketName: 'ensv2-commemorative-nft-staging',
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe('local artifact writer', () => {
  it('creates an output directory and writes nested artifacts once', async () => {
    const parent = await createTemporaryDirectory()
    const outputDirectory = join(parent, 'output')

    await assertEmptyOutputDirectory(outputDirectory)
    const writer = createLocalArtifactWriter(outputDirectory)
    await writer.write(ARTIFACT)

    expect(
      await readFile(
        join(outputDirectory, 'eligibility', 'test address.json'),
        'utf8',
      ),
    ).toBe(ARTIFACT.body)
    await expect(writer.write(ARTIFACT)).rejects.toMatchObject({
      code: 'EEXIST',
    })
  })

  it('refuses a non-empty or symbolic-link output directory', async () => {
    const parent = await createTemporaryDirectory()
    const nonEmptyDirectory = join(parent, 'non-empty')
    await assertEmptyOutputDirectory(nonEmptyDirectory)
    await writeFile(join(nonEmptyDirectory, 'existing.txt'), 'existing')

    await expect(assertEmptyOutputDirectory(nonEmptyDirectory)).rejects.toThrow(
      'must be empty',
    )

    const symbolicLink = join(parent, 'link')
    await symlink(nonEmptyDirectory, symbolicLink)
    await expect(assertEmptyOutputDirectory(symbolicLink)).rejects.toThrow(
      'must not be a symbolic link',
    )
  })

  it('refuses path traversal from an artifact key', async () => {
    const outputDirectory = await createTemporaryDirectory()
    const writer = createLocalArtifactWriter(outputDirectory)

    await expect(
      writer.write({ ...ARTIFACT, key: '../outside.json' }),
    ).rejects.toThrow('Unsafe artifact key')
  })
})

describe('R2 artifact writer', () => {
  it('signs an immutable encoded PUT with SHA-256 metadata', async () => {
    const signedFetch = vi.fn(async () => new Response(null, { status: 200 }))
    const writer = createR2ArtifactWriter(R2_CONFIGURATION, { signedFetch })

    await writer.write(ARTIFACT)

    expect(signedFetch).toHaveBeenCalledOnce()
    expect(signedFetch).toHaveBeenCalledWith(
      `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/ensv2-commemorative-nft-staging/eligibility/test%20address.json`,
      {
        method: 'PUT',
        headers: {
          'Cache-Control': ARTIFACT.cacheControl,
          'Content-Type': ARTIFACT.contentType,
          'If-None-Match': '*',
          'x-amz-meta-sha256':
            'e5f1eb4d806641698a35efe20e098efd20d7d57a9b90ee69079d5bb650920726',
        },
        body: ARTIFACT.body,
      },
    )
  })

  it('retries transient responses with exponential backoff', async () => {
    const signedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const sleep = vi.fn(async () => undefined)
    const writer = createR2ArtifactWriter(R2_CONFIGURATION, {
      signedFetch,
      sleep,
      retryDelayMs: 10,
    })

    await writer.write(ARTIFACT)

    expect(signedFetch).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[10], [20]])
  })

  it('does not retry a permanent client response', async () => {
    const signedFetch = vi.fn(async () => new Response(null, { status: 403 }))
    const sleep = vi.fn(async () => undefined)
    const writer = createR2ArtifactWriter(R2_CONFIGURATION, {
      signedFetch,
      sleep,
    })

    await expect(writer.write(ARTIFACT)).rejects.toThrow('HTTP 403')
    expect(signedFetch).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('fails closed when an immutable object already exists', async () => {
    const signedFetch = vi.fn(async () => new Response(null, { status: 412 }))
    const sleep = vi.fn(async () => undefined)
    const writer = createR2ArtifactWriter(R2_CONFIGURATION, {
      signedFetch,
      sleep,
    })

    await expect(writer.write(ARTIFACT)).rejects.toThrow(
      'immutable artifacts cannot be overwritten',
    )
    expect(signedFetch).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('validates the target before constructing a writer', () => {
    expect(() =>
      createR2ArtifactWriter({
        ...R2_CONFIGURATION,
        accountId: 'not-an-account',
      }),
    ).toThrow('R2_ACCOUNT_ID')
    expect(() =>
      createR2ArtifactWriter({
        ...R2_CONFIGURATION,
        bucketName: '../other-bucket',
      }),
    ).toThrow('R2_BUCKET_NAME')
  })
})
