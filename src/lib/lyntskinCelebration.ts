import confetti from 'canvas-confetti';

function fadeAudio(audio: HTMLAudioElement, from: number, to: number, ms: number): Promise<void> {
	return new Promise((resolve) => {
		const steps = 30;
		const stepTime = ms / steps;
		let step = 0;
		audio.volume = from;

		const interval = setInterval(() => {
			step++;
			const progress = step / steps;
			audio.volume = Math.max(0, Math.min(1, from + (to - from) * progress));

			if (step >= steps) {
				clearInterval(interval);
				audio.volume = to;
				resolve();
			}
		}, stepTime);
	});
}

function playHit(src: string, volume = 1) {
	try {
		const audio = new Audio(`/${src}`);
		audio.volume = volume;
		audio.play().catch(() => {});
	} catch {

	}
}

async function playCheer() {
	try {
		const cheer = new Audio('/cheer.wav');
		cheer.volume = 0;
		await cheer.play().catch(() => {});

		await fadeAudio(cheer, 0, 0.8, 600);

		// hold near full volume while the cheer plays out
		setTimeout(() => {
			fadeAudio(cheer, cheer.volume, 0, 900).then(() => {
				cheer.pause();
			});
		}, 900);
	} catch {
		// ignore playback errors
	}
}


function fireConfettiCannons() {
	const end = Date.now() + 3 * 1000;
	const colors = ['#ffd700', '#ff8c00', '#ffffff', '#60a5fa'];

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

export function celebrateLyntskinPurchase() {
	playHit('boom_cannon.mp3');
	playCheer();
	fireConfettiCannons();
}