import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Submission, MerchItem } from '../lib/submissions';
import { MERCH_CATALOG, fetchMerchCatalog, saveLocalSubmission, getLocalSubmissions, labelDate, fmtLAKShort, clearSubmissionsCache, DEFAULT_ACTIVITY_TYPE, normalizeActivityType, activityLabel, isMissingColumnError, MISSING_ACTIVITY_COLUMN_HINT } from '../lib/submissions';
import { fetchCheckIns, fetchStaff, getCurrentUser, writeAuditLog } from '../lib/workflow';
import type { CheckInRecord, StaffMember } from '../lib/workflow';
import type { Event } from '../lib/events';
import { fetchEvents } from '../lib/events';

// Helper component for number inputs with comma formatting (e.g. 1,000)
const NumberInput = ({ value, onChange, placeholder }: { value: number, onChange: (v: number) => void, placeholder?: string }) => {
  const [str, setStr] = useState(value === 0 ? '' : value.toLocaleString());
  useEffect(() => {
    if (value === 0 && str !== '') setStr('');
  }, [value]);
  
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={str}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(raw)) {
          setStr(raw ? Number(raw).toLocaleString() : '');
          onChange(raw ? Number(raw) : 0);
        }
      }}
    />
  );
};

export default function SubmitResults() {
  const user = getCurrentUser();
  const isAdmin = user?.role === 'admin';

  // Admin can switch team freely; staff are locked to their own team
  const [selectedTeam, setSelectedTeam] = useState<'KPV' | 'Agency'>(
    (user?.team as 'KPV' | 'Agency') || 'KPV'
  );
  const isKPV = selectedTeam === 'KPV';

  const [allCheckIns, setAllCheckIns] = useState<CheckInRecord[]>([]);
  const [kpvStaff, setKpvStaff] = useState<StaffMember[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  React.useEffect(() => {
    const load = async () => {
      const [checkIns, allStaff, { data: evs }] = await Promise.all([
        fetchCheckIns(),
        fetchStaff(),
        fetchEvents(),
      ]);
      setAllCheckIns(checkIns);
      setKpvStaff(allStaff.filter(s => s.team === 'KPV'));
      if (evs) setAllEvents(evs);
    };
    load();
  }, [user]);

  // Filter check-ins by the currently selected team
  const myCheckIns = allCheckIns.filter(c => c.team === selectedTeam);
  const myEvents = allEvents.filter(e => (e.team || 'KPV').toUpperCase() === selectedTeam.toUpperCase());

  const [checkInId, setCheckInId] = useState('');
  // Booth (default) or Event — chosen next to the Activity Check-in selector.
  const [activityType, setActivityType] = useState(DEFAULT_ACTIVITY_TYPE);
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
  
  const [merchCatalog, setMerchCatalog] = useState<MerchItem[]>(MERCH_CATALOG);

  useEffect(() => {
    fetchMerchCatalog().then(setMerchCatalog);
  }, []);

  // When admin switches team, reset the check-in selection and location fields
  const handleTeamChange = (team: 'KPV' | 'Agency') => {
    setSelectedTeam(team);
    setCheckInId('');
    setDate('');
    setBranch('');
    setStaffRows([]);
    setDone('');
  };

  const merchCost = merchRows.reduce((a, i) => {
    const cpu = merchCatalog.find(m => m.name === i.name)?.cpu || 0;
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

    const team = selectedTeam;

    // Prevent duplicate records for the same branch on the same day
    const localSubs = getLocalSubmissions();
    const localExists = localSubs.some(s => s.date === date && s.branch === branch && s.team === team);

    const { data: existingRecords } = await supabase
      .from('submissions')
      .select('id')
      .eq('date', date)
      .eq('branch', branch)
      .eq('team', team)
      .limit(1);

    if ((existingRecords && existingRecords.length > 0) || localExists) {
      window.alert(`A record for ${branch} on ${labelDate(date)} already exists! Please update the existing record from the Calendar or Dashboard instead.`);
      setSubmitting(false);
      return;
    }

    const record: Submission = {
      id: `sub-${Date.now()}`,
      date,
      team,
      branch,
      activity_type: normalizeActivityType(activityType),
      new_register: nc,
      new_reg_purchased: nrp,
      buy_value_new: buyNew,
      existing_users: ec,
      buy_value_existing: buyExisting,
      team_cost: 0, // Service cost is filled later by Admin in Cost Manager
      merch_cost: merchCost,
      sponsorship_cost: 0, // Sponsorship cost — filled later by Admin in Cost Manager
      prod_cost: 0, // Production cost — filled later by Admin in Cost Manager
      merch_items: merchRows,
      staff_in_charge: isKPV ? staffRows : [],
      footfall,
      step_in: stepIn,
      status: 'active',
      event_id: selectedEventId || null,
    };

    // Best-effort database write. We only save locally if the DB fails to avoid duplicate row glitches.
    let savedToDb = true;
    let activityColumnMissing = false;
    try {
      // Everything except activity_type — also serves as the pre-migration fallback.
      // sponsorship_cost / prod_cost are not sent on purpose: both are always 0 at
      // submission time and the column DEFAULT 0 fills them (works even before the
      // migrations from supabase_sponsorship_cost.sql / supabase_prod_cost.sql
      // have been run).
      const basePayload = {
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
        event_id: record.event_id || null,
      };
      let { error } = await supabase
        .from('submissions')
        .insert([{ ...basePayload, activity_type: record.activity_type }]);
      // Databases that predate supabase_activity_type.sql have no activity_type
      // column → retry without it so the results still save (row = Booth) and
      // tell the admin how to enable the column.
      if (error && isMissingColumnError(error, 'activity_type')) {
        activityColumnMissing = true;
        const retry = await supabase.from('submissions').insert([basePayload]);
        error = retry.error;
      }
      if (error) {
        console.error('DB insert failed — saving locally:', error.message);
        saveLocalSubmission(record);
        savedToDb = false;
      }
      clearSubmissionsCache();
    } catch (err) {
      console.error('DB unavailable — saving locally:', err);
      saveLocalSubmission(record);
      savedToDb = false;
    }

    setSubmitting(false);
    if (!savedToDb) {
      void writeAuditLog('submission.offline', { branch, date, team }, 'warning', team);
      setDone(`⚠️ No connection — results were saved on THIS DEVICE only, not in the database yet. They will still show on this phone, but Admin cannot see them yet. When internet is back, tell Admin to check Submission History (the record may need to be entered again).`);
    } else if (activityColumnMissing) {
      void writeAuditLog('submission.create', { branch, date, team, nc, buy_new: buyNew, buy_existing: buyExisting, activity_type: activityType }, 'success', team);
      window.alert(MISSING_ACTIVITY_COLUMN_HINT);
      setDone(`✓ Results submitted for ${branch} on ${labelDate(date)} — saved to the database, but the Activity Type (${activityLabel(record.activity_type)}) was NOT stored: Admin must run supabase_activity_type.sql.`);
    } else {
      void writeAuditLog('submission.create', { branch, date, team, nc, buy_new: buyNew, buy_existing: buyExisting, activity_type: activityType }, 'success', team);
      setDone(`✓ ${activityLabel(record.activity_type)} results submitted for ${branch} on ${labelDate(date)} — saved to the database. Admin will fill Service Cost in Cost Manager.`);
    }
    // Reset form
    setCheckInId(''); setDate(''); setBranch('');
    setActivityType(DEFAULT_ACTIVITY_TYPE);
    setNc(0); setNrp(0); setBuyNew(0); setEc(0); setBuyExisting(0);
    setFootfall(0); setStepIn(0);
    setMerchRows([]); setStaffRows([]);
  };

  return (
    <div>
      {/* ── Activity Check-In selector ── */}
      <div style={{ background: 'rgba(46,194,122,0.1)', border: '1px solid var(--green)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', flexShrink: 0 }}></div>

        {/* ── Admin-only Team switcher ── */}
        {isAdmin && (
          <>
            <strong style={{ fontSize: '13px', color: 'var(--txt-main)', whiteSpace: 'nowrap' }}>Team:</strong>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['KPV', 'Agency'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTeamChange(t)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid',
                    cursor: 'pointer',
                    borderColor: selectedTeam === t ? 'var(--gold)' : 'var(--border)',
                    background: selectedTeam === t ? 'rgba(212,168,67,0.15)' : 'transparent',
                    color: selectedTeam === t ? 'var(--gold)' : 'var(--txt-sub)',
                    transition: 'all 0.15s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <span aria-hidden="true" style={{ width: '1px', height: '22px', background: 'rgba(46,194,122,0.35)' }}></span>
          </>
        )}

        <strong style={{ fontSize: '13px', color: 'var(--txt-main)', whiteSpace: 'nowrap' }}>Activity Check-in:</strong>
        {myCheckIns.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--red)' }}>
              No {selectedTeam} check-in found — capture location first.
            </span>
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

        {/* Activity Type — Booth (default) or Event. Applies to KPV and Agency. */}
        <span aria-hidden="true" style={{ width: '1px', height: '22px', background: 'rgba(46,194,122,0.35)' }}></span>
        <strong style={{ fontSize: '13px', color: 'var(--txt-main)', whiteSpace: 'nowrap' }}>Activity Type:</strong>
        <select
          value={activityType}
          onChange={e => setActivityType(e.target.value)}
          aria-label="Activity type"
          title="Was this activity a Booth or an Event?"
          style={{ background: 'transparent', border: '1px solid rgba(212,168,67,0.45)', color: 'var(--gold)', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, width: 'auto', minWidth: '130px' }}
        >
          <option value="booth">Booth</option>
          <option value="event">Event</option>
        </select>

        {/* Link to Event Plan if Event is chosen or available */}
        {activityType === 'event' && myEvents.length > 0 && (
          <>
            <span aria-hidden="true" style={{ width: '1px', height: '22px', background: 'rgba(124,58,237,0.4)' }}></span>
            <strong style={{ fontSize: '13px', color: '#c084fc', whiteSpace: 'nowrap' }}>🎪 Event Plan:</strong>
            <select
              value={selectedEventId}
              onChange={e => {
                const evId = e.target.value;
                setSelectedEventId(evId);
                const ev = myEvents.find(x => x.id === evId);
                if (ev) {
                  if (!branch && (ev.location || ev.event_name)) setBranch(ev.location || ev.event_name);
                  if (!date && ev.start_date) setDate(ev.start_date);
                }
              }}
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid #a855f7', color: '#e9d5ff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, width: 'auto', minWidth: '220px' }}
            >
              <option value="">— Link to Event Plan (Optional) —</option>
              {myEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.event_name} ({ev.scale} · {ev.activity_type})
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '15px', marginBottom: '3px' }}>Daily Activity Results</h2>
            <div className="text-xs">End-of-day Log</div>
          </div>
          <span
            className={`pill ${isKPV ? 'pill-gold' : 'pill-blue'}`}
            style={{ alignSelf: 'center', fontSize: '12px', padding: '4px 12px' }}
          >
            {selectedTeam} Team
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="form-field" style={{ margin: 0 }}><label>Branch / Location</label><input type="text" value={branch} onChange={e => setBranch(e.target.value)} placeholder="Auto-filled from check-in" required /></div>
          </div>

          <div className="text-xs" style={{ color: 'var(--blue)', marginBottom: '8px' }}><i className="fa-solid fa-user-plus"></i> NEW CUSTOMER DATA</div>
          <div className="grid-3" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Total New Customer (NC)</label><NumberInput value={nc} onChange={setNc} /></div>
            <div className="form-field" style={{ margin: 0 }}><label>New Customer Purchased</label><NumberInput value={nrp} onChange={setNrp} /></div>
            <div className="form-field" style={{ margin: 0 }}><label>Buy Value — New (LAK)</label><NumberInput value={buyNew} onChange={setBuyNew} /></div>
          </div>

          <div className="text-xs" style={{ color: 'var(--blue)', marginBottom: '8px' }}><i className="fa-solid fa-users"></i> EXISTING CUSTOMER DATA</div>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Total Existing Customers Met (EC)</label><NumberInput value={ec} onChange={setEc} /></div>
            <div className="form-field" style={{ margin: 0 }}><label>Buy Value — Existing (LAK)</label><NumberInput value={buyExisting} onChange={setBuyExisting} /></div>
          </div>

          <div className="text-xs" style={{ color: 'var(--green)', marginBottom: '8px' }}><i className="fa-solid fa-shoe-prints"></i> FOOTFALL</div>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Total Footfall</label><NumberInput value={footfall} onChange={setFootfall} /></div>
            <div className="form-field" style={{ margin: 0 }}><label>Step-in Booth</label><NumberInput value={stepIn} onChange={setStepIn} /></div>
          </div>

          {/* ── Merchandise used ── */}
          <div className="text-xs" style={{ color: 'var(--gold)', marginBottom: '8px', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><i className="fa-solid fa-box"></i> MERCHANDISE USED</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontSize: '16px', fontWeight: 800 }}>Total: {fmtLAKShort(merchCost)}</span>
          </div>
          <div style={{ marginBottom: '24px' }}>
            {merchRows.map((row, idx) => {
              const cpu = merchCatalog.find(m => m.name === row.name)?.cpu || 0;
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.5fr 0.7fr 0.4fr', gap: '10px', alignItems: 'end', marginBottom: '8px' }}>
                  <select value={row.name} onChange={e => {
                    const name = e.target.value;
                    const cpu = merchCatalog.find(m => m.name === name)?.cpu || 0;
                    updateMerch(idx, { name, cpu });
                  }} style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}>
                    {merchCatalog.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                  <input type="number" min={0} placeholder="Qty" value={row.qty === 0 ? '' : row.qty} onChange={e => updateMerch(idx, { qty: e.target.value === '' ? 0 : Number(e.target.value) })} style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '8px 12px' }} />
                  <div style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--txt-main)' }}>{fmtLAKShort(Number(row.qty) * cpu)}</div>
                  <button type="button" className="btn" onClick={() => setMerchRows(rows => rows.filter((_, i) => i !== idx))} style={{ padding: '4px', borderRadius: '6px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(232,84,84,0.3)' }} title="Remove">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              );
            })}
            <button type="button" className="btn btn-ghost" onClick={() => setMerchRows(rows => [...rows, { name: merchCatalog[0]?.name || '', qty: 1, cpu: merchCatalog[0]?.cpu || 0 }])} style={{ fontSize: '12px', padding: '6px 14px' }}>+ Add Merch Item</button>
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
                      <option value="">-- Select Staff --</option>
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
          {done && (
            <div role="status" className="alert alert-ok" style={{ marginTop: '16px', background: 'var(--green)', color: '#fff', border: 'none', textAlign: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true"></i> {done}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

