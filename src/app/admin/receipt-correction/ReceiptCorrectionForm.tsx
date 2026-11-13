'use client';
import { useState } from 'react';
export function ReceiptCorrectionForm() {
  const [donationId, setDonationId] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => setResult(null);
  async function submit(confirm: boolean) {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/receipt-content-corrections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ donationId, receiptUrl, confirm, expectedCorrectedSig: confirm ? result?.correctedSig : undefined }) });
      setResult(await response.json());
    } catch { setResult({ error: 'Request failed. Check the receipt before retrying.' }); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <label className="block">Donation ID<input className="block border p-2 w-full" value={donationId} onChange={e => { setDonationId(e.target.value); reset(); }} /></label>
    <label className="block">Actual emailed receipt URL<textarea className="block border p-2 w-full" rows={5} value={receiptUrl} onChange={e => { setReceiptUrl(e.target.value); reset(); }} /></label>
    <button className="border p-2" disabled={busy} onClick={() => submit(false)}>Preview only</button>
    {result && <pre className="whitespace-pre-wrap break-all border p-4">{JSON.stringify(result, null, 2)}</pre>}
    {result?.preview === true && <button className="border p-2" disabled={busy} onClick={() => submit(true)}>Confirm exact-link correction (no email)</button>}
  </div>;
}
