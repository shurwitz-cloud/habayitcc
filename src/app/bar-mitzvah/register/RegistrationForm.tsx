'use client';

import { useCallback, useRef, useState } from 'react';
import { submitBmxRegistration, type ChildInput, type RegistrationInput } from './actions';
import { BMX_NAME } from '@/lib/programs/names';
import {
  HebrewAdventurePaymentSetup,
  type HebrewAdventurePaymentSetupHandle,
} from '@/components/stripe/HebrewAdventurePaymentSetup';
import {
  getBmxSessionTuition,
  getBmxCardProcessingFee,
  getBmxGrandTotal,
  getBmxInstallmentAmounts,
  isBmxEarlyBirdActive,
  BMX_CHAI_DISCOUNT,
  BMX_MONTHLY_TUITION,
  BMX_SESSION_MONTHS,
  BMX_CARD_PROCESSING_RATE,
  BMX_PAY_IN_FULL_DISCOUNT,
  BMX_EARLY_BIRD_DEADLINE_LABEL,
  BMX_EARLY_BIRD_DISCOUNT,
  type BmxPaymentPlan,
  type BmxPaymentMethod,
} from '@/lib/programs/bmx-tuition';

const emptyChild: ChildInput = {
  firstName: '',
  lastName: '',
  hebrewName: '',
  dateOfBirth: '',
  bornBeforeSunset: '',
  grade: '7th',
  schoolAttending: '',
  attendedBefore: '',
  previousProgramName: '',
  hasIepOrNeeds: '',
  iepOrNeedsDetails: '',
  hebrewLevel: '',
  allergies: '',
};

const GRADES = ['7th'];

const PAYMENT_PLAN_OPTIONS: {
  value: BmxPaymentPlan;
  title: string;
  description: string;
}[] = [
  {
    value: 'full',
    title: 'Pay in full',
    description: `Charged upon acceptance — $${BMX_PAY_IN_FULL_DISCOUNT} off.`,
  },
  {
    value: 'two_installments',
    title: 'Two-payment plan',
    description: 'Upon acceptance and by November 1.',
  },
];

