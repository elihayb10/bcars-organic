// הריצה היומית בענן (GitHub Actions). שני שלבים:
// prepare (05:00, א'–ו'): איסוף המלאי ובחירת הרכב של היום -> today.json
// render (כשמשימת Claude דוחפת את השורה המיוחדת ל-claude/line-<תאריך>): סרטון אחד, plan.json ושורה ביומן
// המשימה בענן קוראת את plan.json ומתזמנת ב-Metricool. מתג הפרסום: config.json (live: false = טיוטות בלבד)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const REPO = process.env.GITHUB_REPOSITORY || 'elihayb10/bcars-organic';
const LOG = 'יומן פרסומים.csv';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

function commit(msg, files) {
  run('git', ['add', '-A', ...files]);
  try { out('git', ['diff', '--cached', '--quiet']); return; } catch {}
  run('git', ['-c', 'user.name=bcars-organic-bot', '-c', 'user.email=bcars-organic-bot@users.noreply.github.com', 'commit', '-q', '-m', msg]);
  run('git', ['pull', '-q', '--rebase']);
  run('git', ['push', '-q']);
}

const step = process.argv[2];
if (step === 'prepare') {
  // אין סגנון לחודש הבא: עוצרים ומודיעים, ולא מפרסמים בסגנון של נובמבר (סגנונות חודשיים, "ב-1.12")
  if (today > cfg.styleUntil) {
    fs.writeFileSync('today.json', JSON.stringify({ date: today, error: `אין סגנון חודשי אחרי ${cfg.styleUntil}. צריך סגנון חדש בתיקייה סגנונות חודשיים` }, null, 1));
    commit(`today: ${today} (אין סגנון)`, ['today.json']);
    console.log('::error::אין סגנון חודשי');
    process.exit(1);
  }
  // רכב אחד ביום: אם כבר תוזמן היום פוסט רכב (שורה "תוכנן" ביומן עם התאריך של היום), לא בונים עוד אחד
  const already = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).map((l) => l.split(',')).find((r) => r[0] === today && (r[5] || '').trim() === 'תוכנן');
  if (already) {
    fs.writeFileSync('today.json', JSON.stringify({ date: today, error: `כבר תוזמן היום פוסט רכב (${already[3]}), לא נבנה עוד אחד` }, null, 1));
    commit(`today: ${today} (כבר תוזמן)`, ['today.json']);
    process.exit(0);
  }
  run('node', ['car_text.cjs', 'collect']);
  run('node', ['car_text.cjs', 'prepare']);
  commit(`today: ${today}`, ['today.json']);
}
else if (step === 'render') {
  const ref = process.env.LINE_REF;
  fs.writeFileSync('line.json', out('git', ['show', `origin/${ref}:line.json`]));
  const plan0 = () => JSON.parse(fs.readFileSync('plan.json', 'utf8'));
  let plan;
  try {
    run('node', ['car_text.cjs', 'plan']);
    plan = plan0();
    plan.mode = cfg.live ? 'live' : 'draft';
    if (plan.car) {
      const file = `${plan.date}-${plan.car.plate}.mp4`;
      run('node', ['render.mjs', `jobs/${plan.car.plate}.json`, `out/${file}`]);
      try { out('gh', ['release', 'view', 'videos', '-R', REPO]); }
      catch { run('gh', ['release', 'create', 'videos', '-R', REPO, '--title', 'סרטוני הפוסט היומי', '--notes', 'נוצר אוטומטית ע"י daily.mjs', '--latest=false']); }
      run('gh', ['release', 'upload', 'videos', `out/${file}`, '-R', REPO, '--clobber']);
      plan.car.video = `https://github.com/${REPO}/releases/download/videos/${file}`;
      // שורה אחת ביומן לכל רכב ביום, גם אם הסרטון נבנה שוב. "טיוטה" לא נחשבת פרסום (car_text.cjs, posted)
      const row = [today, hhmm, plan.car.plate, plan.car.name, 'instagram facebook tiktok youtube', cfg.live ? 'תוכנן' : 'טיוטה'].join(',');
      const log = fs.readFileSync(LOG, 'utf8');
      if (!log.split(/\r?\n/).some((l) => l.startsWith(`${today},`) && l.split(',')[2] === plan.car.plate)) fs.appendFileSync(LOG, (log.endsWith('\n') ? '' : '\n') + row + '\n');
    }
  } catch (e) {
    plan = fs.existsSync('plan.json') ? plan0() : { date: today };
    plan.date = today; plan.error = String(e.message).split('\n')[0].slice(0, 200);
    if (plan.car) delete plan.car.video;
  }
  fs.writeFileSync('plan.json', JSON.stringify(plan, null, 1));
  commit(`plan: ${today} ${plan.car ? plan.car.name : 'אין רכב'}${plan.error ? ' (שגיאה)' : ''}`, ['plan.json', 'line.json', LOG, 'voice-cache']);
  try { run('git', ['push', '-q', 'origin', '--delete', ref]); } catch {}
  // סרטונים בני יותר מ-21 יום נמחקים מהגרסה (Metricool כבר העתיק אותם)
  const old = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  try {
    for (const a of JSON.parse(out('gh', ['release', 'view', 'videos', '-R', REPO, '--json', 'assets'])).assets)
      if (/^\d{4}-\d{2}-\d{2}-/.test(a.name) && a.name.slice(0, 10) < old) run('gh', ['release', 'delete-asset', 'videos', a.name, '-R', REPO, '--yes']);
  } catch {}
  if (plan.error) { console.log('::error::' + plan.error); process.exit(1); }
}
else { console.error('usage: node daily.mjs prepare|render'); process.exit(2); }
