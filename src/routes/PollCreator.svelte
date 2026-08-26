<script lang="ts">
	import { Plus, Trash2, BarChart2, X } from 'lucide-svelte';

	interface PollData {
		title: string;
		multi_select: boolean;
		resolve_at: string | null;
		options: string[];
	}

	interface Props {
		poll: PollData | null;
		onchange: (poll: PollData | null) => void;
	}

	let { poll, onchange }: Props = $props();

	let enabled = $state(poll !== null);

	function defaultPoll(): PollData {
		return { title: '', multi_select: false, resolve_at: null, options: ['', ''] };
	}

	let local = $state<PollData>(poll ?? defaultPoll());

	function toggle() {
		enabled = !enabled;
		onchange(enabled ? local : null);
	}

	function update() {
		if (enabled) onchange({ ...local });
	}

	function addOption() {
		if (local.options.length >= 10) return;
		local.options = [...local.options, ''];
		update();
	}

	function removeOption(i: number) {
		if (local.options.length <= 2) return;
		local.options = local.options.filter((_, idx) => idx !== i);
		update();
	}

	// min datetime-local string = now + 5 min
	function minDatetime() {
		const d = new Date(Date.now() + 5 * 60 * 1000);
		return d.toISOString().slice(0, 16);
	}
</script>

<div class="poll-creator">
	<button
		type="button"
		class="poll-toggle"
		class:active={enabled}
		onclick={toggle}
		title={enabled ? 'Remove poll' : 'Add poll'}
	>
		<BarChart2 size={16} />
		<span>{enabled ? 'Remove poll' : 'Add poll'}</span>
	</button>

	{#if enabled}
		<div class="poll-body">
			<div class="poll-body-head">
				<BarChart2 size={12} />
				<span>New poll</span>
			</div>

			<!-- Title -->
			<input
				class="poll-title"
				type="text"
				placeholder="Poll question…"
				maxlength="140"
				bind:value={local.title}
				oninput={update}
			/>

			<!-- Options -->
			<div class="poll-options">
				{#each local.options as _, i}
					<div class="option-row">
						<span class="option-index">{i + 1}</span>
						<input
							class="option-input"
							type="text"
							placeholder="Option {i + 1}"
							maxlength="100"
							bind:value={local.options[i]}
							oninput={update}
						/>
						{#if local.options.length > 2}
							<button type="button" class="remove-btn" onclick={() => removeOption(i)} title="Remove option">
								<Trash2 size={13} />
							</button>
						{/if}
					</div>
				{/each}

				{#if local.options.length < 10}
					<button type="button" class="add-option-btn" onclick={addOption}>
						<Plus size={13} /> Add option
					</button>
				{/if}
			</div>

			<!-- Footer row: multi-select + resolve date -->
			<div class="poll-footer">
				<label class="multi-label">
					<input type="checkbox" bind:checked={local.multi_select} onchange={update} />
					Allow multiple choices
				</label>

				<div class="resolve-wrap">
					<label class="resolve-label" for="resolve-at">End date</label>
					<input
						id="resolve-at"
						class="resolve-input"
						type="datetime-local"
						min={minDatetime()}
						value={local.resolve_at ? local.resolve_at.slice(0, 16) : ''}
						oninput={(e) => {
							local.resolve_at = (e.target as HTMLInputElement).value
								? new Date((e.target as HTMLInputElement).value).toISOString()
								: null;
							update();
						}}
					/>
					{#if local.resolve_at}
						<button type="button" class="clear-date" onclick={() => { local.resolve_at = null; update(); }} title="Clear end date">
							<X size={12} />
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.poll-creator {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-family: var(--font-retro);
	}

	.poll-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		padding: 5px 12px;
		border-radius: 5px;
		background: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
		transition: transform 0.05s ease, box-shadow 0.05s ease, background 0.12s ease;
	}
	.poll-toggle:hover {
		background: hsl(var(--accent));
	}
	.poll-toggle:active {
		transform: translate(1px, 1px);
		box-shadow: none;
	}
	.poll-toggle.active {
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		color: hsl(var(--primary-foreground));
	}

	.poll-body {
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding: 12px;
		border-radius: calc(var(--radius) + 4px);
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
	}

	.poll-body-head {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}

	.poll-title {
		width: 100%;
		background: hsl(var(--muted));
		border-radius: 5px;
		padding: 7px 10px;
		font-size: 14px;
		font-weight: 700;
		color: hsl(var(--foreground));
		outline: none;
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
	}
	.poll-title::placeholder {
		color: hsl(var(--muted-foreground));
		font-weight: 400;
	}
	.poll-title:focus {
		outline: 1.5px solid hsl(var(--ring));
		outline-offset: 1px;
	}

	.poll-options {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.option-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.option-index {
		flex-shrink: 0;
		width: 16px;
		text-align: center;
		font-size: 10px;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
	}

	.option-input {
		flex: 1;
		background: hsl(var(--muted));
		border-radius: 5px;
		padding: 6px 10px;
		font-size: 13px;
		color: hsl(var(--foreground));
		outline: none;
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
	}
	.option-input:focus {
		outline: 1.5px solid hsl(var(--ring));
		outline-offset: 1px;
	}

	.remove-btn {
		flex-shrink: 0;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 5px;
		border-radius: 5px;
	}
	.remove-btn:hover {
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.1);
	}

	.add-option-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		align-self: flex-start;
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--primary));
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 4px 2px;
	}
	.add-option-btn:hover {
		opacity: 0.75;
	}

	.poll-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px dashed hsl(var(--border));
	}

	.multi-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		user-select: none;
	}

	.resolve-wrap {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.resolve-label {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	.resolve-input {
		font-size: 12px;
		background: hsl(var(--muted));
		border-radius: 5px;
		padding: 4px 8px;
		color: hsl(var(--foreground));
		outline: none;
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
	}
	.resolve-input:focus {
		outline: 1.5px solid hsl(var(--ring));
		outline-offset: 1px;
	}

	.clear-date {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 3px;
		border-radius: 4px;
	}
	.clear-date:hover {
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.1);
	}
</style>
