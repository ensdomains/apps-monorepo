import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePipelineCliOptions, readR2UploadConfiguration } from './cli'

describe('commemorative NFT pipeline CLI', () => {
  it('defaults to a local-only run and accepts repeated inputs', () => {
    expect(
      parsePipelineCliOptions([
        '--input',
        'first.csv',
        '--input',
        'second.csv',
        '--out',
        'artifacts',
        '--concurrency',
        '8',
      ]),
    ).toEqual({
      concurrency: 8,
      expectedRoot: undefined,
      inputPaths: [resolve('first.csv'), resolve('second.csv')],
      outputDirectory: resolve('artifacts'),
      shouldUpload: false,
    })
  })

  it('requires an expected root before upload mode can be enabled', () => {
    expect(() =>
      parsePipelineCliOptions(['--input', 'snapshot.csv', '--upload']),
    ).toThrow('--expected-root is required')
  })

  it.each([
    [['--unknown'], 'Unknown argument'],
    [['--input'], 'Missing value'],
    [['--input', 'snapshot.csv', '--concurrency', '0'], 'positive integer'],
    [[], 'At least one --input'],
  ] as const)('rejects invalid arguments', (argumentsList, expectedMessage) => {
    expect(() => parsePipelineCliOptions(argumentsList)).toThrow(
      expectedMessage,
    )
  })

  it('reads every bucket-scoped upload credential explicitly', () => {
    expect(
      readR2UploadConfiguration({
        R2_ACCOUNT_ID: 'a'.repeat(32),
        R2_ACCESS_KEY_ID: 'access',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET_NAME: 'ensv2-commemorative-nft-staging',
      }),
    ).toEqual({
      accountId: 'a'.repeat(32),
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      bucketName: 'ensv2-commemorative-nft-staging',
    })
  })

  it('fails closed when an upload credential is absent', () => {
    expect(() =>
      readR2UploadConfiguration({
        R2_ACCOUNT_ID: 'a'.repeat(32),
        R2_ACCESS_KEY_ID: 'access',
        R2_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toThrow('R2_BUCKET_NAME is required')
  })
})
