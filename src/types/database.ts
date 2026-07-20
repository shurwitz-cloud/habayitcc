// ============================================================
// HaBayit — Database Types
// Mirrors the Supabase schema in supabase/migrations/0001_initial_schema.sql
// Once Supabase CLI type generation is wired up, this file can be
// replaced by `supabase gen types typescript`, but is hand-written
// for Phase 1 so the app can be typed before a live project exists.
// ============================================================

export interface Family {
  [key: string]: unknown;
  id: string;
  family_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  payment_method_preference: string | null;
  created_at: string;
  updated_at: string;
}

export type JewishStatus = 'jewish_by_birth' | 'jewish_by_conversion' | 'not_jewish';

export interface Parent {
  [key: string]: unknown;
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
  [key: string]: unknown;
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  hebrew_name: string | null;
  date_of_birth: string | null;
  born_before_sunset: boolean | null;
  born_sunset_timing: string | null;
  grade: string | null;
  school_attending: string | null;
  attended_before: string | null;
  hebrew_level: string | null;
  allergies: string | null;
  medications: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Program {
  [key: string]: unknown;
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RegistrationStatus = 'pending' | 'accepted' | 'active' | 'withdrawn';
export type PaymentPlan = 'full' | 'two_installments' | 'three_installments' | 'custom';

export interface ProgramRegistration {
  [key: string]: unknown;
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
  [key: string]: unknown;
  id: string;
  slug: string | null;
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
  [key: string]: unknown;
  id: string;
  event_id: string;
  event_slug: string | null;
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
  [key: string]: unknown;
  id: string;
  family_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  amount: number;
  dedication_name: string | null;
  dedication_type: DedicationType | null;
  memo: string | null;
  campaign: string | null;
  donation_type: string | null;
  stripe_payment_intent_id: string | null;
  status: PaymentStatus;
  created_at: string;
}

export type ChaiPartnerStatus = 'active' | 'paused' | 'cancelled';

export interface ChaiPartner {
  [key: string]: unknown;
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
  [key: string]: unknown;
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

export interface TuitionInstallment {
  [key: string]: unknown;
  id: string;
  family_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: string;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Contact {
  [key: string]: unknown;
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
  [key: string]: unknown;
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  source: string | null;
  is_subscribed: boolean;
  created_at: string;
}

export interface StaffNote {
  [key: string]: unknown;
  id: string;
  notable_type: string;
  notable_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
}

export interface Attendance {
  [key: string]: unknown;
  id: string;
  program_registration_id: string | null;
  event_registration_id: string | null;
  attended_on: string;
  was_present: boolean;
  notes: string | null;
  created_at: string;
}

export interface Waiver {
  [key: string]: unknown;
  id: string;
  family_id: string | null;
  child_id: string | null;
  waiver_type: string;
  signed_by: string;
  signed_at: string;
  document_version: string | null;
}

export interface Sponsor {
  [key: string]: unknown;
  id: string;
  name: string;
  contact_email: string | null;
  sponsorship_type: string | null;
  amount: number | null;
  notes: string | null;
  created_at: string;
}

export type ImportantDateType = 'birthday' | 'yahrzeit' | 'anniversary' | 'other';

export interface ImportantDate {
  [key: string]: unknown;
  id: string;
  family_id: string | null;
  parent_id: string | null;
  child_id: string | null;
  label: string;
  date_type: ImportantDateType | string;
  gregorian_date: string | null;
  hebrew_date: string | null;
  hebrew_year: string | null;
  notes: string | null;
  notify_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  [key: string]: unknown;
  id: string;
  form_type: string;
  source_id: string | null;
  email: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Supabase Database type — used to type the Supabase client.
// Extend this as tables are added.
//
// Note: Insert types omit server-generated fields (id, created_at,
// updated_at) since those should never be supplied by calling code.
// ============================================================
type Insertable<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

export interface SiteImageSlotRow {
  [key: string]: unknown;
  slot_id: string;
  src: string | null;
  images: unknown | null;
  focal_x: number;
  focal_y: number;
  zoom: number;
  updated_at: string;
}

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '13';
  };
  public: {
    Tables: {
      families: { Row: Family; Insert: Insertable<Family>; Update: Partial<Insertable<Family>> };
      parents: { Row: Parent; Insert: Insertable<Parent>; Update: Partial<Insertable<Parent>> };
      children: { Row: Child; Insert: Insertable<Child>; Update: Partial<Insertable<Child>> };
      programs: { Row: Program; Insert: Insertable<Program>; Update: Partial<Insertable<Program>> };
      program_registrations: {
        Row: ProgramRegistration;
        Insert: Insertable<ProgramRegistration>;
        Update: Partial<Insertable<ProgramRegistration>>;
      };
      events: { Row: Event; Insert: Insertable<Event>; Update: Partial<Insertable<Event>> };
      event_registrations: {
        Row: EventRegistration;
        Insert: Insertable<EventRegistration>;
        Update: Partial<Insertable<EventRegistration>>;
      };
      donations: { Row: Donation; Insert: Insertable<Donation>; Update: Partial<Insertable<Donation>> };
      chai_partners: {
        Row: ChaiPartner;
        Insert: Insertable<ChaiPartner>;
        Update: Partial<Insertable<ChaiPartner>>;
      };
      payments: { Row: Payment; Insert: Insertable<Payment>; Update: Partial<Insertable<Payment>> };
      tuition_installments: {
        Row: TuitionInstallment;
        Insert: Insertable<TuitionInstallment>;
        Update: Partial<Insertable<TuitionInstallment>>;
      };
      contacts: { Row: Contact; Insert: Insertable<Contact>; Update: Partial<Insertable<Contact>> };
      email_subscribers: {
        Row: EmailSubscriber;
        Insert: Insertable<EmailSubscriber>;
        Update: Partial<Insertable<EmailSubscriber>>;
      };
      staff_notes: {
        Row: StaffNote;
        Insert: Insertable<StaffNote>;
        Update: Partial<Insertable<StaffNote>>;
      };
      attendance: {
        Row: Attendance;
        Insert: Insertable<Attendance>;
        Update: Partial<Insertable<Attendance>>;
      };
      waivers: { Row: Waiver; Insert: Insertable<Waiver>; Update: Partial<Insertable<Waiver>> };
      sponsors: { Row: Sponsor; Insert: Insertable<Sponsor>; Update: Partial<Insertable<Sponsor>> };
      important_dates: {
        Row: ImportantDate;
        Insert: Insertable<ImportantDate>;
        Update: Partial<Insertable<ImportantDate>>;
      };
      form_submissions: {
        Row: FormSubmission;
        Insert: Omit<FormSubmission, 'id' | 'created_at'>;
        Update: Partial<Omit<FormSubmission, 'id' | 'created_at'>>;
      };
      site_image_slots: {
        Row: SiteImageSlotRow;
        Insert: Insertable<SiteImageSlotRow>;
        Update: Partial<Insertable<SiteImageSlotRow>>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
