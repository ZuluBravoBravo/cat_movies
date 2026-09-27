// Scrapes the Catamount Arts "Film" listing + each show's detail page,
// and writes the result to docs/movies.json for the static site to read.
// Run by .github/workflows/update-movies.yml on a schedule, or locally with:
//   node scripts/scrape.mjs

import { writeFile } from "node:fs/promises";

const SOURCE_URL = "https://www.catamountarts.org/shows/by-genre/film/";
const UA = "Mozilla/5.0 (compatible; CatamountMoviesTopping/1.0; +https://github.com/)";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_INDEX = Object.fromEntries(MONTHS.map((m, i) => [m, i]));
const MONTH_PATTERN = MONTHS.join("|");

function extractSlugs(html) {
  const re = /\/show\/details\/([a-z0-9-]+)\/?/gi;
  const slugs = new Set();
  let m;
  while ((m = re.exec(html))) slugs.add(m[1]);
  return [...slugs];
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, "");
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "\u2019")
    .replace(/&#8216;|&lsquo;/g, "\u2018")
    .replace(/&#8211;|&ndash;/g, "\u2013")
    .replace(/&#8212;|&mdash;/g, "\u2014")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(stripTags(h1[1])).trim();
  const og = html.match(/property=["']og:title["']\s+content=["']([^"']*)["']/i);
  if (og) return decodeEntities(og[1]).trim();
  return null;
}

function extractDates(html) {
  const idx = html.search(/>Dates</i);
  const section = idx >= 0 ? html.slice(idx) : html;
  const re = new RegExp(
    `(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s+(\\d{4})\\s*(?:-|–|—|&#8211;|&ndash;)\\s*(\\d{1,2}):(\\d{2})\\s*(am|pm)`,
    "gi"
  );
  const out = [];
  let m;
  while ((m = re.exec(section))) {
    const [, monthName, day, year, hh, mm, ampm] = m;
    out.push({
      monthName, day: Number(day), year: Number(year),
      hh: Number(hh), mm: Number(mm), ampm: ampm.toLowerCase(),
    });
  }
  return out;
}

function toDateKey({ monthName, day, year }) {
  const mm = String(MONTH_INDEX[monthName] + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function to12Hour({ hh, mm, ampm }) {
  return `${hh}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function to24HourMinutes({ hh, mm, ampm }) {
  let h = hh % 12;
  if (ampm === "pm") h += 12;
  return h * 60 + mm;
}

function todayKeyEastern() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

function formatDateLabel(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
  });
}

async function main() {
  const listRes = await fetch(SOURCE_URL, { headers: { "user-agent": UA } });
  if (!listRes.ok) throw new Error(`Listing page returned ${listRes.status}`);
  const listHtml = await listRes.text();
  const slugs = extractSlugs(listHtml);

  const shows = [];
  const CONCURRENCY = 5;
  let cursor = 0;
  async function pullNext() {
    while (cursor < slugs.length) {
      const slug = slugs[cursor++];
      const detailUrl = `https://www.catamountarts.org/show/details/${slug}/`;
      try {
        const res = await fetch(detailUrl, { headers: { "user-agent": UA } });
        if (!res.ok) continue;
        const html = await res.text();
        const title = extractTitle(html) || slug;
        const runtimeMatch = html.match(/Runtime:\s*(\d+)\s*minutes/i);
        const dates = extractDates(html);
        for (const d of dates) {
          shows.push({
            slug, title, url: detailUrl,
            dateKey: toDateKey(d),
            time: to12Hour(d),
            sortMinutes: to24HourMinutes(d),
            runtimeMinutes: runtimeMatch ? Number(runtimeMatch[1]) : null,
          });
        }
      } catch {
        // skip this show, keep going
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slugs.length) }, pullNext));

  const byDate = {};
  for (const s of shows) (byDate[s.dateKey] ||= []).push(s);
  for (const key of Object.keys(byDate)) byDate[key].sort((a, b) => a.sortMinutes - b.sortMinutes);

  const todayKey = todayKeyEastern();
  const days = Object.keys(byDate)
    .filter((k) => k >= todayKey)
    .sort()
    .map((k) => ({
      date: k,
      label: formatDateLabel(k),
      movies: byDate[k].map(({ sortMinutes, ...rest }) => rest),
    }));

  const output = { generatedAt: new Date().toISOString(), source: SOURCE_URL, days };
  await writeFile(new URL("../docs/movies.json", import.meta.url), JSON.stringify(output, null, 2));
  console.log(`Wrote ${days.length} day(s), ${shows.length} showtime(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
