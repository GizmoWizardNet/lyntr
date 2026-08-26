<script lang="ts">
	import type { Writable } from 'svelte/store';
	import { Input } from '@/components/ui/input';

	interface Props {
		isButtonDisabled: Writable<boolean>;
		submittedValue: Writable<string>;
	}

	let { isButtonDisabled, submittedValue }: Props = $props();

	$isButtonDisabled = true;
</script>

<span class="select-none text-wrap"
	>If you buy 3 apples for $2 each and 2 oranges for $1.50 each, how much do you spend in total?</span
>

<Input
	type="number"
	placeholder="Your guess..."
	bind:value={$submittedValue}
	on:change={() => ($isButtonDisabled = false)}
/>
