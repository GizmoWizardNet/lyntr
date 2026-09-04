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

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
	const reg = await navigator.serviceWorker.getRegistration('/');
	if (!reg) return null;
	return reg.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<'subscribed' | 'denied' | 'error'> {
	let subscription: PushSubscription | null = null;
	try {
		if (!(await isPushSupported())) return 'error';

		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return 'denied';

		const reg = await getRegistration();
		if (!reg) return 'error';

		await navigator.serviceWorker.ready;

		const existing = await reg.pushManager.getSubscription();
		if (existing) await existing.unsubscribe().catch(() => {});

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