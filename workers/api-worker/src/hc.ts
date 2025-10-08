import { hc } from 'hono/client'
import app from './app'

// biome-ignore lint/suspicious/reDeclare: This is a weird hack to make tsc serialize the type
const appRouter = app

export type AppRouter = typeof appRouter

export type Client = ReturnType<typeof hc<typeof appRouter>>
