/**
 * TanStack Start Server Entry Point
 *
 * Adds password protection middleware for the entire application.
 * Set the SITE_PASSWORD environment variable in Cloudflare Workers.
 */

import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

// Extend the Env interface to include SITE_PASSWORD
declare global {
  interface Env {
    SITE_PASSWORD?: string
  }
}

// Get SITE_PASSWORD from environment
// In Cloudflare Workers: uses cloudflare:workers import
// In local dev: uses process.env (populated from .dev.vars by wrangler)
async function getSitePassword(): Promise<string | undefined> {
  // Try Cloudflare Workers environment first
  try {
    // Dynamic import to avoid build errors in non-CF environments
    const { env } = await import('cloudflare:workers')
    if (env?.SITE_PASSWORD) {
      return env.SITE_PASSWORD
    }
  } catch {
    // Not in Cloudflare Workers runtime
  }

  // Fallback to process.env for local development
  if (typeof process !== 'undefined' && process.env?.SITE_PASSWORD) {
    return process.env.SITE_PASSWORD
  }

  return undefined
}

const COOKIE_NAME = 'auth_token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function generateToken(password: string): string {
  // Simple hash for cookie validation
  return btoa(password).split('').reverse().join('')
}

function getCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get('Cookie')
  if (!cookies) return null

  const match = cookies.match(new RegExp(`(^| )${name}=([^;]+)`))
  return match ? match[2] : null
}

function getLoginPage(error?: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ENS Manager Alpha</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }

    h1 {
      color: #fff;
      font-size: 24px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 8px;
    }

    p {
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-bottom: 32px;
      font-size: 14px;
    }

    .error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
      text-align: center;
    }

    input[type="password"] {
      width: 100%;
      padding: 14px 16px;
      font-size: 16px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    input[type="password"]:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    input[type="password"]::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    button {
      width: 100%;
      padding: 14px 16px;
      font-size: 16px;
      font-weight: 500;
      color: #fff;
      background: #3b82f6;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 16px;
      transition: background 0.2s, transform 0.1s;
    }

    button:hover {
      background: #2563eb;
    }

    button:active {
      transform: scale(0.98);
    }

    .logo {
      text-align: center;
      margin-bottom: 24px;
    }

    .logo svg {
      width: 48px;
      height: 48px;
      fill: #3b82f6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#3b82f6" fill="none"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#3b82f6" fill="none"/>
      </svg>
    </div>
    <h1>ENS Manager Alpha</h1>
    <p>Enter the password to continue</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/__auth">
      <input
        type="password"
        name="password"
        placeholder="Enter password"
        required
        autofocus
      />
      <button type="submit">Continue</button>
    </form>
  </div>
</body>
</html>`

  return new Response(html, {
    status: 401,
    headers: { 'Content-Type': 'text/html' },
  })
}

export default createServerEntry({
  async fetch(request) {
    const url = new URL(request.url)

    // Skip auth for static assets
    if (
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|map)$/)
    ) {
      return handler.fetch(request)
    }

    // Get SITE_PASSWORD from environment (Cloudflare Workers or local dev)
    const sitePassword = await getSitePassword()

    // If no password configured, allow access
    if (!sitePassword) {
      console.warn('SITE_PASSWORD not set - site is not protected')
      return handler.fetch(request)
    }

    const expectedToken = generateToken(sitePassword)

    // Check for valid auth cookie
    const authCookie = getCookie(request, COOKIE_NAME)
    if (authCookie === expectedToken) {
      return handler.fetch(request)
    }

    // Handle auth form submission
    if (url.pathname === '/__auth' && request.method === 'POST') {
      try {
        const formData = await request.formData()
        const password = formData.get('password')

        if (password === sitePassword) {
          // Password correct - set cookie and redirect to home
          return new Response(null, {
            status: 302,
            headers: {
              Location: '/',
              'Set-Cookie': `${COOKIE_NAME}=${expectedToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`,
            },
          })
        }

        // Wrong password
        return getLoginPage('Incorrect password')
      } catch {
        return getLoginPage('An error occurred')
      }
    }

    // Show login page for unauthenticated requests
    return getLoginPage()
  },
})
