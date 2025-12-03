import { createApp } from '#app/middleware/hono.js'
import telegramWebhookApp from './telegram.js'

export default createApp().basePath('/webhook').route('/', telegramWebhookApp)
