// Setup, Walter's flow (approved 20 Nov): 1 Connect (/welcome) · 2 See what you missed · 3 Check
// Waggle's answers (/setup, one screen at a time).
export { SetupView } from "./setup-view";
export { ReadyLine } from "./ready-line";
export { WelcomeConnect } from "./welcome-connect";
export { SetupStepper } from "./setup-frame";
export { connectProblem, isInAppBrowser } from "./first-connect";
export { deviceOf } from "./connect-help";
export { setupEntry } from "./flow";
export { loadSetupConnected, loadSetupStrip } from "./setup-data";
export { buildBusinessProfiles, buildProfileAfterConnect } from "./profile-run";
