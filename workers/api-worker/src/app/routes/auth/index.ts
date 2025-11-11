import { createApp } from '../../middleware/hono'
import loginRoute from './login.js'
import meRoute from './me.js'
import nonceRoute from './nonce.js'

export default createApp()
  .route('/nonce', nonceRoute)
  .route('/login', loginRoute)
  .route('/me', meRoute)
