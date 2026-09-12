export interface LyntskinDef {
	key: string;
	name: string;
	price: number;
	file: string;
}

export const LYNTSKIN_CATALOG: LyntskinDef[] = [
	{ key: 'blueprint', name: 'Blueprint', price: 150, file: '/lyntskins/blueprint.gif' },
	{ key: 'game_loop', name: 'Game Loop', price: 300, file: '/lyntskins/game_loop.gif' },
	{ key: 'normal_city', name: 'Normal City', price: 500, file: '/lyntskins/normal_city.gif' },
	{ key: 'peaceful_japan', name: 'Peaceful Japan', price: 1000, file: '/lyntskins/peaceful_japan.gif' },
	{ key: 'silent_night', name: 'Silent Night', price: 1300, file: '/lyntskins/silent_night.gif' },
	{ key: 'homebrew', name: 'Homebrew', price: 1500, file: '/lyntskins/homebrew.gif' },
	{ key: 'mario', name: 'Mario', price: 2000, file: '/lyntskins/mario.gif' },
	{ key: 'elite_city', name: 'Elite City', price: 5000, file: '/lyntskins/elite_city.gif' }
];

export const LYNTSKIN_BY_KEY: Record<string, LyntskinDef> = Object.fromEntries(
	LYNTSKIN_CATALOG.map((s) => [s.key, s])
);

export function isValidLyntskinKey(key: unknown): key is string {
	return typeof key === 'string' && key in LYNTSKIN_BY_KEY;
}
