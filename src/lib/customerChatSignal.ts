// Tiny shared signal so the global admin ChatWidget can hide itself while the
// per-customer AI chat is on screen (the customer page should show only the blue
// "Ask AI about <customer>" assistant, not both bubbles).
//
// Reference-counted (a customer page mounts exactly one CustomerAIChat) and
// subscribable so ChatWidget re-renders when it changes. Reading isActive() on
// mount also covers the case where the customer chat mounted first.
let count = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export const customerChatSignal = {
  enter() {
    count += 1;
    notify();
  },
  leave() {
    count = Math.max(0, count - 1);
    notify();
  },
  isActive() {
    return count > 0;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
