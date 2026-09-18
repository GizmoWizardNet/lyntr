export interface LyntskinDef {
	key: string;
	name: string;
	price: number;
	file: string;
}

export const LYNTSKIN_CATALOG: LyntskinDef[] = [
	{ key: 'blueprint', name: 'Blueprint', price: 150, file: '/lyntskins/blueprint.avif' },
	{ key: 'game_loop', name: 'Game Loop', price: 300, file: '/lyntskins/game_loop.avif' },
	{ key: 'normal_city', name: 'Normal City', price: 500, file: '/lyntskins/normal_city.avif' },
	{ key: 'peaceful_japan', name: 'Peaceful Japan', price: 1000, file: '/lyntskins/peaceful_japan.avif' },
	{ key: 'silent_night', name: 'Silent Night', price: 1300, file: '/lyntskins/silent_night.avif' },
	{ key: 'homebrew', name: 'Homebrew', price: 1500, file: '/lyntskins/homebrew.avif' },
	{ key: 'mario', name: 'Mario', price: 2000, file: '/lyntskins/mario.avif' },
	{ key: 'elite_city', name: 'Elite City', price: 5000, file: '/lyntskins/elite_city.avif' },
	{ key: 'psx_fish', name: 'PSX Fish', price: 7500, file: '/lyntskins/fish.avif' },
	{ key: 'eff_juan', name: 'Spinny Eff Juan Car', price: 4500, file: '/lyntskins/f1.avif'}
];

export const LYNTSKIN_BY_KEY: Record<string, LyntskinDef> = Object.fromEntries(
	LYNTSKIN_CATALOG.map((s) => [s.key, s])
);

export function isValidLyntskinKey(key: unknown): key is string {
	return typeof key === 'string' && key in LYNTSKIN_BY_KEY;
}
