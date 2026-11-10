/**
 * Clarity Consent API v2 mapping and withdrawal sequence.
 * Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2
 */

export type ClarityConsentStorage = "granted" | "denied";

export type ClarityConsentV2Payload = {
  ad_Storage: ClarityConsentStorage;
  analytics_Storage: ClarityConsentStorage;
};

export type ClarityConsentPreference = {
  analytics: boolean;
  advertising: boolean;
};

/** Map site analytics/advertising flags to Clarity consentv2 payload. */
export function mapClarityConsentV2(
  preference: ClarityConsentPreference
): ClarityConsentV2Payload {
  if (!preference.analytics) {
    return { ad_Storage: "denied", analytics_Storage: "denied" };
  }
  return {
    ad_Storage: preference.advertising ? "granted" : "denied",
    analytics_Storage: "granted",
  };
}

export type ClarityWindowApi = {
  (command: "consentv2", payload: ClarityConsentV2Payload): void;
  /** Deprecated consent API — required by current docs only for cookie erasure. */
  (command: "consent", granted: boolean): void;
  (command: string, ...args: unknown[]): void;
  q?: unknown[];
};

/**
 * Ordered withdrawal calls when analytics consent is revoked after Clarity loaded:
 * 1) consentv2 both denied
 * 2) consent false (documented cookie erase)
 */
export function clarityWithdrawalCallPlan(): Array<
  | { fn: "consentv2"; args: [ClarityConsentV2Payload] }
  | { fn: "consent"; args: [false] }
> {
  return [
    {
      fn: "consentv2",
      args: [{ ad_Storage: "denied", analytics_Storage: "denied" }],
    },
    { fn: "consent", args: [false] },
  ];
}

export function applyClarityConsentV2(
  clarity: ClarityWindowApi | undefined,
  preference: ClarityConsentPreference
): ClarityConsentV2Payload | null {
  if (typeof clarity !== "function") return null;
  const payload = mapClarityConsentV2(preference);
  clarity("consentv2", payload);
  return payload;
}

export function applyClarityAnalyticsWithdrawal(
  clarity: ClarityWindowApi | undefined
): boolean {
  if (typeof clarity !== "function") return false;
  for (const step of clarityWithdrawalCallPlan()) {
    if (step.fn === "consentv2") {
      clarity("consentv2", step.args[0]);
    } else {
      clarity("consent", step.args[0]);
    }
  }
  return true;
}

export type ClarityRevocationHost = {
  clarity?: ClarityWindowApi;
  /** Schedule a deferred callback (defaults to setTimeout). */
  schedule?: (fn: () => void, ms: number) => unknown;
  /** Full document reload (defaults to location.reload). */
  reload?: () => void;
};

/**
 * C1: On analytics withdrawal after Clarity was injected in this document —
 * signal denied + erase cookies, then defer exactly one full reload so
 * TrackingConsent's Google cookie cleanup can finish on the same stack.
 * If the script was never injected, only the consent calls are skipped/no-op
 * for reload (no reload scheduled).
 */
export function revokeClarityAnalyticsStoppingRecording(
  host: ClarityRevocationHost,
  opts: { scriptInjected: boolean }
): { withdrew: boolean; scheduledReload: boolean } {
  const withdrew = applyClarityAnalyticsWithdrawal(host.clarity);
  if (!opts.scriptInjected) {
    return { withdrew, scheduledReload: false };
  }
  const schedule =
    typeof host.schedule === "function"
      ? host.schedule
      : (fn: () => void, ms: number) => setTimeout(fn, ms);
  const reload =
    typeof host.reload === "function"
      ? host.reload
      : () => {
          if (typeof window !== "undefined") window.location.reload();
        };
  schedule(() => reload(), 0);
  return { withdrew, scheduledReload: true };
}
