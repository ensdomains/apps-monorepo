import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const generateCredentials = () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const publicKey = Buffer.concat([
    Buffer.from([4]), // Uncompressed P-256 point: 0x04 || X || Y.
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ])

  return {
    VAPID_PUBLIC_KEY: publicKey.toString('base64url'),
    VAPID_PRIVATE_KEY: jwk.d,
    JWT_SECRET: randomBytes(64).toString('base64url'),
  }
}

export const writeCredentials = (directory) => {
  // Refuse an existing directory so reruns cannot silently rotate candidates.
  mkdirSync(directory, { mode: 0o700 })
  for (const environment of ['mainnet', 'sepolia']) {
    writeFileSync(
      join(directory, `${environment}.json`),
      `${JSON.stringify(generateCredentials(), null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    )
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const directory = resolve(process.argv[2] ?? '.local-secrets')
  writeCredentials(directory)
  // Never print private keys or JWT secrets to stdout/logs.
  console.log(
    `Wrote independent mainnet and Sepolia candidates to ${directory}`,
  )
}
