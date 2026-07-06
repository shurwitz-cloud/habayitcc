import { unstable_cache } from 'next/cache';
import { HEBCAL_SHABBAT_PARAMS, SHABBAT_LOCATION } from '@/lib/shabbat/config';
import { FALLBACK_SHABBAT } from '@/lib/shabbat/fallback.generated';

interface HebcalShabbatItem {
  title: string;
  date: string;
  category: string;
  hebrew?: string;
}

interface HebcalShabbatResponse {
  location: { tzid: string };
  items: HebcalShabbatItem[];
}

export interface ShabbatInfo {
  parsha: { hebrew: string; englishName: string };
  mevarchim: { hebrew: string; englishMonth: string } | null;
  fridayLabel: string;
  shabbatLabel: string;
  candleLighting: string;
  shabbosEnds: string;
}

const MEVARCHIM_MONTH_EN: Record<string, string> = {
  Av: 'Menachem Av',
};

const MEVARCHIM_MONTH_HE: Record<string, string> = {
  אב: 'מנחם אב',
};

function buildHebcalUrl(): string {
  const params = new URLSearchParams({
    ...HEBCAL_SHABBAT_PARAMS,
    latitude: String(SHABBAT_LOCATION.latitude),
    longitude: String(SHABBAT_LOCATION.longitude),
    tzid: SHABBAT_LOCATION.tzid,
  });

  return `https://www.hebcal.com/shabbat?${params.toString()}`;
}

function getOrdinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const last = day % 10;
  if (last === 1) return `${day}st`;
  if (last === 2) return `${day}nd`;
  if (last === 3) return `${day}rd`;
  return `${day}th`;
}

function formatTimeCompact(isoDate: string, tzid: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tzid,
  }).format(new Date(isoDate));

  return formatted.replace(/\s*AM$/i, 'am').replace(/\s*PM$/i, 'pm');
}

function formatDateLabel(isoDate: string, tzid: string, prefix: string): string {
  const date = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: tzid }).format(date);
  const day = Number(
    new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: tzid }).format(date),
  );

  return `${prefix} ${month} ${getOrdinal(day)}`;
}

function formatParsha(title: string, hebrew: string): { hebrew: string; englishName: string } {
  const englishName = title.replace(/^Parashat\s+/, '');
  const hebrewLine = hebrew.startsWith('פרשת') ? `שבת ${hebrew}` : `שבת פרשת ${hebrew}`;

  return { hebrew: hebrewLine, englishName };
}

function formatMevarchim(title: string, hebrew: string): { hebrew: string; englishMonth: string } {
  const monthMatch = title.match(/Mevarchim Chodesh (.+)$/);
  const monthEn = monthMatch?.[1] ?? '';
  const englishMonth = MEVARCHIM_MONTH_EN[monthEn] ?? monthEn;

  const hebrewMatch = hebrew.match(/מברכים חודש (.+)$/);
  const monthHe = hebrewMatch?.[1] ?? '';
  const displayMonthHe = MEVARCHIM_MONTH_HE[monthHe] ?? monthHe;

  return {
    hebrew: `מברכים חודש ${displayMonthHe}`,
    englishMonth,
  };
}

function parseResponse(data: HebcalShabbatResponse): ShabbatInfo | null {
  const tzid = data.location.tzid;
  const parshaItem = data.items.find((item) => item.category === 'parashat');
  const mevarchimItem = data.items.find((item) => item.category === 'mevarchim');
  const candlesItem = data.items.find((item) => item.category === 'candles');
  const havdalahItem = data.items.find((item) => item.category === 'havdalah');

  if (!parshaItem?.hebrew || !candlesItem || !havdalahItem) {
    return null;
  }

  return {
    parsha: formatParsha(parshaItem.title, parshaItem.hebrew),
    mevarchim:
      mevarchimItem?.hebrew != null
        ? formatMevarchim(mevarchimItem.title, mevarchimItem.hebrew)
        : null,
    fridayLabel: formatDateLabel(candlesItem.date, tzid, 'Friday'),
    shabbatLabel: formatDateLabel(parshaItem.date, tzid, 'Shabbat'),
    candleLighting: formatTimeCompact(candlesItem.date, tzid),
    shabbosEnds: formatTimeCompact(havdalahItem.date, tzid),
  };
}

const SHABBAT_CACHE_KEY = 'hebcal-upcoming-shabbat';
const SHABBAT_REVALIDATE_SECONDS = 3600;

class HebcalFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HebcalFetchError';
  }
}

async function fetchUpcomingShabbatFromHebcal(): Promise<ShabbatInfo> {
  const url = buildHebcalUrl();
  let lastError = 'unknown error';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HaBayit/1.0 (+https://www.habayitcc.org)',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`;
        console.error(`Hebcal fetch failed (${lastError})`);
        continue;
      }

      const data = (await response.json()) as HebcalShabbatResponse;
      const parsed = parseResponse(data);
      if (!parsed) {
        lastError = 'response missing required Shabbat fields';
        console.error(`Hebcal ${lastError}`);
        continue;
      }

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error('Hebcal fetch error:', error);
    }
  }

  throw new HebcalFetchError(lastError);
}

const getCachedUpcomingShabbat = unstable_cache(
  fetchUpcomingShabbatFromHebcal,
  [SHABBAT_CACHE_KEY],
  { revalidate: SHABBAT_REVALIDATE_SECONDS, tags: ['shabbat'] },
);

/** Live Hebcal data with build-time fallback when runtime fetch fails (e.g. on Vercel). */
export async function getUpcomingShabbat(): Promise<ShabbatInfo> {
  try {
    return await getCachedUpcomingShabbat();
  } catch (cachedError) {
    console.error('Cached Hebcal fetch failed, retrying live:', cachedError);
  }

  try {
    return await fetchUpcomingShabbatFromHebcal();
  } catch (liveError) {
    console.error('Live Hebcal fetch failed, using build-time fallback:', liveError);
    return FALLBACK_SHABBAT;
  }
}
