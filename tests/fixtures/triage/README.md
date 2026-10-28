# Triage labeled set

Messages for `pnpm triage:report` (docs/tasks.md T7). They're written for the demo business in
`business.json` (Harbour Bean Café, the same shop as the T9 demo knowledge base).

**Status: starter set, drafted for review.** The labels follow docs/tdd.md §9.3 (precedence
`complaint > lead > faq > spam`; `unclear` when nothing applies; under 4 words is never spam).
Please correct labels you disagree with; the report is only as good as these.

| File             | Expected    | Messages                                                       |
| ---------------- | ----------- | -------------------------------------------------------------- |
| `faq.json`       | faq         | 30 (18 English, 12 Taglish)                                    |
| `lead.json`      | lead        | 30 (18 English, 12 Taglish)                                    |
| `complaint.json` | complaint   | 30 (16 English, 14 Taglish)                                    |
| `spam.json`      | spam        | 30 (16 English, 14 Taglish)                                    |
| `unclear.json`   | unclear     | 30 (15 English, 15 Taglish)                                    |
| `ambiguous.json` | per message | 25 overlapping cases, each with a `note` on why its label wins |

Format: `{ "id", "text", "kind": "comment" | "dm", "lang": "en" | "taglish" }`, plus
`"expected"`, `"ambiguous": true` and `"note"` in `ambiguous.json`. Ids must be unique;
`tests/triage-fixtures.test.ts` checks the set's shape.

All names, numbers and links are made up.
