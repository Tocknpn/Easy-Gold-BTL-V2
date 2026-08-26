import { useEffect, useMemo, useState } from 'react';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, genMockSubmissions, labelDate, fmtLAKShort } from '../lib/submissions';
import { getStaff } from '../lib/workflow';
import BackButton from '../components/BackButton';

// Lao weekday names — matches the Excel template's ວັນ column
const LAO_DAYS = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'];
const laoDay = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return LAO_DAYS[d.getDay()] || '';
};
// "ເມ: lead / ກ້ອຍ: a, b" — main + assistants, per the Excel convention
const formatInCharge = (names: string[]): string => {
  if (!names.length) return '—';
  const lead = names[0];
  const rest = names.slice(1);
  return `ເມ: ${lead}` + (rest.length ? ` / ກ້ອຍ: ${rest.join(', ')}` : '');
};

export default function StaffReport() {
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('2025-03-01');
  const [to, setTo] = useState('2025-03-31');
  const [staffName, setStaffName] = useState(''); // '' = All staff

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await fetchSubmissions();
    if (error) console.error('Error fetching submissions:', error);
    if (data && data.length > 0) setSubmissions(data);
    setLoading(false);
  };

  const kpvStaff = useMemo(() => getStaff().filter(s => s.team === 'KPV'), []);

  // KPV records only
  const kpvSubs = useMemo(
    () => submissions.filter(s => (s.team || 'KPV') === 'KPV'),
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
        if ((s.staff_in_charge || []).includes(st.name)) dates.add(s.date);
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

  // ── Export: document-style printable report (matches Excel/PDF template) ──
  const buildDocHtml = (): string => {
    const range = `${from || '…'} — ${to || '…'}`;
    const monthLabel = from
      ? new Date(from + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : 'All time';
    const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const headRow = `
      <tr>
        <th style="width:60px">ວັນ<br/><span class="en">Day</span></th>
        <th style="width:110px">ວັນທີ<br/><span class="en">Date</span></th>
        <th>ສາຂາ / ສະຖານທີ່<br/><span class="en">Branch / Place</span></th>
        <th>ຜູ້ຮັບຜິດຊອບຫຼັກ<br/><span class="en">In Charge (Main / Assistant)</span></th>
        <th style="width:70px">ຈຳນວນ<br/><span class="en">People</span></th>
        <th style="width:150px">Remark</th>
      </tr>`;

        const rowHtml = (s: Submission) => `
      <tr>
        <td>${laoDay(s.date)}</td>
        <td>${labelDate(s.date)} ${new Date(s.date + 'T00:00:00').getFullYear()}</td>
        <td>${s.branch}</td>
        <td>${formatInCharge(s.staff_in_charge || [])}</td>
        <td>${(s.staff_in_charge || []).length}</td>
        <td>${(s.buy_value_new || 0) + (s.buy_value_existing || 0) > 0 ? `Buy ${fmtLAKShort((s.buy_value_new || 0) + (s.buy_value_existing || 0))}` : ''}</td>
      </tr>`;

    let body = '';
    if (!staffName) {
      for (const st of staffSummary.filter(s => s.days > 0)) {
        const rows = kpvSubs
          .filter(s => inDateRange(s) && (s.staff_in_charge || []).includes(st.name))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (!rows.length) continue;
        body += `
          <div class="staff-block">
            <h2>${st.name} — KPV</h2>
            <table class="doc-table"><thead>${headRow}</thead><tbody>${rows.map(rowHtml).join('')}</tbody>
            <tfoot><tr><td colspan="6" class="total-row">Total working days: <strong>${st.days}</strong></td></tr></tfoot></table>
          </div>`;
      }
            if (!body) body = `<p class="empty" style="text-align:center;padding:20px">No KPV activity records in this period.</p>`;
    } else {
      body = `
        <div class="staff-block">
          <h2>${staffName} — KPV</h2>
          <table class="doc-table"><thead>${headRow}</thead><tbody>
            ${detailRows.length ? detailRows.map(rowHtml).join('') : `<tr><td colspan="6" class="empty" style="text-align:center">No records in this period.</td></tr>`}
          </tbody><tfoot>
            <tr><td colspan="6" class="total-row">Total working days: <strong>${totalWorkingDays}</strong></td></tr>
          </tfoot></table>
        </div>`;
    }

    const signBlock = (roleLao: string, roleEn: string) => `
      <div class="sign">
        <div class="sign-role">${roleLao}<br/><span>${roleEn}</span></div>
        <div class="sign-line"></div>
        <div class="sign-cap">( ${roleEn} )</div>
        <div class="sign-date">Date: ..............................</div>
      </div>`;

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Staff Report ${range}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans Lao', 'Phetsarath OT', 'Saysettha OT', Tahoma, sans-serif; color: #111; padding: 32px 40px; }
  .letterhead { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #A77B27; padding-bottom: 10px; margin-bottom: 18px; }
  .logo { width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #C9A227, #8f6b1d); font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .lh-name { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
  .lh-sub { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
  h1.title { font-size: 16px; text-align: center; margin-bottom: 4px; }
  .range { text-align: center; font-size: 12px; color: #444; margin-bottom: 14px; }
  h2 { font-size: 13px; margin: 18px 0 8px; border-left: 4px solid #A77B27; padding-left: 8px; }
  table.doc-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .doc-table th, .doc-table td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
  .doc-table th { background: #efe9da; font-weight: 700; }
  .doc-table th .en { font-weight: 500; font-size: 9px; color: #666; }
  .doc-table tfoot td.total-row { background: #f4f2ec; font-weight: 700; text-align: right; }
  .empty { color: #888; }
  .sign-area { display: flex; gap: 30px; margin-top: 42px; page-break-inside: avoid; }
  .sign { flex: 1; text-align: center; font-size: 12px; }
  .sign-role { font-weight: 700; margin-bottom: 34px; }
  .sign-role span { font-weight: 400; color: #777; font-size: 10px; }
  .sign-line { border-top: 1.5px solid #333; margin-bottom: 4px; }
  .sign-cap { color: #555; margin-bottom: 3px; }
  .sign-date { color: #555; }
  .foot { margin-top: 26px; font-size: 10px; color: #999; text-align: right; border-top: 1px solid #ddd; padding-top: 8px; }
  @page { size: A4 portrait; margin: 14mm; }
</style></head>
<body>
  <div class="letterhead">
    <div class="logo">🏅</div>
    <div><div class="lh-name">EASY GOLD BTL</div><div class="lh-sub">Phouvang Gold Shop · Field Team Operations</div></div>
  </div>

  <h1 class="title">ສະຫລຸບ ລາຍຊື່ອອກປະຈຳໜ້າຮ້ານຄຳພູວົງ ປະຈຳເດືອນ ${monthLabel}</h1>
  <div class="range">( ${range} ) — Staff Expense Claim Summary · Team KPV</div>

  ${body}

  <div class="sign-area">
    ${signBlock('ຜູ້ປະຕິບັດງານ', 'Staff Signature')}
    ${signBlock('ຜູ້ຈັດການ', 'Manager')}
    ${signBlock('ຝ່າຍບຸກຄະລາກອນ', 'HR / Finance')}
  </div>

  <div class="foot">Easy Gold BTL Tracker · generated ${genDate} · This document supports monthly expense claims with HR.</div>

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
