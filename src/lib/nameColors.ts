// ---------------------------------------------------------------------------
// Name colors
// ---------------------------------------------------------------------------
// Cosmetic username colors. `id` is what's stored on users.name_color and
// sent over the wire; everything else is presentation. Solid colors set
// `color` directly; gradients set `gradient` and are rendered as an
// animated background-clip:text span (see UserName.svelte).
//
// Adding a new color: add an entry here — UserName.svelte and
// ProfileSettings.svelte both just iterate this list, nothing else to touch.
// ---------------------------------------------------------------------------

export interface NameColor {
	id: string;
	label: string;
	kind: 'solid' | 'gradient';
	// For solid colors, a CSS color. For gradients, a CSS `background-image`
	// gradient value (used as a horizontally-scrolling text fill).
	value: string;
}

export const NAME_COLORS: NameColor[] = [
	{ id: 'green-candle', label: 'Green Candle', kind: 'solid', value: '#16a34a' },
	{ id: 'blue-chip', label: 'Blue Chip', kind: 'solid', value: '#2563eb' },
	{ id: 'orange-peel', label: 'Orange Peel', kind: 'solid', value: '#ea580c' },
	{ id: 'purple-haze', label: 'Purple Haze', kind: 'solid', value: '#9333ea' },
	{ id: 'gold-rush', label: 'Gold Rush', kind: 'solid', value: '#ca8a04' },
	{ id: 'red-alert', label: 'Red Alert', kind: 'solid', value: '#dc2626' },
	{
		id: 'degen-fire',
		label: 'Degen Fire',
		kind: 'gradient',
		value: 'linear-gradient(90deg, #ff6a00, #ffd400, #ff6a00)'
	},
	{
		id: 'ocean-wave',
		label: 'Ocean Wave',
		kind: 'gradient',
		value: 'linear-gradient(90deg, #06b6d4, #7c3aed, #06b6d4)'
	},
	{
		id: 'rainbow-baby',
		label: 'Rainbow Baby',
		kind: 'gradient',
		value:
			'linear-gradient(90deg, #ff3b3b, #ff9a3b, #ffe93b, #3bff5e, #3bd4ff, #6a3bff, #ff3bd4, #ff3b3b)'
	},
	{
		id: 'diamond-hands',
		label: 'Diamond Hands',
		kind: 'gradient',
		value: 'linear-gradient(90deg, #ffffff, #40e0d0, #9b5cff, #ffffff)'
	}
];

const NAME_COLOR_MAP = new Map(NAME_COLORS.map((c) => [c.id, c]));

export function getNameColor(id: string | null | undefined): NameColor | null {
	if (!id) return null;
	return NAME_COLOR_MAP.get(id) ?? null;
}

export function isValidNameColor(id: string | null | undefined): boolean {
	return id === null || id === undefined || NAME_COLOR_MAP.has(id);
}
