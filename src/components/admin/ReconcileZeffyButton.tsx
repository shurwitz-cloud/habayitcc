'use client';

/** Zeffy automatic import is off — add Zeffy Chai Partners via Manual Zeffy entry in CRM. */
export function ReconcileZeffyButton() {
  return (
    <div className="mb-6 rounded-lg border border-[#d4cfc4] bg-[#faf8f4] p-4">
      <p className="text-sm text-[#172643]">
        <strong>Zeffy automatic import</strong> is turned off. Chai Partner checkout still sends
        donors to Zeffy; use <strong>Manual entry</strong> below after each gift.
      </p>
    </div>
  );
}
