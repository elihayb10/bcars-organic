// עוזר למשימת Metricool בענן (Claude). המשימה מורידה את plan.json ואת הקובץ הזה ומריצה אותו. כל ההחלטות כאן, לא אצל המודל.
// node schedule.mjs mode                 -> SCHEDULE (בוקר) או CHECK (צהריים), ותאריך היום והיסט השעון
// node schedule.mjs alive                -> ALIVE / SOLD / UNKNOWN: הרכב של היום עוד באתר?
// node schedule.mjs posts [scheduled.json] -> מ-bt-<רשת>.json כותב info-<פוסט>.json ו-date-<פוסט>.txt לכל פוסט (כללים.md סעיף 3).
//                                           פוסט שכבר קיים לרכב היום (ב-scheduled.json) מדולג, כדי שריצה חוזרת לא תכפיל
// node schedule.mjs report               -> מ-results.json: טקסט הדוח לטלפון
// node schedule.mjs sold scheduled.json  -> לרכב שנמכר: upd-<n>.json לכל פוסט שלו שעוד לא עלה, להחזרה לטיוטה
import fs from 'node:fs';

// שישה פוסטים לכל רכב. אינסטגרם ופייסבוק, ריל וסטורי, עולים יחד באותה שעה (אליחי 31.10: "באותה שעה כל הרשתות של
// אינסטגרם ופייסבוק וסטורי"). טיקטוק ויוטיוב: כל אחד בשעה הכי טובה שלו
const META = ['instagram', 'facebook'];
const JOBS = [
  { key: 'instagram', net: 'instagram' }, { key: 'facebook', net: 'facebook' },
  { key: 'instagram-story', net: 'instagram', story: true }, { key: 'facebook-story', net: 'facebook', story: true },
  { key: 'tiktok', net: 'tiktok' }, { key: 'youtube', net: 'youtube' },
];
const HE = { instagram: 'אינסטגרם', facebook: 'פייסבוק', 'instagram-story': 'סטורי אינסטגרם', 'facebook-story': 'סטורי פייסבוק', tiktok: 'טיקטוק', youtube: 'יוטיוב' };
const TZ = 'Asia/Jerusalem';
// לא בשעות של הרילס הקבועים 09:50 ו-18:00: שעה לפני ואחרי כל אחד (תוכנית נובמבר, סעיף 4)
const BLOCK = new Set([9, 10, 17, 18]);
const FIRST = 8, LAST = 21, FRIDAY_LAST = 12; // שישי עד 12:30, ולכן הסלוט האחרון 12:00
const MIN_AHEAD = 30;                          // דקות לפחות מעכשיו

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : null);
// בלי plan.json (הסרטון לא נבנה, או אין רכב): today.json, כדי שהדוח עדיין יגיד מה קרה
const plan = read('plan.json') || read('today.json') || {};
function il(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute, wd: p.weekday };
}
const now = il(process.env.NOW ? new Date(process.env.NOW) : new Date()); // NOW: לבדיקה בלבד
const ISO_DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
// היסט שעון ישראל ביום הפרסום (חורף +02:00, קיץ +03:00)
const offset = () => { const h = new Date().toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/); return `${h[1][0]}${h[1].slice(1).padStart(2, '0')}:00`; };
const pad = (n) => String(n).padStart(2, '0');

// השעה הכי טובה לכמה רשתות יחד: כל רשת מנורמלת לשעה הכי טובה שלה ביום (בפייסבוק המספרים גדולים פי 15), והציונים מתחברים
function bestHour(nets) {
  const okHour = (h, m = 0) => h >= FIRST && h <= (now.wd === 'Fri' ? FRIDAY_LAST : LAST) && !BLOCK.has(h)
    && (h * 60 + m) - (now.hour * 60 + now.minute) >= MIN_AHEAD;
  const score = {};
  for (const net of nets) {
    const raw = read(`bt-${net}.json`);
    const day = raw && (raw.data || raw).find?.((d) => d.dayOfWeek === ISO_DAY[now.wd]);
    if (!day) continue;
    const max = Math.max(...day.bestTimesByHour.map((r) => r.value)) || 1;
    for (const r of day.bestTimesByHour) score[r.hourOfDay] = (score[r.hourOfDay] || 0) + r.value / max;
  }
  const rows = Object.entries(score).map(([h, v]) => ({ h: +h, v })).filter((r) => okHour(r.h)).sort((a, b) => b.v - a.v || a.h - b.h);
  if (rows.length) return { h: rows[0].h, m: 0, src: 'metricool' };
  // Metricool לא זמין: 12:30 בימים א'–ה', 09:00 בשישי (כללים.md 3)
  const fb = now.wd === 'Fri' ? { h: 9, m: 0 } : { h: 12, m: 30 };
  return (fb.h * 60 + fb.m) - (now.hour * 60 + now.minute) >= MIN_AHEAD ? { ...fb, src: 'ברירת מחדל' } : null;
}

