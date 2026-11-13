import { requireCapability } from '@/lib/admin/auth';
import { ReceiptCorrectionForm } from './ReceiptCorrectionForm';
export const metadata = { title: 'Admin receipt correction', robots: { index: false, follow: false } };
export default async function Page() {
  if (!(await requireCapability('crm_finance'))) return <main className="p-8">Finance admin sign-in required.</main>;
  return <main className="max-w-2xl mx-auto p-8"><h1 className="text-2xl mb-4">Correct one existing receipt</h1><p className="mb-4">Preview the company and receipt memo from the saved donation. No email is sent. The existing URL stays the same. Amount, method and date must match.</p><ReceiptCorrectionForm /></main>;
}
