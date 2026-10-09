import { assertNetworkConfig, NetworkConfigError } from '@ens-apps/config'
import { loadEnv } from 'vite'
import { MANAGER_ENDPOINTS } from '../src/endpoints'

// `loadEnv` applies the same .env precedence the build itself will see.
try {
  const config = assertNetworkConfig(
    loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'VITE_'),
    MANAGER_ENDPOINTS,
  )
  console.log(`network config ok: ${config.network}`)
} catch (error) {
  if (error instanceof NetworkConfigError) {
    console.error(`\nNetwork config rejected:\n${error.message}\n`)
    process.exit(1)
  }
  throw error
}
