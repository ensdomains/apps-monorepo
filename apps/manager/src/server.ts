import type { RegisteredRouter } from '@tanstack/react-router'
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { runWithServerRouterContext } from './utils/rootContext'

const fetch = createStartHandler((ctx) =>
  runWithServerRouterContext(ctx.router as unknown as RegisteredRouter, () =>
    defaultStreamHandler(ctx),
  ),
)

export default {
  fetch,
}
