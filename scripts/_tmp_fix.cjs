const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const outDir = process.argv[3] || __dirname;

function loadShared(f) {
  if (!fs.existsSync(f)) return [];
  const ss = fs.readFileSync(f, 'utf8');
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(ss))) out.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
  return out;
}
const shared = loadShared(path.join(dir, 'xl', 'sharedStrings.xml'));

function colIdx(ref) {
  const letters = /^([A-Z]+)/.exec(ref)[1];
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

// sheet rows -> each row is {columnIndex: value} built from r= refs
function sheetTbl(file) {
  const f = path.join(dir, 'xl', 'worksheets', file);
  if (!fs.existsSync(f)) return [];
  const x = fs.readFileSync(f, 'utf8');
  const raw = [...x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
  return raw.map(r => {
    const row = {};
    const cells = [...r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
    for (const c of cells) {
      const refm = /r="([A-Z]+)[^"]*"/.exec(c[1]);
      if (!refm) continue;
      const ci = colIdx(refm[1]);
      const t = (/t="([^"]+)"/.exec(c[1]) || [])[1] || 'n';
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c[2]) || [])[1] || '';
      const is = (/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/.exec(c[2]) || [])[1] || '';
      let val = v;
      if (is) val = is;
      if (t === 's') val = typeof shared[Number(v)] === 'string' ? shared[Number(v)] : '';
      row[ci] = val;
    }
    return row;
  });
}

// Catalog (merch sheet5)
const merchRows = sheetTbl('sheet5.xml');
const mh = merchRows[0] || {};
let itemNameCol = null, cpuCol = null;
for (const ci in mh) { if (mh[ci] === 'itemName') itemNameCol = Number(ci); if (mh[ci] === 'cpu') cpuCol = Number(ci); }
const catalog = {};
for (let i = 1; i < merchRows.length; i++) {
  const row = merchRows[i];
  if (itemNameCol !== null && row[itemNameCol] !== undefined) catalog[row[itemNameCol]] = Number(row[cpuCol]);
}

const subRows = sheetTbl('sheet3.xml');
const hdr = subRows[0] || {};
const labelCol = {};
for (const ci in hdr) if (hdr[ci] !== undefined) labelCol[hdr[ci]] = Number(ci);
const HCC = n => (labelCol[n] === undefined ? -1 : labelCol[n]);
const Cdate = HCC('date'), Cmc = HCC('merch_cost'), Cmi = HCC('merch_items'), Clat = HCC('lat'), Clng = HCC('lng');
console.log('labelCol merch_items=' + Cmi + ' merch_cost=' + Cmc + ' date=' + Cdate);

function serialToDate(raw) {
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) { const p = s.split('/'); return p[0] + '-' + p[1] + '-' + p[2]; }
  if (/^\d{5}(\.0)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return d.toISOString().slice(0, 10); }
  return s;
}// process rows
const results = [];
let emptyMerch = 0, recomputed = 0, rebuilt = 0, kept = 0, unparsable = 0;
let minDate = '', maxDate = '';
for (let i = 1; i < subRows.length; i++) {
  const row = subRows[i];
  const dateRaw = row[Cdate] !== undefined ? row[Cdate] : '';
  const mcRaw = row[Cmc] !== undefined ? row[Cmc] : '';
  const miRaw = row[Cmi] !== undefined ? row[Cmi] : '';
  const mcOld = Number(mcRaw) || 0;
  const dateNew = serialToDate(dateRaw);
  if (dateNew) { if (!minDate || dateNew < minDate) minDate = dateNew; if (!maxDate || dateNew > maxDate) maxDate = dateNew; }

  let cost = mcOld;
  let itemsJson = miRaw;
  let note = 'unchanged';

  if (miRaw === undefined || String(miRaw).trim() === '' || String(miRaw).trim() === '-') {
    emptyMerch++;
  } else {
    const t = String(miRaw).replace(/&quot;/g, '"').replace(/[\r\n]+/g, ' ');
    let arr = null, err = false;
    try { const p = JSON.parse(t); arr = Array.isArray(p) ? p : null; } catch (e) { err = true; }
    if (err || !arr) {
      unparsable++; note = 'unparsable';
      itemsJson = '';
    } else {
      const items = arr.map(o => {
        const name = String(o.name || '');
        let cpu = Number(o.cpu) || 0;
        if (!cpu && catalog[name]) cpu = catalog[name];
        return { name, qty: Number(o.qty) || 0, cpu };
      });
      const sum = items.reduce((a, o) => a + o.qty * o.cpu, 0);
      const sum = items.reduce((a, o) => a + o.qty * o.cpu, 0);
      // Preserve stored merch_cost as authoritative; only fill cpu + clean JSON.
      cost = mcOld;
      itemsJson = JSON.stringify(items);
      note = 'cpu-filled';
      if (Math.abs(sum - mcOld) > Math.max(1, mcOld * 0.05)) { costMismatch++; note = 'cpu-filled(mismatch)'; }
    }
  }
  }
  results.push({ row: i, date: dateNew, cost: Math.round(cost), itemsJson, note });
}

const esc = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const headerLabels = Object.keys(hdr).sort((a, b) => Number(a) - Number(b)).map(ci => hdr[ci]);
const csvLines = [headerLabels.map(esc).join(',')];
for (let i = 1; i < subRows.length; i++) {
  const row = subRows[i];
  const fx = results[i - 1];
  const vals = headerLabels.map(label => {
    const ci = labelCol[label];
    if (label === 'date') return esc(fx.date);
    if (label === 'merch_cost') return esc(fx.cost);
    if (label === 'merch_items') return esc(fx.itemsJson);
    return esc(row[ci] !== undefined ? row[ci] : '');
  });
  csvLines.push(vals.join(','));
}
fs.writeFileSync(path.join(outDir, 'submissions_fixed.csv'), '\ufeff' + csvLines.join('\r\n'), 'utf8');

const audit = results.map(r => ({ excelRow: r.row + 1, date: r.date, note: r.note, cost: r.cost }));
fs.writeFileSync(path.join(outDir, 'merch_audit.json'), JSON.stringify(audit, null, 2), 'utf8');

console.log(JSON.stringify({
  totalRows: subRows.length - 1, emptyMerch, recomputed, rebuilt, kept, unparsable,
  minDate, maxDate, catalogItems: Object.keys(catalog).length, csv: 'submissions_fixed.csv'
}, null, 2));
