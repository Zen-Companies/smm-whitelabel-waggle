/** "See as a table": every chart's numbers, for screen readers and anyone who wants them. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="text-[13px]">
      <summary className="text-honey-text w-fit cursor-pointer font-medium">See as a table</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`text-ink-3 border-line border-b py-1.5 font-medium ${i ? "text-right" : "text-left"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-subtle border-b last:border-0">
                {r.map((v, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="py-1.5 text-left font-normal">
                      {v}
                    </th>
                  ) : (
                    <td key={j} className="py-1.5 text-right">
                      {v}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
