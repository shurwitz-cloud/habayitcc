export type CoupleNameInput = {
  firstName: string;
  lastName: string;
  spouseFirstName?: string | null;
  spouseLastName?: string | null;
};

export type CoupleNames = {
  /** Email greeting: "Mike & Sarah" */
  greeting: string;
  /** Tax receipt line: "Mike & Sarah Smith" or "Mike & Sarah Smith - Cohen" */
  receiptName: string;
  hasSpouse: boolean;
};

function clean(v: string | null | undefined): string {
  return (v || '').trim();
}

function sameLastName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

/**
 * Joint naming for donation / Chai Partner thank-yous and tax receipts.
 */
export function formatCoupleNames(input: CoupleNameInput): CoupleNames {
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  const spouseFirst = clean(input.spouseFirstName);
  const spouseLast = clean(input.spouseLastName) || (spouseFirst ? lastName : '');

  if (!spouseFirst) {
    const solo = [firstName, lastName].filter(Boolean).join(' ');
    return {
      greeting: firstName || solo,
      receiptName: solo,
      hasSpouse: false,
    };
  }

  const greeting = [firstName, spouseFirst].filter(Boolean).join(' & ');

  let receiptName: string;
  if (!spouseLast || sameLastName(lastName, spouseLast)) {
    receiptName = `${firstName} & ${spouseFirst} ${lastName}`.trim();
  } else {
    receiptName = `${firstName} & ${spouseFirst} ${lastName} - ${spouseLast}`.trim();
  }

  return { greeting, receiptName, hasSpouse: true };
}

export function collectRecipientEmails(
  primary?: string | null,
  spouse?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [primary, spouse]) {
    const email = (raw || '').trim().toLowerCase();
    if (!email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
