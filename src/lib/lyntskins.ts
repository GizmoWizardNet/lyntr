export interface LyntskinDef {
	key: string;
	name: string;
	price: number;
	file: string;
}

export const LYNTSKIN_CATALOG: LyntskinDef[] = [
	{ key: 'blueprint', name: 'Blueprint', price: 150, file: '/lyntskins/blueprint.webp' },
	{ key: 'game_loop', name: 'Game Loop', price: 300, file: '/lyntskins/game_loop.webp' },
	{ key: 'normal_city', name: 'Normal City', price: 500, file: '/lyntskins/normal_city.webp' },
	{ key: 'peaceful_japan', name: 'Peaceful Japan', price: 1000, file: '/lyntskins/peaceful_japan.webp' },
	{ key: 'silent_night', name: 'Silent Night', price: 1300, file: '/lyntskins/silent_night.webp' },
	{ key: 'homebrew', name: 'Homebrew', price: 1500, file: '/lyntskins/homebrew.webp' },
	{ key: 'mario', name: 'Mario', price: 2000, file: '/lyntskins/mario.webp' },
	{ key: 'elite_city', name: 'Elite City', price: 5000, file: '/lyntskins/elite_city.webp' },
	{ key: 'psx_fish', name: 'PSX Fish', price: 7500, file: '/lyntskins/fish.webp' },
	{ key: 'eff_juan', name: 'F1 Car', price: 4500, file: '/lyntskins/f1.webp'}
];

export const LYNTSKIN_BY_KEY: Record<string, LyntskinDef> = Object.fromEntries(
	LYNTSKIN_CATALOG.map((s) => [s.key, s])
);

export function isValidLyntskinKey(key: unknown): key is string {
	return typeof key === 'string' && key in LYNTSKIN_BY_KEY;
}
