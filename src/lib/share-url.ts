// 1lyn.tr is a 301 redirect to lyntr.gizmowizard.tech — short and easy to
// paste into Discord/Twitter/etc. Use it for anything a person actually
// copies and shares (the Share button, "copy link" actions). It's NOT used
// for og:url/canonical metadata, Discord embeds, or emails — those need to
// stay on the real domain (lyntr.gizmowizard.tech), since that's what
// crawlers and mail clients should treat as canonical, and it's what
// PUBLIC_ORIGIN/window.location.origin already resolve to anyway.
export const SHARE_ORIGIN = 'https://1lyn.tr';

// Builds a shareable link to a specific lynt. Use this instead of
// `${window.location.origin}?id=${id}` wherever the result gets copied to
// the clipboard or otherwise handed to the person to share externally.
export function shareLyntUrl(lyntId: string): string {
	return `${SHARE_ORIGIN}/?id=${lyntId}`;
}

export function shareScrollableUrl(scrollableId: string): string {
	return `${SHARE_ORIGIN}/scrollables/${scrollableId}`;
}

export function shareProfileUrl(handle: string): string {
	return `${SHARE_ORIGIN}/@${handle}`;
}
