#!/usr/bin/env node
// מנוע הפוסט האורגני של בית הרכב: קריאת המלאי (אתר + Auto360) וטקסט הסרטון לכל רכב.
// הועתק פעם אחת ממכונת המלאי (30.10.2026) ומכאן נפרד ממנה: שינוי כאן לא משפיע על הממומן, ולהפך.
// פקודות: collect | job <מספר רישוי> [--mode organic|sale] [--cars <cars.json>]
'use strict';
const fs = require('fs');
const SRC = {
  site: 'https://www.bcars.co.il/wp-json/wp/v2/car?per_page=100',
  feed: 'https://cm.auto360.co.il/xml-stock.php?lot=75',
  // רשימת המלאי של auto360 (מספרי רישוי וסוג מרכב, בלי מחירים), שגיטהאב מפרסם פעמיים ביום. כך המכונה בענן מאשרת מכירה בלי פרטי גישה
  stockUrl: 'https://github.com/elihayb10/bcars-video/releases/download/data/stock.json',
  minSiteCars: 20,
};
const CFG = SRC;
// שורת ⭐ לרכבים הקיימים (אושר 22.10.2026). רכב חדש: --star
const STARS = {
  '11815203': 'SUV משפחתי.', '12338002': 'SUV ל-7 נוסעים.', '15891303': 'קרוסאובר קומפקטי.',
  '1760832': 'קרוסאובר משפחתי, ק״מ נמוך לשנתון.', '1857312': 'סדאן לתקציב מצומצם.',
  '22639903': 'קרוסאובר קומפקטי דיזל.', '22694403': 'קרוסאובר משפחתי, ק״מ נמוך לשנתון.',
  '24697103': 'טנדר אמריקאי גדול.', '24715803': 'טנדר דיזל לעבודה ולמשפחה.', '24861903': 'טנדר דיזל אמריקאי.',
  '25130903': 'קרוסאובר קטן, ק״מ נמוך לשנתון.', '25384201': 'סדאן משפחתי.', '25457002': 'קטנה לעיר.',
  '26379601': 'סדאן קומפקטי.', '26568403': 'קרוסאובר ספורטיבי של קופרה.', '30145402': 'קומפקטי לעיר.',
  '30153102': 'SUV ספורטיבי.', '30690001': 'קטנה וקלה לחניה.', '33580702': 'היברידית קטנה לעיר.',
  '36017302': "הצ'בק של יונדאי, לנסיעה יומיומית.", '36558402': 'קטן וקומפקטי לעיר.', '3769780': 'סדאן גדול ומרווח.',
  '4231213': 'SUV ל-8 נוסעים, ק״מ נמוך לשנתון.', '46342302': 'הקטן של יונדאי, לעיר.', '46653902': 'סדאן קומפקטי.',
  '46693002': 'היברידית: שילוב של מנוע בנזין ומנוע חשמלי.', '46749803': 'קרוסאובר קטן.',
  '51509702': 'טנדר 4X4 לעבודה ולשטח.', '51911402': 'SUV יוקרה של קאדילאק.', '53263402': 'רכב משפחתי, ק״מ נמוך לשנתון.',
  '55675102': 'SUV משפחתי.', '64072001': 'סדאן משפחתי.', '71402601': 'קרוסאובר משפחתי של קיה.',
  '76882001': 'קרוסאובר קומפקטי.', '77419201': 'SUV משפחתי עם מנוע טורבו.', '7979332': 'SUV ל-7 נוסעים, ק״מ נמוך לשנתון.',
  '79959401': 'קרוסאובר קומפקטי של סובארו.', '80290202': 'SUV יוקרה קומפקטי של קאדילאק.', '81109202': 'קטנה לעיר.',
  '8133553': 'סטיישן לתקציב מצומצם.', '82068603': 'קרוסאובר חשמלי.', '84365502': 'רכב דיזל מרווח לעבודה ולמשפחה.',
  '85078802': 'קטנה לעיר.', '85723001': 'מרווח לעבודה ולמשפחה.', '88867501': 'SUV קומפקטי של מרצדס.',
  '9175139': 'SUV משפחתי, ק״מ נמוך לשנתון.',
};

// גימור קטוע באתר (המכונה, סעיף 6.7): לא מציגים עד שיתוקן באתר
const TRIM_OMIT = new Set(['51911402', '46693002', '88867501']);

const PICKUP =/סילברדו|ראם|היילקס|D-?MAX|רנג'ר|נבארה|טריטון|L200|גלדיאטור|טנדר|פיקאפ/i;

// ---------- עזר ----------
const dec = s => String(s ?? '')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;/g, "'").replace(/&amp;/g, '&')
  .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#8211;/g, '–').replace(/&nbsp;/g, ' ');
