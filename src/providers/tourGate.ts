import { configBool, type RemoteConfig } from "../core/remoteConfig";

/**
 * Whether the remote `onboarding_tour_enabled` flag allows the first-run
 * feature tour to auto-start. Kept in its own module (rather than inlined
 * in TourContext.tsx, which imports DatabaseContext) so this gate is
 * unit-testable under plain Node.
 */
export function isOnboardingTourRemotelyEnabled(config: RemoteConfig): boolean {
  return configBool(config, "onboarding_tour_enabled", true);
}
