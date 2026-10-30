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

const ensMark = html`<svg aria-hidden="true" viewBox="0 0 82 94" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M42.473 1.55c-.344-.524.289-1.137.802-.777L64.757 15.81c13.54 9.477 19.774 26.398 15.482 42.344a38 38 0 0 1-1.048 3.296c-.212.574-1.057.45-1.1-.16-.362-5.193-4.1-11.129-6.814-15.437-.484-.77-.936-1.487-1.33-2.139-2.638-4.363-21.73-33.43-27.474-42.165M14.03 43.84l25.714-42.31c.298-.492-.24-1.064-.75-.798C34.5 3.076 22.37 9.857 12.848 19.367c-10.436 10.423-2.002 21.858.261 24.546.25.297.719.26.92-.072m25.078 49.044c.344.523-.288 1.135-.802.776L16.823 78.624C3.283 69.147-2.951 52.226 1.342 36.28c.34-1.264.704-2.37 1.047-3.296.213-.575 1.057-.45 1.1.16.362 5.193 4.1 11.129 6.814 15.437.485.77.936 1.487 1.33 2.138 2.638 4.364 21.73 33.43 27.474 42.166m2.733.014 25.714-42.31a.57.57 0 0 1 .92-.072c2.264 2.687 10.698 14.123.262 24.545-9.523 9.51-21.652 16.291-26.147 18.635-.51.266-1.048-.307-.75-.798"/></svg>`

// Same paper-plane glyph as Manager's components/icons/telegram.tsx.
const telegramMark = html`<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.11 18.04a.42.42 0 0 0 .78-.02l5.42-15.83a.42.42 0 0 0-.53-.53L1.95 7.08a.42.42 0 0 0-.02.78l6.6 2.65c.21.08.4.21.56.37.16.16.29.35.37.56z"/><path d="M18.21 1.76 9.09 10.87"/></svg>`

const checkGlyph = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12.5 4 4 8-9"/></svg>`

const retryGlyph = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a8 8 0 1 1 2.6 6.3M4 5v6h6"/></svg>`

