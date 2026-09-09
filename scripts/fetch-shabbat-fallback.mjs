/**
 * Fetches upcoming Shabbat/holiday times from Hebcal at build time so production
 * always has fallback data when Vercel runtime calls to hebcal.com fail.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../src/lib/shabbat/fallback.generated.ts');

const LAT = 26.0573;
const LON = -80.2717;
const TZ = 'America/New_York';

const MEVARCHIM_MONTH_EN = { Av: 'Menachem Av' };
const MEVARCHIM_MONTH_HE = { אב: 'מנחם אב' };

function getHebcalQueryDate(tzid, base = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tzid }).format(base);
  const adjusted = weekday === 'Sat' ? new Date(base.getTime() + 24 * 60 * 60 * 1000) : base;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tzid,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(adjusted);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { gy: get('year'), gm: get('month'), gd: get('day') };
}

function addDaysToQuery(query, days, tzid) {
  const base = new Date(Date.UTC(query.gy, query.gm - 1, query.gd + days, 12));
  return getHebcalQueryDate(tzid, base);
}

function getOrdinal(day) {
  if (day >= 11 && day <= 13) return `${day}th`;
  const last = day % 10;
  if (last === 1) return `${day}st`;
  if (last === 2) return `${day}nd`;
  if (last === 3) return `${day}rd`;
  return `${day}th`;
}

function formatTimeCompact(isoDate, tzid) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tzid,
  })
    .format(new Date(isoDate))
    .replace(/\s*AM$/i, 'am')
    .replace(/\s*PM$/i, 'pm');
}

function formatDateLabel(isoDate, tzid, prefix) {
  const date = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: tzid }).format(date);
  const day = Number(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: tzid }).format(date));
  return `${prefix} ${month} ${getOrdinal(day)}`;
}

function formatWeekdayDateLabel(isoDate, tzid) {
  const date = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tzid }).format(date);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: tzid }).format(date);
  const day = Number(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: tzid }).format(date));
  return `${weekday} ${month} ${getOrdinal(day)}`;
}

function formatMemoDateLabel(isoDate, tzid, memo, fallbackPrefix) {
  const prefix = memo?.trim() || fallbackPrefix;
  return formatDateLabel(isoDate, tzid, prefix);
}

function formatParsha(title, hebrew) {
  const englishName = title.replace(/^Parashat\s+/, '');
  const hebrewLine = hebrew.startsWith('פרשת') ? `שבת ${hebrew}` : `שבת פרשת ${hebrew}`;
  return { hebrew: hebrewLine, englishName };
}

function formatMevarchim(title, hebrew) {
  const monthMatch = title.match(/Mevarchim Chodesh (.+)$/);
  const monthEn = monthMatch?.[1] ?? '';
  const englishMonth = MEVARCHIM_MONTH_EN[monthEn] ?? monthEn;
  const hebrewMatch = hebrew.match(/מברכים חודש (.+)$/);
  const monthHe = hebrewMatch?.[1] ?? '';
  const displayMonthHe = MEVARCHIM_MONTH_HE[monthHe] ?? monthHe;
  return { hebrew: `מברכים חודש ${displayMonthHe}`, englishMonth };
}

function holidayKicker(title) {
  if (/^Erev\s+/i.test(title)) return title.replace(/^Erev\s+/i, '');
  if (/Rosh Hashana/i.test(title)) return 'Rosh Hashana';
  if (/Yom Kippur/i.test(title)) return 'Yom Kippur';
  return title.replace(/\s+\d{4}$/, '').replace(/\s+II$/, '');
}

function pickPrimaryHoliday(items) {
  const major = items.filter((item) => item.category === 'holiday' && item.subcat === 'major');
  return major.find((item) => item.yomtov) ?? major.find((item) => !/^Erev\s/i.test(item.title)) ?? major[0] ?? null;
}

function formatHolidayDisplay(holiday) {
  const englishName = holiday.title.replace(/^Erev\s+/i, '');
  return { hebrew: holiday.hebrew ?? englishName, englishName };
}

function findLastHavdalah(items) {
  const havdalahItems = items.filter((item) => item.category === 'havdalah');
  return havdalahItems[havdalahItems.length - 1];
}

function findAllCandles(items) {
  return items.filter((item) => item.category === 'candles');
}

function findFirstCandles(items) {
  return findAllCandles(items)[0];
}

function parseResponse(data) {
  const tzid = data.location.tzid;
  const parshaItem = data.items.find((item) => item.category === 'parashat');
  const mevarchimItem = data.items.find((item) => item.category === 'mevarchim');
  const candlesItem = findFirstCandles(data.items);
  const havdalahItem = findLastHavdalah(data.items);

  if (!candlesItem || !havdalahItem) return null;

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
  if (!primaryHoliday) return null;

  const display = formatHolidayDisplay(primaryHoliday);
  const kicker = holidayKicker(primaryHoliday.title);
  const allCandles = findAllCandles(data.items);
  const secondCandle = allCandles.length > 1 ? allCandles[1] : undefined;

  return {
    kind: 'holiday',
    kicker,
    parsha: display,
    mevarchim: null,
    fridayLabel: formatMemoDateLabel(candlesItem.date, tzid, candlesItem.memo, 'Candle lighting'),
    shabbatLabel: formatWeekdayDateLabel(havdalahItem.date, tzid),
    candleLighting: formatTimeCompact(candlesItem.date, tzid),
    shabbosEnds: formatTimeCompact(havdalahItem.date, tzid),
    ...(secondCandle
      ? {
          secondCandleLabel: formatMemoDateLabel(
            secondCandle.date,
            tzid,
            secondCandle.memo,
            formatWeekdayDateLabel(secondCandle.date, tzid),
          ),
          secondCandleLighting: formatTimeCompact(secondCandle.date, tzid),
        }
      : {}),
  };
}

function isPast(isoDate) {
  return new Date(isoDate).getTime() < Date.now();
}

function buildUrl(query) {
  return `https://www.hebcal.com/shabbat?cfg=json&b=18&M=on&latitude=${LAT}&longitude=${LON}&tzid=${encodeURIComponent(TZ)}&gy=${query.gy}&gm=${query.gm}&gd=${query.gd}&leyning=off`;
}

let query = getHebcalQueryDate(TZ);
let parsed = null;

for (let attempt = 0; attempt < 10; attempt++) {
  const response = await fetch(buildUrl(query), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HaBayit/1.0 (+https://www.habayitcc.org)',
    },
  });

  if (!response.ok) {
    console.warn(`[fetch-shabbat-fallback] Hebcal returned ${response.status}; keeping existing fallback file`);
    process.exit(0);
  }

  const data = await response.json();
  parsed = parseResponse(data);
  const havdalahItem = findLastHavdalah(data.items);

  if (parsed && havdalahItem && !isPast(havdalahItem.date)) {
    break;
  }

  query = addDaysToQuery(query, 1, TZ);
  parsed = null;
}

if (!parsed) {
  console.warn('[fetch-shabbat-fallback] Hebcal response missing fields; keeping existing fallback file');
  process.exit(0);
}

const fetchedAt = new Date().toISOString();
const contents = `/** Generated by scripts/fetch-shabbat-fallback.mjs — do not edit manually. */
export const FALLBACK_SHABBAT_FETCHED_AT = ${JSON.stringify(fetchedAt)};

export const FALLBACK_SHABBAT = ${JSON.stringify(parsed, null, 2)} as const;
`;

writeFileSync(OUT, contents, 'utf8');
console.log(`[fetch-shabbat-fallback] Wrote ${OUT} (${parsed.kicker}: ${parsed.parsha.englishName}, fetched ${fetchedAt})`);
