// Uses @tensorflow/tfjs (pure JS) instead of @tensorflow/tfjs-node.
// This removes the native x86 C++ binding requirement and works on ARM,
// any Node version, and any architecture.
//
// Migration:
//   bun remove @tensorflow/tfjs-node
//   bun add @tensorflow/tfjs @tensorflow/tfjs-backend-cpu
//   (optionally: bun add @tensorflow/tfjs-backend-webgl  — not usable in Node)
//
// The pure JS backend is slower than the native one for large batches,
// but for single-image NSFW classification on a server it's perfectly fine.

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import * as nsfw from 'nsfwjs';
import { json } from '@sveltejs/kit';
import { config } from 'dotenv';
import sharp from 'sharp';

config({ path: '.env' });

const BAD_PREDICTION_TYPES = ['Hentai', 'Porn'];
const PREDICTION_THRESHOLD = 0.7;

export const NSFW_ERROR = json(
	{
		error:
			'It seems like you just uploaded an NSFW image. We do not allow this type of content. If you believe this is a mistake, please contact us.'
	},
	{ status: 400 }
);

// Set CPU backend explicitly — no native bindings needed
await tf.setBackend('cpu');
await tf.ready();
tf.enableProdMode();

// Load NSFWJS model once at startup
const model = await nsfw.load();
console.log('NSFWJS model loaded (CPU backend, architecture-agnostic)');

export async function isImageNsfw(image: Buffer): Promise<boolean> {
	try {
		// tfjs-node had tf.node.decodeImage — the pure JS backend doesn't.
		// We use Sharp to decode the image to raw RGB pixels instead,
		// then create a tensor manually.
		const { data, info } = await sharp(image)
			.resize(224, 224, { fit: 'cover' })  // NSFWJS expects 224×224
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		// Shape: [height, width, channels]
		const tensor = tf.tensor3d(
			new Uint8Array(data.buffer),
			[info.height, info.width, info.channels as 3],
			'int32'
		);

		const predictions = await model.classify(tensor as tf.Tensor3D);
		tensor.dispose(); // free GPU/CPU memory

		for (const prediction of predictions) {
			if (
				prediction.probability > PREDICTION_THRESHOLD &&
				BAD_PREDICTION_TYPES.includes(prediction.className)
			) {
				return true;
			}
		}

		return false;
	} catch (err) {
		console.error('NSFW check error:', err);
		// Fail open — don't block the post if the check itself errors
		return false;
	}
}

export type ModerationVerdict = { allowed: true } | { allowed: false; reason: string };

const MODERATION_SYSTEM_PROMPT = `You moderate posts for Lyntr, a casual social network.
Decide whether the post may be published.
ALLOW:
- Casual profanity and swearing
- Jokes containing profanity
- Criticism and disagreement
- Mild insults that are not targeted harassment
- Discussions of sensitive topics in non-harmful contexts
BLOCK:
- Credible threats of violence
- Severe targeted harassment
- Hate targeting protected groups
- Sexual exploitation or sexual content involving minors
- Instructions encouraging serious self-harm
- Clearly malicious or dangerous content prohibited by the platform
IMPORTANT:
Profanity alone is NEVER a reason to block a post.
Judge the meaning and context, not individual words.
Return ONLY valid JSON:
{"allowed":true}
or
{"allowed":false,"reason":"short user-facing reason"}
Examples:
"this is fucking awesome" -> ALLOW
"what the fuck happened to the server lmao" -> ALLOW
"you're an idiot" -> ALLOW
"I disagree, this idea is shit" -> ALLOW`;

// NOTE: nvidia/nemotron-3.5-content-safety is a fixed-format safety
// classifier, not an instruction-following chat model — it ignores custom
// system prompts entirely and replies with its own format (e.g. "User
// Safety: safe"), which both breaks JSON parsing and means it can't honor
// the nuanced ALLOW/BLOCK rules below. Use a general instruct model instead
// so the prompt is actually followed.
const MODERATION_MODEL = 'google/gemma-4-26b-a4b-it:free';

// Checks post content against Lyntr's content policy via OpenRouter, BEFORE
// the post is written to the DB. Fails open (allows the post) if the
// moderation call itself errors out — we never want an outage in a third
// party API to silently block every post on the platform.
export async function moderateContent(content: string): Promise<ModerationVerdict> {
	if (process.env.MODERATION === 'false') return { allowed: true };
	if (!content || !content.trim()) return { allowed: true };

	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('OPENROUTER_API_KEY is not set — skipping content moderation.');
		return { allowed: true };
	}

	try {
		const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: MODERATION_MODEL,
				temperature: 0,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: MODERATION_SYSTEM_PROMPT },
					{ role: 'user', content }
				]
			})
		});

		if (!res.ok) {
			console.error('Moderation request failed:', res.status, await res.text().catch(() => ''));
			return { allowed: true };
		}

		const data = await res.json();
		const raw: string = data?.choices?.[0]?.message?.content ?? '';

		// Strip code fences, then grab the first {...} block in case the model
		// added any preamble/trailing text around the JSON despite instructions.
		const cleaned = raw.replace(/```json|```/g, '').trim();
		const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

		if (!jsonMatch) {
			console.error('Moderation response was not JSON, failing open:', raw);
			return { allowed: true };
		}

		const parsed = JSON.parse(jsonMatch[0]);

		if (parsed?.allowed === false) {
			return {
				allowed: false,
				reason: typeof parsed.reason === 'string' && parsed.reason ? parsed.reason : 'This post violates our content guidelines.'
			};
		}

		return { allowed: true };
	} catch (err) {
		console.error('Moderation check error:', err);
		// Fail open — don't block posting if the moderation service/JSON parse breaks.
		return { allowed: true };
	}
}
