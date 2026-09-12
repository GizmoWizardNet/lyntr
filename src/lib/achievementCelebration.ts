import confetti from 'canvas-confetti';

/**
 * structured back from the lyntskin celeb TS thing
 */
function playHit(src: string, volume = 1) {
	try {
		const audio = new Audio(`/${src}`);
		audio.volume = volume;
		audio.play().catch(() => {});
	} catch {
	}
}

function fireConfettiCannons() {
	const end = Date.now() + 3 * 1000;
	const colors = ['#dc2626', '#ffffff'];

	(function frame() {
		confetti({
			particleCount: 2,
			angle: 60,
			spread: 55,
			origin: { x: 0 },
			colors
		});
		confetti({
			particleCount: 2,
			angle: 120,
			spread: 55,
			origin: { x: 1 },
			colors
		});

		if (Date.now() < end) {
			requestAnimationFrame(frame);
		}
	})();
}

export function celebrateAchievementClaim() {
	playHit('achievement.wav');
	fireConfettiCannons();
}