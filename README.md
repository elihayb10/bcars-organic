# bcars-organic

הפוסט האורגני היומי של בית הרכב (עפולה): כל יום רכב אחד מהמלאי, סרטון רילס, ותזמון ב-Metricool.

1. `daily.mjs prepare` (GitHub Actions, 05:00): איסוף מהאתר ומ-auto360, בחירת הרכב החדש ביותר שעוד לא פורסם -> `today.json`.
2. משימת Claude בענן (06:00): כותבת את השורה המיוחדת של הרכב ודוחפת `line.json` ל-`claude/line-<תאריך>`.
3. `daily.mjs render` (GitHub Actions): הסרטון (`render.mjs`, קריינות שמורה ב-`voice-cache/`), `plan.json`, שורה ב-`יומן פרסומים.csv`.
4. אותה משימה: `schedule.mjs` בוחר שעה לכל רשת, והיא מתזמנת ב-Metricool ושולחת דוח.

`config.json`: `live: false` = הפוסטים נשמרים ב-Metricool כטיוטות בלבד.

מוזיקה: Mixkit Stock Music Free License. גופנים: Heebo, Karantina (SIL OFL).
