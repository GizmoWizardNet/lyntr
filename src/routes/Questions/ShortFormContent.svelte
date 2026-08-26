<script lang="ts">
	import { run } from 'svelte/legacy';

	import type { Writable } from 'svelte/store';
	import { Label } from '@/components/ui/label';
	import { Slider } from '@/components/ui/slider';

	interface Props {
		isButtonDisabled: Writable<boolean>;
		submittedValue: Writable<string>;
	}

	let { isButtonDisabled, submittedValue }: Props = $props();

	$isButtonDisabled = true;

	let sliderValue = $state([0]);

	// Reactive statement to watch for changes in sliderValue
	$effect(() => {
		$submittedValue = sliderValue[0].toString();
		$isButtonDisabled = false;
	});
</script>

<span class="select-none">How much time do you spend watching Short form content everyday?</span>

<Label>{sliderValue[0]} hours</Label>
<Slider bind:value={sliderValue} max={12} step={1} />
