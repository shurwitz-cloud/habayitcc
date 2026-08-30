'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import type { AdminRole } from '@/lib/admin/roles';
import type { ResendSentEmailDetail, ResendSentEmailSummary } from '@/lib/resend/sent-mail';

type EmailTab = 'sent' | 'inbox' | 'compose';

function formatRecipients(list: string[] | null | undefined): string {
  if (!list?.length) return '—';
  return list.join(', ');
}

function formatSentAt(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventBadgeClass(event: string | null | undefined): string {
  const base = 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize';
  switch (event) {
    case 'delivered':
      return `${base} bg-emerald-100 text-emerald-800`;
    case 'opened':
    case 'clicked':
      return `${base} bg-sky-100 text-sky-800`;
    case 'bounced':
    case 'complained':
      return `${base} bg-red-100 text-red-800`;
    default:
      return `${base} bg-soft text-muted`;
  }
}

function SentDetailDrawer({
  email,
  loading,
  error,
  onClose,
}: {
  email: ResendSentEmailDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-navy/30"
        aria-label="Close email detail"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-2xl h-full bg-white shadow-xl border-l border-line flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-navy truncate">
            {email?.subject || 'Email detail'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold text-navy hover:bg-soft"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && <p className="text-sm text-muted">Loading…</p>}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
          {email && (
            <>
              <dl className="grid gap-2 text-sm">
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-muted font-semibold">To</dt>
                  <dd>{formatRecipients(email.to)}</dd>
                </div>
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-muted font-semibold">From</dt>
                  <dd>{email.from}</dd>
                </div>
                {email.cc?.length ? (
                  <div className="grid grid-cols-[5rem_1fr] gap-2">
                    <dt className="text-muted font-semibold">Cc</dt>
                    <dd>{formatRecipients(email.cc)}</dd>
                  </div>
                ) : null}
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-muted font-semibold">Sent</dt>
                  <dd>{formatSentAt(email.created_at)}</dd>
                </div>
                <div className="grid grid-cols-[5rem_1fr] gap-2 items-center">
                  <dt className="text-muted font-semibold">Status</dt>
                  <dd>
                    <span className={eventBadgeClass(email.last_event)}>
                      {email.last_event || 'unknown'}
                    </span>
                  </dd>
                </div>
              </dl>

              {email.html ? (
                <div className="border border-line rounded-xl overflow-hidden bg-soft/40">
                  <iframe
                    title="Email preview"
                    srcDoc={email.html}
                    sandbox=""
                    className="w-full min-h-[420px] bg-white"
                  />
                </div>
              ) : email.text ? (
                <pre className="whitespace-pre-wrap text-sm bg-soft/40 border border-line rounded-xl p-4">
                  {email.text}
                </pre>
              ) : (
                <p className="text-sm text-muted">No message body available from Resend.</p>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function ComposeTab({ onSent }: { onSent: () => void }) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedTo = to.trim();
    if (!trimmedTo || !subject.trim() || !message.trim()) {
      setError('To, subject, and message are required.');
      return;
    }

    const confirmed = window.confirm(
      `Send this email to ${trimmedTo.split(/[,;]+/)[0].trim()}${trimmedTo.includes(',') || trimmedTo.includes(';') ? ' (and others)' : ''}?`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const res = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc, subject, message }),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setError(json.error || 'Could not send email.');
        return;
      }
      setSuccess('Email sent.');
      setTo('');
      setCc('');
      setSubject('');
      setMessage('');
      onSent();
    } catch {
      setError('Could not send email.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-sm text-muted">
        Sends from info@habayitcc.org with the standard HaBayit email layout. Mail goes out only when
        you click Send and confirm.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          {success}
        </p>
      )}

      <form
        className="bg-white border border-line rounded-2xl p-6 space-y-4"
        onSubmit={handleSubmit}
      >
        <div>
          <label htmlFor="compose-to" className="block text-sm font-semibold text-navy mb-1">
            To
          </label>
          <input
            id="compose-to"
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
            autoComplete="off"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="compose-cc" className="block text-sm font-semibold text-navy mb-1">
            Cc <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="compose-cc"
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Separate multiple with commas"
            autoComplete="off"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="compose-subject" className="block text-sm font-semibold text-navy mb-1">
            Subject
          </label>
          <input
            id="compose-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="compose-message" className="block text-sm font-semibold text-navy mb-1">
            Message
          </label>
          <textarea
            id="compose-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            placeholder="Write your message…"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm resize-y"
          />
        </div>
        <button
          type="submit"
          disabled={sending}
          className="px-5 py-2.5 rounded-full text-sm font-semibold bg-gold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function InboxTab() {
  return (
    <div className="max-w-xl bg-white border border-line rounded-2xl p-8 text-center">
      <h2 className="text-xl font-bold text-navy mb-2">Inbox — coming in Phase 2</h2>
      <p className="text-sm text-muted leading-relaxed">
        Incoming mail to info@habayitcc.org stays in Gmail. The next phase will connect Gmail API
        here so you can read replies without changing your DNS or forwarding setup.
      </p>
    </div>
  );
}

export function EmailAdminPanel({ role }: { role: AdminRole }) {
  const [tab, setTab] = useState<EmailTab>('sent');
  const [emails, setEmails] = useState<ResendSentEmailSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResendSentEmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadSent = useCallback(async (cursor?: { after?: string; before?: string; append?: boolean }) => {
    setListLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor?.after) params.set('after', cursor.after);
      if (cursor?.before) params.set('before', cursor.before);

      const res = await fetch(`/api/admin/email/sent?${params.toString()}`);
      const json = (await res.json()) as {
        data?: ResendSentEmailSummary[];
        has_more?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setListError(json.error || 'Could not load sent mail.');
        return;
      }

      const rows = json.data ?? [];
      setHasMore(Boolean(json.has_more));
      setEmails((prev) => (cursor?.append ? [...prev, ...rows] : rows));
    } catch {
      setListError('Could not load sent mail.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'sent') {
      void loadSent();
    }
  }, [tab, loadSent]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError('');
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);

    void (async () => {
      try {
        const res = await fetch(`/api/admin/email/sent/${encodeURIComponent(selectedId)}`);
        const json = (await res.json()) as ResendSentEmailDetail & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setDetailError(json.error || 'Could not load email.');
          return;
        }
        setDetail(json);
      } catch {
        if (!cancelled) setDetailError('Could not load email.');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const tabs: { id: EmailTab; label: string }[] = [
    { id: 'sent', label: 'Sent' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'compose', label: 'Compose' },
  ];

  return (
    <div>
      <AdminNav role={role} />
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-navy mb-1">Email</h1>
        <p className="text-sm text-muted">
          Sent mail from Resend and compose from info@habayitcc.org. Inbox comes in Phase 2.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              tab === item.id ? 'bg-navy text-white' : 'text-navy hover:bg-soft'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'sent' && (
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {listError && (
            <p className="text-sm text-red-700 bg-red-50 border-b border-red-200 px-4 py-3">
              {listError}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-soft/50 text-left">
                  <th className="px-4 py-3 font-semibold text-navy">Subject</th>
                  <th className="px-4 py-3 font-semibold text-navy">To</th>
                  <th className="px-4 py-3 font-semibold text-navy">Sent</th>
                  <th className="px-4 py-3 font-semibold text-navy">Status</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line last:border-0 hover:bg-soft/40 cursor-pointer"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-4 py-3 font-medium text-navy max-w-xs truncate">
                      {row.subject || '(no subject)'}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-[12rem] truncate">
                      {formatRecipients(row.to)}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {formatSentAt(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={eventBadgeClass(row.last_event)}>
                        {row.last_event || 'unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!listLoading && emails.length === 0 && !listError && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted">
                      No sent emails found in Resend yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-line bg-soft/30">
            <span className="text-xs text-muted">
              {listLoading ? 'Loading…' : `${emails.length} shown`}
            </span>
            {hasMore && (
              <button
                type="button"
                disabled={listLoading || emails.length === 0}
                onClick={() => loadSent({ after: emails[emails.length - 1]?.id, append: true })}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-navy text-white disabled:opacity-50"
              >
                Load more
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'inbox' && <InboxTab />}
      {tab === 'compose' && (
        <ComposeTab
          onSent={() => {
            void loadSent();
          }}
        />
      )}

      {selectedId && (
        <SentDetailDrawer
          email={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
