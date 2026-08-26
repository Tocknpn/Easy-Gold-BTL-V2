// Convert EasyGold BTL.xlsx sheets to individual CSV files
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const XLSX = path.join(ROOT, 'EasyGold BTL.xlsx');
const TMP = path.join(ROOT, 'temp-egbtl');
const OUT = path.join(ROOT, 'data-export-cleaned');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
if (fs.existsSync(TMP)) execSync('rmdir /s /q "' + TMP + '"');
fs.mkdirSync(TMP, { recursive: true });

// Extract xlsx (it's a zip) — rename to .zip first since Expand-Archive rejects .xlsx
const ZIP = path.join(TMP, 'archive.zip');
execSync('powershell -NoProfile -Command "Copy-Item \'' + XLSX + '\' \'' + ZIP + '\'"', { stdio: 'ignore' });
execSync('powershell -NoProfile -Command "& { Expand-Archive -Path \'' + ZIP + '\' -DestinationPath \'' + TMP + '\' -Force }"', { stdio: 'ignore' });
console.log('Extracted XLSX');

// Parse shared strings
const sstPath = path.join(TMP, 'xl/sharedStrings.xml');
let sst = [];
if (fs.existsSync(sstPath)) {
  const sstXml = fs.readFileSync(sstPath, 'utf8');
  const siMatches = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)];
  sst = siMatches.map(m => {
    const tMatch = m[1].match(/<t[^>]*>([^<]*)<\/t>/);
    return tMatch ? tMatch[1] : '';
  });
}

// Sheet files in order
const sheets = [
  { name: 'users', file: 'sheet1.xml' },
  { name: 'audit_log', file: 'sheet2.xml' },
  { name: 'submissions', file: 'sheet3.xml' },
  { name: 'staff', file: 'sheet4.xml' },
  { name: 'merch', file: 'sheet5.xml' },
  { name: 'checkins', file: 'sheet6.xml' },
  { name: 'targets', file: 'sheet7.xml' },
  { name: 'route_plan', file: 'sheet8.xml' }
  // sheet9 = Staff Report Template (skip)
];

sheets.forEach(sheet => {
  const wsPath = path.join(TMP, 'xl/worksheets', sheet.file);
  if (!fs.existsSync(wsPath)) {
    console.log('⚠️  Missing ' + sheet.file);
    return;
  }
  
  const xml = fs.readFileSync(wsPath, 'utf8');
  const rows = parseSheet(xml, sst);
  const csv = toCSV(rows);
  const csvPath = path.join(OUT, sheet.name + '.csv');
  fs.writeFileSync(csvPath, csv, 'utf8');
  console.log('✅ ' + sheet.name + '.csv (' + (rows.length - 1) + ' data rows)');
});

// Clean up
try { execSync('rmdir /s /q "' + TMP + '"'); } catch(e) {}
console.log('\nDone! All CSV files saved to /data-export-cleaned/');

function parseSheet(xml, sst) {
  const rows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const cells = [];
    const cellRegex = /<c[^>]*r="(\w+)"[^>]*?(?:t="(\w+)")?>([^<]*)<\/c>/g;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      const [, ref, type, value] = cellMatch;
      if (type === 's') {
        const idx = parseInt(value);
        cells.push({ ref, value: sst[idx] || '' });
      } else {
        cells.push({ ref, value: value || '' });
      }
    }
    
    cells.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    rows.push(cells.map(c => c.value));
  }
  return rows;
}

function toCSV(rows) {
  return rows.map(row => 
    row.map(cell => {
      const str = String(cell || '');
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  ).join('\n');
}