import "server-only";
import Stripe from "stripe";
import { serverEnv, isStripeConfigured } from "@/lib/config";

/**
 * Server-only Stripe client. Returns null when no secret key is configured,
 * so callers fall back to the simulated booking flow.
 *
 * `sk_test_…` → test mode (no real charges). `sk_live_…` → production.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!isStripeConfigured) return null;
  if (!cached) {
    cached = new Stripe(serverEnv.stripeSecretKey, {
      typescript: true,
    });
  }
  return cached;
}
