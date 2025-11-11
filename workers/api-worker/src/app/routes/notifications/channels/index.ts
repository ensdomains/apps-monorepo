import { createApp } from '#app/middleware/hono.js'
import emailRoutes from '../channels/email/index.js'
import idRoutes from '../channels/id/index.js'
import listRoute from '../channels/list.js'
import telegramRoute from '../channels/telegram.js'

export default createApp()
  .basePath('/channels')
  .route('/', listRoute)
  .route('/', emailRoutes)
  .route('/', telegramRoute)
  .route('/', idRoutes)
