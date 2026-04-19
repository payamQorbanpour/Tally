import { useCallback, useEffect, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/** Max time the pull-to-refresh indicator stays visible; work continues in background. */
export const REFRESH_UI_MAX_MS = 800;

type Options = {
  /** When refresh UI ends early (timeout or user scrolled), snap scroll to top. */
  scrollToTop?: () => void;
};

/**
 * Pull-to-refresh: hide the spinner after {@link REFRESH_UI_MAX_MS} or when the user
 * scrolls the list (e.g. swipe up to read content), while the refresh promise keeps running.
 */
export function useRefreshWithBackgroundSync(
  runRefresh: () => Promise<void>,
  options?: Options,
) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToTopRef = useRef(options?.scrollToTop);
  scrollToTopRef.current = options?.scrollToTop;

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  const clearRefreshTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const endRefreshUI = useCallback(
    (scrollTop: boolean) => {
      clearRefreshTimer();
      setRefreshing(false);
      if (scrollTop) scrollToTopRef.current?.();
    },
    [clearRefreshTimer],
  );

  const onRefresh = useCallback(() => {
    clearRefreshTimer();
    setRefreshing(true);
    const p = runRefresh();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setRefreshing(false);
    }, REFRESH_UI_MAX_MS);
    p.finally(() => {
      clearRefreshTimer();
      setRefreshing(false);
    });
  }, [runRefresh, clearRefreshTimer]);

  const onScrollWhileRefreshing = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!refreshingRef.current) return;
      const y = e.nativeEvent.contentOffset.y;
      if (y > 12) {
        endRefreshUI(true);
      }
    },
    [endRefreshUI],
  );

  return { refreshing, onRefresh, onScrollWhileRefreshing };
}