const clean = s => dec(s).replace(/<[^>]+>/g, '').replace(/`/g, "'").replace(/\s+/g, ' ').trim();
const digits = s => String(s ?? '').replace(/\D/g, '');
const num = s => { const d = digits(s); return d ? Number(d) : 0; };
const fmt = n => Number(n).toLocaleString('en-US');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1));
const die = m => { console.error('ERROR: ' + m); process.exit(2); };
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name) => process.argv.includes(name);

// שעון ישראל (הענן רץ ב-UTC)
function ilParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  return Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
}
const ilStamp = (d = new Date()) => { const p = ilParts(d); return `${p.day}.${p.month} ${p.hour}:${p.minute}`; };
const ilDate = (d = new Date()) => { const p = ilParts(d); return `${p.day}.${p.month}`; };
const isSunday = () => ilParts().weekday === 'Sun';
const byIdDesc = (a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1);

// האתר והפיד מחזירים לפעמים 415/429 בעומס (כמה ריצות במקביל, 22.10.2026): מנסים שוב עם המתנה הולכת וגדלה
async function get(url, tries = 6) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' }); // בלי User-Agent: אחרת האתר נכנס ללולאת הפניות
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { if (i === tries) throw new Error(url + ': ' + e.message); await new Promise(s => setTimeout(s, 4000 * i)); }
  }
}

function plateDash(p) {
  const d = digits(p);
  if (d.length === 8) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  if (d.length === 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
}

// ---------- דף רכב ----------
function parseCarPage(html) {
  const pick = re => { const m = html.match(re); return m ? m[1] : ''; };
  const title = clean(pick(/<h1 class="bxk-t"[^>]*>([\s\S]*?)<\/h1>/));
  const trim = clean(pick(/<p class="bxk-trim">([\s\S]*?)<\/p>/));
  const plate = digits(pick(/<span class="bxk-plate"[^>]*>[\s\S]*?<b>([^<]+)<\/b>/));
  const stats = {};
  const st = pick(/<div class="bxk-stats">([\s\S]*?)<\/div><\/div>/) || pick(/<div class="bxk-stats">([\s\S]*?)<ul/);
  for (const m of st.matchAll(/<b>([^<]*)<\/b>\s*<small>([^<]*)<\/small>/g)) stats[clean(m[2])] = clean(m[1]);
  const spec = {};
  const sp = pick(/<ul class="bxk-spec"[^>]*>([\s\S]*?)<\/ul>/);
  for (const m of sp.matchAll(/<small>([^<]*)<\/small>\s*<b>([^<]*)<\/b>/g)) spec[clean(m[1])] = clean(m[2]);
  const price = num(pick(/<div class="bxk-price">[\s\S]*?<b>([^<]*)<\/b>/));
  const noPhotos = /<b>התמונות של הרכב בדרך<\/b>/.test(html);
  // גיבוי לתמונות: גלריית האתר בגודל מלא, לפי הסדר
  const siteImgs = [...new Set([...html.matchAll(/https:\/\/www\.bcars\.co\.il\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"'\s]+?\.(?:jpe?g|png|webp)/gi)].map(m => m[0]))]
    .filter(u => !/-\d+x\d+\.|logo|poster|favicon|car_plate|bx-og/i.test(u));
  return {
    title, trim, plate,
    km: num(stats['קילומטרים']), hand: stats['יד'] || '', origin: stats['מקוריות'] || '',
    gear: spec['גיר'] || '', fuel: spec['סוג מנוע'] || '', cc: num(spec['נפח מנוע']), hp: num(spec['כוח סוס']),
    seats: num(spec['מושבים']), test: spec['תוקף טסט'] || '', price, noPhotos, siteImgs,
  };
}

function parseFeed(xml) {
  const out = {};
  for (const m of xml.matchAll(/<car>([\s\S]*?)<\/car>/g)) {
    const b = m[1];
    const plate = digits((b.match(/<CarNumber>([^<]*)<\/CarNumber>/) || [])[1]);
    if (!plate) continue;
    const imgs = [...b.matchAll(/<CarImage Path="([^"]+)"\s+imgNum="(\d+)"/g)]
      .map(x => ({ u: x[1], n: Number(x[2]) })).sort((a, c) => a.n - c.n).map(x => x.u);
    out[plate] = { imgs, hand: (b.match(/<Hand>([^<]*)<\/Hand>/) || [])[1], salePrice: num((b.match(/<SalePrice>([^<]*)<\/SalePrice>/) || [])[1]) };
  }
  return out;
}

// גיל: תאריך הפרסום באתר, מתוקן לפי מזהה הסנכרון כשהוא חריג (פורסם מחדש)
function computeAges(cars, now = Date.now()) {
  const withId = cars.filter(c => c.syncId).sort((a, b) => a.syncId - b.syncId);
  for (let i = 0; i < withId.length; i++) {
    const nb = withId.slice(Math.max(0, i - 3), i).concat(withId.slice(i + 1, i + 4)).map(c => c.dateMs).sort((a, b) => a - b);
    const med = nb.length ? nb[Math.floor(nb.length / 2)] : withId[i].dateMs;
    const c = withId[i];
    c.ageFixed = c.dateMs - med > 30 * 864e5;
    c.effDateMs = c.ageFixed ? med : c.dateMs;
  }
  for (const c of cars) {
    if (!c.effDateMs) c.effDateMs = c.dateMs;
    c.ageDays = Math.floor((now - c.effDateMs) / 864e5);
  }
}

// מלאי auto360 (API של התוסף): מקור שני שמאשר שרכב נמכר. פרטי הגישה ממשתני סביבה, לא בקוד
// למה auto360 לא זמין (נכתב בדוח האיסוף, בלי פרטי הגישה עצמם)
let auto360Why = '', auto360Body = {}, auto360Info = {};
async function auto360() {
  const email = process.env.AUTO360_EMAIL, code = process.env.AUTO360_CODE;
  if (!email || !code) { auto360Why = 'אין משתני סביבה AUTO360_EMAIL / AUTO360_CODE'; return null; }
  try {
    const a = await fetch('https://cm.auto360.co.il/api/v1/auth/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, fingerprint: 'bcars-machine', version: '1.0' }) });
    if (!a.ok) { auto360Why = 'הפעלה נכשלה, HTTP ' + a.status; return null; }
    const t = (await a.json()).token; if (!t) { auto360Why = 'ההפעלה לא החזירה token'; return null; }
    const r = await fetch('https://cm.auto360.co.il/api/v1/inventory', { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) { auto360Why = 'המלאי נכשל, HTTP ' + r.status; return null; }
    const v = (await r.json()).vehicles;
    if (!Array.isArray(v) || v.length < CFG.minSiteCars) { auto360Why = 'המלאי החזיר ' + (Array.isArray(v) ? v.length : 0) + ' רכבים'; return null; }
    const av = v.filter(x => x.status === 'available');
    for (const x of av) auto360Body[digits(x.license_plate)] = x.body_style || '';
    // לבדיקת התאמה מול האתר (29.10.2026): מחירון, גימור, מקוריות, תוקף טסט, יד אמיתית
    for (const x of av) auto360Info[digits(x.license_plate)] = { list: x.list_price_ils || 0, trim: x.finish_level || '', origin: x.original_ownership || '',
      testExp: x.license_expiration || '', hand: x.hand || 0 };
    return av.map(x => digits(x.license_plate)); // price_ils = מחיר מכירה: לא נשמר בשום מקום
  } catch (e) { auto360Why = 'שגיאת רשת: ' + e.message; return null; }
}

async function stockFromGithub() {
  try {
    const j = JSON.parse(await get(CFG.stockUrl, 2));
    const ageH = (Date.now() - Date.parse(j.at)) / 36e5;
    if (!(ageH <= 8)) { auto360Why += '; הרשימה מגיטהאב ישנה (' + Math.round(ageH) + ' שעות)'; return null; }
    if (!Array.isArray(j.plates) || j.plates.length < CFG.minSiteCars) { auto360Why += '; הרשימה מגיטהאב קצרה'; return null; }
    auto360Body = j.body || {}; auto360Why = '';
    return j.plates;
  } catch (e) { auto360Why += '; הרשימה מגיטהאב לא נטענה: ' + e.message; return null; }
}

// משרד התחבורה (data.gov.il, מאגר פתוח): כוח סוס, נפח ומושבים לפי מספר רישוי, לבדיקת התאמה מול האתר (29.10.2026).
// רכב רגיל: מאגר כלי הרכב נותן קוד יצרן, קוד דגם ושנה, ומאגר הדגמים את הנתונים. טנדר מעל 3.5 טון: מאגר נפרד, רק נפח
const MOT = { cars: '053cea08-09bc-40ec-8f7a-156f0677aff3', models: '142afde2-6228-49f9-8a29-9b6c3a0cbe40', heavy: 'cd3acc5c-03c3-4c89-9c54-d40f93c0d790' };
let motWhy = '';
async function motQuery(rid, filters) {
  const j = JSON.parse(await get(`https://data.gov.il/api/3/action/datastore_search?resource_id=${rid}&filters=${encodeURIComponent(JSON.stringify(filters))}`, 3));
  if (!j.success) throw new Error('data.gov.il: ' + JSON.stringify(j.error).slice(0, 80));
  return j.result.records;
}
async function mot(plates) {
  const out = {}, queue = [...plates]; let fails = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const p = queue.shift();
      try {
        const [v] = await motQuery(MOT.cars, { mispar_rechev: Number(p) });
        if (v) {
          const ms = await motQuery(MOT.models, { tozeret_cd: v.tozeret_cd, degem_cd: v.degem_cd, shnat_yitzur: v.shnat_yitzur });
          const m = ms.find(r => r.ramat_gimur === v.ramat_gimur) || ms[0];
          if (m) out[p] = { hp: Number(m.koah_sus) || 0, cc: Number(m.nefah_manoa) || 0, seats: Number(m.mispar_moshavim) || 0 };
        } else {
          const [h] = await motQuery(MOT.heavy, { mispar_rechev: Number(p) });
          if (h) out[p] = { hp: 0, cc: Number(h.nefach_manoa) || 0, seats: 0 };
        }
      } catch (e) { fails++; motWhy = e.message; }
    }
  }));
  if (!Object.keys(out).length) { motWhy = motWhy || 'לא נמצא אף רכב'; return null; }
  if (fails) motWhy = `${fails} רכבים לא נבדקו (${motWhy})`;
  return out;
}

