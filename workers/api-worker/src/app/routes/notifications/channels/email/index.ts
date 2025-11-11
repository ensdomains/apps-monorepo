import { createApp } from '#app/middleware/hono.js'
import createRoute from './post.js'
import verifyRoute from './verify.js'

export default createApp()
  .basePath('/email')
  .route('/', createRoute)
  .route('/', verifyRoute)
