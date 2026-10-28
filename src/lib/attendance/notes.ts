/** Encode a 1–5 slider in the note text so we don't need new DB columns yet. */

const RATING_PREFIX = /^\[([1-5])\](?:\s([\s\S]*))?$/;

export function packRatedNote(rating: number | null, note: string): string {
  const text = note.trim();
  if (rating == null || rating < 1 || rating > 5) return text;
  return text ? `[${rating}] ${text}` : `[${rating}]`;
}

export function unpackRatedNote(raw: string | null | undefined): { rating: number | null; note: string } {
  const value = raw?.trim() ?? '';
  if (!value) return { rating: null, note: '' };
  const match = value.match(RATING_PREFIX);
  if (!match) return { rating: null, note: value };
  return { rating: Number(match[1]), note: (match[2] ?? '').trim() };
}

export function ratingLabel(rating: number | null): string {
  if (rating == null) return 'Not set';
  if (rating <= 1) return 'Less';
  if (rating === 2) return 'Low';
  if (rating === 3) return 'OK';
  if (rating === 4) return 'Strong';
  return 'More';
}

export function formatRatedNote(raw: string | null | undefined): string {
  const { rating, note } = unpackRatedNote(raw);
  if (rating == null) return note || '—';
  const label = `${ratingLabel(rating)} (${rating}/5)`;
  return note ? `${label} — ${note}` : label;
}
