/**
 * A category as a word, not a chip (docs/design.md §4): Lead in honey text, Complaint in danger.
 * Questions and unclear messages carry no label; spam lives in Ignored.
 */
export function CategoryLabel({ category }: { category: string | null }) {
  if (category === "lead") return <span className="status-lead">Lead</span>;
  if (category === "complaint") return <span className="status-complaint">Complaint</span>;
  return null;
}
