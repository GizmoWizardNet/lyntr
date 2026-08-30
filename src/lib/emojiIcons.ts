
export const EMOJI_ICONS: Record<string, string> = {
	'❤️': '/emojis/heart.png',
	'😂': '/emojis/laughing.png',
	'😮': '/emojis/wow.png',
	'😢': '/emojis/sad.png',
	'🔥': '/emojis/fire.png',
	'👍': '/emojis/thumbs_up.png',
	'👎': '/emojis/thumbs_down.png',
	'😡': '/emojis/angry.png',
	'🎉': '/emojis/confetti.png',
	'👀': '/emojis/eyes.png'
};

export function emojiIcon(emoji: string): string | null {
	return EMOJI_ICONS[emoji] ?? null;
}