function info(job, dateTime) {
  const c = plan.car;
  const data = job.story ? { [`${job.net}Data`]: { type: 'STORY' } } : {
    instagram: { instagramData: { type: 'REEL', showReelOnFeed: true } },
    facebook: { facebookData: { type: 'REEL', title: c.title } },
    // Metricool דורש כותרת בטיקטוק (נבדק 31.10)
    tiktok: { tiktokData: { title: c.title, privacyOption: 'PUBLIC_TO_EVERYONE', disableComment: false, disableDuet: false, disableStitch: false } },
    youtube: { youtubeData: { title: c.title, type: 'short', privacy: 'public', madeForKids: false, category: 'AUTOS_VEHICLES' } },
  }[job.net];
  // סטורי בלי מלל: אין לו כיתוב, ו-Metricool דוחה סטורי אוטומטי עם טקסט
  return { autoPublish: true, draft: plan.mode !== 'live', descendants: [], firstCommentText: '', hasNotReadNotes: false,
    media: [c.video], mediaAltText: [], providers: [{ network: job.net }], publicationDate: { dateTime, timezone: TZ },
    shortener: false, smartLinkData: { ids: [] }, ...(job.story ? {} : { text: c.text }), ...data };
}

// הפוסטים של הרכב של היום מתוך getScheduledPosts. ריל, טיקטוק ויוטיוב: לפי שורת הפתיחה של המלל.
// סטורי (בלי מלל): סטורי באינסטגרם או בפייסבוק באותה שעה בדיוק כמו הריל שלנו. סטורי אחר של העסק לא נוגעים בו
const netOf = (p) => (p.providers || [])[0]?.network;
const isStory = (p) => [p.instagramData?.type, p.facebookData?.type].includes('STORY');
function ours(raw) {
  const all = raw?.data || raw || [];
  const head = plan.car?.text?.split('\n')[0];
  const main = all.filter((p) => head && String(p.text || '').startsWith(head));
  const reelTimes = new Set(main.filter((p) => META.includes(netOf(p))).map((p) => p.publicationDate?.dateTime));
  const stories = all.filter((p) => isStory(p) && META.includes(netOf(p)) && reelTimes.has(p.publicationDate?.dateTime));
  return [...main.map((p) => ({ p, key: netOf(p) })), ...stories.map((p) => ({ p, key: `${netOf(p)}-story` }))];
}

