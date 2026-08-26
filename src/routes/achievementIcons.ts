// Maps the string icon names in the (isomorphic, server-safe) achievement
// catalog (src/lib/achievements.ts) to actual hugeicons components. Kept
// as an explicit lookup, not a dynamic/wildcard import, so bundlers can
// tree-shake to just the icons actually used here instead of pulling in
// the entire hugeicons set.
import {
	Rocket01Icon,
	MessageMultiple01Icon,
	FlameIcon,
	FlameKindlingIcon,
	UserGroup02Icon,
	Crown02Icon,
	Idea01Icon,
	Award01Icon,
	MedalFirstPlaceIcon,
	SparklesIcon
} from '@hugeicons/core-free-icons';

export const ACHIEVEMENT_ICONS: Record<string, typeof Rocket01Icon> = {
	Rocket01Icon,
	MessageMultiple01Icon,
	FlameIcon,
	FlameKindlingIcon,
	UserGroup02Icon,
	Crown02Icon,
	Idea01Icon,
	Award01Icon,
	MedalFirstPlaceIcon,
	SparklesIcon
};
