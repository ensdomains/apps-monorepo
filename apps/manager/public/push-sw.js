/// <reference lib="webworker" />

/**
 * Push notification service worker.
 * Handles incoming push events and displays notifications.
 */

const sw = /** @type {ServiceWorkerGlobalScope} */ (self);

const TRUSTED_EXTERNAL_ORIGINS = new Set(['https://ens.domains']);

/**
 * @param {unknown} rawUrl
 * @returns {URL | null}
 */
const getSafeNotificationUrl = (rawUrl) => {
  if (typeof rawUrl !== 'string') return null;

  let url;

  try {
    url = new URL(rawUrl, sw.location.origin);
  } catch {
    return null;
  }

  if (
    url.origin === sw.location.origin &&
    url.protocol === sw.location.protocol
  ) {
    return url;
  }

  if (url.protocol === 'https:' && TRUSTED_EXTERNAL_ORIGINS.has(url.origin)) {
    return url;
  }

  return null;
};

// activate immediately
sw.addEventListener('install', () => {
  sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

// handle incoming push notifications
sw.addEventListener('push', (event) => {
  const rawText = event.data?.text() ?? 'No payload';

  /** @type {string} */
  let title = 'ENS Notification';
  /** @type {string} */
  let body = rawText;
  /** @type {string | undefined} */
  let icon;
  /** @type {string | undefined} */
  let badge;
  /** @type {string | undefined} */
  let tag;
  /** @type {Record<string, unknown> | undefined} */
  let data;

  try {
    const payload = JSON.parse(rawText);
    title = payload.title ?? title;
    body = payload.body ?? body;
    icon = payload.icon;
    badge = payload.badge;
    tag = payload.tag;
    data = payload.data;
  } catch {
    // use raw text as body if not valid JSON
  }

  event.waitUntil(
    sw.registration.showNotification(title, {
      body,
      icon: icon ?? '/logo192.png',
      badge: badge ?? '/logo192.png',
      tag,
      data,
    })
  );
});

// handle notification click
sw.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = getSafeNotificationUrl(event.notification.data?.url);

  if (url) {
    event.waitUntil(
      sw.clients.matchAll({ type: 'window' }).then((clientList) => {
        // try to focus existing window
        for (const client of clientList) {
          if (client.url === url.href && 'focus' in client) {
            return client.focus();
          }
        }
        // open new window if none found
        if (sw.clients.openWindow) {
          return sw.clients.openWindow(url.href);
        }
      })
    );
  }
});
