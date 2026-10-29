/**
 * Category labels (docs/design.md §3): lead = coral-soft chip with a coral dot, complaint =
 * amber dot + amber text, FAQ / unclear = plain gray text. Spam is hidden by default.
 */
export function CategoryLabel({ category }: { category: string | null }) {
  if (category === "lead") return <span className="chip-lead">Lead</span>;
  if (category === "complaint") return <span className="label-complaint">Complaint</span>;
  if (category === "faq") return <span className="label-plain">Question</span>;
  if (category === "unclear") return <span className="label-plain">Unclear</span>;
  if (category === "spam") return <span className="label-plain">Spam</span>;
  return null;
}
