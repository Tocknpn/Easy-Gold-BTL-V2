import { useEffect, useMemo, useState } from 'react';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, genMockSubmissions, labelDate, fmtLAKShort, getCurrentDateHelpers } from '../lib/submissions';
import { fetchStaff } from '../lib/workflow';
import type { StaffMember } from '../lib/workflow';
import BackButton from '../components/BackButton';

// Lao weekday names — matches the Excel template's ວັນ column
const LAO_DAYS = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'];
const laoDay = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return LAO_DAYS[d.getDay()] || '';
};
// Names already contain role labels in parentheses e.g. "ນ ສຸດສະດາ (ເມ)", "ນາງ ໃຈ (ກ້ອຍ)"
// Just join them with commas — no extra prefix needed.
const formatInCharge = (names: string[]): string => {
  if (!names.length) return '—';
  return names.join(', ');
};

export default function StaffReport() {
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  const { startOfMonth, endOfMonth } = getCurrentDateHelpers();
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(endOfMonth);
  const [staffName, setStaffName] = useState(''); // '' = All staff
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data, error }, staffData] = await Promise.all([
      fetchSubmissions(),
      fetchStaff()
    ]);
    if (error) console.error('Error fetching submissions:', error);
    if (data && data.length > 0) setSubmissions(data);
    if (staffData) setStaffList(staffData);
    setLoading(false);
  };

  const kpvStaff = useMemo(() => staffList.filter(s => s.team === 'KPV'), [staffList]);

  // KPV records only
  const kpvSubs = useMemo(
    () => submissions.filter(s => (s.team || 'KPV').toUpperCase().includes('KPV')),
    [submissions]
  );

  const inDateRange = (s: Submission) =>
    (!from || s.date >= from) && (!to || s.date <= to);

  // ── Per-staff working-day summary (All view) ───────────────────────────
  const staffSummary = useMemo(() => {
    return kpvStaff.map(st => {
      const dates = new Set<string>();
      for (const s of kpvSubs) {
        if (!inDateRange(s)) continue;
        const staffNames = (s.staff_in_charge || []).map(n => n.trim());
        if (staffNames.includes(st.name.trim())) dates.add(s.date);
      }
      const sorted = [...dates].sort();
      return {
        staffId: st.staffId || '—',
        name: st.name,
        days: sorted.length,
        lastDate: sorted.length ? sorted[sorted.length - 1] : '',
        dates: sorted,
      };
    }).sort((a, b) => b.days - a.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpvStaff, kpvSubs, from, to]);

  const grandTotalDays = useMemo(
    () => staffSummary.reduce((a, s) => a + s.days, 0),
    [staffSummary]
  );

  // ── Detail rows for the selected staff ────────────────────────────────
  const detailRows = useMemo(() => {
    if (!staffName) return [];
    return kpvSubs
      .filter(s => inDateRange(s) && (s.staff_in_charge || []).includes(staffName))
      .sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpvSubs, staffName, from, to]);

  const totalWorkingDays = new Set(detailRows.map(r => r.date)).size;

  // ── Export: document-style printable report (matches pic2 template) ──
  const buildDocHtml = (): string => {
    const range = `${from || '…'} — ${to || '…'}`;
    const monthLabel = from
      ? new Date(from + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : 'All time';


    // Collect all rows in date order for the chosen filter
    const allRows = kpvSubs
      .filter(s => inDateRange(s) && (!staffName || (s.staff_in_charge || []).map(n => n.trim()).includes(staffName.trim())))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Build staff day-count summary from the displayed rows
    const staffDayMap: Record<string, Set<string>> = {};
    for (const s of allRows) {
      for (const name of (s.staff_in_charge || [])) {
        const n = name.trim();
        if (!n) continue;
        if (!staffDayMap[n]) staffDayMap[n] = new Set();
        staffDayMap[n].add(s.date);
      }
    }
    const staffDaySummary = Object.entries(staffDayMap)
      .map(([name, dates]) => ({ name, days: dates.size }))
      .sort((a, b) => b.days - a.days);

    const totalUniqueDays = new Set(allRows.map(r => r.date)).size;

    // Main attendance rows
    const rowsHtml = allRows.length
      ? allRows.map((s, i) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td style="text-align:center">${laoDay(s.date)}</td>
          <td style="white-space:nowrap">${labelDate(s.date)} ${new Date(s.date + 'T00:00:00').getFullYear()}</td>
          <td>${s.branch}</td>
          <td>${formatInCharge(s.staff_in_charge || [])}</td>
          <td></td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;color:#888;padding:12px">ບໍ່ມີຂໍ້ມູນໃນໄລຍະດັ່ງກ່າວ</td></tr>`;

    // Staff summary rows
    const summaryRowsHtml = staffDaySummary.map(st => `
      <tr>
        <td>${st.name}</td>
        <td style="text-align:center">${st.days} ມື້</td>
        <td></td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Staff Report ${range}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans Lao', 'Phetsarath OT', 'Saysettha OT', Tahoma, sans-serif; color: #111; padding: 0; font-size: 10.5px; }
  .title { font-size: 12.5px; font-weight: 700; text-align: center; margin-bottom: 4px; }
  .range { text-align: center; font-size: 9.5px; color: #444; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9.5px; }
  th, td { border: 1px solid #333; padding: 3px 5px; vertical-align: top; }
  th { background: #e8e8e8; font-weight: 700; text-align: center; }
  tfoot td { background: #f2f2f2; font-weight: 700; }
  .sign-wrapper { border: 1px solid #333; margin-top: 10px; page-break-inside: avoid; }
  .sign-header { display: flex; border-bottom: 1px solid #333; background: #e8e8e8; }
  .sign-header div { flex: 1; padding: 4px 8px; font-weight: 700; font-size: 9.5px; border-right: 1px solid #333; text-align: center; }
  .sign-header div:last-child { border-right: none; }
  .sign-area { display: flex; gap: 0; }
  .sign-cell { flex: 1; border-right: 1px solid #333; padding: 8px 10px; font-size: 9.5px; }
  .sign-cell:last-child { border-right: none; }
  .sign-label { font-weight: 700; margin-bottom: 28px; }
  .sign-line { border-top: 1px solid #333; margin-bottom: 4px; }
  .sign-date { color: #555; font-size: 8.5px; }
  @page { size: A4 portrait; margin: 14mm 16mm; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="title">ສະຫລຸບ ລາຍຊື່ອອກບູສໜ້າຮ້ານຄຳພູວົງ ປະຈຳເດືອນ ${monthLabel} ( ${range} )</div>

  <table>
    <thead>
      <tr>
        <th style="width:28px">ລ/ດ</th>
        <th style="width:42px">ວັນ</th>
        <th style="width:90px">ວັນທີ</th>
        <th style="width:110px">ສາຂາ</th>
        <th>ຜູ້ຮັບຜິດຊອບ</th>
        <th style="width:80px">Remark</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr><td colspan="6" style="text-align:right">ລວມທັງໝົດ ${totalUniqueDays} ມື້</td></tr>
    </tfoot>
  </table>

  <table style="width:55%">
    <thead>
      <tr>
        <th>ລວມໜ້າວຽກ ${staffDaySummary.length} ຄົນ</th>
        <th style="width:80px">ຈຳນວນມື້</th>
        <th style="width:80px">ລາຍຮັບ</th>
      </tr>
    </thead>
    <tbody>${summaryRowsHtml}</tbody>
  </table>

  <div class="sign-wrapper">
    <div class="sign-header">
      <div>ຜູ້ສະເໝີ</div>
      <div>ຫົວໜ້າສາຍງານ</div>
      <div>ຜູ້ອຳນວຍການການຕະຫລາດ ແລະ ບໍລິການລູກຄ້າ</div>
    </div>
    <div class="sign-area">
      <div class="sign-cell">
        <div class="sign-label">&nbsp;</div>
        <div class="sign-line"></div>
        <div class="sign-date">ວັນທີ: ...........................</div>
      </div>
      <div class="sign-cell">
        <div class="sign-label">&nbsp;</div>
        <div class="sign-line"></div>
        <div class="sign-date">ວັນທີ: ...........................</div>
      </div>
      <div class="sign-cell">
        <div class="sign-label">&nbsp;</div>
        <div class="sign-line"></div>
        <div class="sign-date">ວັນທີ: ...........................</div>
      </div>
    </div>
  </div>

  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body></html>`;
  };

  const handleExportPdf = () => {
    const win = window.open('', '_blank');
    if (!win) {
      window.alert('Popup blocked — allow popups to export the PDF.');
      return;
    }
    win.document.open();
    win.document.write(buildDocHtml());
    win.document.close();
  };

  return (
    <div>
      <div className="demo-banner">
        <i className="fa-solid fa-circle-info"></i> {loading
          ? 'Loading KPV records…'
          : 'KPV expense-claim summary — pick a date range and staff member to total their working days, then export the document for HR signatures.'}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
        <select value={staffName} onChange={e => setStaffName(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
          <option value="">All KPV Staff</option>
          {kpvStaff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>Team: <span className="pill pill-gold">KPV only</span></span>
        <button className="btn btn-primary" onClick={handleExportPdf} style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: '12px' }}>
          <i className="fa-solid fa-file-pdf"></i> Export PDF{staffName ? ` — ${staffName.split(' ')[0]}` : ' (All Staff)'}
        </button>
      </div>

      {/* Summary cards */}
      {staffName ? (
        <>
          {/* Back arrow → previous view */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <BackButton onClick={() => setStaffName('')} label="All KPV Staff" />
            <span style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>
              Viewing detail — <strong style={{ color: 'var(--txt-main)' }}>{staffName}</strong>
            </span>
          </div>
          <div className="grid-3" style={{ marginBottom: '20px' }}>
            <div className="card" style={{ borderTop: '4px solid var(--gold)', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Staff</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{staffName}</div>
            </div>
            <div className="card" style={{ borderTop: '4px solid var(--blue)', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Working Days</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--gold)' }}>{totalWorkingDays}</div>
            </div>
            <div className="card" style={{ borderTop: '4px solid var(--green)', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Activity Records</div>
              <div style={{ fontSize: '26px', fontWeight: 800 }}>{detailRows.length}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '14px' }}>Working-Day Summary by Staff</h3>
            <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>Click a row to open the attendance detail</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Staff ID</th>
                <th>Staff Name</th>
                <th style={{ width: '160px' }}>Total Working Day</th>
                <th style={{ width: '180px' }}>Last Activity Date</th>
              </tr>
            </thead>
            <tbody>
              {staffSummary.map(s => (
                <tr
                  key={s.name}
                  onClick={() => setStaffName(s.name)}
                  title="Click to view attendance detail"
                  style={{ cursor: s.days > 0 ? 'pointer' : undefined }}
                >
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{s.staffId}</td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td><strong style={{ color: s.days > 0 ? 'var(--gold)' : 'var(--txt-dim)' }}>{s.days}</strong></td>
                  <td>{s.lastDate ? labelDate(s.lastDate) : <span style={{ color: 'var(--txt-dim)' }}>—</span>}</td>
                </tr>
              ))}
              {staffSummary.every(s => s.days === 0) && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '18px' }}>No in-charge records in this period.</td></tr>
              )}
            </tbody>
            {!staffSummary.every(s => s.days === 0) && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Total — {staffSummary.filter(s => s.days > 0).length} staff on duty</td>
                  <td><strong style={{ color: 'var(--gold)' }}>{grandTotalDays}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Detail table */}
      {staffName && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px' }}>Attendance Detail — {staffName}</h3>
            <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>{from || '…'} → {to || '…'} · Team KPV</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>No</th>
                <th>Day / ວັນ</th>
                <th>Date</th>
                <th>Branch / Place</th>
                <th>In Charge (Main · Assistants)</th>
                <th>People</th>
                <th>Buy Value</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td><span className="pill pill-gold">{laoDay(s.date)}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{labelDate(s.date)}</td>
                  <td>{s.branch}</td>
                  <td>{formatInCharge(s.staff_in_charge || [])}</td>
                  <td><strong>{(s.staff_in_charge || []).length}</strong></td>
                  <td>{fmtLAKShort((s.buy_value_new || 0) + (s.buy_value_existing || 0))}</td>
                </tr>
              ))}
              {detailRows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '24px' }}>
                  No records where this staff was in charge within the selected range.
                </td></tr>
              )}
            </tbody>
            {detailRows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5}><strong>Total working days (unique dates)</strong></td>
                  <td colSpan={2}><strong style={{ color: 'var(--gold)', fontSize: '16px' }}>{totalWorkingDays}</strong> <span style={{ color: 'var(--txt-dim)', fontSize: '11px' }}>/ {detailRows.length} records</span></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
