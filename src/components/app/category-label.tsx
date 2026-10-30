/**
 * Category as status text in a card header (docs/design.md §4), not chips: HOT LEAD (honey-light),
 * COMPLAINT (alert), plain QUESTION / UNCLEAR (pollen). Spam goes to Ignored.
 */
export function CategoryLabel({ category }: { category: string | null }) {
  if (category === "lead") return <span className="status-lead">Hot lead</span>;
  if (category === "complaint") return <span className="status-complaint">Complaint</span>;
  if (category === "faq") return <span className="status-plain">Question</span>;
  if (category === "unclear") return <span className="status-plain">Unclear</span>;
  if (category === "spam") return <span className="status-plain">Spam</span>;
  return null;
}
