import { CARD_PROCESSING_RATE, type PaidEventConfig } from '@/lib/events/paid-events';

export const DINNER_ADULT_PRICE = 55;
export const DINNER_CHILD_PRICE = 35;
export const FAIR_CHILD_PRICE = 12;
export const WOMENS_TICKET_PRICE = 36;
export const COUPLES_TICKET_PRICE = 55;
export const COUPLES_MEMBER_TICKET_PRICE = 45;
export const SKATE_TICKET_PRICE = 20;
/** Non-skater entry pass: rink admission without skating. */
export const SKATE_NON_SKATER_PRICE = 7;
/** Chai member skate discount: 15% off each ticket, people on the reservation. */
export const SKATE_CHAI_DISCOUNT_RATE = 0.15;
export const SKATE_CHAI_SKATER_PRICE =
  Math.round(SKATE_TICKET_PRICE * (1 - SKATE_CHAI_DISCOUNT_RATE) * 100) / 100;
export const SKATE_CHAI_NON_SKATER_PRICE =
  Math.round(SKATE_NON_SKATER_PRICE * (1 - SKATE_CHAI_DISCOUNT_RATE) * 100) / 100;
/** Hebrew Adventure event-code discount on skate tickets: 15% off one skater per code. */
export const SKATE_HA_DISCOUNT_RATE = 0.15;
export const SKATE_HA_TICKET_PRICE =
  Math.round(SKATE_TICKET_PRICE * (1 - SKATE_HA_DISCOUNT_RATE) * 100) / 100;

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

export interface CouplesRegistrationData {
  couples: number;
  memberCode?: string;
  /** First couple at member price. Extra couples on this reservation stay full price. */
  memberDiscount?: boolean;
}

export interface SkateRegistrationData {
  skaters: number;
  /** Non-skater entry passes on this reservation (rink admission only). */
  nonSkaters?: number;
  memberCode?: string;
  /** Chai discount applies to the first memberPeople of this reservation. */
  memberDiscount?: boolean;
  /**
   * How many people on this reservation get the Chai discount (remaining
   * per-member allowance for this event). Skaters are discounted first,
   * then non-skater passes. Defaults to everyone on the reservation when
   * memberDiscount is set. Extra people pay the full advance price.
   */
  memberPeople?: number;
  /**
   * Hebrew Adventure event codes applied to this reservation (one discounted
   * skater per code). Only codes actually claimed for the discount belong
   * here; an unapplied code is never consumed. Never applies to a non-skater
   * pass.
   */
  haCodes?: string[];
  /**
   * How many skaters get the 3% Hebrew Adventure discount (one per claimed
   * code). Discounts never stack: when a Chai member discount is applied to
   * this registration the HA discount is NOT applied at all (the larger
   * discount wins for the whole registration, even beyond the member cap).
   */
  haDiscountedSkaters?: number;
}

