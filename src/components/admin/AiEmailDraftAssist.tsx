'use client';

import { useState } from 'react';

type Tone = 'warm' | 'brief' | 'formal';

type Props = {
  subject: string;
  message: string;
  onApply: (draft: { subject: string; message: string }) => void;
  recipientHint?: string;
  audienceHint?: string;
};

export function AiEmailDraftAssist({
  subject,
  message,
  onApply,
  recipientHint,
  audienceHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState<Tone>('warm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function draft() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/email/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          tone,
          recipientHint,
          audienceHint,
          existingSubject: subject,
          existingMessage: message,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        subject?: string;
        message?: string;
      };
      if (!res.ok || !json.subject || !json.message) {
        setError(json.error || 'Could not draft email.');
        return;
      }
      onApply({ subject: json.subject, message: json.message });
      setOpen(false);
    } catch {
      setError('Could not draft email.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-soft/50 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy">Draft with AI</p>
          <p className="text-xs text-muted">
            Sketch the idea — review and edit before you send.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setError('');
          }}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-soft"
        >
          {open ? 'Close' : 'Open'}
        </button>
      </div>

      {open ? (
        <div className="space-y-2 pt-1 border-t border-line">
          <label className="block text-sm text-navy">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              What should this email say?
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Thank them for joining Chai, confirm $150/mo, remind about access code coming separately…"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm resize-y"
            />
          </label>
          <div className="flex flex-wrap gap-3 text-sm text-navy">
            {(
              [
                ['warm', 'Warm'],
                ['brief', 'Brief'],
                ['formal', 'Formal'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="ai-email-tone"
                  checked={tone === value}
                  onChange={() => setTone(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={busy || prompt.trim().length < 3}
            onClick={() => void draft()}
            className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Drafting…' : subject || message ? 'Rewrite draft' : 'Draft subject & message'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
