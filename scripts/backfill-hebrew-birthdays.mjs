/**
 * Backfill Hebrew birthdays for children with date_of_birth from Hebcal.
 *
 * Usage:
 *   npx vercel env run -e production -- node scripts/backfill-hebrew-birthdays.mjs
 *   node scripts/backfill-hebrew-birthdays.mjs --dry-run
 *   node scripts/backfill-hebrew-birthdays.mjs --force
 */
import { createClient } from '@supabase/supabase-js';

const DELAY_MS = 120;
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');

function loadEnvKey(name) {
  const v = process.env[name]?.trim();
  if (!v || v.includes('[SENSITIVE') || v.length < 20) return null;
  return v;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAfterSunset(bornSunsetTiming, bornBeforeSunset) {
  if (bornSunsetTiming === 'after') {
    return { afterSunset: true, timingUsed: 'after' };
  }
  if (bornSunsetTiming === 'before') {
    return { afterSunset: false, timingUsed: 'before' };
  }
  if (bornBeforeSunset === false) {
    return { afterSunset: true, timingUsed: 'after' };
  }
  return { afterSunset: false, timingUsed: 'before' };
}

function isSunsetTimingUnknown(bornSunsetTiming) {
  return !bornSunsetTiming || bornSunsetTiming === 'unknown' || bornSunsetTiming === '';
}

function formatHebrewBirthdayRange(before, after) {
  if (before.hm === after.hm && before.hy === after.hy) {
    return {
      english: `${before.hd}/${after.hd} ${before.hm} ${before.hy}`,
      hebrew: `${before.hebrew} / ${after.hebrew}`,
      hebrewYear: after.hebrewYear,
    };
  }

  return {
    english: `${before.english} / ${after.english}`,
    hebrew: `${before.hebrew} / ${after.hebrew}`,
    hebrewYear: after.hebrewYear,
  };
}

async function lookupHebrewBirthday(child) {
  if (isSunsetTimingUnknown(child.born_sunset_timing)) {
    const before = await convertGregorianToHebrewBirthday(child.date_of_birth, false);
    const after = await convertGregorianToHebrewBirthday(child.date_of_birth, true);
    if (!before && !after) return null;
    if (!before) return { ...after, timingUsed: 'unknown' };
    if (!after) return { ...before, timingUsed: 'unknown' };
    if (before.hd === after.hd && before.hm === after.hm && before.hy === after.hy) {
      return { ...before, timingUsed: 'same_either_way' };
    }
    return { ...formatHebrewBirthdayRange(before, after), timingUsed: 'unknown' };
  }

  const { afterSunset, timingUsed } = resolveAfterSunset(
    child.born_sunset_timing,
    child.born_before_sunset,
  );
  const result = await convertGregorianToHebrewBirthday(child.date_of_birth, afterSunset);
  if (!result) return null;
  return { ...result, timingUsed };
}

async function convertGregorianToHebrewBirthday(gregorianDate, afterSunset) {
  const params = new URLSearchParams({
    cfg: 'json',
    date: gregorianDate,
    g2h: '1',
    strict: '1',
  });
  if (afterSunset) params.set('gs', 'on');

  const response = await fetch(`https://www.hebcal.com/converter?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Hebcal ${response.status} for ${gregorianDate}`);
  }

  const data = await response.json();
  if (!data.hy || !data.hm || !data.hd) {
    throw new Error(`Invalid Hebcal response for ${gregorianDate}`);
  }

  return {
    english: `${data.hd} ${data.hm} ${data.hy}`,
    hebrew: data.hebrew,
    hebrewYear: data.heDateParts?.y ?? String(data.hy),
  };
}

function buildHebrewBirthdayNotes(bornSunsetTiming) {
  if (bornSunsetTiming === 'before') return 'Born before sunset.';
  if (bornSunsetTiming === 'after') return 'Born after sunset.';
  if (bornSunsetTiming === 'unknown') {
    return 'Sunset timing unknown — Hebrew birthday may be either date shown.';
  }
  return 'Sunset timing not provided — Hebrew birthday may be either date shown.';
}

