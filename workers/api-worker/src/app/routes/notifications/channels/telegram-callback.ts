import { html } from 'hono/html'
import {
  TelegramAttemptRecoveryError,
  TelegramTokenExchangeError,
} from '#services/telegram/errors.js'

const isTokenExchangeTimeout = (error: unknown): boolean => {
  if (error instanceof TelegramAttemptRecoveryError)
    return isTokenExchangeTimeout(error.failure)
  return (
    error instanceof TelegramTokenExchangeError &&
    error.stage === 'request' &&
    (error.cause instanceof Error || error.cause instanceof DOMException) &&
    error.cause.name === 'TimeoutError'
  )
}

export const telegramCallbackPage = ({
  isSuccess,
  nonce,
  managerUrl,
  error,
}: {
  readonly isSuccess: boolean
  readonly nonce: string
  readonly managerUrl?: string
  readonly error?: unknown
}) => {
  const hasTimedOut = !isSuccess && isTokenExchangeTimeout(error)
  return html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="color-scheme" content="light">
      <title>${isSuccess ? 'Telegram connected' : 'Connect Telegram'} · ENS Manager</title>
      <style nonce="${nonce}">
        /* Mirror Manager's styles/theme.css tokens for this standalone page.
           It needs no application bundle, scripts, cookies, or wallet session. */
        :root {
          --font-sans: "ABCMonumentGrotesk", Arial, sans-serif;
          --font-mono: "ABCMonumentGroteskMono", monospace;
          --color-ens-lapis-core: #0080bc;
          --color-ens-lapis-hover: #026b9c;
          --color-ens-lapis-dense: #093c52;
          --color-ens-lapis-dust: #cee1e8;
          --color-ens-lapis-tint: #f5fcff;
          --color-ens-quartz-0: #ffffff;
          --color-ens-quartz-50: #faf9f7;
          --color-ens-quartz-150: #eae8e8;
          --color-ens-quartz-400: #737373;
          --color-ens-quartz-550: #515151;
          --color-ens-signal-success-100: #e3f7e9;
          --color-ens-signal-success-700: #105c23;
          --color-ens-signal-warning-100: #fffaeb;
          --color-ens-signal-warning-700: #955b14;
          --shadow-temp-card: 0 4px 24px 0 rgba(7, 28, 47, 0.07);
        }
        @font-face {
          font-family: "ABCMonumentGrotesk";
          src: url("https://fonts.ens.dev/fonts/Monument%20Grotesk%20Variable/ABCMonumentGroteskVariable.woff2") format("woff2");
          font-weight: 200 900;
          font-display: swap;
        }
        @font-face {
          font-family: "ABCMonumentGroteskMono";
          src: url("https://fonts.ens.dev/fonts/Monument%20Grotesk%20Mono/ABCMonumentGroteskMono-Regular.woff2") format("woff2");
          font-weight: 400;
          font-display: swap;
        }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100svh; padding: 48px 24px; display: grid; place-items: center; background: var(--color-ens-quartz-50); color: var(--color-ens-lapis-dense); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
        .shell { width: 100%; max-width: 480px; }
        .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 32px; }
        .brand svg { width: 25px; height: 29px; color: var(--color-ens-lapis-core); }
        .brand span { font-size: 18px; }
        .card { padding: 40px 32px 28px; border: 1px solid var(--color-ens-quartz-150); border-radius: 16px; background: var(--color-ens-quartz-0); box-shadow: var(--shadow-temp-card); text-align: center; }
        .icon { position: relative; display: grid; place-items: center; width: 80px; height: 80px; margin: 0 auto 24px; border: 1px solid var(--color-ens-lapis-dust); border-radius: 50%; background: var(--color-ens-lapis-tint); color: var(--color-ens-lapis-core); }
        .icon > svg { width: 36px; height: 36px; }
        .badge { position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center; width: 28px; height: 28px; border: 3px solid var(--color-ens-quartz-0); border-radius: 50%; background: var(--color-ens-signal-success-100); color: var(--color-ens-signal-success-700); }
        .badge svg { width: 16px; height: 16px; }
        .incomplete .badge { background: var(--color-ens-signal-warning-100); color: var(--color-ens-signal-warning-700); }
        .eyebrow { margin: 0 0 12px; font-family: var(--font-mono); font-size: 11px; line-height: 1.4; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-ens-quartz-400); }
        h1 { margin: 0 0 16px; font-size: 32px; font-weight: 450; line-height: 1.12; letter-spacing: -0.025em; text-wrap: balance; }
        .description { margin: 0; color: var(--color-ens-quartz-550); font-size: 16px; line-height: 1.5; text-wrap: pretty; }
        .next-step { margin-top: 28px; padding: 20px; border-radius: 8px; background: var(--color-ens-lapis-tint); }
        .next-step strong { display: block; margin-bottom: 6px; font-size: 15px; font-weight: 500; line-height: 1.4; }
        .next-step p { margin: 0; color: var(--color-ens-quartz-550); font-size: 14px; line-height: 1.5; }
        .manager-link { display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; padding: 10px 14px; border-radius: 4px; color: var(--color-ens-lapis-core); font-family: var(--font-mono); font-size: 12px; text-decoration: none; }
        .manager-link:hover { background: var(--color-ens-lapis-tint); color: var(--color-ens-lapis-hover); }
        .manager-link:focus-visible { outline: 2px solid var(--color-ens-lapis-core); outline-offset: 3px; }
        .manager-link svg { width: 16px; height: 16px; }
        .footnote { margin: 20px 12px 0; color: var(--color-ens-quartz-400); font-size: 12px; line-height: 1.5; text-align: center; }
        @media (max-width: 420px) { body { padding: 32px 16px; } .card { padding: 32px 24px 24px; } h1 { font-size: 28px; } .brand { margin-bottom: 24px; } }
      </style>
    </head>
    <body>
      <div class="shell">
        <header class="brand" aria-label="ENS Manager">
          <svg aria-hidden="true" viewBox="0 0 82 94" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M42.473 1.55c-.344-.524.289-1.137.802-.777L64.757 15.81c13.54 9.477 19.774 26.398 15.482 42.344a38 38 0 0 1-1.048 3.296c-.212.574-1.057.45-1.1-.16-.362-5.193-4.1-11.129-6.814-15.437-.484-.77-.936-1.487-1.33-2.139-2.638-4.363-21.73-33.43-27.474-42.165M14.03 43.84l25.714-42.31c.298-.492-.24-1.064-.75-.798C34.5 3.076 22.37 9.857 12.848 19.367c-10.436 10.423-2.002 21.858.261 24.546.25.297.719.26.92-.072m25.078 49.044c.344.523-.288 1.135-.802.776L16.823 78.624C3.283 69.147-2.951 52.226 1.342 36.28c.34-1.264.704-2.37 1.047-3.296.213-.575 1.057-.45 1.1.16.362 5.193 4.1 11.129 6.814 15.437.485.77.936 1.487 1.33 2.138 2.638 4.364 21.73 33.43 27.474 42.166m2.733.014 25.714-42.31a.57.57 0 0 1 .92-.072c2.264 2.687 10.698 14.123.262 24.545-9.523 9.51-21.652 16.291-26.147 18.635-.51.266-1.048-.307-.75-.798"/></svg>
          <span>ENS Manager</span>
        </header>
        <main class="card ${isSuccess ? '' : 'incomplete'}">
          <div class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            <span class="badge">${
              isSuccess
                ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-8"/></svg>`
                : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a9 9 0 1 1 3 9M3 4v6h6"/></svg>`
            }</span>
          </div>
          <p class="eyebrow">Telegram notifications</p>
          <h1>${isSuccess ? 'Telegram connected' : hasTimedOut ? 'Telegram sign-in timed out' : 'Connection not completed'}</h1>
          <p class="description">${
            isSuccess
              ? 'Your Telegram is ready. Head back to ENS Manager to finish setting your notification preferences.'
              : hasTimedOut
                ? 'Telegram took too long to respond. Return to your original ENS Manager tab and start a new connection. If you didn’t allow messages, enable that permission when you try again.'
                : 'We couldn’t finish connecting Telegram this time. Return to ENS Manager to try again.'
          }</p>
          <div class="next-step">
            <strong>${isSuccess ? 'Continue in your ENS Manager tab' : 'Try again and allow messages'}</strong>
            <p>${
              isSuccess
                ? 'You can close this tab. Your connection will update automatically in Manager.'
                : 'When Telegram asks, allow the notification bot to send you messages. This permission is required to receive ENS notifications.'
            }</p>
          </div>
          ${managerUrl ? html`<a class="manager-link" href="${managerUrl}" rel="noreferrer">Open ENS Manager <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a>` : ''}
        </main>
        <p class="footnote">If you’re registering a name, return to your original tab to keep your progress.</p>
      </div>
    </body>
  </html>`
}