export function RegistrationForm() {
  const [children, setChildren] = useState<ChildInput[]>([{ ...emptyChild }]);
  const [parent1, setParent1] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [parent2, setParent2] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [motherStatus, setMotherStatus] = useState('');
  const [motherConversionOrg, setMotherConversionOrg] = useState('');
  const [motherConversionRabbi, setMotherConversionRabbi] = useState('');
  const [fatherStatus, setFatherStatus] = useState('');
  const [fatherConversionOrg, setFatherConversionOrg] = useState('');
  const [fatherConversionRabbi, setFatherConversionRabbi] = useState('');
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [emergency, setEmergency] = useState({ contact: '', phone: '' });
  const [isChaiPartner, setIsChaiPartner] = useState(false);
  const [chaiCode, setChaiCode] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<BmxPaymentPlan>('full');
  const [paymentMethod, setPaymentMethod] = useState<BmxPaymentMethod | ''>('');
  const [agreedPolicies, setAgreedPolicies] = useState(false);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [savedSetupIntentId, setSavedSetupIntentId] = useState<string | null>(null);
  const paymentSetupRef = useRef<HebrewAdventurePaymentSetupHandle>(null);

  const handlePaymentSetupError = useCallback((message: string) => {
    setSubmitError(message);
  }, []);

  function selectPaymentMethod(method: BmxPaymentMethod) {
    setPaymentMethod(method);
    setSavedSetupIntentId(null);
  }

  function updateChild(index: number, field: keyof ChildInput, value: string) {
    setChildren((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function updateChildFields(index: number, patch: Partial<ChildInput>) {
    setChildren((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function calculateTuitionSubtotal() {
    return getBmxSessionTuition(isChaiPartner, paymentPlan);
  }

  function calculateTotal() {
    if (!paymentMethod) return calculateTuitionSubtotal();
    return getBmxGrandTotal(calculateTuitionSubtotal(), paymentMethod);
  }

  function formatCurrency(amount: number) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (!agreedPolicies) {
      setSubmitError('You must agree to the enrollment policies to continue.');
      return;
    }
    if (!paymentMethod) {
      setSubmitError('Please select a payment method.');
      return;
    }
    if (!parent1.email.trim()) {
      setSubmitError('Please enter Parent / Guardian 1 email.');
      return;
    }
    for (const child of children) {
      if (child.attendedBefore === 'yes' && !child.previousProgramName.trim()) {
        setSubmitError(
          `Please enter the name of the previous Hebrew program for ${child.firstName || 'each child'}.`
        );
        return;
      }
      if (!child.hasIepOrNeeds) {
        setSubmitError(
          `Please indicate whether ${child.firstName || 'each child'} has an IEP or specific educational needs.`
        );
        return;
      }
      if (child.hasIepOrNeeds === 'yes' && !child.iepOrNeedsDetails.trim()) {
        setSubmitError(
          `Please specify the IEP or educational needs for ${child.firstName || 'each child'}.`
        );
        return;
      }
    }
    if (
      motherStatus === 'jewish_by_conversion' &&
      (!motherConversionOrg.trim() || !motherConversionRabbi.trim())
    ) {
      setSubmitError('Please enter the mother\'s conversion Beit Din / organization and certifying rabbi.');
      return;
    }
    if (
      fatherStatus === 'jewish_by_conversion' &&
      (!fatherConversionOrg.trim() || !fatherConversionRabbi.trim())
    ) {
      setSubmitError('Please enter the father\'s conversion Beit Din / organization and certifying rabbi.');
      return;
    }

    setSubmitting(true);

    let stripeSetupIntentId = savedSetupIntentId;
    if (!stripeSetupIntentId) {
      stripeSetupIntentId = (await paymentSetupRef.current?.confirmSetup()) ?? null;
      if (!stripeSetupIntentId) {
        setSubmitting(false);
        return;
      }
      setSavedSetupIntentId(stripeSetupIntentId);
    }

    const input: RegistrationInput = {
      parent1FirstName: parent1.firstName,
      parent1LastName: parent1.lastName,
      parent1Phone: parent1.phone,
      parent1Email: parent1.email,
      parent2FirstName: parent2.firstName,
      parent2LastName: parent2.lastName,
      parent2Phone: parent2.phone,
      parent2Email: parent2.email,
      motherStatus,
      motherConversionOrg,
      motherConversionRabbi,
      fatherStatus,
      fatherConversionOrg,
      fatherConversionRabbi,
      streetAddress: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip,
      emergencyContact: emergency.contact,
      emergencyPhone: emergency.phone,
      children,
      isChaiPartner,
      chaiPartnerCode: chaiCode,
      paymentPlan,
      paymentMethod,
      stripeSetupIntentId,
      agreedToPolicies: agreedPolicies,
      notes,
    };

    const result = await submitBmxRegistration(input);
    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
    } else {
      setSubmitError(result.error || 'Something went wrong. Please try again.');
    }
  }

  if (submitted) {
    return (
      <div className="max-w-[600px] mx-auto text-center py-20">
        <h2 className="text-[2.2rem] text-navy font-bold mb-4">Thank you!</h2>
        <p className="text-muted">
          Your {BMX_NAME} registration has been submitted. Your payment method is on
          file — you will not be charged until your registration is reviewed and accepted.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Children */}
      {children.map((child, i) => (
        <div key={i} className="bg-white border-[1.5px] border-dashed border-line rounded-[18px] p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-[1.1rem] text-gold">Child Information</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Field label="Legal Full Name" required>
              <input
                value={child.firstName}
                onChange={(e) => updateChild(i, 'firstName', e.target.value)}
                placeholder="First name"
                required
              />
            </Field>
            <Field label="Last Name" required>
              <input
                value={child.lastName}
                onChange={(e) => updateChild(i, 'lastName', e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Field label="Hebrew Name" required>
              <input
                value={child.hebrewName}
                onChange={(e) => updateChild(i, 'hebrewName', e.target.value)}
                required
              />
            </Field>
            <Field label="Date of Birth" required>
              <input
                type="date"
                value={child.dateOfBirth}
                onChange={(e) => updateChild(i, 'dateOfBirth', e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="mb-4">
            <Field
              label="Was your child born before or after sunset?"
              hint="Jewish days begin at sunset — needed for an accurate Hebrew birthday"
              required
            >
              <select
                value={child.bornBeforeSunset}
                onChange={(e) =>
                  updateChild(i, 'bornBeforeSunset', e.target.value as ChildInput['bornBeforeSunset'])
                }
                required
              >
                <option value="">Please select...</option>
                <option value="before">Before sunset</option>
                <option value="after">After sunset</option>
                <option value="unknown">Not sure</option>
              </select>
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Field label="Grade Entering" required>
              <select
                value={child.grade}
                onChange={(e) => updateChild(i, 'grade', e.target.value)}
                required
              >
                <option value="">Select grade</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="School Attending" required>
              <input
                value={child.schoolAttending}
                onChange={(e) => updateChild(i, 'schoolAttending', e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="border-t border-line pt-5">
            <h4 className="font-display text-[1.25rem] text-navy font-bold mb-1">Hebrew Background</h4>
            <p className="text-muted text-[0.88rem] mb-4">This helps us place your child at the right level.</p>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <Field label="Attended a Hebrew program before?" required>
                <select
                  value={child.attendedBefore}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateChildFields(i, {
                      attendedBefore: value,
                      ...(value !== 'yes' ? { previousProgramName: '' } : {}),
                    });
                  }}
                  required
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <Field label="Hebrew Reading Level" required>
                <select
                  value={child.hebrewLevel}
                  onChange={(e) => updateChild(i, 'hebrewLevel', e.target.value)}
                  required
                >
                  <option value="">Select level</option>
                  <option value="none">No prior experience</option>
                  <option value="some_letters">Recognizes some letters</option>
                  <option value="reads_slowly">Reads slowly</option>
                  <option value="reads_comfortably">Reads comfortably</option>
                </select>
              </Field>
            </div>
            {child.attendedBefore === 'yes' && (
              <div className="mb-4">
                <Field label="Name of program" required>
                  <input
                    value={child.previousProgramName}
                    onChange={(e) => updateChild(i, 'previousProgramName', e.target.value)}
                    placeholder="e.g. synagogue Hebrew school, day school, tutoring"
                    required
                  />
                </Field>
              </div>
            )}
            <div className="mb-4">
              <Field label="Does your child have an IEP or specific educational needs?" required>
                <select
                  value={child.hasIepOrNeeds}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateChildFields(i, {
                      hasIepOrNeeds: value,
                      ...(value !== 'yes' ? { iepOrNeedsDetails: '' } : {}),
                    });
                  }}
                  required
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
            </div>
            {child.hasIepOrNeeds === 'yes' && (
              <div className="mb-4">
                <Field label="Please specify" required>
                  <textarea
                    value={child.iepOrNeedsDetails}
                    onChange={(e) => updateChild(i, 'iepOrNeedsDetails', e.target.value)}
                    placeholder="Share anything that will help us support your child."
                    rows={3}
                    required
                  />
                </Field>
              </div>
            )}
            <Field label="Allergies / Medical Info">
              <input
                value={child.allergies}
                onChange={(e) => updateChild(i, 'allergies', e.target.value)}
                placeholder="Enter N/A if none"
              />
            </Field>
          </div>
        </div>
      ))}

      {/* Parents */}
      <FormSection title="Parent / Guardian Information" description="Please provide information for both parents/guardians, where applicable.">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Parent / Guardian 1 First Name" required>
            <input value={parent1.firstName} onChange={(e) => setParent1({ ...parent1, firstName: e.target.value })} required />
          </Field>
          <Field label="Last Name" required>
            <input value={parent1.lastName} onChange={(e) => setParent1({ ...parent1, lastName: e.target.value })} required />
          </Field>
          <Field label="Cell Phone" required>
            <input type="tel" value={parent1.phone} onChange={(e) => setParent1({ ...parent1, phone: e.target.value })} required />
          </Field>
          <Field label="Email" required>
            <input type="email" value={parent1.email} onChange={(e) => setParent1({ ...parent1, email: e.target.value })} required />
          </Field>
          <Field label="Parent / Guardian 2 First Name">
            <input value={parent2.firstName} onChange={(e) => setParent2({ ...parent2, firstName: e.target.value })} />
          </Field>
          <Field label="Last Name">
            <input value={parent2.lastName} onChange={(e) => setParent2({ ...parent2, lastName: e.target.value })} />
          </Field>
          <Field label="Cell Phone">
            <input type="tel" value={parent2.phone} onChange={(e) => setParent2({ ...parent2, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" value={parent2.email} onChange={(e) => setParent2({ ...parent2, email: e.target.value })} />
          </Field>
        </div>
      </FormSection>

      {/* Jewish background */}
      <FormSection title="Child's Jewish Background" description="Mother and father information helps us understand each child's Jewish background with care and accuracy.">
        <div className="grid md:grid-cols-2 gap-5.5">
          <StatusBox
            label="Mother"
            status={motherStatus}
            onStatusChange={setMotherStatus}
            org={motherConversionOrg}
            onOrgChange={setMotherConversionOrg}
            rabbi={motherConversionRabbi}
            onRabbiChange={setMotherConversionRabbi}
          />
          <StatusBox
            label="Father"
            status={fatherStatus}
            onStatusChange={setFatherStatus}
            org={fatherConversionOrg}
            onOrgChange={setFatherConversionOrg}
            rabbi={fatherConversionRabbi}
            onRabbiChange={setFatherConversionRabbi}
          />
        </div>
      </FormSection>

      {/* Address & emergency */}
      <FormSection title="Address & Emergency">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Street Address" required className="md:col-span-2">
            <input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} required />
          </Field>
          <Field label="City" required>
            <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} required />
          </Field>
          <Field label="State" required>
            <input value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} required />
          </Field>
          <Field label="ZIP" required>
            <input value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} required />
          </Field>
          <Field label="Emergency Contact" required>
            <input value={emergency.contact} onChange={(e) => setEmergency({ ...emergency, contact: e.target.value })} required />
          </Field>
          <Field label="Emergency Phone" required>
            <input type="tel" value={emergency.phone} onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })} required />
          </Field>
        </div>
      </FormSection>

      {/* Tuition & payment */}
      <FormSection title="Tuition & Payment">
        <div className="grid md:grid-cols-2 gap-4.5 mb-5">
          <div className="bg-soft border border-line rounded-[18px] p-5.5">
            <span className="text-gold text-[0.74rem] font-extrabold uppercase tracking-wider">
              Tuition
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[2.2rem] text-navy font-extrabold leading-none">
                ${BMX_MONTHLY_TUITION}
              </span>
              <span className="text-[1rem] font-bold text-gold uppercase tracking-[0.12em] leading-none">
                / month
              </span>
            </div>
            <div className="text-muted text-[0.85rem] mt-2">
              Every Thursday · {BMX_SESSION_MONTHS}-month program (Sep–May)
            </div>
          </div>
          <div className="bg-soft border border-gold rounded-[18px] p-5.5">
            <span className="text-gold text-[0.74rem] font-extrabold uppercase tracking-wider">
              Chai Partner Benefit
            </span>
            <div className="text-[2.2rem] text-navy font-extrabold leading-none">
              1 month off
            </div>
            <div className="text-muted text-[0.85rem]">
              ${BMX_CHAI_DISCOUNT} for HaBayit Chai Partners with a valid code
            </div>
          </div>
        </div>

        {isBmxEarlyBirdActive() && (
          <div className="bg-soft border border-gold rounded-[18px] px-5 py-4 mb-5 text-[0.92rem] text-navy">
            <strong>Early registration:</strong> ${BMX_EARLY_BIRD_DISCOUNT} off when you sign up
            by {BMX_EARLY_BIRD_DEADLINE_LABEL}.
          </div>
        )}

        <div className="border border-line rounded-[18px] p-5">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={isChaiPartner}
              onChange={(e) => setIsChaiPartner(e.target.checked)}
              className="mt-1"
            />
            <span className="text-[1rem] font-bold text-navy">
              I am a HaBayit Chai Partner
              <span className="block text-muted text-[0.9rem] font-normal mt-0.5">
                HaBayit Chai Partners receive 1 month off (${BMX_CHAI_DISCOUNT}) with a valid
                code.{' '}
                <a href="/chai-partner" className="text-gold font-semibold">
                  Become a Chai Partner
                </a>
              </span>
            </span>
          </label>
          {isChaiPartner && (
            <div className="mt-4 pt-4 border-t border-line">
              <Field label="Chai Partner Discount Code" required>
                <input
                  value={chaiCode}
                  onChange={(e) => setChaiCode(e.target.value.toUpperCase())}
                  placeholder="HABAYIT-XXXXXX"
                />
              </Field>
            </div>
          )}
        </div>

        <div className="mt-5">
          <Field label="Payment plan" required>
            <select
              value={paymentPlan}
              onChange={(e) => setPaymentPlan(e.target.value as BmxPaymentPlan)}
              required
            >
              {PAYMENT_PLAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.title} — {option.description}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-muted text-[0.85rem] mt-2">
            {PAYMENT_PLAN_OPTIONS.find((option) => option.value === paymentPlan)?.description}
          </p>
        </div>

        <p className="text-[0.78rem] font-bold uppercase tracking-wide text-navy mt-6 mb-3">
          Payment Method
        </p>
        <p className="text-muted text-[0.85rem] mb-3">
          Choose bank or card below — the matching secure Stripe fields appear right away. Nothing
          is charged until your registration is accepted.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <PaymentOption
            selected={paymentMethod === 'bank'}
            onSelect={() => selectPaymentMethod('bank')}
            title="Bank Account (ACH)"
            description="No extra fee. Pay directly from your bank via Stripe."
          />
          <PaymentOption
            selected={paymentMethod === 'card'}
            onSelect={() => selectPaymentMethod('card')}
            title="Credit Card"
            description={`${BMX_CARD_PROCESSING_RATE * 100}% processing fee added to tuition.`}
          />
        </div>

        <div className="bg-soft border border-line rounded-[18px] p-5 mt-5">
          <p className="text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-2">
            Estimated Tuition Summary
          </p>
          <div className="flex justify-between py-2 border-b border-black/[0.06] text-muted">
            <span>Program tuition</span>
            <strong className="tabular-nums">
              $
              {getBmxSessionTuition(isChaiPartner, 'two_installments', {
                earlyBird: false,
              }).toLocaleString()}
            </strong>
          </div>
          {isBmxEarlyBirdActive() && (
            <div className="flex justify-between py-2 border-b border-black/[0.06] text-muted">
              <span>Early registration (by {BMX_EARLY_BIRD_DEADLINE_LABEL})</span>
              <strong className="tabular-nums">-${BMX_EARLY_BIRD_DISCOUNT}</strong>
            </div>
          )}
          {paymentPlan === 'full' && (
            <div className="flex justify-between py-2 border-b border-black/[0.06] text-muted">
              <span>Pay-in-full discount</span>
              <strong className="tabular-nums">-${BMX_PAY_IN_FULL_DISCOUNT}</strong>
            </div>
          )}
          {paymentMethod === 'card' && (
            <div className="flex justify-between py-2 border-b border-black/[0.06] text-muted">
              <span>Card processing fee ({BMX_CARD_PROCESSING_RATE * 100}%)</span>
              <strong className="tabular-nums">
                +${formatCurrency(getBmxCardProcessingFee(calculateTuitionSubtotal(), 'card'))}
              </strong>
            </div>
          )}
          {paymentMethod && (
            <div className="py-2.5 border-b border-black/[0.06] text-muted text-[0.88rem]">
              <span className="block font-semibold text-navy mb-1.5">Payment schedule</span>
              {getBmxInstallmentAmounts(
                calculateTuitionSubtotal(),
                paymentMethod,
                paymentPlan
              ).map((amount, i, arr) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span>
                    Payment {i + 1} of {arr.length}
                    {paymentPlan === 'full' || i === 0
                      ? ' — upon acceptance'
                      : ' — by November 1'}
                  </span>
                  <strong className="tabular-nums">${formatCurrency(amount)}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between pt-3.5 font-black text-navy text-[1.1rem]">
            <span>{paymentMethod === 'card' ? 'Estimated Total (incl. fee)' : 'Estimated Total'}</span>
            <strong className="tabular-nums">${formatCurrency(calculateTotal())}</strong>
          </div>
        </div>

        {paymentMethod && (
          <div className="mt-5 border border-line rounded-[18px] p-5 bg-white">
            <HebrewAdventurePaymentSetup
              ref={paymentSetupRef}
              email={parent1.email}
              name={`${parent1.firstName} ${parent1.lastName}`.trim()}
              paymentMethod={paymentMethod}
              onError={handlePaymentSetupError}
              returnUrl={
                typeof window !== 'undefined'
                  ? `${window.location.origin}/bar-mitzvah/register?setup=complete`
                  : '/bar-mitzvah/register?setup=complete'
              }
            />
            <p className="text-center text-[0.75rem] text-muted mt-4">
              Secured by Stripe. HaBayit never stores your full account or card numbers.
            </p>
          </div>
        )}
      </FormSection>

      {/* Policies */}
      <FormSection title="Policies & Agreement">
        <div className="border border-line rounded-2xl p-4.5 bg-soft text-[0.9rem] space-y-3.5">
          <PolicyBlock title="Enrollment">
            Registration is considered complete once all required forms have been submitted and
            your child&apos;s registration has been accepted. Enrollment is for the full school
            year.
          </PolicyBlock>
          <PolicyBlock title="Tuition & Payments">
            Tuition is non-refundable once registration has been accepted. Your selected payment
            method (credit card or bank account) will be charged according to the payment plan
            selected. A {BMX_CARD_PROCESSING_RATE * 100}% processing fee applies to
            credit card payments only; bank (ACH) payments have no extra fee. You will not be
            charged until registration has been reviewed and accepted.
          </PolicyBlock>
          <PolicyBlock title="Attendance">
            Refunds or credits cannot be provided for missed classes due to illness, vacations,
            holidays, or other absences.
          </PolicyBlock>
          <PolicyBlock title="Medical Emergencies">
            In the event of a medical emergency, {BMX_NAME} staff will make every
            reasonable effort to contact a parent or emergency contact. If necessary, emergency
            medical services may be contacted.
          </PolicyBlock>
          <PolicyBlock title="Photography">
            Unless otherwise requested in writing, you grant permission for HaBayit to photograph
            or record your child during {BMX_NAME} and related activities. Children&apos;s
            last names will not be published.
          </PolicyBlock>
        </div>

        <div className="mt-5">
          <label className="flex items-start gap-2.5 text-[0.95rem]">
            <input
              type="checkbox"
              checked={agreedPolicies}
              onChange={(e) => setAgreedPolicies(e.target.checked)}
              className="mt-1"
              required
            />
            I have read and agree to the {BMX_NAME} Policies above.
          </label>
        </div>

        <div className="mt-5">
          <Field label="Notes or Special Requests">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything you'd like us to know regarding your child(ren) or registration."
              rows={3}
            />
          </Field>
        </div>
      </FormSection>

      <div className="bg-soft border border-line text-muted rounded-2xl px-5 py-4 text-[0.9rem]">
        Complete the payment section above, then submit. Stripe saves your card or bank account
        securely; charges begin only after we accept your registration.
      </div>

      {submitError && (
        <div className="bg-[#fdecea] border border-[#f3c4c0] text-danger rounded-2xl px-5 py-4">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-gold text-white rounded-full px-6 py-4.5 font-black uppercase tracking-wider disabled:opacity-60"
      >
        {submitting ? 'Submitting...' : 'Submit Registration'}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
        {label} {required && <span className="text-gold">*</span>}
        {hint && <span className="ml-1.5 normal-case font-normal text-muted text-[0.7rem]">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-line rounded-[22px] p-7.5">
      <div className="border-b border-line pb-3.5 mb-5.5">
        <h2 className="text-[1.9rem] text-navy font-bold leading-none">{title}</h2>
        {description && <p className="text-muted text-[0.9rem] mt-2">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusBox({
  label,
  status,
  onStatusChange,
  org,
  onOrgChange,
  rabbi,
  onRabbiChange,
}: {
  label: string;
  status: string;
  onStatusChange: (v: string) => void;
  org: string;
  onOrgChange: (v: string) => void;
  rabbi: string;
  onRabbiChange: (v: string) => void;
}) {
  return (
    <div className="bg-soft border border-line rounded-2xl p-5">
      <h3 className="text-navy font-bold text-[1.4rem] mb-3.5">{label}</h3>
      <Field label="Jewish Status" required>
        <select value={status} onChange={(e) => onStatusChange(e.target.value)} required>
          <option value="">Select</option>
          <option value="jewish_by_birth">Jewish by birth</option>
          <option value="jewish_by_conversion">Jewish by conversion</option>
          <option value="not_jewish">Not Jewish</option>
        </select>
      </Field>
      {status === 'jewish_by_conversion' && (
        <div className="mt-3.5 space-y-3.5">
          <Field label="Conversion Beit Din / Organization" required>
            <input value={org} onChange={(e) => onOrgChange(e.target.value)} required />
          </Field>
          <Field label="Certifying Rabbi" required>
            <input value={rabbi} onChange={(e) => onRabbiChange(e.target.value)} required />
          </Field>
        </div>
      )}
    </div>
  );
}

function PaymentOption({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left border rounded-2xl p-4.5 transition-all ${
        selected ? 'border-gold bg-soft shadow-[0_0_0_2px_var(--color-gold)]' : 'border-line bg-white'
      }`}
    >
      <div className="font-bold text-navy">{title}</div>
      <div className="text-muted text-[0.85rem] mt-1">{description}</div>
    </button>
  );
}

function PolicyBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-navy font-bold text-[1.1rem] mb-1">{title}</h3>
      <p>{children}</p>
    </div>
  );
}
