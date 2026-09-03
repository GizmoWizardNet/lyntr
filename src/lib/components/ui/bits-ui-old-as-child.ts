import type { Snippet } from "svelte";

export type MeltBuilder = {
	readonly role?: string;
	readonly "aria-haspopup"?: string;
	readonly "aria-expanded"?: string | boolean;
	readonly "data-state"?: string;
	readonly "aria-controls"?: string;
	readonly id?: string;
	readonly type?: string;
} & {
	[x: `data-melt-${string}`]: "";
} & {
	action: (node: HTMLElement) => unknown;
};

export function withAsChild<T extends abstract new (...args: any[]) => any>(
	component: T
): new (...args: any[]) => InstanceType<T> & {
	$$prop_def: InstanceType<T>["$$prop_def"] & {
		asChild?: boolean;
		children?: Snippet<[{ builder: MeltBuilder }]>;
	};
} {
	return component as any;
}
