/** Loose shapes for Zeffy webhook / API payment objects (Beta — fields vary). */

export type ZeffyWebhookEnvelope = {
  type?: string;
  event?: string;
  created?: number | string;
  data?: { object?: ZeffyPaymentLike; payment?: ZeffyPaymentLike };
  payment?: ZeffyPaymentLike;
  [key: string]: unknown;
};

export type ZeffyPaymentLike = {
  id?: string;
  amount?: number;
  amount_total?: number;
  total?: number;
  currency?: string;
  status?: string;
  created?: number | string;
  type?: string;
  frequency?: string;
  is_recurring?: boolean;
  recurring?: boolean | { interval?: string };
  contact?: ZeffyContactLike | string;
  buyer?: ZeffyContactLike;
  donor?: ZeffyContactLike;
  campaign?: ZeffyCampaignLike | string;
  form?: ZeffyCampaignLike;
  line_items?: Array<{ amount?: number; quantity?: number }>;
  [key: string]: unknown;
};

export type ZeffyContactLike = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  address?: {
    line1?: string;
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    zip?: string;
  };
  [key: string]: unknown;
};

export type ZeffyCampaignLike = {
  id?: string;
  title?: string;
  name?: string;
  [key: string]: unknown;
};

export type ParsedZeffyPayment = {
  paymentId: string;
  amountDollars: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  campaignId: string | null;
  campaignTitle: string | null;
  /** True when Zeffy marks the gift recurring/monthly, or Habayit Chai Partner form. */
  isMonthly: boolean;
  status: string;
  raw: unknown;
};
