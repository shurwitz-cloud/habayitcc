'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SQL_EDITOR =
  'https://supabase.com/dashboard/project/vrhgcxlpaocmmdnibehe/sql/new';

const FALLBACK_SQL = `alter table program_registrations
  add column if not exists fair_access_code text;

create unique index if not exists idx_program_registrations_fair_access_code
  on program_registrations (fair_access_code)
  where fair_access_code is not null;

create table if not exists hebrew_fair_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  program_registration_id uuid not null references program_registrations(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  event_registration_id uuid references event_registrations(id) on delete set null,
  fair_access_code text not null,
  redeemed_at timestamptz not null default now(),
  unique (program_registration_id, event_id)
);`;

export function BackfillHebrewFairCodesButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);
  const [sql, setSql] = useState(FALLBACK_SQL);
  const [accessToken, setAccessToken] = useState('');
  const [applyingSchema, setApplyingSchema] = useState(false);

  async function run() {
    setStatus('running');
    setMessage('');
    try {
      const res = await fetch('/api/admin/backfill-hebrew-fair-codes', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: number;
        total?: number;
        error?: string;
        hint?: string;
        migrationRequired?: boolean;
        codes?: Array<{ childName: string; code: string }>;
      };

      if (!res.ok || data.ok === false) {
        setStatus('error');
        setNeedsMigration(Boolean(data.migrationRequired));
        const parts = [data.error ?? 'Backfill failed.'];
        if (data.hint) parts.push(data.hint);
        setMessage(parts.join(' '));

        if (data.migrationRequired) {
          try {
            const schemaRes = await fetch('/api/admin/apply-hebrew-fair-codes-schema');
            const schema = (await schemaRes.json()) as { sql?: string };
            if (schema.sql) setSql(schema.sql);
          } catch {
            // keep fallback SQL
          }
        }
        return;
      }

      setNeedsMigration(false);
      setStatus('done');
      const sample = (data.codes ?? [])
        .slice(0, 6)
        .map((row) => `${row.childName}: ${row.code}`)
        .join(' · ');
      let text = `Issued ${data.created ?? 0} new code(s) across ${data.total ?? 0} accepted/active child(ren).`;
      if (sample) text += ` ${sample}`;
      setMessage(text);
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  async function applySchema() {
    setApplyingSchema(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/apply-hebrew-fair-codes-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: accessToken.trim() || undefined }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        hint?: string;
        sql?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus('error');
        if (data.sql) setSql(data.sql);
        setNeedsMigration(true);
        setMessage([data.error, data.hint].filter(Boolean).join(' '));
        return;
      }
      setStatus('done');
      setMessage(data.message ?? 'Schema applied. Issuing codes…');
      setNeedsMigration(false);
      await run();
    } catch {
      setStatus('error');
      setMessage('Schema apply failed — network error.');
    } finally {
      setApplyingSchema(false);
    }
  }

  async function copySql() {
    try {
      await navigator.clipboard.writeText(sql);
      setMessage('SQL copied. Paste into Supabase SQL Editor → Run, then click Issue again.');
    } catch {
      setMessage('Could not copy — select the SQL below and copy manually.');
    }
  }

  return (
    <div className="px-4 py-3 border-b border-line bg-soft/30">
      <p className="text-sm text-navy">
        <strong className="font-semibold">Hebrew event codes</strong> — unique{' '}
        <span className="font-mono text-xs">HA-</span> code per accepted Hebrew Adventure child for
        free entry at promo events. Safe to run more than once. Does not email families.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running' || applyingSchema}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === 'running' ? 'Issuing codes…' : 'Issue / refresh Hebrew event codes'}
        </button>
      </div>
      {message ? (
        <p className={`mt-2 text-sm ${status === 'error' ? 'text-danger' : 'text-navy'}`}>{message}</p>
      ) : null}

      {needsMigration && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3 space-y-3">
          <p className="text-sm text-navy font-semibold">
            Database fix required before codes can appear
          </p>
          <p className="text-xs text-muted">
            The <span className="font-mono">fair_access_code</span> column is missing. Run this SQL
            in Supabase, or paste a Supabase personal access token below to apply it from CRM.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={SQL_EDITOR}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-navy px-3 py-1.5 text-sm font-medium text-navy"
            >
              Open Supabase SQL Editor
            </a>
            <button
              type="button"
              onClick={() => void copySql()}
              className="rounded border border-line px-3 py-1.5 text-sm font-medium text-navy"
            >
              Copy SQL
            </button>
          </div>
          <textarea
            readOnly
            value={sql}
            rows={8}
            className="w-full rounded border border-line bg-soft/40 p-2 font-mono text-[0.7rem] text-navy"
          />
          <div className="space-y-2">
            <label className="block text-xs text-muted">
              Optional: Supabase personal access token (
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold font-semibold"
              >
                create one here
              </a>
              )
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="sbp_…"
              className="w-full max-w-xl rounded border border-line px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void applySchema()}
              disabled={applyingSchema || !accessToken.trim()}
              className="rounded bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {applyingSchema ? 'Applying schema…' : 'Apply schema with token'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
