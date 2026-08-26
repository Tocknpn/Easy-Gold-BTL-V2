// ── Reusable "back arrow" button for drill-down views ────────────────────
// Drop this at the top of any second-level view to return to its parent list.
export default function BackButton({ label = 'Back', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button
      className="btn btn-ghost"
      onClick={onClick}
      style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
      title="Go back"
    >
      <i className="fa-solid fa-arrow-left"></i> {label}
    </button>
  );
}