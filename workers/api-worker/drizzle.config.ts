import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/core/database/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB!,
  },
})
