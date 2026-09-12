const freezeFrameCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function captureFirstFrame(src: string): Promise<string | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth || 1;
				canvas.height = img.naturalHeight || 1;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve(null);
					return;
				}
				ctx.drawImage(img, 0, 0);
				resolve(canvas.toDataURL('image/png'));
			} catch {
				resolve(null);
			}
		};
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

export function getLyntskinFreezeFrame(src: string): Promise<string | null> {
	const cached = freezeFrameCache.get(src);
	if (cached) return Promise.resolve(cached);

	const pending = inFlight.get(src);
	if (pending) return pending;

	const promise = captureFirstFrame(src).then((dataUrl) => {
		inFlight.delete(src);
		if (dataUrl) freezeFrameCache.set(src, dataUrl);
		return dataUrl;
	});

	inFlight.set(src, promise);
	return promise;
}