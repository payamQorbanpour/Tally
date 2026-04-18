import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Value = { epoch: number; bump: () => void };

const GroupsListSyncContext = createContext<Value | null>(null);

export function GroupsListSyncProvider({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const bump = useCallback(() => setEpoch((n) => n + 1), []);
  const value = useMemo(() => ({ epoch, bump }), [epoch, bump]);
  return (
    <GroupsListSyncContext.Provider value={value}>
      {children}
    </GroupsListSyncContext.Provider>
  );
}

export function useGroupsListEpoch(): number {
  const v = useContext(GroupsListSyncContext);
  if (!v) {
    throw new Error("useGroupsListEpoch must be used within GroupsListSyncProvider");
  }
  return v.epoch;
}

/** Safe to use outside the provider; becomes a no-op. */
export function useBumpGroupsList(): () => void {
  const v = useContext(GroupsListSyncContext);
  if (!v) {
    return () => {};
  }
  return v.bump;
}
