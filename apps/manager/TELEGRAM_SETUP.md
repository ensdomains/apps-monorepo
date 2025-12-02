# Telegram Bot Setup Instructions

## Bot Information
- **Bot Username**: `ens_managerv4_bot`
- **Bot ID**: `8430077778`
- **Bot Token**: `7992408869:AAFRdSNYiNVgjJFMYpwQ8kd8dYQiE_2Mk9s` (keep secure, server-side only)

## Environment Variables

Add to your `.env` file in `apps/manager/`:

```bash
# Telegram Bot Configuration
VITE_TELEGRAM_BOT_USERNAME=ens_managerv4_bot

# Bot token should be stored server-side (in your API/backend)
# Do NOT expose the bot token in client-side code
# TELEGRAM_BOT_TOKEN=7992408869:AAFRdSNYiNVgjJFMYpwQ8kd8dYQiE_2Mk9s
```

## Domain Configuration

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send: `/setdomain`
3. Select your bot: `ens_managerv4_bot`
4. Enter your domain:
   - **Local development**: `localhost:3000`
   - **Production**: Your actual domain (e.g., `app.example.com`)

## Security Notes

⚠️ **Important**: 
- The bot token (`7992408869:AAFRdSNYiNVgjJFMYpwQ8kd8dYQiE_2Mk9s`) should **NEVER** be exposed in client-side code
- Store it securely in your backend/API server
- Use it only for server-side hash verification of Telegram auth data
- The widget only needs the bot username (which is safe to expose)

## Testing

1. Set `VITE_TELEGRAM_BOT_USERNAME=ens_managerv4_bot` in your `.env` file
2. Configure the domain in BotFather
3. Restart your dev server
4. The Telegram Login Widget should appear automatically
5. Click the widget to test authentication

## Verification

The Telegram widget returns auth data with a `hash` field. This should be verified server-side using:

1. Create a data-check-string from all fields (except hash), sorted alphabetically
2. Calculate HMAC-SHA-256 using the bot token as the secret key
3. Compare the result with the provided hash

See `verifyTelegramAuth()` function in `notificationService.ts` for reference implementation.

