import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import * as nsfw from 'nsfwjs';
import { json } from '@sveltejs/kit';
import { config } from 'dotenv';
import sharp from 'sharp';

config({ path: '.env' });

const BAD_PREDICTION_TYPES = ['Hentai', 'Porn', 'Erotic', 'Sexual'];
const PREDICTION_THRESHOLD = 0.7;

export const NSFW_ERROR = json(
	{
		error:
			'It seems like you just uploaded an NSFW image. We do not allow this type of content. If you believe this is a mistake, please contact us. Most probably we wont help you.'
	},
	{ status: 400 }
);

let modelPromise: ReturnType<typeof nsfw.load> | null = null;

async function getModel() {
	if (!modelPromise) {
		modelPromise = (async () => {
			await tf.setBackend('cpu');
			await tf.ready();
			tf.enableProdMode();
			const loaded = await nsfw.load();
			console.log('NSFWJS model loaded (CPU backend, architecture-agnostic)');
			return loaded;
		})();
	}
	return modelPromise;
}

export async function isImageNsfw(image: Buffer): Promise<boolean> {
	try {
		const { data, info } = await sharp(image)
			.resize(224, 224, { fit: 'cover' })
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		// Shape: [height, width, channels]
		const tensor = tf.tensor3d(
			new Uint8Array(data.buffer),
			[info.height, info.width, info.channels as 3],
			'int32'
		);

		const model = await getModel();
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

export type ModerationVerdict =
	| { allowed: true; notices?: string[] }
	| { allowed: false; reason: string; notices?: string[] };

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

const MODERATION_MODELS = ['google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'inclusionai/ling-3.0-flash-vl:free', 'nvidia/nemotron-3.5-lightning:free', 'deepseek/deepseek-v4-flash-0731:free'];

const HOP_NOTICE = 'Please wait - the server is now going to hack OpenRouter';
const ALL_FAILED_MESSAGE = 'Moderation Failure - blame OpenRouter';

function isRetryableStatus(status: number): boolean {
	return status === 429 || (status >= 500 && status <= 599);
}

async function callModerationModel(
	model: string,
	apiKey: string,
	content: string
): Promise<
	| { kind: 'verdict'; parsed: { allowed: boolean; reason?: string } }
	| { kind: 'fail-open' }
	| { kind: 'retryable' }
> {
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			temperature: 0,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: MODERATION_SYSTEM_PROMPT },
				{ role: 'user', content }
			]
		})
	});

	if (!res.ok) {
		const bodyText = await res.text().catch(() => '');
		console.error(`Moderation request failed on ${model}:`, res.status, bodyText);
		if (isRetryableStatus(res.status)) return { kind: 'retryable' };
		// Non-retryable HTTP error (e.g. 400/401/403) — fail open rather than hop,
		// same as the previous behavior.
		return { kind: 'fail-open' };
	}

	const data = await res.json();
	const raw: string = data?.choices?.[0]?.message?.content ?? '';

	const cleaned = raw.replace(/```json|```/g, '').trim();
	const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

	if (!jsonMatch) {
		console.error(`Moderation response from ${model} was not JSON, failing open:`, raw);
		return { kind: 'fail-open' };
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]);
		return { kind: 'verdict', parsed };
	} catch (err) {
		console.error(`Moderation response from ${model} failed to parse, failing open:`, err);
		return { kind: 'fail-open' };
	}
}

export async function moderateContent(content: string): Promise<ModerationVerdict> {
	if (process.env.MODERATION === 'false') return { allowed: true };
	if (!content || !content.trim()) return { allowed: true };

	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('OPENROUTER_API_KEY is not set — skipping content moderation.');
		return { allowed: true };
	}

	const notices: string[] = [];

	for (let i = 0; i < MODERATION_MODELS.length; i++) {
		const model = MODERATION_MODELS[i];

		try {
			const result = await callModerationModel(model, apiKey, content);

			if (result.kind === 'retryable') {
				const isLastModel = i === MODERATION_MODELS.length - 1;
				if (!isLastModel) {
					notices.push(HOP_NOTICE);
					continue; // hop to the next model in the chain
				}
				// Every model in the chain failed with a retryable error.
				return { allowed: false, reason: ALL_FAILED_MESSAGE, notices };
			}

			if (result.kind === 'fail-open') {
				return { allowed: true, notices: notices.length ? notices : undefined };
			}

			// Got an actual verdict from the model — this is final, no hopping.
			const parsed = result.parsed;
			if (parsed?.allowed === false) {
				return {
					allowed: false,
					reason:
						typeof parsed.reason === 'string' && parsed.reason
							? parsed.reason
							: 'This post violates our content guidelines.',
					notices: notices.length ? notices : undefined
				};
			}

			return { allowed: true, notices: notices.length ? notices : undefined };
		} catch (err) {
			// Network-level failure (timeout, DNS, connection reset, etc.) — treat
			// like a retryable provider error and hop.
			console.error(`Moderation check error on ${model}:`, err);
			const isLastModel = i === MODERATION_MODELS.length - 1;
			if (!isLastModel) {
				notices.push(HOP_NOTICE);
				continue;
			}
			return { allowed: false, reason: ALL_FAILED_MESSAGE, notices };
		}
	}

	// Should be unreachable, but fail open just in case.
	return { allowed: true, notices: notices.length ? notices : undefined };
}