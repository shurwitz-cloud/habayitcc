// ============================================================
// HaBayit — Database Types
// Mirrors the Supabase schema in supabase/migrations/0001_initial_schema.sql
// Once Supabase CLI type generation is wired up, this file can be
// replaced by `supabase gen types typescript`, but is hand-written
// for Phase 1 so the app can be typed before a live project exists.
// ============================================================

export interface Family {
  id: string;
  family_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type JewishStatus = 'jewish_by_birth' | 'jewish_by_conversion' | 'not_jewish';

export interface Parent {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  jewish_status: string | null;
  conversion_org: string | null;
  conversion_rabbi: string | null;
  is_primary_contact: boolean;
  created_at: string;
  updated_at: string;
}

export interface Child {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  hebrew_name: string | null;
  date_of_birth: string | null;
  born_before_sunset: boolean | null;
  grade: string | null;
  school_attending: string | null;
  allergies: string | null;
  medications: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RegistrationStatus = 'pending' | 'accepted' | 'active' | 'withdrawn';
export type PaymentPlan = 'full' | 'two_installments' | 'custom';

export interface ProgramRegistration {
  id: string;
  program_id: string;
  child_id: string;
  family_id: string;
  term: string | null;
  status: RegistrationStatus;
  is_chai_partner_rate: boolean;
  chai_partner_code_used: string | null;
  payment_plan: PaymentPlan | null;
  tuition_total: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  family_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  guest_count: number;
  notes: string | null;
  created_at: string;
}

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type DedicationType = 'honor' | 'memory';

export interface Donation {
  id: string;
  family_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  amount: number;
  dedication_name: string | null;
  dedication_type: DedicationType | null;
  stripe_payment_intent_id: string | null;
  status: PaymentStatus;
  created_at: string;
}

export type ChaiPartnerStatus = 'active' | 'paused' | 'cancelled';

export interface ChaiPartner {
  id: string;
  family_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  monthly_amount: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  access_code: string | null;
  status: ChaiPartnerStatus;
  created_at: string;
  updated_at: string;
}

export type PaymentSourceType = 'donation' | 'chai_partner' | 'program_registration';

export interface Payment {
  id: string;
  source_type: PaymentSourceType;
  source_id: string;
  amount: number;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  interest: string | null;
  message: string | null;
  is_resolved: boolean;
  created_at: string;
}

export interface EmailSubscriber {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  source: string | null;
  is_subscribed: boolean;
  created_at: string;
}

export interface StaffNote {
  id: string;
  notable_type: string;
  notable_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  program_registration_id: string | null;
  event_registration_id: string | null;
  attended_on: string;
  was_present: boolean;
  notes: string | null;
  created_at: string;
}

export interface Waiver {
  id: string;
  family_id: string | null;
  child_id: string | null;
  waiver_type: string;
  signed_by: string;
  signed_at: string;
  document_version: string | null;
}

export interface Sponsor {
  id: string;
  name: string;
  contact_email: string | null;
  sponsorship_type: string | null;
  amount: number | null;
  notes: string | null;
  created_at: string;
}

// ============================================================
// Supabase Database type — used to type the Supabase client.
// Extend this as tables are added.
// ============================================================
export interface Database {
  public: {
    Tables: {
      families: { Row: Family; Insert: Partial<Family>; Update: Partial<Family> };
      parents: { Row: Parent; Insert: Partial<Parent>; Update: Partial<Parent> };
      children: { Row: Child; Insert: Partial<Child>; Update: Partial<Child> };
      programs: { Row: Program; Insert: Partial<Program>; Update: Partial<Program> };
      program_registrations: {
        Row: ProgramRegistration;
        Insert: Partial<ProgramRegistration>;
        Update: Partial<ProgramRegistration>;
      };
      events: { Row: Event; Insert: Partial<Event>; Update: Partial<Event> };
      event_registrations: {
        Row: EventRegistration;
        Insert: Partial<EventRegistration>;
        Update: Partial<EventRegistration>;
      };
      donations: { Row: Donation; Insert: Partial<Donation>; Update: Partial<Donation> };
      chai_partners: { Row: ChaiPartner; Insert: Partial<ChaiPartner>; Update: Partial<ChaiPartner> };
      payments: { Row: Payment; Insert: Partial<Payment>; Update: Partial<Payment> };
      contacts: { Row: Contact; Insert: Partial<Contact>; Update: Partial<Contact> };
      email_subscribers: {
        Row: EmailSubscriber;
        Insert: Partial<EmailSubscriber>;
        Update: Partial<EmailSubscriber>;
      };
      staff_notes: { Row: StaffNote; Insert: Partial<StaffNote>; Update: Partial<StaffNote> };
      attendance: { Row: Attendance; Insert: Partial<Attendance>; Update: Partial<Attendance> };
      waivers: { Row: Waiver; Insert: Partial<Waiver>; Update: Partial<Waiver> };
      sponsors: { Row: Sponsor; Insert: Partial<Sponsor>; Update: Partial<Sponsor> };
    };
  };
}
