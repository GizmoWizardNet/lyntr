
export const EMOJI_ICONS: Record<string, string> = {
	'❤️': '/emojis/heart.webp',
	'😂': '/emojis/laughing.webp',
	'😮': '/emojis/wow.webp',
	'😢': '/emojis/sad.webp',
	'🔥': '/emojis/fire.webp',
	'👍': '/emojis/thumbs_up.webp',
	'👎': '/emojis/thumbs_down.webp',
	'😡': '/emojis/angry.webp',
	'🎉': '/emojis/confetti.webp',
	'👀': '/emojis/eyes.webp'
};

export function emojiIcon(emoji: string): string | null {
	return EMOJI_ICONS[emoji] ?? null;
}