async function collect() {
  const list = JSON.parse(await get(CFG.site));
  if (!Array.isArray(list) || list.length < CFG.minSiteCars) die(`האתר החזיר ${list && list.length} רכבים (פחות מ-${CFG.minSiteCars}). לא ממשיכים.`);
  const feed = parseFeed(await get(CFG.feed));
  const cats = JSON.parse(await get(CFG.site.replace('/car?', '/car_category?')));
  const comCat = (cats.find(t => t.name === 'מסחריים') || {}).id;
  if (!comCat) die('לא נמצאה באתר הקטגוריה "מסחריים"');
  const cars = [];
  const queue = [...list];
  async function worker() {
    while (queue.length) {
      const it = queue.shift();
      const html = await get(it.link);
      const p = parseCarPage(html);
      const syncId = Number((dec(it.title.rendered).match(/->\s*(\d+)/) || [])[1]) || 0;
      const f = feed[p.plate];
      // 10 לתמונות המודעה, ועוד עד 5 גיבוי למקרה של תמונה כפולה בפיד (יונדאי אקסנט, 22.10.2026)
      const all = (f && f.imgs.length >= 10 ? f.imgs : p.siteImgs).slice(0, 15);
      const images = all.slice(0, 10), extra = all.slice(10);
      cars.push({ ...p, wpId: it.id, link: it.link, syncId, commercial: (it.car_category || []).includes(comCat), dateMs: Date.parse(it.date + '+03:00'),
        images, extra, imgSource: f && f.imgs.length >= 10 ? 'feed' : 'site', inFeed: !!f, salePrice: f ? f.salePrice : 0 });
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  computeAges(cars);
  for (const c of cars) delete c.siteImgs;
  cars.sort((a, b) => a.plate.localeCompare(b.plate));
  let api = await auto360();
  if (!api && !flag('--direct')) api = await stockFromGithub();
  const motData = await mot(cars.map(c => c.plate));
  writeJson('cars.json', { at: new Date().toISOString(), count: cars.length, cars, apiPlates: api, apiBody: api ? auto360Body : {}, apiInfo: auto360Info, apiWhy: auto360Why,
    mot: motData, motWhy });
  const bad = cars.filter(c => !c.plate || !c.title);
  console.log(`auto360: ${api ? api.length + ' רכבים' : 'לא זמין (' + auto360Why + ')'}. משרד התחבורה: ${motData ? Object.keys(motData).length + ' רכבים' + (motWhy ? ' (' + motWhy + ')' : '') : 'לא זמין (' + motWhy + ')'}. נאספו ${cars.length} רכבים. בלי תמונות: ${cars.filter(c => c.noPhotos).length}. לא בפיד: ${cars.filter(c => !c.inFeed).length}. שגיאות פענוח: ${bad.length}`);
  if (bad.length) die('פענוח נכשל: ' + bad.map(c => c.link).join(' '));
}

// ---------- הטקסט ----------
function splitTitle(title) {
  const t = title.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*\S)\s+((?:19|20)\d{2})$/);
  return m ? { name: m[1], year: m[2] } : { name: t, year: '' };
}

function trimOk(trim, plate) {
  if (!trim || TRIM_OMIT.has(plate)) return false;
  if (/\.\.\.|…$/.test(trim)) return false;
  return true;
}

function handPart(c) {
  const h = (c.hand || '').trim();
  // באתר "00"/"01"/"02" = יד 1/2/3, ו-"1" בלי אפס = יד 1 (נבדק מול auto360, 28.10). מציגים כפי שכתוב, ומסתירים יד אמיתית 3+
  const real = Number(h) + (h.startsWith('0') ? 1 : 0);
  if (!h || !(real < 3)) return '';
  return ` | יד ${h}${c.origin === 'פרטית' ? ' פרטי' : ''}`;
}

