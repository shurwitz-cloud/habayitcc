export const LULAV_SET_PRICE = 50;
export const LULAV_CARD_FEE_RATE = 0.03;
export const LULAV_ZELLE_PHONE = '646-462-1138';
export const LULAV_ZELLE_NAME = 'Jewish Educational Services';
export const LULAV_ZELLE_MEMO = 'Lulav';

export type LulavPayMethod = 'card' | 'zelle';

export interface LulavPricing {
  quantity: number;
  subtotal: number;
  cardFee: number;
  total: number;
  totalCents: number;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLulavPricing(
  quantity: number,
  payMethod: LulavPayMethod,
  coverFee: boolean
): LulavPricing {
  const qty = Math.max(0, Math.floor(quantity));
  const subtotal = roundMoney(qty * LULAV_SET_PRICE);
  const cardFee =
    payMethod === 'card' && coverFee && subtotal > 0
      ? roundMoney(subtotal * LULAV_CARD_FEE_RATE)
      : 0;
  const total = roundMoney(subtotal + cardFee);
  return {
    quantity: qty,
    subtotal,
    cardFee,
    total,
    totalCents: Math.round(total * 100),
  };
}
