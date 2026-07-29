/** A set of 0-to-1 metrics as horizontal bars on a shared scale.
 *
 *  Tracking reported IDF1, HOTA, identity precision, identity recall and association accuracy as
 *  five numbers in a table. They are all fractions of the same unit, so the reader was doing the
 *  comparison in their head; on one scale the shape is immediate, and the gap that matters here
 *  (precision far above recall, or the reverse) is visible without arithmetic.
 *
 *  One series, so no legend: each bar is directly labelled with its name and its value. Bars are
 *  thin with a 4px rounded data-end anchored to the baseline, and the value text wears an ink
 *  token rather than the bar colour.
 */
export function MetricBars({
  rows, caption,
}: {
  rows: Array<{ label: string; value: number | null | undefined; hint?: string }>;
  caption?: string;
}) {
  const shown = rows.filter((r) => typeof r.value === 'number' && Number.isFinite(r.value));
  if (shown.length === 0) return null;

  return (
    <div className="fs-metricbars">
      {shown.map((row) => {
        const value = row.value as number;
        const pct = Math.max(0, Math.min(1, value)) * 100;
        return (
          <div className="fs-metricbar" key={row.label}>
            <span className="fs-metricbar-l" title={row.hint}>{row.label}</span>
            <div className="fs-metricbar-t" role="img" aria-label={`${row.label} ${value.toFixed(3)}`}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <span className="fs-metricbar-v">{value.toFixed(3)}</span>
          </div>
        );
      })}
      {caption && <p className="fs-hint small">{caption}</p>}
    </div>
  );
}