function emoji(c, star) {
  if (/חשמל/.test(c.fuel) && !/היבריד/.test(c.fuel)) return '⚡';
  if (PICKUP.test(c.title) || /טנדר/.test(star)) return '🛻';
  if (/SUV|קרוסאובר|ג'יפ/i.test(star)) return '🚙';
  return '🚗';
}

// "ק״מ נמוך לשנתון" רק אם האתר עצמו מסמן את הרכב "ק"מ נמוך" (אליחי, 22.10.2026).
// אותו כלל כמו בכרטיס הרכב באתר (snippet-car-card.php): ממוצע שנתי עד 18,000, ובמסחרי עד 24,000.
const LOW_KM = /,?\s*ק״מ נמוך לשנתון/;
function lowKm(c) {
  const { year } = splitTitle(c.title);
  const yrs = Math.max(1, new Date().getFullYear() - Number(year));
  return c.km > 0 && Number(year) > 1990 && c.km / yrs <= (c.commercial ? 24000 : 18000);
}
function fixStar(c, star) {
  let s = String(star || '').trim();
  if (LOW_KM.test(s) && !lowKm(c)) s = s.replace(LOW_KM, '').replace(/\s*\.?$/, '.');
  return s;
}

// טסט מופיע במודעה רק אם הוא בתוקף לפחות 6 חודשים מיום בניית המודעה (אליחי, 22.10.2026)
function testValid(t) {
  const m = String(t || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const min = new Date(); min.setMonth(min.getMonth() + 6);
  return new Date(+m[3], +m[2] - 1, +m[1], 23, 59) >= min;
}

// ---------- סרטון: מה הקריין אומר ומה כתוב על המסך (נבנה מאותם נתונים וכללים כמו הטקסט) ----------
// מספר במילים, כמו שאומרים בעברית מדוברת: 106000 -> "מאה ושש אלף", 2022 -> "אלפיים עשרים ושתיים"
const HE_UNITS = ['', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'];
const HE_TEENS = ['עשר', 'אחת עשרה', 'שתים עשרה', 'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה'];
const HE_TENS = ['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];
const HE_HUNDREDS = ['', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות', 'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות'];
const HE_THOUSANDS = { 1: 'אלף', 2: 'אלפיים', 3: 'שלושת אלפים', 4: 'ארבעת אלפים', 5: 'חמשת אלפים', 6: 'ששת אלפים', 7: 'שבעת אלפים', 8: 'שמונת אלפים', 9: 'תשעת אלפים', 10: 'עשרת אלפים' };
function heBelow1000(n) {
  const p = [];
  if (n >= 100) p.push(HE_HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r >= 10 && r < 20) p.push(HE_TEENS[r - 10]);
  else { if (r >= 20) p.push(HE_TENS[Math.floor(r / 10)]); if (r % 10) p.push(HE_UNITS[r % 10]); }
  return p;
}
function heNum(n) {
  n = Math.round(Number(n));
  if (!n) return 'אפס';
  const p = [], k = Math.floor(n / 1000), r = n % 1000;
  if (k) p.push(HE_THOUSANDS[k] || `${heNum(k)} אלף`);
  p.push(...heBelow1000(r));
  if (p.length > 1) p[p.length - 1] = 'ו' + p[p.length - 1]; // "ו" לפני האחרון
  return p.join(' ');
}
// מחיר: הפסקה קטנה אחרי האלפים, כמו שמקריאים מחיר
const heMoney = (n) => { const k = Math.floor(n / 1000), r = n % 1000; return k && r ? `${heNum(k * 1000)}, ${heNum(r)}` : heNum(n); };

// שמות שהקריין צריך לקרוא אחרת ממה שכתוב (אותיות לטיניות, מספרי דגם). דגם שלא כאן ויש בו לטינית: נאמר רק היצרן
const SAY_NAME = [
  [/קרייזלר דודג[׳'] ראם/, "דודג' ראם"], [/מזדה 2/, 'מאזדה שתיים'], [/מזדה 3/, 'מאזדה שלוש'], [/\bI20\b/i, 'איי עשרים'], [/\bI10\b/i, 'איי עשר'],
  [/\bXT5\b/, 'אקס טי חמש'], [/\bXT4\b/, 'אקס טי ארבע'], [/\bGLA200\b/, "ג'י אל איי מאתיים"], [/פיג'ו 2008/, "פז'ו אלפיים ושמונה"],
  [/פיג'ו 3008/, "פז'ו שלושת אלפים ושמונה"], [/פיג'ו/, "פז'ו"], [/\bST\b/, 'אס טי'], [/\bXV\b/, 'אקס וי'], [/\bBERLINA\b/i, 'ברלינה'], [/גיאומטרי C/, "ג'יאומטרי סי"],
];
function sayName(name) {
  let s = name; for (const [re, to] of SAY_NAME) s = s.replace(re, to);
  return /[A-Za-z]/.test(s) ? s.split(' ')[0] : s;
}
// הפתיח: שאלה לצופה, מתוך שורת ה-⭐ של הרכב
const HOOK_FIX = [
  [/^קטנה וקלה לחניה/, 'רכב קטן שקל להחנות'], [/^קטנה לעיר/, 'רכב קטן לעיר'], [/^קטן וקומפקטי לעיר/, 'רכב קטן לעיר'], [/^הקטן של .*/, 'רכב קטן לעיר'],
  [/^היברידית:.*/, 'רכב היברידי'], [/^הצ'בק של .*/, "האצ'בק לנסיעה יומיומית"], [/^מרווח לעבודה ולמשפחה/, 'רכב מרווח לעבודה ולמשפחה'],
  [/^רכב דיזל מרווח לעבודה ולמשפחה/, 'רכב דיזל מרווח לעבודה ולמשפחה'], [/^קומפקטי לעיר/, 'רכב קומפקטי לעיר'],
];
const SAY_WORDS = [[/\bSUV\b/g, 'אֶס-יוּ-וִי'], [/ל-7/g, 'לשבעה'], [/ל-8/g, 'לשמונה'], [/ל-6/g, 'לשישה'], [/4X4/gi, 'פוֹר בַּיי פוֹר']];
const sayWords = (s) => SAY_WORDS.reduce((x, [re, to]) => x.replace(re, to), s);
function hookOf(c, star) {
  let h = fixStar(c, star).replace(/\.$/, '').split(',')[0].trim();
  for (const [re, to] of HOOK_FIX) if (re.test(h)) { h = h.replace(re, to); break; }
  return h;
}
// פתיח לרכב בלי שורת ⭐: מסוג המרכב ב-auto360 ומנתוני האתר, בלי המצאה. אין התאמה: שם הרכב ("מחפשים סיאט איביזה?")
function autoHook(c, body) {
  const b = String(body || '').toUpperCase(), seats = c.seats || 0;
  if (/חשמל/.test(c.fuel) && !/היבריד/.test(c.fuel)) return 'רכב חשמלי';
  if (/היבריד/.test(c.fuel)) return 'רכב היברידי';
  if (PICKUP.test(c.title) || /PICKUP|TRUCK/.test(b)) return 'טנדר';
  if (/SUV|CROSSOVER|JEEP/.test(b)) return seats >= 7 ? `SUV ל-${seats} נוסעים` : 'SUV';
  if (seats >= 7) return `רכב ל-${seats} נוסעים`;
  if (/HATCH/.test(b)) return "האצ'בק";
  if (/SEDAN/.test(b)) return 'סדאן';
  if (/WAGON|ESTATE|STATION/.test(b)) return 'סטיישן';
  if (/VAN|MPV/.test(b) || c.commercial) return 'רכב מרווח לעבודה ולמשפחה';
  const n = splitTitle(c.title).name;
  return /[A-Za-z]/.test(n) ? n.split(' ')[0] : n;
}
const VIDEO_MUSIC = [ // Mixkit Stock Music Free License; מתחילים רגע לפני הביט
  ['https://assets.mixkit.co/music/623/623.mp3', 14.4], ['https://assets.mixkit.co/music/130/130.mp3', 14.1], ['https://assets.mixkit.co/music/371/371.mp3', 12.3],
  ['https://assets.mixkit.co/music/258/258.mp3', 10.4], ['https://assets.mixkit.co/music/471/471.mp3', 14.9], ['https://assets.mixkit.co/music/739/739.mp3', 9.0],
  ['https://assets.mixkit.co/music/282/282.mp3', 12.0], ['https://assets.mixkit.co/music/33/33.mp3', 10.4],
];
function videoJob(c, star) {
  const { name, year } = splitTitle(c.title);
  const L = (s) => `<span class="ltr">${s}</span>`;
  const segs = [];
  const hook = hookOf(c, star);
  segs.push({ beat: 1, say: `מחפשים ${sayWords(hook)}?`, show: `מחפשים ${hook.replace(/\bSUV\b/, '<b>SUV</b>')}?` });
  segs.push({ beat: 1, say: `${sayName(name)}${year ? ', ' + heNum(year) : ''}.`, show: trimOk(c.trim, c.plate) ? `גימור <b>${L(c.trim)}</b>` : `שנת ${L(year)}` });
  const real = Number(c.hand) + (String(c.hand).startsWith('0') ? 1 : 0);
  if (c.km) segs.push({ beat: 2, say: `${heNum(c.km)} קילומטר${real === 1 ? ', יד ראשונה' : ''}.`, show: `${L(fmt(c.km))} ק״מ${handPart(c)}` });
  const gearSay = /אוטומט/.test(c.gear) ? 'אוטומטית' : /ידני/.test(c.gear) ? 'ידנית' : /רובוט/.test(c.gear) ? 'רובוטית' : '';
  const eng = [c.hp ? `${heNum(c.hp)} כוח סוס` : '', c.fuel && !/בנזין/.test(c.fuel) ? c.fuel : '', gearSay].filter(Boolean);
  const engShow = [c.fuel, /אוטומט/.test(c.gear) ? 'אוטומטי' : c.gear, c.hp ? `${L(c.hp)} כ״ס` : ''].filter(Boolean);
  if (eng.length) segs.push({ beat: 2, say: eng.join(', ') + '.', show: engShow.join(' · ') });
  if (testValid(c.test)) segs.push({ beat: 2, say: '', show: `טסט עד ${L(c.test)}`, hold: 1.6 });
  if (c.price) segs.push({ beat: 3, say: `מחירון לוי יצחק: ${heMoney(c.price)} שקל.`, show: `מחירון לוי יצחק: <b>${L(fmt(c.price) + ' ₪')}</b>` });
  // המחירון הוא מידע, לא מחיר שאנחנו דורשים (אליחי 28.10). "מתחת למחירון" רק כשזה נכון (מחיר המכירה בפיד נמוך מהמחירון). המחיר עצמו לא מופיע אף פעם
  if (c.price && c.salePrice && c.salePrice < c.price) segs.push({ beat: 3, say: 'ואצלנו? מתחת למחירון.', show: 'אצלנו <b>מתחת למחירון</b>' });
  segs.push({ beat: 5, say: 'לבירור מחיר או הצעת טרייד-אין, שלחו הודעה בוואטסאפ.', show: '' });
  const [url, start] = VIDEO_MUSIC[Number(c.plate) % VIDEO_MUSIC.length];
  return { plate: c.plate, images: c.images, music: { url, start }, data: { plate: c.plate, name: `${name}${year ? ' ' + year : ''}` }, segs };
}

// NOVEMBER SALE (1.11–30.11.2026, אליחי 30.10). שתי גרסאות מאותו מנוע, ובשתיהן העברת בעלות במתנה (#109):
// ממומן (sale): מחיר המבצע בלבד, בלי מחירון. המחיר הוא מחיר הפרסום מ-auto360. במסחרי המחיר לפני מע"מ, ולכן "+ מע״מ".
// אורגני (organic): מחירון לוי יצחק בלבד (גם במסחרי, כולל מע"מ), בלי מחיר מכירה.
const SALE_SAY = 'נוֹבֶמְבֶּר סֵייל';
// המשפט החכם של כל רכב בסרטון (אליחי 30.10: "תמיד חוכמה ביצירת המשפט החכם"): רק מנתוני האתר, בלי סופרלטיבים ובלי מפרט מומצא
const VIDEO_LINES = {
};
// דגמים שקיימים גם באוטומט וגם בידני (קטנות ומסחריות קלות): רק בהם הגיר נכנס לכותרת
// "מתחת למחירון" רק כשזה נכון. במסחרי מחיר המכירה לפני מע"מ והמחירון כולל, ולכן משווים באותו בסיס.
// ב-today.json (מאגר ציבורי) אין מחיר מכירה, רק התשובה (below)
const belowList = (c) => (typeof c.below === 'boolean' ? c.below : !!(c.price && c.salePrice && c.salePrice * (c.commercial ? 1.18 : 1) < c.price));
const jeep = (s) => s.replace(/\bSUV\b/g, "ג'יפ").replace(/ג'יפ יוקרה(?= |,|$)/g, "ג'יפ יוקרתי");
const BOTH_GEARS = /I10|I20|פיקנטו|ספארק|ספייס סטאר|מזדה 2|איביזה|ראפיד|אקסנט|טיפו|אסטרה|ברלינגו|דובלו/i; // בניקוד, כדי שהקריין יגיד את זה נכון (#96)
function videoJobSale(c, star, mode, unique) {
  const { name, year } = splitTitle(c.title);
  const L = (s) => `<span class="ltr">${s}</span>`;
  const segs = [];
  const hook = hookOf(c, star);
  // פתיח על הקמפיין (כרטיס ניאון, בלי שורת כתובית): "נובמבר סייל בבית הרכב" (אליחי 30.10)
  segs.push({ beat: 0, intro: true, say: `${SALE_SAY} בבית הרכב!`, show: '' });
  // גיר רק בכותרת, ורק בדגם שקיים גם באוטומט וגם בידני (אליחי 30.10: "מיותר לרשום אוטומטי")
  const auto = /אוטומט/.test(c.gear), manual = /ידני/.test(c.gear);
  const gearT = manual || (auto && BOTH_GEARS.test(c.title)) ? (manual ? 'ידני' : 'אוטומטי') : '';
  // כל פרט כותרת משלו (אליחי 30.10: "כל כותרת בנפרד"). icon: האייקון המונפש ליד הכותרת
  // 1. יצרן, דגם ושנה במבצע סוף שנה: "קאדילאק XT4 שנת 2022 במבצע סוף שנה" (אליחי 30.10). גיר רק אם הדגם קיים בשתי הגרסאות
  const gearSay = gearT ? ', ' + (manual ? 'ידנית' : 'אוטומטית') : '';
  // שתי שורות גדולות אחת אחרי השנייה, משפט אחד בקריינות
  segs.push({ beat: 1, icon: 'car', say: `${sayName(name)}${gearSay}${year ? ', ' + heNum(year) : ''},`, show: `${name}${gearT ? ' ' + gearT : ''}${year ? ` שנת ${L(year)}` : ''}` });
  segs.push({ beat: 1, say: 'במבצע סוף שנה!', show: '<b>במבצע סוף שנה</b>' });
  // שורה ייחודית לרכב (אליחי 30.10): שורת ה-⭐ של המכונה, שנכתבה מנתוני האתר. בלי המצאה
  // משפט חכם לרכב (VIDEO_LINES, נכתב מנתוני האתר ומאושר ע"י אליחי). אין משפט: שורת ה-⭐.
  // "ג'יפ יוקרתי" ולא "SUV יוקרה" (אליחי 30.10: "אני לא אוהב שאומרים SUV")
  const uq = jeep((VIDEO_LINES[c.plate] || (unique ? fixStar(c, unique) : '')).replace(/\.$/, '').trim());
  // משפט עם פסיק: שתי שורות גדולות אחת אחרי השנייה, במקום שורה ארוכה וקטנה
  const uqParts = uq ? uq.split(/,\s*/).filter(Boolean) : [];
  uqParts.forEach((part, k) => segs.push({ beat: 1, say: `${sayWords(part)}${k < uqParts.length - 1 ? ',' : '!'}`, show: part }));
  // 2. מנוע וכ"ס: "מנוע 2000 בנזין · 237 כ״ס". הנפח מעוגל (#102), בחשמלי אין נפח
  const cc = c.cc ? Math.round(c.cc / 100) * 100 : 0, ev = /חשמל/.test(c.fuel) && !/היבריד/.test(c.fuel);
  // "מנוע 2000 מספק 237 כוחות סוס". מתחת ל-100 כ"ס לא מציינים את הכוח (אליחי 30.10)
  const hp = c.hp >= 100 ? c.hp : 0;
  const engShow = [ev ? 'מנוע חשמלי' : cc ? `מנוע ${L(cc)} ${c.fuel || ''}`.trim() : c.fuel, hp ? `${L(hp)} כ״ס` : ''].filter(Boolean);
  const engHead = ev ? 'מנוע חשמלי' : cc ? `מנוע ${heNum(cc)}` : '';
  const engSay = engHead && hp ? `${engHead} מספק ${heNum(hp)} כוחות סוס.` : engHead ? `${engHead}${!ev && c.fuel ? ', ' + c.fuel : ''}.` : hp ? `${heNum(hp)} כוחות סוס.` : '';
  if (engSay) segs.push({ beat: 2, icon: 'engine', say: engSay, show: engShow.join(' · ') });
  // 3. ק"מ, 4. יד (כמו באתר, יד 3+ מוסתרת, #99)
  const real = Number(c.hand) + (String(c.hand).startsWith('0') ? 1 : 0);
  if (c.km) segs.push({ beat: 2, icon: 'km', say: `${heNum(c.km)} קילומטר.`, show: `${L(fmt(c.km))} ק״מ` });
  const hand = handPart(c).replace(/^ \| /, '');
  if (hand) segs.push({ beat: 2, icon: 'key', say: real === 1 ? 'יד ראשונה.' : 'יד שנייה.', show: hand });
  if (testValid(c.test)) segs.push({ beat: 2, opt: 2, icon: 'test', say: '', show: `טסט עד ${L(c.test)}`, hold: 1.3 });
  if (mode === 'sale') {
    if (!c.salePrice) throw new Error(`${c.plate}: אין מחיר מבצע`);
    const vat = c.commercial ? ' פלוס מע"מ' : '', vatShow = c.commercial ? ' <small>+ מע״מ</small>' : '';
    segs.push({ beat: 3, price: true, say: `במחיר מבצע: ${heMoney(c.salePrice)} שקל${vat}!`, show: `מחיר NOVEMBER SALE|${L(fmt(c.salePrice) + ' ₪')}${vatShow}` }); // שתי שורות: מה המחיר | המספר
  } else if (c.price) {
    segs.push({ beat: 3, price: true, say: `מחירון לוי יצחק: ${heMoney(c.price)} שקל.`, show: `מחירון לוי יצחק|${L(fmt(c.price) + ' ₪')}` });
    // מחיר המכירה במסחרי לפני מע"מ, והמחירון כולל: משווים באותו בסיס
    // עם קריינות (אליחי 30.10: "אני כן רוצה קריינות")
    if (belowList(c)) segs.push({ beat: 3, say: 'ואצלנו? מתחת למחירון!', show: 'אצלנו <b>מתחת למחירון</b>' });
  }
  // ממומן: המתנה נאמרת על כרטיס הסיום (שם היא כתובה בגדול), כדי שהסרטון ייכנס ב-20 שניות. הכפתור והחץ הם ההנעה לפעולה
  // בשתי הגרסאות המתנה נאמרת על כרטיס הסיום, ושם כתוב גם שהיא של הקמפיין ולא של הרכב
  segs.push({ beat: 5, say: `וּבְ${SALE_SAY}: העברת בעלות במתנה!`, show: '' });
  // אורגני (בלי מחיר מבצע): ההזמנה נאמרת בקול בלבד, ועל המסך רק מספר הוואטסאפ
  if (mode !== 'sale') segs.push({ beat: 5, say: 'רוצים את מחיר המבצע, או הצעת טרייד-אין? שלחו לנו הודעה!', show: '' });
  const [url, start] = VIDEO_MUSIC[Number(c.plate) % VIDEO_MUSIC.length];
  // כל התמונות של הרכב בסדר של האתר (10 + הנוספות), והסרטון כולו עד 20 שניות (אליחי 30.10)
  // קריין נלהב יותר (אליחי 30.10): פחות יציבות, יותר סגנון. בלי האצה (#96)
  return { plate: c.plate, mode, maxSec: 25, voice: { stability: 0.3, similarity_boost: 0.8, style: 0.65, use_speaker_boost: true }, images: [...c.images, ...(c.extra || [])], music: { url, start }, data: { plate: c.plate, mode, name: `${name}${year ? ' ' + year : ''}` }, segs };
}

// רשימת המלאי לפרסום בגיטהאב: מספרי רישוי וסוג מרכב בלבד. בלי מחירים
function cmdStock(file) {
  const CJ = readJson('cars.json');
  if (!Array.isArray(CJ.apiPlates)) die('auto360 לא זמין: ' + (CJ.apiWhy || ''));
  writeJson(file || 'stock.json', { at: CJ.at, plates: CJ.apiPlates, body: CJ.apiBody || {} });
  console.log(`stock: ${CJ.apiPlates.length} רכבים`);
}
// משימת סרטון לכל רכב במלאי (בענן, בגיטהאב). רכב בלי 10 תמונות, או שלא במלאי auto360, מדולג
function cmdVideoJobsAll(dir = 'video-jobs') {
  fs.mkdirSync(dir, { recursive: true });
  const CJ = readJson('cars.json'); const api = Array.isArray(CJ.apiPlates) ? new Set(CJ.apiPlates) : null; const body = CJ.apiBody || {};
  const out = [];
  for (const c of CJ.cars) {
    if (c.noPhotos || c.images.length < 10 || (api && !api.has(c.plate))) continue;
    writeJson(`${dir}/${c.plate}.json`, videoJob(c, STARS[c.plate] || autoHook(c, body[c.plate])));
    out.push(c.plate);
  }
  fs.writeFileSync(`${dir}/_list.json`, JSON.stringify(out));
  console.log(`video-jobs-all: ${out.length} רכבים`);
}

// ---------- הפוסט היומי: איזה רכב עולה היום (כללים.md, סעיפים 1–2) ----------
// היומן בתוך המנוע, כדי שהוא יעלה לגיטהאב עם הקוד: מקור אמת אחד לענן ולמחשב
const LOG = __dirname + '/יומן פרסומים.csv';
// "לא רוצה מודעות לרכבים ללא תמונות ולרכבים עם נתונים ממש גרועים" (אליחי 30.10). הספים בסעיף 2 עוד ממתינים לאישור
const MAX_KM = 250000, MAX_AGE_YEARS = 15;
function whyNot(c) {
  const { year } = splitTitle(c.title), h = String(c.hand || '').trim(), real = Number(h) + (h.startsWith('0') ? 1 : 0);
  if (c.noPhotos || (c.images || []).length < 10) return 'פחות מ-10 תמונות';
  if (!year || !c.km || !c.price) return 'חסרים שנה, ק"מ או מחירון';
  if (real >= 3) return `יד ${real}`;
  if (c.km > MAX_KM) return `${fmt(c.km)} ק"מ`;
  if (new Date().getFullYear() - Number(year) > MAX_AGE_YEARS) return `שנת ${year}`;
  return '';
}
// שורה בסטטוס "טיוטה" (לפני שאליחי אישר פרסום אוטומטי) או "נכשל" לא נחשבת פרסום: הרכב יעלה שוב כשהמערכת תעבור לפרסום
const NOT_POSTED = new Set(['טיוטה', 'נכשל']);
function posted() {
  if (!fs.existsSync(LOG)) return new Set();
  return new Set(fs.readFileSync(LOG, 'utf8').split(/\r?\n/).slice(1).map((l) => l.split(','))
    .filter((r) => r[2] && !NOT_POSTED.has((r[5] || '').trim())).map((r) => r[2]));
}
// החדש ביותר במלאי (לפי תאריך הכניסה לאתר) שעוד לא פורסם ועובר את הסינון.
// רכב שלא במלאי auto360 נחשב נמכר (כללים.md 1.4). auto360 לא זמין: סומכים על האתר בלבד
function pickToday(CJ, n = 1) {
  const done = posted(), skipped = [], picked = [];
  const api = Array.isArray(CJ.apiPlates) ? new Set(CJ.apiPlates) : null;
  const cars = [...CJ.cars].sort((a, b) => (b.effDateMs || b.dateMs || 0) - (a.effDateMs || a.dateMs || 0));
  for (const c of cars) {
    if (done.has(c.plate)) continue;
    const why = api && !api.has(c.plate) ? 'לא במלאי auto360' : whyNot(c);
    if (why) { if (!picked.length) skipped.push(`${c.title} (${c.plate}): ${why}`); continue; }
    picked.push(c);
    if (picked.length === n) break;
  }
  return { car: picked[0] || null, next: picked[1] || null, skipped };
}

function makeJob(CJ, c, mode = 'organic') {
  return videoJobSale(c, autoHook(c, (CJ.apiBody || {})[c.plate]), mode, STARS[c.plate]);
}

// ---------- מלל הפוסט (כללים.md סעיף 5) ----------
// פותח בשם העסק וביתרון של הרכב, הפרטים בסדר קבוע (שם ושנה, ק"מ, יד, מנוע), מחירון בלבד, ההנעה לפעולה והמשפט המזוהה.
// בלי מחיר מכירה, בלי האשטגים, בלי מספר רישוי. שורת המתנה של החודש: סגנונות חודשיים\
const MONTH_GIFT = { '2026-11': 'בנובמבר סייל: העברת בעלות במתנה בכל רכישת רכב, עד 30.11.' };
// השורה המיוחדת של הרכב נכתבת כל יום ע"י AI (משימת Claude בענן) מהגימור, המפרט והתמונות של הרכב (אליחי 30.10:
// "תמיד יהיה AI שיכין את השורה המיוחדת לכל רכב", ולא סוג המרכב). אותה שורה בסרטון ובפוסט
const uniqueLine = (c, line) => jeep(fixStar(c, line || '').replace(/\.$/, '').trim());
// בדיקה של השורה לפני שהיא נכנסת לסרטון: קצרה, עד שני חלקים, בלי סופרלטיבים, קלישאות, האשטגים או מחיר
const LINE_BAD = /#|הכי |מושלם|מדהים|חלום|הזדמנות|לא תאמינו|מציאה|שווה כל|יחיד|במיוחד בשבילך|₪|שקל|מחיר|SUV/i;
function checkLine(line) {
  const parts = String(line || '').replace(/\.$/, '').split(/,\s*/).filter(Boolean), errs = [];
  if (!parts.length) errs.push('ריקה');
  if (parts.length > 2) errs.push('יותר משני חלקים (פסיקים)');
  for (const p of parts) if (p.length > 34) errs.push(`חלק ארוך מ-34 תווים: "${p}"`);
  if (LINE_BAD.test(line)) errs.push(`מילה אסורה: ${line.match(LINE_BAD)[0]}`);
  return errs;
}
function postText(c, month, line) {
  const { name, year } = splitTitle(c.title);
  const uq = uniqueLine(c, line);
  const cc = c.cc ? Math.round(c.cc / 100) * 100 : 0, ev = /חשמל/.test(c.fuel) && !/היבריד/.test(c.fuel);
  const hp = c.hp >= 100 ? `, ${c.hp} כ"ס` : '';
  const manual = /ידני/.test(c.gear), gear = manual || (/אוטומט/.test(c.gear) && BOTH_GEARS.test(c.title)) ? (manual ? ', ידני' : ', אוטומטי') : '';
  const engine = ev ? `מנוע חשמלי${hp}` : cc ? `מנוע ${cc} ${c.fuel || ''}`.trim() + hp + gear : '';
  // היד כמו באתר ("יד 01"), כמו בסרטון (#99). אליחי 31.10 דחה המרה ל"יד 2"
  const hand = handPart(c).replace(/^ \| /, '');
  const below = belowList(c);
  const lines = [
    `בית הרכב עפולה | ${name} ${year}${uq ? ', ' + uq : ''}`, '',
    `${name} שנת ${year}`, `${fmt(c.km)} ק"מ`, hand, engine,
    `מחירון לוי יצחק: ${fmt(c.price)} ₪${c.commercial ? ' (כולל מע"מ)' : ''}`, below ? 'אצלנו מתחת למחירון.' : '',
  ].filter((l, i) => l || i === 1);
  if (MONTH_GIFT[month]) lines.push('', MONTH_GIFT[month]);
  lines.push('', 'לבירור מחיר או הצעת טרייד-אין, שלחו הודעה בוואטסאפ: 04-640-1666', 'הבנים 41, עפולה',
    'בית הרכב בעפולה משנת 1989 – ניסיון, שירות ואמינות');
  return lines.join('\n');
}
// .env מקומי (פרטי Auto360). לא עולה לגיטהאב
if (fs.existsSync(__dirname + '/.env')) for (const l of fs.readFileSync(__dirname + '/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }

(async () => {
  const [cmd, ...rest] = process.argv.slice(2).filter((x, i, arr) => !(x.startsWith('--') || (i > 0 && arr[i - 1].startsWith('--'))));
  try {
    if (cmd === 'collect') await collect();
    else if (cmd === 'job') {
      const mode = arg('--mode') || 'organic', file = arg('--cars') || 'cars.json';
      const CJ = JSON.parse(fs.readFileSync(file, 'utf8')), body = CJ.apiBody || {};
      fs.mkdirSync('jobs', { recursive: true });
      for (const p of rest) {
        const c = CJ.cars.find((x) => x.plate === String(p).replace(/\D/g, ''));
        if (!c) die(`רכב ${p} לא במלאי`);
        const job = makeJob(CJ, c, mode);
        fs.writeFileSync(`jobs/${c.plate}.json`, JSON.stringify(job, null, 1));
        console.log(`${c.plate} ${job.data.name} (${mode})\n` + job.segs.map((g) => `  [${g.beat}] ${g.say || '(שקט)'}  ||  ${g.show.replace(/<[^>]+>/g, '')}`).join('\n'));
      }
    }
    else if (cmd === 'pick') {
      // node car_text.cjs pick [--cars file]: מדפיס את הרכב של היום (או "אין"), ולמה דולגו אחרים
      const { car, skipped } = pickToday(JSON.parse(fs.readFileSync(arg('--cars') || 'cars.json', 'utf8')));
      if (skipped.length) console.log('דולגו:\n  ' + skipped.join('\n  '));
      console.log(car ? `היום: ${car.plate} ${car.title}` : 'היום: אין רכב חדש שעוד לא פורסם');
    }
    else if (cmd === 'prepare') {
      // node car_text.cjs prepare [--cars file] [--plate X]: הרכב של היום ל-today.json, שממנו ה-AI כותב את השורה המיוחדת.
      // המאגר ציבורי: בלי מחיר מכירה, רק אם הוא מתחת למחירון (below)
      const CJ = JSON.parse(fs.readFileSync(arg('--cars') || 'cars.json', 'utf8'));
      const p = ilParts(), date = `${p.year}-${p.month}-${p.day}`;
      let { car, next, skipped } = pickToday(CJ, 2);
      if (arg('--plate')) { car = CJ.cars.find((x) => x.plate === arg('--plate')); if (!car) die(`רכב ${arg('--plate')} לא במלאי`); }
      const T = { date, at: new Date().toISOString(), skipped, auto360: Array.isArray(CJ.apiPlates) ? 'ok' : CJ.apiWhy || 'לא זמין',
        next: next ? next.title : '', car: null };
      if (car) {
        const { salePrice, ...pub } = car;
        T.car = { ...pub, below: belowList(car), body: (CJ.apiBody || {})[car.plate] || '', oldStar: STARS[car.plate] || '' };
      }
      writeJson('today.json', T);
      console.log(car ? `היום: ${car.plate} ${car.title}` : 'היום: אין רכב שעוד לא פורסם');
    }
    else if (cmd === 'check-line') {
      // node car_text.cjs check-line "<שורה>": OK או רשימת בעיות
      const errs = checkLine(rest.join(' '));
      console.log(errs.length ? 'ERR: ' + errs.join('; ') : 'OK');
      if (errs.length) process.exit(1);
    }
    else if (cmd === 'plan') {
      // node car_text.cjs plan: מ-today.json ומהשורה ב-line.json: משימת הסרטון ב-jobs\ ומלל הפוסט ב-plan.json
      const T = readJson('today.json'), L = fs.existsSync('line.json') ? readJson('line.json') : {};
      const plan = { date: T.date, at: new Date().toISOString(), skipped: T.skipped, auto360: T.auto360, next: T.next, car: null };
      if (T.car) {
        const c = T.car, { name, year } = splitTitle(c.title);
        if (L.plate !== c.plate || L.date !== T.date) die(`line.json לא של הרכב של היום (${L.plate || '-'} ${L.date || '-'})`);
        const errs = checkLine(L.line); if (errs.length) die('השורה המיוחדת נפסלה: ' + errs.join('; '));
        fs.mkdirSync('jobs', { recursive: true });
        fs.writeFileSync(`jobs/${c.plate}.json`, JSON.stringify(videoJobSale(c, autoHook(c, c.body), 'organic', L.line), null, 1));
        plan.car = { plate: c.plate, wpId: c.wpId, link: c.link, name: `${name} ${year}`, line: L.line,
          text: postText(c, T.date.slice(0, 7), L.line), title: `${name} ${year} | בית הרכב עפולה` };
      }
      writeJson('plan.json', plan);
      console.log(plan.car ? `${plan.car.name}\n\n${plan.car.text}` : 'היום: אין רכב');
    }
    else if (cmd === 'log') {
      // node car_text.cjs log <מספר רישוי> <רשתות> <סטטוס> [--cars file]
      const CJ = JSON.parse(fs.readFileSync(arg('--cars') || 'cars.json', 'utf8')), c = CJ.cars.find((x) => x.plate === rest[0]);
      const d = new Date(), il = d.toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
      if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, 'תאריך,שעה,מספר רישוי,רכב,רשתות,סטטוס\n');
      fs.appendFileSync(LOG, [il.slice(0, 10), il.slice(11, 16), rest[0], c ? c.title : '', (rest[1] || '').replace(/,/g, ' '), rest[2] || ''].join(',') + '\n');
      console.log('נרשם ביומן:', rest[0]);
    }
    else die('פקודה לא מוכרת. collect | pick | prepare | check-line | plan | job <מספר רישוי> | log <מספר רישוי> <רשתות> <סטטוס>');
  } catch (e) { die(e.message); }
})();