const cmd = process.argv[2];
if (cmd === 'mode') console.log(`${now.hour < 11 ? 'SCHEDULE' : 'CHECK'} ${now.date} ${offset()}`);
else if (cmd === 'alive') {
  if (!plan.car) { console.log('NOCAR'); process.exit(0); }
  try {
    const r = await fetch(`https://www.bcars.co.il/wp-json/wp/v2/car/${plan.car.wpId}`);
    console.log(r.ok ? 'ALIVE' : r.status === 404 || r.status === 410 ? 'SOLD' : 'UNKNOWN HTTP ' + r.status);
  } catch (e) { console.log('UNKNOWN ' + e.message); }
}
else if (cmd === 'posts') {
  if (plan.date !== now.date && !process.env.NOW) { console.log(`STALE: התוכנית מ-${plan.date}, היום ${now.date}`); process.exit(1); }
  if (!plan.car || !plan.car.video) { console.log('NOCAR'); process.exit(1); }
  const existing = ours(read(process.argv[3] || 'scheduled.json')), have = new Set(existing.map((x) => x.key));
  // ריל שכבר קיים קובע את השעה של כל קבוצת אינסטגרם-פייסבוק, כדי שהשאר יצטרפו אליו
  const metaAt = existing.find((x) => META.includes(x.key))?.p.publicationDate?.dateTime;
  const metaT = metaAt ? { h: +metaAt.slice(11, 13), m: +metaAt.slice(14, 16), src: 'כמו הריל שכבר תוזמן' } : bestHour(META);
  const out = [];
  for (const job of JOBS) {
    if (have.has(job.key)) { out.push(`${job.key}: כבר תוזמן היום, מדלגים`); continue; }
    const t = META.includes(job.net) ? metaT : bestHour([job.net]);
    if (!t) { out.push(`${job.key}: אין שעה פנויה היום`); continue; }
    const dateTime = `${now.date}T${pad(t.h)}:${pad(t.m)}:00`;
    fs.writeFileSync(`info-${job.key}.json`, JSON.stringify(info(job, dateTime)));
    fs.writeFileSync(`date-${job.key}.txt`, `${dateTime}${offset()}`);
    out.push(`${job.key}: ${pad(t.h)}:${pad(t.m)} (${t.src})`);
  }
  console.log(out.join('\n'));
}
else if (cmd === 'report') {
  // results.json: { "instagram": "ok" | "<שגיאה>", "instagram-story": ..., ... } שהמשימה כותבת אחרי כל קריאה
  const res = read('results.json') || {};
  const c = plan.car, draft = plan.mode !== 'live', KEYS = JOBS.map((j) => j.key);
  const at = (k) => (fs.existsSync(`date-${k}.txt`) ? fs.readFileSync(`date-${k}.txt`, 'utf8').slice(11, 16) : '');
  const lines = [];
  if (plan.error) lines.push(`פוסט הרכב היומי: ${plan.error}`);
  else if (!c) lines.push('פוסט הרכב היומי: אין היום רכב שעוד לא פורסם ועומד בכללים.');
  else {
    const ok = KEYS.filter((k) => res[k] === 'ok');
    // מקבצים לפי שעה: "20:00 אינסטגרם, פייסבוק, סטורי אינסטגרם..."
    const byTime = {};
    for (const k of ok) (byTime[at(k)] ||= []).push(HE[k]);
    const done = Object.keys(byTime).sort().map((t) => `${t} ${byTime[t].join(', ')}`.trim());
    const bad = KEYS.filter((k) => res[k] && res[k] !== 'ok').map((k) => `${HE[k]}: ${String(res[k]).slice(0, 60)}`);
    const none = KEYS.filter((k) => !res[k]).map((k) => HE[k]);
    lines.push(`פוסט הרכב היומי: ${c.name || c.title}${c.line ? ` ("${c.line}")` : ''}.`);
    if (done.length) lines.push(`${draft ? 'נשמר כטיוטה ב-Metricool (מצב בדיקה, לא עולה)' : 'תוזמן'}: ${done.join('; ')}.`);
    if (bad.length) lines.push(`נכשל: ${bad.join('; ')}.`);
    if (none.length) lines.push(`לא תוזמן: ${none.join(', ')}.`);
  }
  if (plan.skipped?.length) lines.push(`דולגו: ${plan.skipped.map((s) => s.replace(/\s*\(\d+\)/, '')).join('; ')}.`);
  if (plan.next) lines.push(`הבא בתור: ${plan.next}.`);
  if (plan.auto360 !== 'ok') lines.push(`auto360 לא זמין (${plan.auto360}), נבדק מול האתר בלבד.`);
  const t = lines.join(' ');
  console.log(t.length > 400 ? t.slice(0, 397) + '...' : t);
}
else if (cmd === 'sold') {
  // getScheduledPosts של היום: הפוסטים של הרכב שעוד לא עלו חוזרים לטיוטה.
  // התוכן נבנה מחדש מהתוכנית (אותו פוסט בדיוק), עם draft: true והשעה המקורית שלו
  const posts = ours(read(process.argv[3])).filter((x) => !x.p.draft && JOBS.some((j) => j.key === x.key));
  posts.forEach((x, i) => fs.writeFileSync(`upd-${i + 1}.json`, JSON.stringify({ id: String(x.p.id), uuid: x.p.uuid,
    info: { ...info(JOBS.find((j) => j.key === x.key), x.p.publicationDate?.dateTime), draft: true } })));
  console.log(`${posts.length} פוסטים להחזרה לטיוטה`);
}
else { console.error('פקודה לא מוכרת'); process.exit(2); }
