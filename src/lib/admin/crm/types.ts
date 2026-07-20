import type {
  ChaiPartner,
  Contact,
  Donation,
  EventRegistration,
  FormSubmission,
  ImportantDate,
  Payment,
  Parent,
  Child,
  ProgramRegistration,
  Waiver,
} from '@/types/database';

export type CrmView =
  | 'activity'
  | 'contacts'
  | 'events'
  | 'applications'
  | 'rsvps'
  | 'donations'
  | 'chai'
  | 'payments'
  | 'dates'
  | 'submissions';

export type DateFilter = 'all' | '7d' | '30d' | '90d' | 'year';

export type CrmFamilyRecord = {
  id: string;
  familyName: string;
  address: string | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  stripeCustomerId: string | null;
  paymentMethodPreference: string | null;
  createdAt: string;
  parents: Parent[];
  children: Child[];
  registrations: Array<
    ProgramRegistration & {
      programName: string;
      programSlug: string;
      childName: string;
    }
  >;
};

export type CrmLeadRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  interest: string | null;
  message: string | null;
  isResolved: boolean;
  createdAt: string;
};

export type CrmProgramTrackSnapshot = {
  id: string;
  programSlug: string;
  tabLabel: string;
  fullName: string;
  registrationPath?: string;
  applicationCount: number;
  pendingCount: number;
  leadCount: number;
  formSubmissionCount: number;
};

export type CrmRsvpRecord = EventRegistration & {
  eventTitle: string;
};

export type CrmEventRecord = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  location: string | null;
  dateLabel: string | null;
  time: string | null;
  program: string | null;
  rsvpCount: number;
  guestTotal: number;
  rsvps: CrmRsvpRecord[];
};

export type CrmActivityItem = {
  id: string;
  type: 'contact' | 'donation' | 'chai' | 'family' | 'payment' | 'rsvp';
  title: string;
  subtitle: string;
  email: string | null;
  amount: number | null;
  status: string | null;
  createdAt: string;
  recordId: string;
};

export type CrmStats = {
  contacts: number;
  contactsOpen: number;
  donations: number;
  donationsTotal: number;
  chaiPartners: number;
  chaiMonthlyTotal: number;
  families: number;
  applications: number;
  pendingRegistrations: number;
  events: number;
  rsvps: number;
  importantDates: number;
  formSubmissions: number;
  payments: number;
  paymentsTotal: number;
};

export type CrmSnapshot = {
  stats: CrmStats;
  contacts: Contact[];
  donations: Donation[];
  chaiPartners: ChaiPartner[];
  families: CrmFamilyRecord[];
  /** All program application tracks (tabs under Applications). */
  programTracks: CrmProgramTrackSnapshot[];
  applicationsByProgram: Record<string, CrmFamilyRecord[]>;
  leadsByProgram: Record<string, CrmLeadRecord[]>;
  events: CrmEventRecord[];
  rsvps: CrmRsvpRecord[];
  payments: Payment[];
  importantDates: ImportantDate[];
  formSubmissions: FormSubmission[];
  waiversByFamily: Record<string, Waiver[]>;
};
