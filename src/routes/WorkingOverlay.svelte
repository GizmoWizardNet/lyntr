<script lang="ts">
  import { working } from '$lib/working';
  import { fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
</script>

{#if $working.active}
  <div
    class="working-overlay"
    transition:fly={{ y: 24, duration: 220, easing: quintOut }}
    aria-live="polite"
    aria-atomic="true"
    role="status"
  >
    <!-- Spinner ring -->
    <svg class="spinner" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.2"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
    <span>{$working.message}</span>
  </div>
{/if}

<style>
  .working-overlay {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;

    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px 10px 14px;

    /* Glossy pill — design system */
    background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
    color: hsl(var(--primary-foreground));
    border: 1px solid hsl(var(--primary-dim));
    border-radius: 999px;
    box-shadow:
      inset 0 1px 0 rgba(255, 240, 210, 0.45),
      0 12px 32px -4px rgba(60, 30, 0, 0.32);

    font-family: 'Work Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    pointer-events: none;
    white-space: nowrap;
  }

  .spinner {
    width: 18px;
    height: 18px;
    color: hsl(var(--primary-foreground));
    animation: spin 0.75s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
