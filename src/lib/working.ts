import { writable } from 'svelte/store';

interface WorkingState {
  active: boolean;
  message: string;
}

function createWorking() {
  const { subscribe, set } = writable<WorkingState>({ active: false, message: '' });
  let timer: ReturnType<typeof setInterval> | null = null;

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    subscribe,
    start: (message = 'Working…') => {
      clearTimer();
      set({ active: true, message });
    },
    // Cycles through a sequence of step messages (e.g. "Uploading files…",
    // "Verifying post contents…", "Writing to database…") to make a
    // longer-running action feel alive. Stays on the final message until
    // done() is called — call done() once the real request resolves.
    steps: (messages: string[], intervalMs = 550) => {
      clearTimer();
      if (messages.length === 0) return;

      let i = 0;
      set({ active: true, message: messages[0] });

      if (messages.length > 1) {
        timer = setInterval(() => {
          i += 1;
          set({ active: true, message: messages[i] });
          if (i >= messages.length - 1) clearTimer();
        }, intervalMs);
      }
    },
    done: () => {
      clearTimer();
      set({ active: false, message: '' });
    },
  };
}

export const working = createWorking();