async function main() {
  const url = loadEnvKey('NEXT_PUBLIC_SUPABASE_URL') || loadEnvKey('SUPABASE_URL');
  const key = loadEnvKey('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Run with: npx vercel env run -e production -- node scripts/backfill-hebrew-birthdays.mjs');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: children, error } = await supabase
    .from('children')
    .select(
      'id, family_id, first_name, last_name, date_of_birth, born_before_sunset, born_sunset_timing',
    )
    .not('date_of_birth', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load children:', error.message);
    process.exit(1);
  }

  let rows = children ?? [];

  if (!force) {
    const { data: existingBirthdays, error: datesError } = await supabase
      .from('important_dates')
      .select('child_id, hebrew_date')
      .eq('date_type', 'birthday')
      .not('child_id', 'is', null);

    if (datesError) {
      console.error('Failed to load important_dates:', datesError.message);
      process.exit(1);
    }

    const doneChildIds = new Set(
      (existingBirthdays ?? [])
        .filter((row) => row.child_id && row.hebrew_date)
        .map((row) => row.child_id),
    );

    rows = rows.filter((child) => !doneChildIds.has(child.id));
  }

  if (!rows.length) {
    console.log('No children need Hebrew birthday backfill.');
    return;
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Processing ${rows.length} child record(s)${force ? ' (--force)' : ''}…`,
  );

  let updated = 0;
  let failed = 0;
  let childColumnsAvailable = true;

  for (const child of rows) {
    const dob = child.date_of_birth;
    const name = `${child.first_name} ${child.last_name}`.trim();
    const { afterSunset, timingUsed } = resolveAfterSunset(
      child.born_sunset_timing,
      child.born_before_sunset,
    );

    try {
      const result = await lookupHebrewBirthday(child);
      console.log(
        `- ${name}: ${dob} (${result.timingUsed}) → ${result.english}${result.hebrew ? ` / ${result.hebrew}` : ''}`,
      );

      if (dryRun) {
        updated++;
        await sleep(DELAY_MS);
        continue;
      }

      if (childColumnsAvailable) {
        const { error: childError } = await supabase
          .from('children')
          .update({
            hebrew_birthday: result.english,
            hebrew_birthday_hebrew: result.hebrew,
            hebrew_birthday_year: result.hebrewYear,
          })
          .eq('id', child.id);

        if (childError) {
          if (/column .* does not exist|Could not find the .* column/i.test(childError.message)) {
            childColumnsAvailable = false;
            console.warn('children.hebrew_birthday columns missing — saving to important_dates only');
          } else {
            throw new Error(`child update: ${childError.message}`);
          }
        }
      }

      const notes = buildHebrewBirthdayNotes(child.born_sunset_timing);

      const { data: existingDate } = await supabase
        .from('important_dates')
        .select('id')
        .eq('child_id', child.id)
        .eq('date_type', 'birthday')
        .maybeSingle();

      const importantDateRow = {
        family_id: child.family_id,
        child_id: child.id,
        label: `${name} birthday`,
        date_type: 'birthday',
        gregorian_date: dob,
        hebrew_date: result.english,
        hebrew_year: result.hebrewYear,
        notes,
      };

      if (existingDate?.id) {
        const { error: dateError } = await supabase
          .from('important_dates')
          .update(importantDateRow)
          .eq('id', existingDate.id);
        if (dateError) {
          console.warn(`  important_dates update warning for ${name}:`, dateError.message);
        }
      } else {
        const { error: dateError } = await supabase.from('important_dates').insert(importantDateRow);
        if (dateError) {
          console.warn(`  important_dates insert warning for ${name}:`, dateError.message);
        }
      }

      updated++;
    } catch (err) {
      failed++;
      console.error(`  FAILED ${name} (${dob}):`, err.message || err);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Updated: ${updated}, failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
