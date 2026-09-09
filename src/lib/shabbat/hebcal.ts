import { unstable_cache } from 'next/cache';
import { HEBCAL_SHABBAT_PARAMS, SHABBAT_LOCATION } from '@/lib/shabbat/config';
import { FALLBACK_SHABBAT } from '@/lib/shabbat/fallback.generated';

interface HebcalShabbatItem {
  title: string;
  date: string;
  category: string;
  subcat?: string;
  hebrew?: string;
  yomtov?: boolean;
  memo?: string;
}

interface HebcalShabbatResponse {
  location: { tzid: string };
  items: HebcalShabbatItem[];
}

export interface ShabbatInfo {
  kind: 'shabbat' | 'holiday';
  kicker: string;
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

export function getHebcalQueryDate(tzid: string, base: Date = new Date()): {
  gy: number;
  gm: number;
  gd: number;
} {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tzid }).format(base);
  const adjusted =
    weekday === 'Sat' ? new Date(base.getTime() + 24 * 60 * 60 * 1000) : base;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tzid,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(adjusted);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  return { gy: get('year'), gm: get('month'), gd: get('day') };
}

function buildHebcalUrl(query: { gy: number; gm: number; gd: number }): string {
  const params = new URLSearchParams({
    ...HEBCAL_SHABBAT_PARAMS,
    latitude: String(SHABBAT_LOCATION.latitude),
    longitude: String(SHABBAT_LOCATION.longitude),
    tzid: SHABBAT_LOCATION.tzid,
    gy: String(query.gy),
    gm: String(query.gm),
    gd: String(query.gd),
    leyning: 'off',
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

function formatMemoDateLabel(
  isoDate: string,
  tzid: string,
  memo: string | undefined,
  fallbackPrefix: string,
): string {
  const prefix = memo?.trim() || fallbackPrefix;
  return formatDateLabel(isoDate, tzid, prefix);
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

function holidayKicker(title: string): string {
  if (/^Erev\s+/i.test(title)) return title.replace(/^Erev\s+/i, '');
  if (/Rosh Hashana/i.test(title)) return 'Rosh Hashana';
  if (/Yom Kippur/i.test(title)) return 'Yom Kippur';
  if (/Sukkot/i.test(title)) return title.includes('Erev') ? 'Sukkot' : title.replace(/\s+II$/, '');
  if (/Shavuot/i.test(title)) return 'Shavuot';
  if (/Pesach/i.test(title) || /Passover/i.test(title)) return 'Pesach';
  return title.replace(/\s+\d{4}$/, '').replace(/\s+II$/, '');
}

function pickPrimaryHoliday(items: HebcalShabbatItem[]): HebcalShabbatItem | null {
  const major = items.filter((item) => item.category === 'holiday' && item.subcat === 'major');
  return major.find((item) => item.yomtov) ?? major.find((item) => !/^Erev\s/i.test(item.title)) ?? major[0] ?? null;
}

function formatHolidayDisplay(holiday: HebcalShabbatItem): { hebrew: string; englishName: string } {
  const englishName = holiday.title.replace(/^Erev\s+/i, '');
  const hebrew = holiday.hebrew ?? englishName;
  return { hebrew, englishName };
}

function findLastHavdalah(items: HebcalShabbatItem[]): HebcalShabbatItem | undefined {
  const havdalahItems = items.filter((item) => item.category === 'havdalah');
  return havdalahItems[havdalahItems.length - 1];
}

function findFirstCandles(items: HebcalShabbatItem[]): HebcalShabbatItem | undefined {
  return items.find((item) => item.category === 'candles');
}

export function parseHebcalShabbatResponse(data: HebcalShabbatResponse): ShabbatInfo | null {
  const tzid = data.location.tzid;
  const parshaItem = data.items.find((item) => item.category === 'parashat');
  const mevarchimItem = data.items.find((item) => item.category === 'mevarchim');
  const candlesItem = findFirstCandles(data.items);
  const havdalahItem = findLastHavdalah(data.items);

  if (!candlesItem || !havdalahItem) {
    return null;
  }

  if (parshaItem?.hebrew) {
    return {
      kind: 'shabbat',
      kicker: "This week's parsha",
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

  const primaryHoliday = pickPrimaryHoliday(data.items);
  if (!primaryHoliday) {
    return null;
  }

  const display = formatHolidayDisplay(primaryHoliday);
  const kicker = holidayKicker(primaryHoliday.title);
  const endMemo = havdalahItem.memo?.trim();
  const endPrefix = endMemo ? `${endMemo} ends` : `${kicker} ends`;

  return {
    kind: 'holiday',
    kicker,
    parsha: display,
    mevarchim: null,
    fridayLabel: formatMemoDateLabel(candlesItem.date, tzid, candlesItem.memo, 'Candle lighting'),
    shabbatLabel: formatDateLabel(havdalahItem.date, tzid, endPrefix),
    candleLighting: formatTimeCompact(candlesItem.date, tzid),
    shabbosEnds: formatTimeCompact(havdalahItem.date, tzid),
  };
}

function isPast(isoDate: string): boolean {
  return new Date(isoDate).getTime() < Date.now();
}

function addDaysToQuery(
  query: { gy: number; gm: number; gd: number },
  days: number,
  tzid: string,
): { gy: number; gm: number; gd: number } {
  const base = new Date(Date.UTC(query.gy, query.gm - 1, query.gd + days, 12));
  return getHebcalQueryDate(tzid, base);
}

const SHABBAT_CACHE_KEY = 'hebcal-upcoming-shabbat-v3';
const SHABBAT_REVALIDATE_SECONDS = 3600;

class HebcalFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HebcalFetchError';
  }
}

async function fetchHebcalJson(url: string): Promise<HebcalShabbatResponse> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HaBayit/1.0 (+https://www.habayitcc.org)',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new HebcalFetchError(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as HebcalShabbatResponse;
}

async function fetchUpcomingShabbatFromHebcal(): Promise<ShabbatInfo> {
  const tzid = SHABBAT_LOCATION.tzid;
  let query = getHebcalQueryDate(tzid);
  let lastError = 'unknown error';

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const data = await fetchHebcalJson(buildHebcalUrl(query));
      const parsed = parseHebcalShabbatResponse(data);
      const havdalahItem = findLastHavdalah(data.items);

      if (!parsed || !havdalahItem) {
        lastError = 'response missing required Shabbat fields';
        console.error(`Hebcal ${lastError}`);
        query = addDaysToQuery(query, 1, tzid);
        continue;
      }

      if (isPast(havdalahItem.date)) {
        query = addDaysToQuery(query, 1, tzid);
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
    const cached = await getCachedUpcomingShabbat();
    if (cached) return cached;
    console.error('Cached Hebcal returned empty (stale cache entry), refetching live');
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
