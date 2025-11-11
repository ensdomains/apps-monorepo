import { createApp } from '#app/middleware/hono.js'
import telegramWebhookApp from './telegram.js'

export default createApp().route('/telegram', telegramWebhookApp)
