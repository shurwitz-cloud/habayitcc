/**
 * AI email drafting for admin compose (OpenAI).
 * Requires OPENAI_API_KEY in the environment.
 */

export type DraftEmailInput = {
  /** What the admin wants to communicate (bullet notes / rough idea). */
  prompt: string;
  /** Optional tone hint. */
  tone?: 'warm' | 'brief' | 'formal';
  /** Optional recipient context (name, reason). */
  recipientHint?: string;
  /** Optional group/audience context. */
  audienceHint?: string;
  /** Keep refining an existing draft. */
  existingSubject?: string;
  existingMessage?: string;
};

export type DraftEmailResult =
  | { ok: true; subject: string; message: string }
  | { ok: false; error: string };

const SYSTEM = `You draft emails for HaBayit Israeli Jewish Center (Cooper City, FL), a warm Jewish community with an Israeli spirit.

Rules:
- Write as HaBayit staff (friendly, clear, respectful). Sign off as "HaBayit" or "The HaBayit team" — never invent a personal staff name unless given.
- Output plain text only (no HTML, no markdown headings). Short paragraphs; blank line between paragraphs.
- Subject: concise, no emoji spam, under 80 characters.
- Do not invent dollar amounts, dates, access codes, or promises that were not in the prompt.
- If details are missing, keep language general or use a clear placeholder in [brackets].
- Reply with JSON only: {"subject":"...","message":"..."}`;

function toneLine(tone: DraftEmailInput['tone']): string {
  if (tone === 'brief') return 'Tone: brief and to the point.';
  if (tone === 'formal') return 'Tone: a bit more formal, still warm.';
  return 'Tone: warm and welcoming.';
}

export async function draftAdminEmail(input: DraftEmailInput): Promise<DraftEmailResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        'OPENAI_API_KEY is not set. Add it in Vercel → Environment Variables (Production), then redeploy.',
    };
  }

  const prompt = input.prompt.trim();
  if (prompt.length < 3) {
    return { ok: false, error: 'Add a short note about what the email should say.' };
  }
  if (prompt.length > 4000) {
    return { ok: false, error: 'Prompt is too long (max 4000 characters).' };
  }

  const userParts = [
    toneLine(input.tone),
    input.recipientHint?.trim() ? `Recipient context: ${input.recipientHint.trim()}` : null,
    input.audienceHint?.trim() ? `Audience: ${input.audienceHint.trim()}` : null,
    input.existingSubject?.trim()
      ? `Existing subject to improve (optional): ${input.existingSubject.trim()}`
      : null,
    input.existingMessage?.trim()
      ? `Existing message to improve (optional):\n${input.existingMessage.trim()}`
      : null,
    `What to communicate:\n${prompt}`,
  ].filter(Boolean);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EMAIL_MODEL?.trim() || 'gpt-4o-mini',
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userParts.join('\n\n') },
        ],
      }),
    });

    const data = (await res.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data.error?.message || `OpenAI error (${res.status}).`,
      };
    }

    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    if (!raw) {
      return { ok: false, error: 'AI returned an empty draft.' };
    }

    let parsed: { subject?: unknown; message?: unknown };
    try {
      parsed = JSON.parse(raw) as { subject?: unknown; message?: unknown };
    } catch {
      return { ok: false, error: 'AI returned an unreadable draft. Try again.' };
    }

    const subject = String(parsed.subject ?? '').trim();
    const message = String(parsed.message ?? '').trim();
    if (!subject || !message) {
      return { ok: false, error: 'AI draft was incomplete. Try again with a clearer prompt.' };
    }

    return {
      ok: true,
      subject: subject.slice(0, 200),
      message: message.slice(0, 20000),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft failed.';
    return { ok: false, error: message };
  }
}
