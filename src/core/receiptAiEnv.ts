/**
 * AI feature gate. Pre-migration this checked for bundled provider keys
 * (Groq / OpenAI / ElevenLabs); now those keys live behind the `ai-proxy`
 * Edge Function, so the only client-side requirement is that Supabase sync
 * is configured. The user-must-be-signed-in part is enforced separately by
 * `signInGate` in {@link ../screens/AiReceiptScreen.tsx}, since the proxy
 * rejects anonymous calls.
 */
import { isAiProxyAvailable } from "./aiProxy";

export function hasAnyAiBackend(): boolean {
  return isAiProxyAvailable();
}
