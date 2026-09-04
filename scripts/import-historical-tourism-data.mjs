#!/usr/bin/env node
/**
 * VistaBalayan historical tourism Excel cleanup/import.
 *
 * Usage:
 *   SOURCE_DIR=/path/to/excels SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-historical-tourism-data.mjs --dry-run
 *   SOURCE_DIR=/path/to/excels SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... EXECUTE_IMPORT=true node scripts/import-historical-tourism-data.mjs
 *
 * The script intentionally defaults to dry-run. It never creates establishments/users/UUIDs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const SOURCE_DIR = process.env.SOURCE_DIR || process.argv.find(a => a.startsWith('--source='))?.slice(9) || '/opt/data/vistabalayan_gdrive_import/source';
const DRY_RUN = !process.env.EXECUTE_IMPORT || process.env.EXECUTE_IMPORT !== 'true' || process.argv.includes('--dry-run');
const OUT_DIR = process.env.OUT_DIR || '/opt/data/vistabalayan_gdrive_import/output';
fs.mkdirSync(OUT_DIR, { recursive: true });

const MONTHS = new Map(Object.entries({
  jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12,
}));
const norm = v => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const isBlank = v => v == null || String(v).trim() === '';
const toNum = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g,'').trim();
  if (s === '' || /^[-–—]$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const md5 = s => crypto.createHash('md5').update(String(s)).digest('hex');
function excelDateToISO(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel serial, 1900 date system with leap-year bug compensation.
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0,10);
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) return validISO(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (m) return validISO(+m[3], +m[1], +m[2]) || validISO(+m[3], +m[2], +m[1]);
  m = s.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (m && MONTHS.has(norm(m[1]))) return validISO(+m[3], MONTHS.get(norm(m[1])), +m[2]);
  return null;
}
function validISO(y,m,d) {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m-1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m-1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function inferMonthYear(parts) {
  const text = parts.map(x => String(x ?? '')).join(' ');
  let month = null, year = null;
  for (const [name, idx] of MONTHS) if (new RegExp(`\\b${name}\\b`, 'i').test(text)) { month = idx; break; }
  const y = text.match(/\b(20\d{2})\b/); if (y) year = +y[1];
  let m = text.match(/\b(20\d{2})[-_\s](\d{1,2})\b/); if (m) { year = +m[1]; month = +m[2]; }
  m = text.match(/\b(\d{1,2})[-_\s](20\d{2})\b/); if (m) { month = +m[1]; year = +m[2]; }
  return { month, year };
}
function cellText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0,10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if (v.hyperlink && v.text) return String(v.text);
  }
  return String(v);
}
function rowValues(ws, rowNo) {
  const row = ws.getRow(rowNo); const arr=[];
  for (let c=1; c<=Math.max(ws.actualColumnCount, row.cellCount); c++) arr.push(cellText(row.getCell(c)).trim());
  return arr;
}
function findExcelFiles(dir) {
  const out=[];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes:true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...findExcelFiles(p));
    else if (/\.(xlsx|xlsm|xls)$/i.test(ent.name) && !/^~\$/.test(ent.name)) out.push(p);
  }
  return out;
}
function scoreName(candidate, est) {
  const a = norm(candidate), b = norm(est.name);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 92;
  const aw = new Set(a.split(' ').filter(w=>w.length>2));
  const bw = new Set(b.split(' ').filter(w=>w.length>2));
  const inter = [...aw].filter(w => bw.has(w)).length;
  const union = new Set([...aw,...bw]).size || 1;
  return Math.round((inter/union)*80);
}
function matchEstablishment(textParts, establishments) {
  const hay = textParts.join(' | ');
  let best = null;
  for (const est of establishments) {
    const s = scoreName(hay, est);
    if (!best || s > best.score) best = { est, score:s };
  }
  return best && best.score >= 55 ? best : null;
}
function classifyHeader(headers) {
  const h = headers.map(norm).join(' | ');
  const hasVisitor = /\b(male|female|guest|visitor|tourist|residence|municipality|province|group|reservation)\b/.test(h) && /\bmale\b/.test(h) && /\bfemale\b/.test(h);
  const hasAccommodation = /\b(room|occupied|occupancy|check in|guest night|nights|available)\b/.test(h) && (/\boccupied\b/.test(h) || /\broom\b/.test(h));
  if (hasVisitor && !hasAccommodation) return 'visitor';
  if (hasAccommodation && !hasVisitor) return 'accommodation';
  if (hasVisitor) return 'visitor';
  if (hasAccommodation) return 'accommodation';
  return null;
}
function colMap(headers) {
  const m={};
  headers.forEach((raw,i)=>{
    const h=norm(raw);
    if (!h) return;
    const set = k => { if (m[k] == null) m[k]=i; };
    if (/^(date|report date|day|arrival date|booking date)$/.test(h) || /\bdate\b/.test(h) || h==='day') set('date');
    if (/\bguest\b|\bgroup\b|reservation|name/.test(h) && !/night/.test(h)) set('guest_name');
    if (/\bmale\b/.test(h)) set('male');
    if (/\bfemale\b/.test(h)) set('female');
    if (/\b(total|no)\b.*\b(guest|visitor|tourist|pax|person)/.test(h) || h==='total') set('total_guests');
    if (/residence type|within|outside|resident|classification/.test(h)) set('residence_type');
    if (/place.*residence|residence|address|origin/.test(h) && !/type|classification/.test(h)) set('place_of_residence');
    if (/municipality|province|city/.test(h)) set('municipality_province');
    if (/total.*room|rooms available|no.*rooms|number.*rooms|room count/.test(h)) set('total_rooms');
    if (/occupied.*room|rooms occupied|occupancy/.test(h)) set('occupied_rooms');
    if (/check.*in|arrivals/.test(h)) set('check_ins');
    if (/guest.*night|room.*night|nights/.test(h)) set('guest_nights');
    if (/room.*type|category|accommodation type/.test(h)) set('room_type');
    if (/room.*code|room.*name|room no|room number/.test(h)) set('room_code');
    if (/number.*of.*rooms|qty|quantity/.test(h)) set('number_of_rooms');
  });
  return m;
}
function parseDateFromRow(row, map, inferred, warnings, ctx) {
  let iso = map.date != null ? excelDateToISO(row[map.date]) : null;
  if (!iso && map.date != null) {
    const day = toNum(row[map.date]);
    if (day != null && Number.isInteger(day) && inferred.year && inferred.month) iso = validISO(inferred.year, inferred.month, day);
    if (day != null && !iso) warnings.push({...ctx, issue:'invalid_date', value:row[map.date], inferred});
  }
  // Sometimes the first non-empty cell is just the day number.
  if (!iso && inferred.year && inferred.month) {
    const first = row.find(v => !isBlank(v));
    const day = toNum(first);
    if (day != null && Number.isInteger(day)) iso = validISO(inferred.year, inferred.month, day);
  }
  return iso;
}
async function getTableRows(supabase, table, select, opts={}) {
  let q = supabase.from(table).select(select);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}
async function tryDeleteAll(supabase, table, label) {
  const { count, error } = await supabase.from(table).delete({ count:'exact' }).neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) return { table, label, error:error.message, count:0 };
  return { table, label, count: count ?? null };
}
async function main() {
  const summary = { sourceDir: SOURCE_DIR, dryRun: DRY_RUN, files: [], sheets: [], warnings: [], skippedRows: [], duplicates: [], unmatched: [], imported: null };
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Service-role access is required for cleanup/import while preserving auth users.');
  const supabase = createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });

  const establishments = await getTableRows(supabase, 'establishments', '*');
  const profiles = await getTableRows(supabase, 'profiles', '*');
  const officer = profiles.find(p => p.role === 'municipal_officer' && (p.status ?? 'active') === 'active') || profiles.find(p => p.role === 'municipal_officer');
  const accountByEst = new Map();
  for (const est of establishments) {
    const staff = profiles.find(p => p.establishment_id === est.id && p.role === 'establishment_staff' && (p.status ?? 'active') === 'active') || profiles.find(p => p.establishment_id === est.id && p.role === 'establishment_staff');
    accountByEst.set(est.id, staff?.id || officer?.id || null);
  }
  summary.database = { establishments: establishments.length, profiles: profiles.length, activeOfficerFallback: officer?.id || null };

  const files = findExcelFiles(SOURCE_DIR);
  summary.files = files;
  const accommodation = new Map();
  const roomDetails = [];
  const visitors = [];

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    for (const ws of wb.worksheets) {
      const topRows=[];
      for (let r=1; r<=Math.min(ws.actualRowCount, 12); r++) topRows.push(...rowValues(ws,r).filter(Boolean));
      const inferred = inferMonthYear([path.basename(file), ws.name, ...topRows]);
      const estMatch = matchEstablishment([path.basename(file), ws.name, ...topRows], establishments);
      const sheetInfo = { file:path.relative(SOURCE_DIR,file), sheet:ws.name, inferred, establishment:estMatch?.est?.name || null, establishmentScore:estMatch?.score || 0, type:null, rows:0 };
      if (!estMatch) summary.unmatched.push({ file:sheetInfo.file, sheet:ws.name, issue:'no_existing_establishment_match' });
      let headerRow = null, headers = null, type = null, map = null;
      for (let r=1; r<=Math.min(ws.actualRowCount, 30); r++) {
        const vals = rowValues(ws,r);
        const t = classifyHeader(vals);
        if (t) { headerRow=r; headers=vals; type=t; map=colMap(vals); break; }
      }
      sheetInfo.type = type;
      summary.sheets.push(sheetInfo);
      if (!type || !headerRow) { summary.skippedRows.push({ file:sheetInfo.file, sheet:ws.name, issue:'no_recognized_header' }); continue; }
      if (!estMatch) continue;
      const establishment_id = estMatch.est.id;
      const submitted_by = accountByEst.get(establishment_id);
      if (!submitted_by) { summary.unmatched.push({ file:sheetInfo.file, sheet:ws.name, establishment:estMatch.est.name, issue:'no_profile_account_for_establishment_or_officer_fallback' }); continue; }

      for (let r=headerRow+1; r<=ws.actualRowCount; r++) {
        const row = rowValues(ws,r);
        const joined = norm(row.join(' '));
        if (!joined || /^(total|grand total|prepared by|submitted by|noted by)/.test(joined) || classifyHeader(row)) continue;
        const ctx = { file:sheetInfo.file, sheet:ws.name, row:r };
        const report_date = parseDateFromRow(row, map, inferred, summary.warnings, ctx);
        if (!report_date) { summary.skippedRows.push({...ctx, issue:'missing_or_invalid_daily_date'}); continue; }
        if (type === 'visitor') {
          const male = map.male != null ? toNum(row[map.male]) : null;
          const female = map.female != null ? toNum(row[map.female]) : null;
          const total = map.total_guests != null ? toNum(row[map.total_guests]) : (male != null && female != null ? male + female : null);
          if (male == null && female == null && total == null) { summary.skippedRows.push({...ctx, issue:'no_visitor_counts'}); continue; }
          if (male != null && female != null && total != null && male + female !== total) summary.warnings.push({...ctx, issue:'male_female_total_discrepancy', male, female, total});
          const rec = {
            establishment_id, submitted_by, report_date,
            guest_name: map.guest_name != null && !isBlank(row[map.guest_name]) ? String(row[map.guest_name]).trim() : null,
            total_male: male, total_female: female, total_guests: total,
            residence_type: map.residence_type != null && !isBlank(row[map.residence_type]) ? String(row[map.residence_type]).trim() : null,
            place_of_residence: map.place_of_residence != null && !isBlank(row[map.place_of_residence]) ? String(row[map.place_of_residence]).trim() : null,
            municipality_province: map.municipality_province != null && !isBlank(row[map.municipality_province]) ? String(row[map.municipality_province]).trim() : null,
            status: 'approved',
            created_at: `${report_date}T12:00:00Z`,
            _source: ctx,
          };
          const key = ['v', establishment_id, report_date, norm(rec.guest_name), rec.total_male, rec.total_female, rec.total_guests, norm(rec.place_of_residence), norm(rec.residence_type)].join('|');
          if (visitors.some(v => v._key === key)) { summary.duplicates.push({...ctx, type:'visitor_exact_duplicate'}); continue; }
          visitors.push({ ...rec, _key:key }); sheetInfo.rows++;
        } else if (type === 'accommodation') {
          const total_rooms = map.total_rooms != null ? toNum(row[map.total_rooms]) : (estMatch.est.total_rooms ?? null);
          const total_occupied_rooms = map.occupied_rooms != null ? toNum(row[map.occupied_rooms]) : null;
          const total_check_ins = map.check_ins != null ? toNum(row[map.check_ins]) : null;
          const total_guest_nights = map.guest_nights != null ? toNum(row[map.guest_nights]) : null;
          if ([total_rooms,total_occupied_rooms,total_check_ins,total_guest_nights].every(v => v == null)) { summary.skippedRows.push({...ctx, issue:'no_accommodation_metrics'}); continue; }
          const key = `${establishment_id}|${report_date}`;
          const existing = accommodation.get(key);
          if (existing) {
            const same = ['total_rooms','total_occupied_rooms','total_check_ins','total_guest_nights'].every(k => (existing[k] ?? null) === ({total_rooms,total_occupied_rooms,total_check_ins,total_guest_nights}[k] ?? null));
            if (!same) summary.warnings.push({...ctx, issue:'conflicting_accommodation_duplicate_date', existingSource:existing._source});
            else summary.duplicates.push({...ctx, type:'accommodation_duplicate_same_establishment_date'});
            continue;
          }
          accommodation.set(key, { establishment_id, submitted_by, report_date, total_rooms, total_occupied_rooms, total_check_ins, total_guest_nights, status:'approved', created_at:`${report_date}T12:00:00Z`, _source:ctx });
          if (map.room_type != null || map.room_code != null || map.number_of_rooms != null) {
            roomDetails.push({ parentKey:key, room_type: map.room_type != null ? row[map.room_type] || null : null, room_code: map.room_code != null ? row[map.room_code] || null : null, number_of_rooms: map.number_of_rooms != null ? toNum(row[map.number_of_rooms]) : total_rooms, occupied_rooms: total_occupied_rooms, check_ins: total_check_ins, guest_nights: total_guest_nights, is_rent_mode:false, _source:ctx });
          }
          sheetInfo.rows++;
        }
      }
    }
  }

  const accRows = [...accommodation.values()].map(({_source,...r})=>r);
  const visRows = visitors.map(({_key,_source,municipality_province,...r})=> {
    // Current app schema may not have municipality_province; keep it out of insert unless supported via generated column later.
    // Preserve it in audit JSON report.
    return r;
  });
  summary.prepared = { accommodationReports: accRows.length, visitorReports: visRows.length, roomDetails: roomDetails.length };
  summary.recordsPerEstablishment = {};
  for (const r of [...accRows, ...visRows]) summary.recordsPerEstablishment[establishments.find(e=>e.id===r.establishment_id)?.name || r.establishment_id] = (summary.recordsPerEstablishment[establishments.find(e=>e.id===r.establishment_id)?.name || r.establishment_id] || 0) + 1;
  const dates = [...accRows, ...visRows].map(r=>r.report_date).sort();
  summary.dateRange = { earliest: dates[0] || null, latest: dates.at(-1) || null };
  summary.establishmentsWithNoImportedData = establishments.filter(e => !summary.recordsPerEstablishment[e.name]).map(e => e.name);

  fs.writeFileSync(path.join(OUT_DIR, 'prepared-accommodation.json'), JSON.stringify(accRows, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'prepared-visitor.json'), JSON.stringify(visitors.map(({_key,...r})=>r), null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'prepared-room-details.json'), JSON.stringify(roomDetails, null, 2));

  if (!DRY_RUN) {
    const before = {};
    for (const t of ['room_occupancy_details','accommodation_reports','visitor_reports','ai_anomalies','ai_anomalies_cache','ai_recommendations','ai_insights_cache','notifications']) {
      const { count } = await supabase.from(t).select('id', { count:'exact', head:true }); before[t] = count;
    }
    const cleanup = [];
    cleanup.push(await tryDeleteAll(supabase, 'room_occupancy_details', 'room details first'));
    cleanup.push(await tryDeleteAll(supabase, 'accommodation_reports', 'accommodation reports'));
    cleanup.push(await tryDeleteAll(supabase, 'visitor_reports', 'visitor reports'));
    cleanup.push(await tryDeleteAll(supabase, 'ai_anomalies', 'AI anomalies'));
    cleanup.push(await tryDeleteAll(supabase, 'ai_anomalies_cache', 'AI anomalies cache'));
    cleanup.push(await tryDeleteAll(supabase, 'ai_recommendations', 'AI recommendations'));
    cleanup.push(await tryDeleteAll(supabase, 'ai_insights_cache', 'AI insights cache'));
    // Report-related/generated notifications only. Conservative text/type filter.
    const { count:notifCount, error:notifError } = await supabase.from('notifications').delete({ count:'exact' }).or('type.in.(report,warning,alert,success),title.ilike.%report%,message.ilike.%report%,title.ilike.%AI%,message.ilike.%AI%,title.ilike.%anomal%,message.ilike.%anomal%');
    cleanup.push({ table:'notifications', label:'report/AI related only', count:notifCount ?? 0, error:notifError?.message });
    const cleanupError = cleanup.find(x => x.error);
    if (cleanupError) throw new Error(`Cleanup failed at ${cleanupError.table}: ${cleanupError.error}`);

    let insertedAcc=[];
    for (let i=0; i<accRows.length; i+=500) {
      const { data, error } = await supabase.from('accommodation_reports').insert(accRows.slice(i,i+500)).select('id,establishment_id,report_date');
      if (error) throw new Error(`Insert accommodation_reports failed: ${error.message}`);
      insertedAcc.push(...(data||[]));
    }
    const idByKey = new Map(insertedAcc.map(r => [`${r.establishment_id}|${r.report_date}`, r.id]));
    const detailRows = roomDetails.map(({parentKey,_source,...d}) => ({ accommodation_report_id:idByKey.get(parentKey), ...d })).filter(d => d.accommodation_report_id);
    let insertedDetails=0;
    for (let i=0; i<detailRows.length; i+=500) {
      const { count, error } = await supabase.from('room_occupancy_details').insert(detailRows.slice(i,i+500), { count:'exact' });
      if (error) throw new Error(`Insert room_occupancy_details failed: ${error.message}`);
      insertedDetails += count ?? detailRows.slice(i,i+500).length;
    }
    let insertedVisitors=0;
    for (let i=0; i<visRows.length; i+=500) {
      const { count, error } = await supabase.from('visitor_reports').insert(visRows.slice(i,i+500), { count:'exact' });
      if (error) throw new Error(`Insert visitor_reports failed: ${error.message}`);
      insertedVisitors += count ?? visRows.slice(i,i+500).length;
    }
    const after = {};
    for (const t of ['room_occupancy_details','accommodation_reports','visitor_reports','ai_anomalies','ai_anomalies_cache','ai_recommendations','ai_insights_cache','notifications']) {
      const { count } = await supabase.from(t).select('id', { count:'exact', head:true }); after[t] = count;
    }
    summary.imported = { before, cleanup, insertedAccommodation: insertedAcc.length, insertedVisitors, insertedRoomDetails: insertedDetails, after };
  }

  const outPath = path.join(OUT_DIR, `import-summary-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok:true, dryRun:DRY_RUN, outPath, database:summary.database, files:files.length, prepared:summary.prepared, warnings:summary.warnings.length, skippedRows:summary.skippedRows.length, unmatched:summary.unmatched.length, duplicates:summary.duplicates.length, imported:summary.imported }, null, 2));
}
main().catch(err => { console.error(JSON.stringify({ ok:false, error:err.message, stack:err.stack }, null, 2)); process.exit(1); });
