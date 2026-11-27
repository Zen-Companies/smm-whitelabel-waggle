// Sign-in pieces shared by the brand (tenants) and organization features (docs/auth/AUDIT.md).
export { signInNext } from "./sign-in-next";
export { continueWithGoogle } from "./google-actions";
export { GoogleButton, OrDivider } from "./google-button";
export { AuthWall } from "./auth-wall";
export { AuthSplit } from "./auth-split";
export { InAppGoogleGate } from "./in-app-google-gate";
export { breakerApp, detectInApp, deviceOf, inAppName, isInAppBrowser } from "./in-app-browser";
export type { BreakerApp, Device, InAppHit, NamedApp } from "./in-app-browser";
// Leaving an in-app browser (27 Nov): sign-up, sign-in, setup's Connect and Settings → Accounts.
export {
  blockedPlatforms,
  chromeIntentUrl,
  leaveSteps,
  plainPageUrl,
  switchDetails,
} from "./in-app-switch";
export type { DrawnStep, InAppWhere, LeaveSteps } from "./in-app-switch";
export { InAppCard } from "./in-app-card";
export { InAppGuard } from "./in-app-guard";
export type { RecordInAppSwitch } from "./in-app-guard";
export { OkLine, PROGRESS_SAVED, StepPhone, StepRow } from "./step-drawings";
