<script lang="ts">
	import { Input } from '@/components/ui/input';
	import type { Writable } from 'svelte/store';

	interface Props {
		isButtonDisabled: Writable<boolean>;
		submittedValue: Writable<string>;
	}

	let { isButtonDisabled, submittedValue }: Props = $props();

	$isButtonDisabled = true;
</script>

<span class="select-none">What's the full meaning of AGI?</span>
<Input
	on:input={() => ($isButtonDisabled = false)}
	bind:value={$submittedValue}
	placeholder="Your answer..."
	class="border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
></Input>
