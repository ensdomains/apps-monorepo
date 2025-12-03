# Running the API Worker Locally

This guide explains how to run the API worker locally for development and testing.

## Prerequisites

- Node.js (v18 or higher)
- pnpm (or npm/yarn)
- A Cloudflare account (for Wrangler authentication, if needed)
- A private key with ETH on Sepolia testnet (for funding smart accounts)

## Setup

### 1. Install Dependencies

From the monorepo root:

```bash
pnpm install
```

Or from the `apps/api-worker` directory:

```bash
cd apps/api-worker
pnpm install
```

### 2. Configure Environment Variables

Create a `.dev.vars` file in the `apps/api-worker` directory to store local development environment variables:

```bash
cd apps/api-worker
touch .dev.vars
```

Add the following to `.dev.vars`:

```bash
# Private key for funding smart accounts (must have ETH on Sepolia for gas)
# Format: 0x... or without 0x prefix (both work)
FUNDING_PRIVATE_KEY=your_private_key_here
```

**Important Notes:**
- The `.dev.vars` file is automatically ignored by git (already in `.gitignore`)
- Never commit your private key to version control
- The private key must have ETH on Sepolia testnet to pay for gas fees
- You can use a test wallet with minimal funds for development

### 3. Authenticate with Cloudflare (if needed)

If this is your first time running Wrangler locally, you may need to authenticate:

```bash
cd apps/api-worker
pnpm wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

## Running the Worker Locally

### Start the Development Server

From the `apps/api-worker` directory:

```bash
pnpm dev
```

Or from the monorepo root:

```bash
cd apps/api-worker && pnpm dev
```

The worker will start on `http://localhost:8787` by default. Check the terminal output for the exact URL.

### Verify the Worker is Running

You can test the worker by making a request:

```bash
curl http://localhost:8787/p/fund-smart-account \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"accountAddress":"0x1234567890123456789012345678901234567890"}'
```

## Configuring the Frontend to Use Local Worker

### 1. Set Environment Variable

Create or update `.env.local` in the `apps/manager` directory:

```bash
cd apps/manager
echo "VITE_API_BASE_URL=http://localhost:8787" >> .env.local
```

Or manually create/edit `.env.local`:

```bash
VITE_API_BASE_URL=http://localhost:8787
```

### 2. Restart the Frontend Dev Server

If the manager app is already running, restart it to pick up the new environment variable:

```bash
# Stop the current dev server (Ctrl+C)
# Then restart:
cd apps/manager
pnpm dev
```

### 3. Verify Configuration

The frontend will now use `http://localhost:8787` instead of the production API URL (`https://api-worker.ens.workers.dev`).

You can verify this by checking the browser's Network tab - API requests should go to `localhost:8787`.

## Testing the Funding Endpoint

### Using the Dev Button (Recommended)

1. Start both the API worker and the manager app
2. Connect your wallet and create a smart account
3. In the user menu, you should see a "🧪 Dev Only" section with a "Fund Account" button
4. Click the button to manually trigger funding

### Using curl

```bash
curl http://localhost:8787/p/fund-smart-account \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3001" \
  -d '{"accountAddress":"0xYourSmartAccountAddress"}'
```

### Expected Response

```json
{
  "success": true,
  "daiTxHash": "0x...",
  "usdcTxHash": "0x..."
}
```

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. **Verify the worker is running**: Check that `http://localhost:8787` is accessible
2. **Check the origin**: Make sure your frontend origin matches what's allowed (localhost with any port)
3. **Restart both servers**: Sometimes a restart helps clear connection issues

The CORS configuration in `src/router.ts` allows:
- All localhost origins (any port)
- Production ENS domains
- Requests with no origin

### "FUNDING_PRIVATE_KEY not configured" Error

1. **Check `.dev.vars` exists**: Make sure the file is in `apps/api-worker/.dev.vars`
2. **Verify the format**: The private key should be a valid hex string (with or without `0x` prefix)
3. **Restart the worker**: Environment variables are loaded on startup

### "Insufficient funds for gas fees" Error

The funding wallet needs ETH on Sepolia to pay for gas. Check the wallet balance:

1. Go to [Sepolia Etherscan](https://sepolia.etherscan.io/)
2. Search for your wallet address (derived from the private key)
3. If balance is low, get testnet ETH from a faucet

### Worker Won't Start

1. **Check Node.js version**: Ensure you're using Node.js v18 or higher
2. **Reinstall dependencies**: Try `pnpm install` again
3. **Check Wrangler**: Ensure Wrangler is properly installed: `pnpm wrangler --version`
4. **Check logs**: Look for error messages in the terminal output

### Port Already in Use

If port 8787 is already in use:

1. **Find the process**: `lsof -i :8787` (macOS/Linux) or `netstat -ano | findstr :8787` (Windows)
2. **Kill the process**: Or change the port in `wrangler.jsonc` (requires additional configuration)

## Development Workflow

### Typical Development Session

1. **Terminal 1**: Start the API worker
   ```bash
   cd apps/api-worker
   pnpm dev
   ```

2. **Terminal 2**: Start the manager app
   ```bash
   cd apps/manager
   pnpm dev
   ```

3. **Make changes**: Edit files in `apps/api-worker/src/`
4. **Auto-reload**: Both servers support hot-reload, so changes are reflected automatically
5. **Test**: Use the dev button in the UI or curl commands

### Testing Production Build Locally

To test the production build:

```bash
cd apps/api-worker
pnpm build
pnpm wrangler dev
```

This runs the built version instead of the development version.

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `FUNDING_PRIVATE_KEY` | Yes | Private key for funding wallet (must have ETH on Sepolia) | `0x1234...` or `1234...` |

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Hono Framework Documentation](https://hono.dev/)
- [Viem Documentation](https://viem.sh/)

## Notes

- The `.dev.vars` file is only used for local development
- For production, set environment variables in Cloudflare Workers dashboard
- The local worker uses the same code as production, but with local environment variables
- CORS is configured to allow localhost origins for development

