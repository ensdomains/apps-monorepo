import { createApp } from '#app/middleware/hono.js'
import deleteRoute from './delete.js'
import listRoute from './list.js'
import putRoute from './put.js'

export default createApp()
  .basePath('/favorites')
  .route('/', listRoute)
  .route('/', putRoute)
  .route('/', deleteRoute)