export const telegramCallbackPage = ({
  isSuccess,
  nonce,
  error,
}: {
  readonly isSuccess: boolean
  readonly nonce: string
  readonly error?: unknown
}) => {
  const hasTimedOut = !isSuccess && isTokenExchangeTimeout(error)
  return html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="color-scheme" content="light">
      <title>${isSuccess ? 'Telegram connected' : 'Telegram not connected'} · ENS App</title>
      <style nonce="${nonce}">
        /* Mirror Manager's styles/theme.css and fonts.css for this standalone page.
           It needs no application bundle, cookies, or wallet session. */
        :root {
          --font-sans: "ABCMonumentGrotesk", Arial, sans-serif;
          --font-mono: "ABCMonumentGroteskMono", ui-monospace, monospace;
          --font-serif: "ABCMarist", Georgia, serif;
          --color-ens-lapis-core: #0080bc;
          --color-ens-lapis-hover: #026b9c;
          --color-ens-lapis-active: #024b6e;
          --color-ens-lapis-dense: #093c52;
          --color-ens-lapis-dust: #cee1e8;
          --color-ens-lapis-bg: #e5f7ff;
          --color-ens-lapis-tint: #f5fcff;
          --color-ens-quartz-0: #ffffff;
          --color-ens-quartz-50: #faf9f7;
          --color-ens-quartz-150: #eae8e8;
          --color-ens-quartz-300: #c7c6c4;
          --color-ens-quartz-400: #737373;
          --color-ens-quartz-550: #515151;
          --color-ens-signal-success-100: #e3f7e9;
          --color-ens-signal-success-600: #167e30;
          --color-ens-signal-warning-100: #fffaeb;
          --color-ens-signal-warning-400: #feeec4;
          --color-ens-signal-warning-700: #955b14;
          --shadow-temp-card: 0 4px 24px 0 rgba(7, 28, 47, 0.07);
          --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
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
        @font-face {
          font-family: "ABCMarist";
          src: url("https://fonts.ens.dev/fonts/Marist/ABCMarist-Book.woff2") format("woff2");
          font-weight: 400;
          font-display: swap;
        }
        * { box-sizing: border-box; }
        html { background: #fafafa; }
        body { position: relative; margin: 0; min-height: 100svh; padding: 40px 20px; display: grid; place-items: center; color: var(--color-ens-lapis-dense); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }

        /* Manager's landing-page block pattern, faded towards the card. */
        .backdrop { position: fixed; inset: 0; z-index: -2; width: 100%; height: 100%; }
        .veil { position: fixed; inset: 0; z-index: -1; background: radial-gradient(ellipse 60% 55% at 50% 48%, #fafafa 35%, rgba(250, 250, 250, 0) 100%); }

        .shell { width: 100%; max-width: 448px; }
        .brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0 0 28px; color: var(--color-ens-lapis-dense); font-size: 17px; letter-spacing: 0.01em; }
        .brand svg { width: 20px; height: 23px; color: var(--color-ens-lapis-core); }

        .card { padding: 36px 36px 32px; border: 1px solid var(--color-ens-quartz-150); border-radius: 20px; background: var(--color-ens-quartz-0); box-shadow: var(--shadow-temp-card); }

        /* The connection: ENS on the left, Telegram on the right, the link between them. */
        .link { display: grid; grid-template-columns: 56px 1fr 56px; align-items: center; margin: 0 0 32px; }
        .tile { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; }
        .tile svg { width: 24px; height: 24px; }
        .tile-ens { background: var(--color-ens-lapis-core); color: var(--color-ens-quartz-0); }
        .tile-ens svg { width: 22px; height: 25px; }
        .tile-telegram { border: 1px solid var(--color-ens-lapis-dust); background: var(--color-ens-lapis-tint); color: var(--color-ens-lapis-core); }
        .wire { position: relative; height: 32px; }
        .wire::before, .wire::after { content: ""; position: absolute; top: 50%; height: 2px; margin-top: -1px; transform-origin: left center; animation: draw 520ms var(--ease-out) both; }
        .wire::before { left: 0; right: 50%; }
        .wire::after { left: 50%; right: 0; animation-delay: 140ms; }
        .node { position: absolute; z-index: 1; top: 50%; left: 50%; display: grid; place-items: center; width: 36px; height: 36px; margin: -18px 0 0 -18px; border: 4px solid var(--color-ens-quartz-0); border-radius: 50%; animation: pop 360ms var(--ease-out) 520ms both; }
        .node svg { width: 18px; height: 18px; }

        .is-connected .wire::before, .is-connected .wire::after { background: var(--color-ens-lapis-core); }
        .is-connected .node { background: var(--color-ens-signal-success-100); color: var(--color-ens-signal-success-600); box-shadow: 0 0 0 1px var(--color-ens-signal-success-100); }

        .is-broken .wire::before, .is-broken .wire::after { background: repeating-linear-gradient(90deg, var(--color-ens-quartz-300) 0 6px, transparent 6px 11px); }
        .is-broken .wire::before { right: calc(50% + 12px); }
        .is-broken .wire::after { left: calc(50% + 12px); }
        .is-broken .tile-telegram { border-style: dashed; border-color: var(--color-ens-quartz-300); background: var(--color-ens-quartz-50); color: var(--color-ens-quartz-400); }
        .is-broken .node { background: var(--color-ens-signal-warning-100); color: var(--color-ens-signal-warning-700); box-shadow: 0 0 0 1px var(--color-ens-signal-warning-400); }

        h1 { margin: 0 0 12px; font-family: var(--font-serif); font-size: 34px; font-weight: 400; line-height: 1.08; letter-spacing: -0.02em; text-wrap: balance; }
        .description { margin: 0; max-width: 34em; color: var(--color-ens-quartz-550); font-size: 16px; line-height: 1.5; text-wrap: pretty; }

        .aside { margin: 24px 0 0; padding: 14px 16px; border-radius: 10px; background: var(--color-ens-lapis-tint); color: var(--color-ens-lapis-dense); font-size: 14px; line-height: 1.5; }

        .steps { margin: 24px 0 0; padding: 0; list-style: none; counter-reset: step; border-top: 1px solid var(--color-ens-quartz-150); }
        .steps li { position: relative; padding: 14px 0 14px 40px; border-bottom: 1px solid var(--color-ens-quartz-150); counter-increment: step; font-size: 15px; line-height: 1.45; }
        .steps li::before { content: counter(step); position: absolute; top: 13px; left: 0; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--color-ens-lapis-bg); color: var(--color-ens-lapis-core); font-family: var(--font-mono); font-size: 12px; line-height: 1; }
        .steps li:last-child { padding-bottom: 0; border-bottom: 0; }
        .steps strong { font-weight: 500; }
        .steps span { display: block; margin-top: 2px; color: var(--color-ens-quartz-550); font-size: 14px; }

        .button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; margin-top: 28px; padding: 16px; border: 0; border-radius: 6px; background: var(--color-ens-lapis-core); color: var(--color-ens-quartz-0); font-family: var(--font-mono); font-size: 14px; cursor: pointer; transition: background-color 150ms ease; }
        .button:hover { background: var(--color-ens-lapis-hover); }
        .button:active { background: var(--color-ens-lapis-active); }
        .button:focus-visible { outline: 3px solid var(--color-ens-lapis-dust); outline-offset: 2px; }
        .button svg { width: 16px; height: 16px; transition: transform 150ms ease; }
        .button:hover svg { transform: translateX(2px); }

        .footnote { margin: 20px 16px 0; color: var(--color-ens-quartz-400); font-size: 13px; line-height: 1.5; text-align: center; text-wrap: balance; }

        @keyframes draw { from { transform: scaleX(0); } }
        @keyframes pop { from { opacity: 0; transform: scale(0.4); } }
        @media (prefers-reduced-motion: reduce) {
          .wire::before, .wire::after, .node { animation: none; }
          .button, .button svg { transition: none; }
        }
        @media (max-width: 420px) {
          body { padding: 28px 14px; place-items: start center; }
          .brand { margin-bottom: 20px; }
          .card { padding: 28px 22px 24px; border-radius: 16px; }
          .link { margin-bottom: 28px; }
          h1 { font-size: 29px; }
        }
      </style>
    </head>
    <body>
      <svg class="backdrop" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="blocks" width="256" height="256" patternUnits="userSpaceOnUse" patternTransform="scale(0.1171875)">
            <rect width="256" height="256" fill="#fafafa"/>
            <g fill="#ffffff">
              <rect y="16" width="16" height="32"/><rect y="80" width="16" height="32"/><rect x="48" y="80" width="32" height="32"/><rect x="240" y="16" width="16" height="32"/><rect x="48" y="16" width="160" height="32"/><rect x="112" y="80" width="144" height="32"/><rect y="208" width="144" height="32"/><rect x="112" y="144" width="32" height="32"/><rect x="176" y="144" width="80" height="32"/><rect y="144" width="80" height="32"/><rect x="176" y="208" width="32" height="32"/><rect x="240" y="208" width="16" height="32"/>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#blocks)"/>
      </svg>
      <div class="veil" aria-hidden="true"></div>
      <div class="shell">
        <header class="brand">${ensMark}<span>ENS App</span></header>
        <main class="card ${isSuccess ? 'is-connected' : 'is-broken'}">
          <div class="link" aria-hidden="true">
            <span class="tile tile-ens">${ensMark}</span>
            <span class="wire"><span class="node">${isSuccess ? checkGlyph : retryGlyph}</span></span>
            <span class="tile tile-telegram">${telegramMark}</span>
          </div>
          <h1>${isSuccess ? 'Telegram connected' : hasTimedOut ? 'Telegram sign-in timed out' : 'Telegram not connected'}</h1>
          <p class="description">${
            isSuccess
              ? 'Your Telegram account is linked. Go back to ENS App to finish setting up your notifications.'
              : hasTimedOut
                ? 'Telegram took too long to respond, so your account wasn’t linked. Follow these steps to start a new connection.'
                : 'Telegram sign-in didn’t finish, so your account wasn’t linked. Follow these steps to try again.'
          }</p>
          ${
            isSuccess
              ? html`<p class="aside">You can close this tab. ENS App will show Telegram as connected.</p>`
              : html`<ol class="steps">
            <li><strong>Go back to your ENS App tab</strong><span>If you’re registering a name, use that tab so you keep your progress.</span></li>
            <li><strong>Select Connect Telegram again</strong></li>
            <li><strong>Allow messages when Telegram asks</strong><span>You need to allow the notification bot to send you messages, or ENS notifications can’t reach you.</span></li>
          </ol>`
          }
          <button class="button" id="close-window" type="button">Close Window</button>
        </main>
        <p class="footnote">If this window doesn’t close, you can close it manually.${isSuccess ? ' Registering a name? Go back to your original tab to keep your progress.' : ''}</p>
      </div>
      <script nonce="${nonce}">
        document.getElementById('close-window').addEventListener('click', () => window.close());
      </script>
    </body>
  </html>`
}
