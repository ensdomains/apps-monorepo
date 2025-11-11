import { createApp } from '#app/middleware/hono.js'
import deleteRoute from './remove.js'
import resendRoute from './resend.js'
import getRoute from './show.js'
import testRoute from './test.js'

export default createApp()
  .basePath('/:id')
  .route('/', getRoute)
  .route('/', deleteRoute)
  .route('/', testRoute)
  .route('/', resendRoute)
