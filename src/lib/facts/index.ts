export { factSpans, factTokens, factUsed } from "./spans";
export type { FactSpan, FactText, FactToken, FactTokenKind } from "./spans";
export {
  loadUncheckedFacts,
  markFactChecked,
  markUsedFactsChecked,
  uncheckedFactIds,
} from "./unchecked";
export type { FoundKind, FoundSource, UncheckedFact } from "./unchecked";
