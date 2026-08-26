const fs = require('fs');
const path = require('path');
const dir = process.argv[2];

function loadShared() {
  const f = path.join(dir, 'xl', 'sharedStrings.xml');
  if (!fs.existsSync(f)) return [];
  const ss = fs.readFileSync(f, 'utf8');
  const re = /<si>([\s\S]*?)<\/si>/g;
  const out = [];
  let m;
  while ((m = re.exec(ss))) out.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
  return out;
}
const shared = loadShared();

function sheetCells(file) {
  const f = path.join(dir, 'xl', 'worksheets', file);
  const x = fs.readFileSync(f, 'utf8');
  const raw = [...x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
  return raw.map(r => {
    const cells = [...r[1].matchAll(/<c[^>]*>([\s\S]*?)<\/c>/g)];
    return cells.map(c => {
      const t = (/t="([^"]+)"/.exec(c[0]) || [])[1] || 'n';
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c[1]) || [])[1] || '';
      const is = (/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/.exec(c[1]) || [])[1] || '';
      let val = v;
      if (is) val = is;
      if (t === 's') val = shared[parseInt(v, 10)] ?? ('#' + v);
      return val;
    });
  });
}

const merchRows = sheetCells('sheet5.xml');
const catalog = {};
for (let i = 1; i < merchRows.length; i++) {
  const r = merchRows[i];
  if (r[0]) catalog[r[0]] = Number(r[1]);
}
console.log('MERCH_CATALOG (sheet5) items: ' + Object.keys(catalog).length);
Object.entries(catalog).forEach(([k, v]) => console.log('  ' + k + ' = ' + v));

const subRows = sheetCells('sheet3.xml');
const header = subRows[0];
const miIdx = header.indexOf('merch_items');
const mcIdx = header.indexOf('merch_cost');
const dateIdx = header.indexOf('date');
console.log('merch_items col=' + miIdx + ' merch_cost col=' + mcIdx + ' date col=' + dateIdx);

let rowsWithMerch = 0, rowsMissingCpu = 0, mismatch = 0;
const noCatalogItems = new Set();
const allItemNames = new Set();
const observedCpu = {};
const missingCpuExamples = [];
const mismatchExamples = [];
for (let i = 1; i < subRows.length; i++) {
  const r = subRows[i];
  const jv = r[miIdx] || '';
  const date = r[dateIdx] || '';
  const mc = Number(r[mcIdx]);
  if (!jv || jv === '-' || jv.trim() === '') continue;
  rowsWithMerch++;
  let arr;
  try { arr = JSON.parse(jv.replace(/&quot;/g, '"')); } catch (e) {
    console.log('PARSE FAIL row ' + (i + 1) + ' date=' + date + ' len=' + jv.length);
    console.log('  RAW>> ' + jv.slice(0, 260));
    continue;
  }
  if (!Array.isArray(arr)) { console.log('NOT ARRAY row ' + (i + 1)); continue; }
  const miss = [];
  for (const o of arr) {
    if (!('cpu' in o) || o.cpu === '' || o.cpu === null || o.cpu === undefined) {
      miss.push(o.name || '?');
      missingCpuExamples.push({ date, full: o });
    } else if (o.name && !(o.name in catalog)) {
      noCatalogItems.add(o.name);
    }
    if (o.name) {
      allItemNames.add(o.name);
      if ('cpu' in o && Number(o.cpu) > 0) {
        if (!(o.name in observedCpu)) observedCpu[o.name] = o.cpu;
      }
    }
  }
  if (miss.length) rowsMissingCpu++;
  if (!isNaN(mc) && mc > 0) {
    const sum = arr.reduce((a, o) => a + Number(o.qty) * Number(o.cpu || 0), 0);
    if (Math.abs(sum - mc) > Math.max(1, mc * 0.05)) {
      mismatch++;
      if (mismatchExamples.length < 6) mismatchExamples.push({ date, sum, mc });
    }
  }
}
console.log('rows with merch_items = ' + rowsWithMerch);
console.log('rows missing cpu (>=1 item) = ' + rowsMissingCpu);
console.log('missing-cpu item shapes: ' + JSON.stringify(missingCpuExamples.slice(0, 6)));
console.log('DISTINCT item names seen: ' + JSON.stringify([...allItemNames]));
console.log('observed cpu per item (from data): ' + JSON.stringify(observedCpu));
console.log('item names NOT in catalog: ' + JSON.stringify([...noCatalogItems]));
console.log('merch_cost mismatches (>5%) = ' + mismatch);
console.log('mismatch samples: ' + JSON.stringify(mismatchExamples));