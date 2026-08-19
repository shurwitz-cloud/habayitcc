import { CARD_PROCESSING_RATE, type PaidEventConfig } from '@/lib/events/paid-events';

export const DINNER_ADULT_PRICE = 55;
export const DINNER_CHILD_PRICE = 35;
export const FAIR_CHILD_PRICE = 12;
export const WOMENS_TICKET_PRICE = 36;

export interface DinnerRegistrationData {
  adults: number;
  kids: number;
}

export interface FairChildEntry {
  hebrewCode?: string;
}

export interface FairRegistrationData {
  children: FairChildEntry[];
}

export interface WomensRegistrationData {
  women: number;
}

export interface PricingBreakdown {
  ticketSubtotal: number;
  sponsorAmount: number;
  cardFee: number;
  total: number;
  /** Per-child fair pricing detail for sheets. */
  fairChildLines?: Array<{ index: number; price: number; codeUsed: string | null; free: boolean }>;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeCardFee(subtotal: number, coverFee: boolean): number {
  if (!coverFee || subtotal <= 0) return 0;
  return roundMoney(subtotal * CARD_PROCESSING_RATE);
}

export function computeDinnerTickets(data: DinnerRegistrationData): number {
  const adults = Math.max(0, data.adults);
  const kids = Math.max(0, data.kids);
  if (adults + kids < 1) return 0;
  return roundMoney(adults * DINNER_ADULT_PRICE + kids * DINNER_CHILD_PRICE);
}

export function computeFairTickets(
  data: FairRegistrationData,
  freeChildIndices: Set<number>
): { subtotal: number; lines: PricingBreakdown['fairChildLines'] } {
  const lines: NonNullable<PricingBreakdown['fairChildLines']> = [];
  let subtotal = 0;

  data.children.forEach((child, index) => {
    const code = child.hebrewCode?.trim().toUpperCase() || null;
    const free = freeChildIndices.has(index);
    const price = free ? 0 : FAIR_CHILD_PRICE;
    subtotal += price;
    lines.push({ index: index + 1, price, codeUsed: code, free });
  });

  return { subtotal: roundMoney(subtotal), lines };
}

export function computeWomensTickets(data: WomensRegistrationData): number {
  const women = Math.max(0, data.women);
  if (women < 1) return 0;
  return roundMoney(women * WOMENS_TICKET_PRICE);
}

export function computePaidEventTotal(input: {
  event: PaidEventConfig;
  dinner?: DinnerRegistrationData;
  fair?: FairRegistrationData;
  fairFreeChildIndices?: Set<number>;
  womens?: WomensRegistrationData;
  sponsorAmount: number;
  coverFee: boolean;
}): PricingBreakdown {
  let ticketSubtotal = 0;
  let fairChildLines: PricingBreakdown['fairChildLines'];

  switch (input.event.type) {
    case 'dinner':
      ticketSubtotal = computeDinnerTickets(input.dinner ?? { adults: 0, kids: 0 });
      break;
    case 'family-fair': {
      const result = computeFairTickets(
        input.fair ?? { children: [] },
        input.fairFreeChildIndices ?? new Set()
      );
      ticketSubtotal = result.subtotal;
      fairChildLines = result.lines;
      break;
    }
    case 'womens':
      ticketSubtotal = computeWomensTickets(input.womens ?? { women: 0 });
      break;
  }

  const sponsorAmount = roundMoney(Math.max(0, input.sponsorAmount));
  const preFeeSubtotal = roundMoney(ticketSubtotal + sponsorAmount);
  const cardFee = computeCardFee(preFeeSubtotal, input.coverFee);
  const total = roundMoney(preFeeSubtotal + cardFee);

  return { ticketSubtotal, sponsorAmount, cardFee, total, fairChildLines };
}

export function totalToCents(total: number): number {
  return Math.round(total * 100);
}
