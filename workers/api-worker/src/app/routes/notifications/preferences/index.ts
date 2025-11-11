import { createApp } from '#app/middleware/hono.js'
import getRoute from './list.js'
import updateBatchRoute from './update-batch.js'
import updateKindRoute from './update-kind.js'

export default createApp()
  .basePath('/preferences')
  .route('/', getRoute)
  .route('/', updateKindRoute)
  .route('/', updateBatchRoute)
