/**
 * src/lib/sound.ts — tiny WebAudio helpers for short UI sound cues.
 *
 * No audio files to ship, no autoplay-policy headaches: the AudioContext
 * is only ever created lazily, inside one of these calls, which only ever
 * happen in response to something that already happened after a user
 * gesture (a WS event triggered by the user's own action, a click, etc).
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!ctx) {
		const Ctor = window.AudioContext || (window as any).webkitAudioContext;
		if (!Ctor) return null;
		ctx = new Ctor();
	}
	if (ctx.state === 'suspended') ctx.resume();
	return ctx;
}

/** A single short pitch-swept blip. */
export function playBlip({
	up = true,
	duration = 0.09,
	startFreq = 320,
	endFreq = 720,
	volume = 0.16
}: { up?: boolean; duration?: number; startFreq?: number; endFreq?: number; volume?: number } = {}) {
	const audio = getCtx();
	if (!audio) return;
	const osc = audio.createOscillator();
	const gain = audio.createGain();
	osc.type = 'triangle';
	const now = audio.currentTime;
	osc.frequency.setValueAtTime(up ? startFreq : endFreq, now);
	osc.frequency.exponentialRampToValueAtTime(up ? endFreq : startFreq, now + duration);
	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
	osc.connect(gain).connect(audio.destination);
	osc.start(now);
	osc.stop(now + duration + 0.02);
}

/** A little two-note "cha-ching" for coin/reward pickups. */
export function playCoinChime() {
	playBlip({ up: true, startFreq: 520, endFreq: 900, duration: 0.07, volume: 0.14 });
	setTimeout(() => playBlip({ up: true, startFreq: 780, endFreq: 1300, duration: 0.09, volume: 0.16 }), 70);
}
