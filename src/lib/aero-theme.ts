// "Glassy Aerodynamics" theme — a Netscape/Vista/Windows 7-era glass skin
// layered on top of Lyntr's existing HSL colour tokens. It's a pure CSS
// class toggle (see the `.aero` block in app.css), so switching it is
// instant and live — no reload, no round trip.
//
// Persisted client-side only (localStorage), same tier as things like
// sidebar-collapsed state — it's a per-device display preference, not
// account data, so it doesn't need a server round trip or DB column.

const STORAGE_KEY = 'lyntr-aero-theme';

function applyClass(enabled: boolean) {
	if (typeof document === 'undefined') return;
	document.documentElement.classList.toggle('aero', enabled);
}

export function getAeroEnabled(): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(STORAGE_KEY) === '1';
}

export function setAeroEnabled(enabled: boolean) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
	}
	applyClass(enabled);
}

// Call once on app init (e.g. root layout) in case the inline app.html
// script didn't run for some reason (SSR hydration edge cases) — cheap
// no-op if the class is already correctly set.
export function initAeroTheme() {
	applyClass(getAeroEnabled());
}
