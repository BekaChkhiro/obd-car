import { create } from 'zustand';

/** Tab shown when nothing else has been visited yet. */
const DEFAULT_TAB = '(home)';

interface TabHistoryState {
  /** Last tab the user was on other than the assistant. */
  lastNonAssistantTab: string;
  visit: (routeName: string) => void;
}

/**
 * Remembers where the user came from before opening the assistant.
 *
 * The assistant is a tab, not a pushed screen, so there is no stack entry to
 * pop — "back" has to mean "the tab I was looking at", and only the tab bar
 * sees those transitions. Without this the back control would have to guess a
 * destination, which is worse than not offering one.
 */
export const useTabHistory = create<TabHistoryState>((set) => ({
  lastNonAssistantTab: DEFAULT_TAB,
  visit: (routeName) =>
    set((state) =>
      routeName === 'ai' || routeName === state.lastNonAssistantTab
        ? state
        : { lastNonAssistantTab: routeName },
    ),
}));
