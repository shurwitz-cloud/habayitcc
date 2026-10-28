import { redirect } from 'next/navigation';
import { BLOOM_PATH } from '@/lib/programs/names';

/** Legacy Bat Mitzvah club URL — Bloom is the program home. */
export default function BatMitzvahRedirectPage() {
  redirect(BLOOM_PATH);
}
