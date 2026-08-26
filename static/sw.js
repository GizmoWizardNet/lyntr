/**
 * Lyntr Service Worker
 *
 * Handles:
 *   - push   — show a native notification from a Web Push message
 *   - notificationclick — navigate to the relevant page when tapped
 */

self.addEventListener('push', (event) => {
	if (!event.data) return;

	let payload;
	try {
		payload = event.data.json();
	} catch {
		payload = { title: 'Lyntr', body: event.data.text() };
	}

	const title = payload.title ?? 'Lyntr';
	const options = {
		body:    payload.body   ?? '',
		icon:    payload.icon   ?? '/android-chrome-192x192.png',
		badge:   payload.badge  ?? '/favicon-32x32.png',
		tag:     payload.tag    ?? 'lyntr-notif',
		data:    { url: payload.url ?? '/' },
		// Vibrate on mobile: 200ms on, 100ms off, 200ms on
		vibrate: [200, 100, 200],
		// Renotify even if a notification with the same tag already exists
		renotify: true,
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = event.notification.data?.url ?? '/';

	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// If Lyntr is already open, focus it and navigate
			for (const client of clientList) {
				if (client.url.includes(self.location.origin) && 'focus' in client) {
					client.focus();
					client.navigate(url);
					return;
				}
			}
			// Otherwise open a new tab
			if (clients.openWindow) {
				return clients.openWindow(url);
			}
		})
	);
});

// Keep the SW alive and update it immediately when a new version is deployed
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
