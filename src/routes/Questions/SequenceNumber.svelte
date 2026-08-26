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

<span class="select-none">What is the next number in this sequence?</span>
<span class="select-none text-4xl">2, 6, 12, 20, 30</span>

<Input
	type="number"
	placeholder="Your guess..."
	bind:value={$submittedValue}
	on:change={() => ($isButtonDisabled = false)}
/>
