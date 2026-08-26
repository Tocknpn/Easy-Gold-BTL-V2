import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Submission, MerchItem } from '../lib/submissions';
import { MERCH_CATALOG, saveLocalSubmission, labelDate, fmtLAKShort } from '../lib/submissions';
import { getCheckIns, getStaff, getCurrentUser } from '../lib/workflow';

export default function SubmitResults() {
  const user = getCurrentUser();
  const isKPV = (user?.team || 'KPV') === 'KPV';

  // Activity check-ins captured by THIS staff member (from the Check-In menu)
  const myCheckIns = useMemo(
    () => getCheckIns().filter(c => c.user === (user?.name || '')),
    [user?.name]
  );

  const [checkInId, setCheckInId] = useState('');
  const [date, setDate] = useState('');
  const [branch, setBranch] = useState('');
  const [nc, setNc] = useState(0);
  const [nrp, setNrp] = useState(0);
  const [buyNew, setBuyNew] = useState(0);
  const [ec, setEc] = useState(0);
  const [buyExisting, setBuyExisting] = useState(0);
  const [footfall, setFootfall] = useState(0);
  const [stepIn, setStepIn] = useState(0);
  const [merchRows, setMerchRows] = useState<MerchItem[]>([]);
  // KPV only — Agency teams do not record Staff In Charge
  const [staffRows, setStaffRows] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState('');

  const kpvStaff = useMemo(() => getStaff().filter(s => s.team === 'KPV'), []);

  const merchCost = merchRows.reduce((a, i) => {
    const cpu = MERCH_CATALOG.find(m => m.name === i.name)?.cpu || 0;
    return a + Number(i.qty) * cpu;
  }, 0);
  const totalBuy = buyNew + buyExisting;

  const selectCheckIn = (id: string) => {
    setCheckInId(id);
    const rec = myCheckIns.find(c => c.id === id);
    if (rec) {
      setDate(rec.date);
      setBranch(rec.location);
    }
  };

    const updateMerch = (idx: number, patch: Partial<MerchItem>) => {
    setMerchRows(rows => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !branch) return;
    setSubmitting(true);

    const record: Submission = {
      id: `sub-${Date.now()}`,
      date,
      team: user?.team || 'KPV',
      branch,
      new_register: nc,
      new_reg_purchased: nrp,
      buy_value_new: buyNew,
      existing_users: ec,
      buy_value_existing: buyExisting,
      team_cost: 0, // Service cost is filled later by Admin in Cost Manager
      merch_cost: merchCost,
      merch_items: merchRows,
      staff_in_charge: isKPV ? staffRows : [],
      footfall,
      step_in: stepIn,
      status: 'active',
    };

    // Persist locally so the record shows up everywhere instantly
    saveLocalSubmission(record);

    // Best-effort database write (works when Supabase is connected)
    try {
      const { error } = await supabase
        .from('submissions')
        .insert([{
          date: record.date,
          team: record.team,
          branch: record.branch,
          new_register: record.new_register,
          new_reg_purchased: record.new_reg_purchased,
          buy_value_new: record.buy_value_new,
          existing_users: record.existing_users,
          buy_value_existing: record.buy_value_existing,
          team_cost: record.team_cost,
          merch_cost: record.merch_cost,
          merch_items: JSON.stringify(record.merch_items),
          staff_in_charge: JSON.stringify(record.staff_in_charge),
          footfall: record.footfall,
          step_in: record.step_in,
          status: record.status,
        }]);
      if (error) console.error('Saved locally only — DB insert failed:', error.message);
    } catch (err) {
      console.error('Saved locally only — DB unavailable:', err);
    }

    setSubmitting(false);
    setDone(`✓ Results submitted for ${branch} on ${labelDate(date)} — Admin will fill Service Cost in Cost Manager.`);
    // Reset form
    setCheckInId(''); setDate(''); setBranch('');
    setNc(0); setNrp(0); setBuyNew(0); setEc(0); setBuyExisting(0);
    setFootfall(0); setStepIn(0);
        setMerchRows([]); setStaffRows([]);
  };

  return (
    <div>
      {/* ── Activity Check-In selector ── */}
      <div style={{ background: 'rgba(46,194,122,0.1)', border: '1px solid var(--green)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }}></div>
        <strong style={{ fontSize: '13px', color: 'var(--txt-main)', whiteSpace: 'nowrap' }}>Activity Check-in:</strong>
        {myCheckIns.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--red)' }}>No captured check-in found — capture your location first.</span>
            <Link to="/checkin" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '11px' }}>
              <i className="fa-solid fa-location-dot"></i> Go to Check-In
            </Link>
          </div>
        ) : (
          <select
            value={checkInId}
            onChange={e => selectCheckIn(e.target.value)}
            required
            style={{ background: 'transparent', border: '1px solid rgba(46,194,122,0.3)', color: 'var(--green)', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, width: 'auto', minWidth: '260px' }}
          >
            <option value="">— Select your captured check-in —</option>
            {myCheckIns.map(c => (
              <option key={c.id} value={c.id}>{c.location} ({labelDate(c.date)} @ {c.time})</option>
            ))}
          </select>
        )}
      </div>

      {done && (
        <div className="alert alert-ok" style={{ marginBottom: '20px' }}>
          <i className="fa-solid fa-circle-check"></i> {done}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '15px', marginBottom: '3px' }}>Daily Activity Results</h2>
            <div className="text-xs">End-of-day Log</div>
          </div>
          <div className="text-xs" style={{ color: 'var(--txt-sub)' }}>{user?.team || 'KPV'} Team</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="form-field" style={{ margin: 0 }}><label>Branch / Location</label><input type="text" value={branch} onChange={e => setBranch(e.target.value)} placeholder="Auto-filled from check-in" required /></div>
          </div>

          <div className="text-xs" style={{ color: 'var(--blue)', marginBottom: '8px' }}><i className="fa-solid fa-user-plus"></i> NEW CUSTOMER DATA</div>
          <div className="grid-3" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Total New Customer (NC)</label><input type="number" min={0} value={nc} onChange={e => setNc(+e.target.value || 0)} required /></div>
            <div className="form-field" style={{ margin: 0 }}><label>New Customer Purchased</label><input type="number" min={0} value={nrp} onChange={e => setNrp(+e.target.value || 0)} required /></div>
            <div className="form-field" style={{ margin: 0 }}><label>Buy Value — New (LAK)</label><input type="number" min={0} value={buyNew} onChange={e => setBuyNew(+e.target.value || 0)} required /></div>
          </div>

          <div className="text-xs" style={{ color: 'var(--blue)', marginBottom: '8px' }}><i className="fa-solid fa-users"></i> EXISTING CUSTOMER DATA</div>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Total Existing Customers Met (EC)</label><input type="number" min={0} value={ec} onChange={e => setEc(+e.target.value || 0)} required /></div>
            <div className="form-field" style={{ margin: 0 }}><label>Buy Value — Existing (LAK)</label><input type="number" min={0} value={buyExisting} onChange={e => setBuyExisting(+e.target.value || 0)} required /></div>
          </div>

          <div className="text-xs" style={{ color: 'var(--green)', marginBottom: '8px' }}><i className="fa-solid fa-shoe-prints"></i> FOOTFALL</div>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Total Footfall</label><input type="number" min={0} value={footfall} onChange={e => setFootfall(+e.target.value || 0)} required /></div>
                        <div className="form-field" style={{ margin: 0 }}><label>Step-in Booth</label><input type="number" min={0} value={stepIn} onChange={e => setStepIn(+e.target.value || 0)} required /></div>
          </div>

          {/* ── Merchandise used ── */}
          <div className="text-xs" style={{ color: 'var(--gold)', marginBottom: '8px', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><i className="fa-solid fa-box"></i> MERCHANDISE USED</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>Cost: {fmtLAKShort(merchCost)}</span>
          </div>
          <div style={{ marginBottom: '24px' }}>
            {merchRows.map((row, idx) => {
              const cpu = MERCH_CATALOG.find(m => m.name === row.name)?.cpu || 0;
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.5fr 0.7fr 0.4fr', gap: '10px', alignItems: 'end', marginBottom: '8px' }}>
                  <select value={row.name} onChange={e => updateMerch(idx, { name: e.target.value })} style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}>
                    {MERCH_CATALOG.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                  <input type="number" min={0} placeholder="Qty" value={row.qty} onChange={e => updateMerch(idx, { qty: +e.target.value || 0 })} style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '13px' }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--txt-sub)' }}>{fmtLAKShort(Number(row.qty) * cpu)}</div>
                  <button type="button" className="btn" onClick={() => setMerchRows(rows => rows.filter((_, i) => i !== idx))} style={{ padding: '4px', borderRadius: '6px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(232,84,84,0.3)' }} title="Remove">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              );
            })}
            <button type="button" className="btn btn-ghost" onClick={() => setMerchRows(rows => [...rows, { name: MERCH_CATALOG[0].name, qty: 1, cpu: MERCH_CATALOG[0].cpu }])} style={{ fontSize: '12px', padding: '6px 14px' }}>+ Add Merch Item</button>
          </div>

          {/* ── Staff In Charge — KPV teams only (hidden for Agency) ── */}
          {isKPV && (
            <>
              <div className="text-xs" style={{ color: 'var(--gold)', marginBottom: '8px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <i className="fa-solid fa-users"></i> STAFF IN CHARGE
              </div>
              <div style={{ marginBottom: '24px' }}>
                {staffRows.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--txt-dim)', marginBottom: '8px' }}>Select who was in charge on this activity day (multiple allowed).</div>
                )}
                {staffRows.map((name, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                    <select value={name} onChange={e => setStaffRows(rows => rows.map((s, i) => (i === idx ? e.target.value : s)))} style={{ width: '260px', padding: '8px 12px', fontSize: '13px' }}>
                      {kpvStaff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                    <button type="button" className="btn" onClick={() => setStaffRows(rows => rows.filter((_, i) => i !== idx))} style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(232,84,84,0.3)' }} title="Remove">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost" onClick={() => setStaffRows(rows => [...rows, kpvStaff[0]?.name || ''])} style={{ fontSize: '12px', padding: '6px 14px' }}>+ Add Staff</button>
              </div>
            </>
          )}

          {/* ── Live summary ── */}
          <div className="summary-footer" style={{ borderTop: '2px solid var(--gold)', background: 'var(--input-bg)' }}>
            <div className="sum-box"><span>New Customer (NC)</span><strong>{nc}</strong></div>
            <div className="sum-box green"><span>Total Buy Value</span><strong>{fmtLAKShort(totalBuy)}</strong></div>
            <div className="sum-box gold"><span>Merch Cost</span><strong>{fmtLAKShort(merchCost)}</strong></div>
            <div className="sum-box"><span>Existing (EC)</span><strong>{ec}</strong></div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting || !date || !branch} style={{ width: '100%', opacity: submitting || !date || !branch ? 0.6 : 1 }}>
              <i className="fa-solid fa-check"></i> {submitting ? 'Submitting...' : 'Submit Results'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
