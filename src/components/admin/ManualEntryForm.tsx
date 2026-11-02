'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContactSuggestInput } from '@/components/admin/ContactSuggestInput';
import { GOODS_ITEM_PRESETS, GOODS_OTHER_ITEM } from '@/lib/goods/items';
import type { CrmPersonSuggestion } from '@/lib/admin/crm/person-suggestions';

const METHODS = [
  'Zelle',
  'Zeffy',
  'Cash',
  'Check',
  'Cash App',
  'HaBayit donation link',
  'Other',
] as const;
type PaymentMethod = (typeof METHODS)[number];
type EntryKind = 'one_time' | 'monthly' | 'chai_partner' | 'goods_services';

const empty = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  amount: '',
  paidAtLocal: '',
  campaign: '',
  memo: '',
  methodOther: '',
  checkNumber: '',
  spouseFirstName: '',
  spouseLastName: '',
  spouseEmail: '',
  spousePhone: '',
  company: '',
};

export type ManualEntryPrefill = {
  contactId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  kind?: EntryKind;
};

export function ManualEntryForm({
  defaultKind = 'one_time',
  defaultOpen = false,
  people = [],
  prefill = null,
  prefillKey = null,
  onPrefillConsumed,
}: {
  defaultKind?: EntryKind;
  defaultOpen?: boolean;
  people?: CrmPersonSuggestion[];
  prefill?: ManualEntryPrefill | null;
  /** Changing this opens the form and applies `prefill` (e.g. from a contact). */
  prefillKey?: number | null;
  onPrefillConsumed?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<EntryKind>(defaultKind);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Zelle');
  const [form, setForm] = useState(empty);
  const [includeSpouse, setIncludeSpouse] = useState(false);
  const [spouseContactId, setSpouseContactId] = useState<string | null>(null);
  const [companyChecked, setCompanyChecked] = useState(false);
  const [alsoEmailSpouse, setAlsoEmailSpouse] = useState(false);
  const [paidUpfront, setPaidUpfront] = useState(false);
  const [coverageMonths, setCoverageMonths] = useState(1);
  const [sendEmail, setSendEmail] = useState(false);
  const [includeReceiptLink, setIncludeReceiptLink] = useState(false);
  const [goodsItem, setGoodsItem] = useState<string>(GOODS_ITEM_PRESETS[0]);
  const [goodsCustomItem, setGoodsCustomItem] = useState('');
  const [goodsQty, setGoodsQty] = useState(1);
  const [goodsUnit, setGoodsUnit] = useState('');
  const [includeInYearEnd, setIncludeInYearEnd] = useState(false);
  const [includeAsDonation, setIncludeAsDonation] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null);
  const [linkedContactLabel, setLinkedContactLabel] = useState<string | null>(null);

  const amountNumber = Number(form.amount);
  const goodsUnitNumber = Number(goodsUnit);
  const goodsTotal =
    kind === 'goods_services' &&
    goodsQty >= 1 &&
    Number.isFinite(goodsUnitNumber) &&
    goodsUnitNumber > 0
      ? Math.round(goodsQty * goodsUnitNumber * 100) / 100
      : null;
  const effectiveMonths = paidUpfront ? 12 : coverageMonths;
  const prepaidMonthly =
    kind === 'chai_partner' &&
    effectiveMonths > 1 &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0
      ? Math.round((amountNumber / effectiveMonths) * 100) / 100
      : null;

  useEffect(() => {
    if (prefillKey == null) return;
    setOpen(true);
    if (prefill) {
      setKind(prefill.kind ?? defaultKind);
      setForm((prev) => ({
        ...prev,
        firstName: prefill.firstName?.trim() || prev.firstName,
        lastName: prefill.lastName?.trim() || prev.lastName,
        email: prefill.email?.trim() || prev.email,
        phone: (prefill.phone ?? prev.phone)?.toString() || prev.phone,
      }));
      const name = [prefill.firstName, prefill.lastName].filter(Boolean).join(' ');
      setLinkedContactId(prefill.contactId ?? null);
      setLinkedContactLabel(name || prefill.email || 'Selected contact');
    }
    setStatus('idle');
    setMessage('');
    setReceiptUrl(null);
    onPrefillConsumed?.();
    // Parent bumps prefillKey for each "add from contact" action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey]);

  function setField(key: keyof typeof empty, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'firstName' || key === 'lastName' || key === 'email' || key === 'phone') {
      setLinkedContactId(null);
      setLinkedContactLabel(null);
    }
  }

  function applyPerson(person: CrmPersonSuggestion) {
    setForm((prev) => ({
      ...prev,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone || prev.phone,
    }));
    setLinkedContactId(person.id);
    setLinkedContactLabel(`${person.firstName} ${person.lastName}`);
  }

  function onMethodChange(m: PaymentMethod) {
    setPaymentMethod(m);
    if (kind === 'goods_services') return;
    if (m === 'Zelle' || m === 'Cash App') {
      setSendEmail(true);
      setIncludeReceiptLink(true);
    } else if (m === 'Zeffy' || m === 'HaBayit donation link') {
      setSendEmail(false);
      setIncludeReceiptLink(false);
    }
  }

  function onKindChange(value: EntryKind) {
    setKind(value);
    if (value !== 'chai_partner') setPaidUpfront(false);
    if (value === 'goods_services') {
      // Goods/services: email + receipt are deliberate per-entry choices.
      setSendEmail(false);
      setIncludeReceiptLink(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    setReceiptUrl(null);

    const amount =
      kind === 'goods_services' ? (goodsTotal ?? NaN) : Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('error');
      setMessage(
        kind === 'goods_services'
          ? 'Enter a valid quantity and unit price.'
          : 'Enter a valid amount.',
      );
      return;
    }

    if (
      kind === 'goods_services' &&
      goodsItem === GOODS_OTHER_ITEM &&
      !goodsCustomItem.trim()
    ) {
      setStatus('error');
      setMessage('Enter the custom item name.');
      return;
    }

    if (includeSpouse && !form.spouseFirstName.trim()) {
      setStatus('error');
      setMessage('Spouse first name is required when adding a spouse.');
      return;
    }

    let paidAt: string | undefined;
    if (form.paidAtLocal.trim()) {
      const d = new Date(form.paidAtLocal);
      if (!Number.isNaN(d.getTime())) paidAt = d.toISOString();
    }

    try {
      const res = await fetch('/api/admin/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          kind,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          street: form.street || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          zip: form.zip || undefined,
          amount,
          paymentMethod,
          paymentMethodOther: paymentMethod === 'Other' ? form.methodOther || undefined : undefined,
          checkNumber:
            paymentMethod === 'Check' && form.checkNumber.trim()
              ? form.checkNumber.trim()
              : undefined,
          paidAt,
          sendEmail,
          includeReceiptLink,
          item: kind === 'goods_services' ? goodsItem : undefined,
          customItem:
            kind === 'goods_services' && goodsItem === GOODS_OTHER_ITEM
              ? goodsCustomItem.trim()
              : undefined,
          quantity: kind === 'goods_services' ? goodsQty : undefined,
          unitAmount: kind === 'goods_services' ? goodsUnitNumber : undefined,
          includeInYearEnd: kind === 'goods_services' ? includeInYearEnd : undefined,
          includeAsDonation:
            kind === 'goods_services' && includeAsDonation ? true : undefined,
          goodsFmv:
            kind === 'goods_services' && includeAsDonation ? 0 : undefined,
          paidUpfront: kind === 'chai_partner' && paidUpfront ? true : undefined,
          coverageMonths:
            kind === 'chai_partner' && !paidUpfront ? coverageMonths : undefined,
          campaign: form.campaign || undefined,
          company: companyChecked ? form.company.trim() || undefined : undefined,
          memo: form.memo || undefined,
          ...(includeSpouse
            ? {
                spouseFirstName: form.spouseFirstName,
                spouseLastName: form.spouseLastName || undefined,
                spouseEmail: form.spouseEmail || undefined,
                spousePhone: form.spousePhone || undefined,
                contactId: linkedContactId || undefined,
                spouseContactId: spouseContactId || undefined,
                alsoEmailSpouse: alsoEmailSpouse || undefined,
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        spouseLinkWarning?: string | null;
        accessCode?: string;
        duplicate?: boolean;
        emailed?: boolean;
        receiptUrl?: string | null;
        paymentMethod?: string;
        greeting?: string;
      };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Could not save entry.');
        return;
      }
      setStatus('done');
      if (data.receiptUrl) setReceiptUrl(data.receiptUrl);
      if (data.duplicate) {
        setMessage(
          `Already in CRM (duplicate). No new email sent.${
            data.spouseLinkWarning ? ` Warning: ${data.spouseLinkWarning}` : ''
          }`,
        );
      } else {
        const kindLabel =
          kind === 'chai_partner' && paidUpfront
            ? 'Chai Partner (prepaid year)'
            : kind === 'chai_partner'
              ? 'Chai Partner'
              : kind === 'goods_services'
                ? 'Goods/Services payment'
                : kind === 'monthly'
                  ? 'Monthly gift'
                  : 'Donation';
        const monthlyNote =
          kind === 'chai_partner' && paidUpfront && Number.isFinite(amount)
            ? ` CRM monthly $${(Math.round((amount / 12) * 100) / 100).toFixed(2)}/mo.`
            : '';
        setMessage(
          `Saved ${kindLabel} via ${data.paymentMethod || paymentMethod}${
            data.greeting ? ` (${data.greeting})` : ''
          }.${monthlyNote}${data.accessCode ? ` Code ${data.accessCode}.` : ''}${
            data.emailed ? ' Email sent.' : ' No email sent.'
          }${data.spouseLinkWarning ? ` Warning: ${data.spouseLinkWarning}` : ''}`,
        );
      }
      setForm(empty);
      setLinkedContactId(null);
      setSpouseContactId(null);
      setCompanyChecked(false);
      setIncludeSpouse(false);
      setAlsoEmailSpouse(false);
      setPaidUpfront(false);
      setCoverageMonths(1);
      setGoodsItem(GOODS_ITEM_PRESETS[0]);
      setGoodsCustomItem('');
      setGoodsQty(1);
      setGoodsUnit('');
      setIncludeInYearEnd(false);
      setLinkedContactLabel(null);
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-[#d4cfc4] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#172643]">Manual entry</p>
          <p className="text-sm text-[#6f6a60] mt-0.5">
            Record a payment or gift that came in outside the website (Zelle, Zeffy, cash,
            check, etc.). Start typing a name to pick an existing contact.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setStatus('idle');
            setMessage('');
            setReceiptUrl(null);
          }}
          className="rounded bg-[#172643] px-4 py-2 text-sm font-medium text-white"
        >
          {open ? 'Close' : 'New entry'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-4 border-t border-[#e4ded2] pt-4">
          {linkedContactLabel ? (
            <p className="rounded border border-[#e4ded2] bg-[#faf8f4] px-3 py-2 text-sm text-[#172643]">
              Using contact: <strong>{linkedContactLabel}</strong>
              {form.email ? (
                <span className="text-[#6f6a60]"> · {form.email}</span>
              ) : null}
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-[#172643]">Type</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['one_time', 'One-time Donation'],
                  ['monthly', 'Monthly Donation'],
                  ['chai_partner', 'Chai Partner'],
                  ['goods_services', 'Goods / Services / Classes'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-[#172643]">
                  <input
                    type="radio"
                    name="manual-entry-kind"
                    checked={kind === value}
                    onChange={() => onKindChange(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {kind === 'chai_partner' ? (
              <>
                <label className="mt-3 flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paidUpfront}
                    onChange={(e) => {
                      setPaidUpfront(e.target.checked);
                      if (e.target.checked) setCoverageMonths(12);
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">Paid full year upfront</span>
                    <span className="mt-0.5 block text-[#6f6a60]">
                      Enter the full amount they paid (e.g. 1800). CRM monthly = amount ÷ 12.
                    </span>
                  </span>
                </label>
                {!paidUpfront ? (
                  <label className="mt-3 block text-sm text-[#172643]">
                    <span className="mb-1 block font-medium">Months this payment covers</span>
                    <select
                      value={coverageMonths}
                      onChange={(e) => setCoverageMonths(Number(e.target.value))}
                      className="w-full max-w-xs rounded border border-[#d4cfc4] px-3 py-2 text-sm bg-white"
                    >
                      {[1, 2, 3, 4, 5, 6, 9, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} month{n === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[#6f6a60]">
                      Default is 1 (normal monthly). Use 2+ for cash/Zelle paid ahead.
                    </span>
                  </label>
                ) : null}
              </>
            ) : null}
            {kind === 'goods_services' ? (
              <div className="mt-3 space-y-3">
                <label className="block text-sm text-[#172643]">
                  <span className="mb-1 block font-medium">Item</span>
                  <select
                    value={goodsItem}
                    onChange={(e) => setGoodsItem(e.target.value)}
                    className="w-full max-w-xs rounded border border-[#d4cfc4] px-3 py-2 text-sm bg-white"
                  >
                    {GOODS_ITEM_PRESETS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                    <option value={GOODS_OTHER_ITEM}>Other (custom)</option>
                  </select>
                </label>
                {goodsItem === GOODS_OTHER_ITEM ? (
                  <label className="block text-sm text-[#172643]">
                    <span className="mb-1 block font-medium">Custom item name</span>
                    <input
                      type="text"
                      value={goodsCustomItem}
                      onChange={(e) => setGoodsCustomItem(e.target.value)}
                      placeholder="e.g. Siddur, event sponsorship of goods..."
                      className="w-full max-w-xs rounded border border-[#d4cfc4] px-3 py-2 text-sm"
                    />
                  </label>
                ) : null}
                <p className="text-sm text-[#6f6a60]">
                  A goods/services payment, not a donation. It never appears on a
                  tax receipt unless you add it as a donation below, and stays
                  out of year-end receipts unless you opt in.
                </p>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[#172643]">
              <span className="mb-1 block font-medium">Payment method</span>
              <select
                value={paymentMethod}
                onChange={(e) => onMethodChange(e.target.value as PaymentMethod)}
                className="w-full rounded border border-[#d4cfc4] px-3 py-2 text-sm bg-white"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {paymentMethod === 'Other' ? (
              <Field
                label="Other method (optional)"
                value={form.methodOther}
                onChange={(v) => setField('methodOther', v)}
                placeholder="e.g. Venmo, wire…"
              />
            ) : paymentMethod === 'Check' ? (
              <Field
                label="Check number (optional)"
                value={form.checkNumber}
                onChange={(v) => setField('checkNumber', v)}
                placeholder="e.g. 123"
              />
            ) : (
              <div className="hidden sm:block" />
            )}

            <ContactSuggestInput
              label="First name"
              people={people}
              value={form.firstName}
              onChange={(v) => setField('firstName', v)}
              onSelect={applyPerson}
              matchContext={`${form.lastName} ${form.email}`}
              required
            />
            <ContactSuggestInput
              label="Last name"
              people={people}
              value={form.lastName}
              onChange={(v) => setField('lastName', v)}
              onSelect={applyPerson}
              matchContext={`${form.firstName} ${form.email}`}
              required
            />
            <ContactSuggestInput
              label="Email"
              type="email"
              people={people}
              value={form.email}
              onChange={(v) => setField('email', v)}
              onSelect={applyPerson}
              matchContext={`${form.firstName} ${form.lastName}`}
              required
              className="sm:col-span-2"
            />
            <Field label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} />
            {kind === 'goods_services' ? (
              <>
                <label className="block text-sm text-[#172643]">
                  <span className="mb-1 block font-medium">Quantity</span>
                  <input
                    type="number"
                    value={goodsQty}
                    onChange={(e) => setGoodsQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    required
                    min={1}
                    step="1"
                    className="w-full rounded border border-[#d4cfc4] px-3 py-2 text-sm"
                  />
                </label>
                <div>
                  <label className="block text-sm text-[#172643]">
                    <span className="mb-1 block font-medium">Unit price ($)</span>
                    <input
                      type="number"
                      value={goodsUnit}
                      onChange={(e) => setGoodsUnit(e.target.value)}
                      required
                      min={0.01}
                      step="0.01"
                      placeholder="e.g. 36"
                      className="w-full rounded border border-[#d4cfc4] px-3 py-2 text-sm"
                    />
                  </label>
                  {goodsTotal != null ? (
                    <p className="mt-1.5 text-sm text-[#172643]">
                      Total: <strong>${goodsTotal.toFixed(2)}</strong>
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            {kind !== 'goods_services' ? (
            <div>
              <Field
                label={
                  kind === 'chai_partner'
                    ? paidUpfront || coverageMonths > 1
                      ? 'Amount paid ($)'
                      : 'Monthly amount ($)'
                    : 'Amount ($)'
                }
                type="number"
                value={form.amount}
                onChange={(v) => setField('amount', v)}
                required
                min={kind === 'chai_partner' ? (paidUpfront ? 1800 : 150) : 1}
                step="0.01"
                placeholder={
                  kind === 'chai_partner' && paidUpfront
                    ? '1800'
                    : kind === 'chai_partner' && coverageMonths === 2
                      ? '300'
                      : undefined
                }
              />
              {prepaidMonthly != null ? (
                <p className="mt-1.5 text-sm text-[#172643]">
                  CRM monthly:{' '}
                  <strong>
                    ${prepaidMonthly.toFixed(2)}
                    /mo
                  </strong>{' '}
                  <span className="text-[#6f6a60]">
                    (covers {effectiveMonths} month{effectiveMonths === 1 ? '' : 's'})
                  </span>
                  {prepaidMonthly < 150 ? (
                    <span className="block text-red-700 mt-0.5">
                      Must be at least $150/mo.
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
            ) : null}
            <Field
              label="Paid at (real date if entering late)"
              type="datetime-local"
              value={form.paidAtLocal}
              onChange={(v) => setField('paidAtLocal', v)}
            />
            {kind === 'chai_partner' ? (
              <>
                <Field
                  label="Memo (optional)"
                  value={form.memo}
                  onChange={(v) => setField('memo', v)}
                  className="sm:col-span-2"
                  placeholder="Optional note"
                />
                <Field label="Street" value={form.street} onChange={(v) => setField('street', v)} className="sm:col-span-2" />
                <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
                <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
                <Field label="ZIP" value={form.zip} onChange={(v) => setField('zip', v)} />
              </>
            ) : (
              <>
                {kind !== 'goods_services' ? (
                  <Field
                    label="Campaign (optional)"
                    value={form.campaign}
                    onChange={(v) => setField('campaign', v)}
                    placeholder="e.g. Purim, Lag BaOmer"
                  />
                ) : null}
                <Field
                  label="Memo (optional)"
                  value={form.memo}
                  onChange={(v) => setField('memo', v)}
                  className="sm:col-span-2"
                  placeholder={
                    kind === 'goods_services'
                      ? 'Note (also shown on the payment receipt)'
                      : 'Shown on tax receipt if filled'
                  }
                />
              </>
            )}
          </div>

          <div className="rounded border border-[#e4ded2] px-3 py-3 space-y-3">
            <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
              <input
                type="checkbox"
                checked={includeSpouse}
                onChange={(e) => { setIncludeSpouse(e.target.checked); if (!e.target.checked) setSpouseContactId(null); }}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Add spouse</span>
                <span className="mt-0.5 block text-[#6f6a60]">
                  Shared address. Receipt uses joint names. Email goes to the payer only unless you check Also email spouse.
                </span>
              </span>
            </label>

            {includeSpouse ? (
              <div className="grid gap-3 sm:grid-cols-2 border-t border-[#e4ded2] pt-3">
                <ContactSuggestInput
                  label="Spouse first name"
                  people={people}
                  value={form.spouseFirstName}
                  onChange={(v) => { setField('spouseFirstName', v); setSpouseContactId(null); }}
                  onSelect={(person) => {
                    setSpouseContactId(person.id);
                    setForm((prev) => ({
                      ...prev,
                      spouseFirstName: person.firstName,
                      spouseLastName:
                        person.lastName !== prev.lastName ? person.lastName : prev.spouseLastName,
                      spouseEmail: person.email,
                      spousePhone: person.phone || prev.spousePhone,
                    }));
                  }}
                  matchContext={`${form.spouseLastName} ${form.spouseEmail}`}
                  required
                />
                <Field
                  label="Spouse last name (if different)"
                  value={form.spouseLastName}
                  onChange={(v) => setField('spouseLastName', v)}
                  placeholder="Leave blank if same last name"
                />
                <ContactSuggestInput
                  label="Spouse email"
                  type="email"
                  people={people}
                  value={form.spouseEmail}
                  onChange={(v) => { setField('spouseEmail', v); setSpouseContactId(null); }}
                  onSelect={(person) => {
                    setSpouseContactId(person.id);
                    setForm((prev) => ({
                      ...prev,
                      spouseFirstName: person.firstName || prev.spouseFirstName,
                      spouseLastName:
                        person.lastName !== prev.lastName ? person.lastName : prev.spouseLastName,
                      spouseEmail: person.email,
                      spousePhone: person.phone || prev.spousePhone,
                    }));
                  }}
                  matchContext={`${form.spouseFirstName} ${form.spouseLastName}`}
                />
                <Field
                  label="Spouse phone"
                  value={form.spousePhone}
                  onChange={(v) => setField('spousePhone', v)}
                />
                {spouseContactId ? (
                  <p className="text-xs text-[#4a6b4f] sm:col-span-2">
                    Existing contact selected. On save it will be linked as the spouse in Contacts - no duplicate is created.
                  </p>
                ) : null}
              </div>
            ) : null}

            {includeSpouse ? (
              <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer border-t border-[#e4ded2] pt-3">
                <input
                  type="checkbox"
                  checked={alsoEmailSpouse}
                  onChange={(e) => setAlsoEmailSpouse(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Also email spouse</span>
                  <span className="mt-0.5 block text-[#6f6a60]">
                    Off by default. The confirmation email goes to the payer
                    only; check this to copy the spouse's address.
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
            <input
              type="checkbox"
              checked={companyChecked}
              onChange={(e) => {
                setCompanyChecked(e.target.checked);
                if (!e.target.checked) setField('company', '');
              }}
              className="mt-0.5"
            />
            <span className="font-semibold">
              {kind === 'goods_services' ? 'This is a company payment' : 'This is a company donation'}
            </span>
          </label>
          {companyChecked ? (
          <div>
            <Field
              label="Company / organization (optional)"
              value={form.company}
              onChange={(v) => setField('company', v)}
              placeholder="e.g. Hurwitz Holdings LLC"
            />
            <span className="mt-1 block text-xs text-[#6f6a60]">
              When filled, receipts and the year-end summary are issued to the
              company name. This takes precedence over joint spouse names.
            </span>
            {form.company.trim() ? (
              <span className="mt-1 block text-xs font-medium text-[#172643]">
                Receipt name: {form.company.trim()}
              </span>
            ) : null}
          </div>
          ) : null}

          <div className="space-y-3 rounded border border-[#e4ded2] bg-[#faf8f4] px-3 py-3">
            {kind === 'goods_services' ? (
              <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAsDonation}
                  onChange={(e) => setIncludeAsDonation(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Add as a donation</span>
                </span>
              </label>
            ) : null}
            {kind === 'goods_services' ? (
              <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer border-t border-[#e4ded2] pt-3">
                <input
                  type="checkbox"
                  checked={includeInYearEnd}
                  onChange={(e) => setIncludeInYearEnd(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">
                    Include in year-end goods &amp; services receipt
                  </span>
                  <span className="mt-0.5 block text-[#6f6a60]">
                    Off by default. Lists this payment on the payer's separate
                    year-end goods &amp; services receipt (not a tax receipt), in
                    addition to their regular tax-donation receipt.
                  </span>
                </span>
              </label>
            ) : null}
            <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => {
                  const next = e.target.checked;
                  setSendEmail(next);
                  if (!next) setIncludeReceiptLink(false);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Send email</span>
                <span className="mt-0.5 block text-[#6f6a60]">
                  {kind === 'chai_partner'
                    ? "Welcome email with access code, to the payer's email."
                    : kind === 'goods_services'
                      ? "Payment confirmation email to the payer's email. Off by default."
                      : "Thank-you email from HaBayit, to the payer's email."}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
              <input
                type="checkbox"
                checked={includeReceiptLink}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIncludeReceiptLink(next);
                  if (next) setSendEmail(true);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">
                  {kind === 'goods_services'
                    ? 'Add payment receipt link in email'
                    : 'Add tax receipt link in email'}
                </span>
                <span className="mt-0.5 block text-[#6f6a60]">
                  {kind === 'goods_services'
                    ? 'Itemized payment receipt (not a tax receipt).'
                    : paymentMethod === 'Zeffy'
                      ? 'Usually leave off — Zeffy already receipts.'
                      : paymentMethod === 'HaBayit donation link'
                        ? 'Usually leave off — Stripe already receipts the card charge.'
                        : 'Includes a View & Print Tax Receipt button.'}
                </span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={status === 'saving'}
            className="rounded bg-[#b8902a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {status === 'saving' ? 'Saving…' : 'Save to CRM'}
          </button>

          {message ? (
            <p className={`text-sm ${status === 'error' ? 'text-red-700' : 'text-[#4a6741]'}`}>
              {message}
            </p>
          ) : null}

          {receiptUrl ? (
            <p className="text-sm text-[#172643]">
              {kind === 'goods_services' ? 'Payment receipt link:' : 'Tax receipt link:'}{' '}
              <a
                href={receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#b8902a] underline"
              >
                Open receipt
              </a>
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  className = '',
  min,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
  min?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className={`block text-sm text-[#172643] ${className}`}>
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={min}
        step={step}
        placeholder={placeholder}
        className="w-full rounded border border-[#d4cfc4] px-3 py-2 text-sm"
      />
    </label>
  );
}
