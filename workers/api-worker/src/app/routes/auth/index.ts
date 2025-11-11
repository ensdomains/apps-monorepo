import { createApp } from '../../middleware/hono'
import loginRoute from './login.js'
import meRoute from './me.js'
import nonceRoute from './nonce.js'

export default createApp()
  .basePath('/auth')
  .route('/', nonceRoute)
  .route('/', loginRoute)
  .route('/', meRoute)