export interface PricingBreakdown {
  ticketSubtotal: number;
  sponsorAmount: number;
  cardFee: number;
  total: number;
  /** Per-child fair pricing detail for sheets. */
  fairChildLines?: Array<{ index: number; price: number; codeUsed: string | null; free: boolean }>;
  coupleLines?: Array<{ index: number; price: number; member: boolean }>;
  skateLines?: Array<{ index: number; price: number; member: boolean; ha: boolean }>;
  skatePassLines?: Array<{ index: number; price: number; member: boolean }>;
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

export function computeCouplesTickets(
  data: CouplesRegistrationData,
): { subtotal: number; lines: NonNullable<PricingBreakdown['coupleLines']> } {
  const couples = Math.max(0, Math.round(data.couples) || 0);
  const lines: NonNullable<PricingBreakdown['coupleLines']> = [];
  let subtotal = 0;

  for (let i = 0; i < couples; i++) {
    const member = i === 0 && data.memberDiscount === true;
    const price = member ? COUPLES_MEMBER_TICKET_PRICE : COUPLES_TICKET_PRICE;
    subtotal += price;
    lines.push({ index: i + 1, price, member });
  }

  return { subtotal: roundMoney(subtotal), lines };
}

export function computeSkateTickets(
  data: SkateRegistrationData,
): {
  subtotal: number;
  lines: NonNullable<PricingBreakdown['skateLines']>;
  passLines: NonNullable<PricingBreakdown['skatePassLines']>;
} {
  const skaters = Math.max(0, Math.round(data.skaters) || 0);
  const nonSkaters = Math.max(0, Math.round(data.nonSkaters ?? 0) || 0);
  const lines: NonNullable<PricingBreakdown['skateLines']> = [];
  const passLines: NonNullable<PricingBreakdown['skatePassLines']> = [];
  let subtotal = 0;

  const people = skaters + nonSkaters;
  // Chai discount covers up to memberPeople people on this reservation,
  // $20 skaters first, then $7 non-skater passes.
  const memberAllowance =
    data.memberDiscount === true
      ? Math.min(people, Math.max(0, Math.round(data.memberPeople ?? people)))
      : 0;
  // Registration-level exclusivity: an applied Chai member discount wins
  // for the whole registration - no HA discount on ANY skater (even beyond
  // the member cap), and HA codes stay unused. HA never discounts a pass.
  const haAllowance =
    data.memberDiscount === true
      ? 0
      : Math.min(skaters, Math.max(0, Math.round(data.haDiscountedSkaters ?? 0)));

  for (let i = 0; i < skaters; i++) {
    const member = i < memberAllowance;
    const ha = !member && i < haAllowance;
    const price = member
      ? SKATE_CHAI_SKATER_PRICE
      : ha
        ? SKATE_HA_TICKET_PRICE
        : SKATE_TICKET_PRICE;
    subtotal += price;
    lines.push({ index: i + 1, price, member, ha });
  }

  for (let j = 0; j < nonSkaters; j++) {
    const member = skaters + j < memberAllowance;
    const price = member ? SKATE_CHAI_NON_SKATER_PRICE : SKATE_NON_SKATER_PRICE;
    subtotal += price;
    passLines.push({ index: j + 1, price, member });
  }

  return { subtotal: roundMoney(subtotal), lines, passLines };
}

export function computePaidEventTotal(input: {
  event: PaidEventConfig;
  dinner?: DinnerRegistrationData;
  fair?: FairRegistrationData;
  fairFreeChildIndices?: Set<number>;
  womens?: WomensRegistrationData;
  couples?: CouplesRegistrationData;
  skate?: SkateRegistrationData;
  sponsorAmount: number;
  coverFee: boolean;
}): PricingBreakdown {
  let ticketSubtotal = 0;
  let fairChildLines: PricingBreakdown['fairChildLines'];
  let coupleLines: PricingBreakdown['coupleLines'];
  let skateLines: PricingBreakdown['skateLines'];
  let skatePassLines: PricingBreakdown['skatePassLines'];

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
    case 'celebration':
      ticketSubtotal = 0;
      break;
    case 'couples': {
      const result = computeCouplesTickets(input.couples ?? { couples: 0 });
      ticketSubtotal = result.subtotal;
      coupleLines = result.lines;
      break;
    }
    case 'skate': {
      const result = computeSkateTickets(input.skate ?? { skaters: 0 });
      ticketSubtotal = result.subtotal;
      skateLines = result.lines;
      skatePassLines = result.passLines;
      break;
    }
  }

  const sponsorAmount = roundMoney(Math.max(0, input.sponsorAmount));
  const preFeeSubtotal = roundMoney(ticketSubtotal + sponsorAmount);
  const cardFee = computeCardFee(preFeeSubtotal, input.coverFee);
  const total = roundMoney(preFeeSubtotal + cardFee);

  return { ticketSubtotal, sponsorAmount, cardFee, total, fairChildLines, coupleLines, skateLines, skatePassLines };
}

export function totalToCents(total: number): number {
  return Math.round(total * 100);
}
