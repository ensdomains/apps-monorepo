/**
 * Load `e2e/.env` into `process.env`. Import this (for its side effect) before
 * any module that reads env at load time: imports evaluate before the importing
 * module's body, so loading it there would be too late for them.
 * `process.loadEnvFile` keeps variables already set and throws on a missing
 * file, hence the existence check.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const envPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.env',
)
if (existsSync(envPath)) process.loadEnvFile(envPath)
