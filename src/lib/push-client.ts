/**
 * Client-side Web Push helpers.
 *
 * Registers the service worker, requests Notification permission, and
 * saves/removes the PushSubscription via /api/push/subscribe.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function isPushSupported(): Promise<boolean> {
	return (
		'serviceWorker' in navigator &&
		'PushManager'    in window &&
		'Notification'   in window
	);
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) return null;
	try {
		return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
	} catch (err) {
		console.error('[push] SW registration failed:', err);
		return null;
	}
}

/** Returns the current subscription state for the active SW registration. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
	const reg = await navigator.serviceWorker.getRegistration('/');
	if (!reg) return null;
	return reg.pushManager.getSubscription();
}

/**
 * Subscribes the current device to push notifications.
 * - Requests notification permission if not already granted.
 * - Fetches the VAPID public key from the server.
 * - Creates a PushSubscription and saves it to /api/push/subscribe.
 *
 * If the server save fails, the browser-level subscription is rolled back
 * (unsubscribed) rather than left dangling — otherwise the UI would read
 * "subscribed" from the browser on every future load while the server has
 * no record of it, so no push ever actually arrives and nothing ever
 * surfaces why. Better to fail visibly and let the person retry.
 *
 * Returns 'subscribed' | 'denied' | 'error'.
 */
export async function subscribeToPush(): Promise<'subscribed' | 'denied' | 'error'> {
	let subscription: PushSubscription | null = null;
	try {
		if (!(await isPushSupported())) return 'error';

		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return 'denied';

		const reg = await getRegistration();
		if (!reg) return 'error';

		// Fetch VAPID public key
		const keyRes = await fetch('/api/push/subscribe');
		if (!keyRes.ok) return 'error';
		const { publicKey } = await keyRes.json();
		if (!publicKey) return 'error';

		subscription = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
		});

		// Send to server
		const saveRes = await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(subscription.toJSON()),
		});

		if (!saveRes.ok) {
			await subscription.unsubscribe();
			return 'error';
		}

		return 'subscribed';
	} catch (err) {
		console.error('[push] subscribe error:', err);
		// Same rollback if something threw after the browser-level
		// subscribe succeeded (e.g. the fetch itself throwing offline).
		if (subscription) await subscription.unsubscribe().catch(() => {});
		return 'error';
	}
}

/**
 * Re-sends the current browser-level subscription to the server if one
 * exists locally. Call this on mount alongside getCurrentSubscription() —
 * it's the self-healing counterpart to the rollback above: if the
 * subscription ever landed in the DB dropping a row (a bad migration, a
 * manual DB edit, whatever), the toggle would otherwise keep showing
 * "subscribed" forever from the browser's perspective while silently
 * receiving nothing. Idempotent — the server upserts on (user, endpoint),
 * so calling this on every mount is cheap and safe.
 */
export async function resyncSubscription(sub: PushSubscription): Promise<boolean> {
	try {
		const res = await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(sub.toJSON()),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Unsubscribes the current device from push notifications.
 * Removes the subscription from the browser AND the server.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
	try {
		const sub = await getCurrentSubscription();
		if (!sub) return true; // already unsubscribed

		await fetch('/api/push/subscribe', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint: sub.endpoint }),
		});

		await sub.unsubscribe();
		return true;
	} catch (err) {
		console.error('[push] unsubscribe error:', err);
		return false;
	}
}

/** Returns the current Notification permission without prompting. */
export function getPermissionState(): NotificationPermission | 'unsupported' {
	if (!('Notification' in window)) return 'unsupported';
	return Notification.permission;
}
