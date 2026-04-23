import { createContext, useContext, type ReactNode } from "react";

/**
 * Lifts the onboarding flag + setter out of `ThemedApp` so the
 * `RootNavigator` can pick the right initial route (Onboarding vs. Main)
 * and so child screens (Onboarding, Auth) can flip the flag when the user
 * either opts for local-only or finishes sign-in.
 *
 * `onboardingDone` is `null` while the SQLite flag is still being read —
 * consumers should render nothing / a splash in that window to avoid a
 * flash of the wrong screen.
 */
export type OnboardingContextValue = {
  onboardingDone: boolean | null;
  markOnboardingDone: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  value,
  children,
}: {
  value: OnboardingContextValue;
  children: ReactNode;
}) {
  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const v = useContext(OnboardingContext);
  if (!v) throw new Error("useOnboarding requires OnboardingProvider");
  return v;
}
