import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Web build of `admobProvider.ts`. Metro/webpack pick this file automatically
 * for the web target via the `.web.ts` platform extension, so the real
 * `admobProvider.ts` — and therefore `react-native-google-mobile-ads` itself —
 * is never part of the web bundle's module graph at all.
 *
 * `react-native-google-mobile-ads` cannot be required here even inside a
 * try/catch: Metro resolves `require`/`import` statements statically to build
 * its dependency graph, independent of whether the call is runtime-guarded,
 * and one of the package's own modules imports RN's `codegenNativeComponent`,
 * which the web bundler hard-rejects. Only a *file-level* platform split
 * avoids the resolution attempt entirely.
 */

export function getAdmobRewardedUnitId(): null {
  return null;
}

export const admobProvider: RewardedAdProvider = noopProvider;

export function getConfiguredRewardedAdProvider(): RewardedAdProvider {
  return noopProvider;
}
