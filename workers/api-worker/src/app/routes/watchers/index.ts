import { createApp } from '#app/middleware/hono.js'
import deleteRoute from './delete.js'
import listRoute from './list.js'
import createRoute from './post.js'

export default createApp()
  .basePath('/watchers')
  .route('/', listRoute)
  .route('/', createRoute)
  .route('/', deleteRoute)
