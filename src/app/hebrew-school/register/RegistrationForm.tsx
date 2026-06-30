'use client';

import { useState } from 'react';
import { submitHebrewSchoolRegistration, type ChildInput, type RegistrationInput } from './actions';

const emptyChild: ChildInput = {
  firstName: '',
  lastName: '',
  hebrewName: '',
  dateOfBirth: '',
  bornBeforeSunset: '',
  grade: '',
  schoolAttending: '',
  attendedBefore: '',
  hebrewLevel: '',
  allergies: '',
};

const GRADES = ['K', '1st', '2nd', '3rd', '4th', '5th'];

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
  const [paymentPlan, setPaymentPlan] = useState<'full' | 'two_installments' | ''>('');
  const [agreedPolicies, setAgreedPolicies] = useState(false);
  const [agreedPhoto, setAgreedPhoto] = useState(false);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function updateChild(index: number, field: keyof ChildInput, value: string) {
    setChildren((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addChild() {
    setChildren((prev) => [...prev, { ...emptyChild }]);
  }

  function removeChild(index: number) {
    setChildren((prev) => prev.filter((_, i) => i !== index));
  }

  function calculateTotal() {
    const base = isChaiPartner ? 1000 : 1100;
    return children.reduce((total, _, i) => {
      const discount = i === 1 ? 50 : i >= 2 ? 75 : 0;
      return total + (base - discount);
    }, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (!agreedPolicies) {
      setSubmitError('You must agree to the enrollment policies to continue.');
      return;
    }
    if (!paymentPlan) {
      setSubmitError('Please select a payment plan.');
      return;
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
      agreedToPolicies: agreedPolicies,
      agreedToPhotoPermission: agreedPhoto,
      notes,
    };

    setSubmitting(true);
    const result = await submitHebrewSchoolRegistration(input);
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
          Your Hebrew School registration has been submitted. Once it&apos;s reviewed, you&apos;ll
          receive a confirmation email with next steps, including payment.
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
            <h3 className="font-display text-[1.1rem] text-gold">Child #{i + 1}</h3>
            {i > 0 && (
              <button
                type="button"
                onClick={() => removeChild(i)}
                className="text-[0.78rem] text-muted underline hover:text-danger"
              >
                Remove
              </button>
            )}
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
            <Field label="Was your child born before or after sunset?" hint="(for Hebrew birthday)" required>
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
              <Field label="Attended Hebrew School Before?" required>
                <select
                  value={child.attendedBefore}
                  onChange={(e) => updateChild(i, 'attendedBefore', e.target.value)}
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

      <div className="bg-soft border border-dashed border-[#d8cab3] rounded-[18px] p-4.5 text-center">
        <button
          type="button"
          onClick={addChild}
          className="bg-navy text-white rounded-full px-5.5 py-3 font-extrabold tracking-wide"
        >
          + Add Another Child
        </button>
        <p className="text-muted text-[0.87rem] mt-3">
          <strong>Sibling Discount:</strong> 2nd child receives $50 off. 3rd and additional
          children receive $75 off each.
        </p>
      </div>

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
              Annual Tuition
            </span>
            <div className="text-[2.2rem] text-navy font-extrabold leading-none">$1,100</div>
            <div className="text-muted text-[0.85rem]">per student</div>
          </div>
          <div className="bg-soft border border-line rounded-[18px] p-5.5">
            <span className="text-gold text-[0.74rem] font-extrabold uppercase tracking-wider">
              Chai Partner Tuition
            </span>
            <div className="text-[2.2rem] text-navy font-extrabold leading-none">$1,000</div>
            <div className="text-muted text-[0.85rem]">with a valid discount code</div>
          </div>
        </div>

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
                Chai Partners receive the discounted $1,000 tuition rate with a valid code.{' '}
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

        <div className="grid md:grid-cols-2 gap-4 mt-5">
          <PaymentOption
            selected={paymentPlan === 'full'}
            onSelect={() => setPaymentPlan('full')}
            title="Pay in Full"
            description="Charged upon acceptance."
          />
          <PaymentOption
            selected={paymentPlan === 'two_installments'}
            onSelect={() => setPaymentPlan('two_installments')}
            title="Two-Payment Plan"
            description="50% upon acceptance. Balance charged January 1."
          />
        </div>

        <div className="bg-soft border border-line rounded-[18px] p-5 mt-5">
          <p className="text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-2">
            Estimated Tuition Summary
          </p>
          {children.map((_, i) => {
            const base = isChaiPartner ? 1000 : 1100;
            const discount = i === 1 ? 50 : i >= 2 ? 75 : 0;
            return (
              <div key={i} className="flex justify-between py-2 border-b border-black/[0.06] text-muted">
                <span>
                  Child {i + 1}
                  {discount ? ` (sibling discount: -$${discount})` : ''}
                </span>
                <strong className="tabular-nums">${(base - discount).toLocaleString()}</strong>
              </div>
            );
          })}
          <div className="flex justify-between pt-3.5 font-black text-navy text-[1.1rem]">
            <span>Estimated Total</span>
            <strong className="tabular-nums">${calculateTotal().toLocaleString()}</strong>
          </div>
        </div>
      </FormSection>

      {/* Policies */}
      <FormSection title="Policies & Agreement">
        <div className="h-[230px] overflow-auto border border-line rounded-2xl p-4.5 bg-soft text-[0.9rem] space-y-3.5">
          <PolicyBlock title="Enrollment">
            Registration is considered complete once all required forms have been submitted and
            your child&apos;s registration has been accepted. Enrollment is for the full school
            year.
          </PolicyBlock>
          <PolicyBlock title="Tuition & Payments">
            Tuition is non-refundable once registration has been accepted. Your selected payment
            method will be charged according to the payment option selected. Your card will not be
            charged until registration has been reviewed and accepted.
          </PolicyBlock>
          <PolicyBlock title="Attendance">
            Refunds or credits cannot be provided for missed classes due to illness, vacations,
            holidays, or other absences.
          </PolicyBlock>
          <PolicyBlock title="Medical Emergencies">
            In the event of a medical emergency, HaBayit Hebrew School staff will make every
            reasonable effort to contact a parent or emergency contact. If necessary, emergency
            medical services may be contacted.
          </PolicyBlock>
          <PolicyBlock title="Photography">
            Unless otherwise requested in writing, you grant permission for HaBayit to photograph
            or record your child during Hebrew School and related activities. Children&apos;s
            last names will not be published.
          </PolicyBlock>
        </div>

        <div className="space-y-3.5 mt-5">
          <label className="flex items-start gap-2.5 text-[0.95rem]">
            <input
              type="checkbox"
              checked={agreedPolicies}
              onChange={(e) => setAgreedPolicies(e.target.checked)}
              className="mt-1"
              required
            />
            I have read and agree to the HaBayit Hebrew School Policies above.
          </label>
          <label className="flex items-start gap-2.5 text-[0.95rem]">
            <input
              type="checkbox"
              checked={agreedPhoto}
              onChange={(e) => setAgreedPhoto(e.target.checked)}
              className="mt-1"
            />
            I give permission for my child(ren) to be photographed for HaBayit publications,
            social media, and our website.
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

      <div className="bg-[#fff8e6] border border-[#ead8a4] text-[#5c4916] rounded-2xl px-5 py-4 font-semibold">
        <strong>Note:</strong> Payment collection will be set up once Stripe is connected — your
        registration is fully recorded now and you&apos;ll be contacted with payment details.
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
          <Field label="Beit Din">
            <input value={org} onChange={(e) => onOrgChange(e.target.value)} />
          </Field>
          <Field label="Rabbi Who Certified">
            <input value={rabbi} onChange={(e) => onRabbiChange(e.target.value)} />
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
