export type AuraTier = 'Newbie' | 'Emerging' | 'Notable' | 'Elite' | 'Legendary' | 'Certified Aura God';

// Pure, no DB access — safe to import from client code (ProfilePage renders
// a tier name from a score it already has) as well as from
// src/lib/server/aura.ts, which does the actual score computation.
export function auraTier(score: number): AuraTier {
	if (score >= 5000) return 'Certified Aura God';
	if (score >= 2500) return 'Legendary';
	if (score >= 1200) return 'Elite';
	if (score >= 500) return 'Notable';
	if (score >= 150) return 'Emerging';
	return 'Newbie';
}
