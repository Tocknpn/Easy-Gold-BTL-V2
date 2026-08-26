import { useState, useEffect } from 'react';
import type { Submission, MerchItem } from '../lib/submissions';
import { fmtLAK, fmtLAKShort, MERCH_CATALOG, STAFF_NAMES } from '../lib/submissions';

interface Props {
  open: boolean;
  submission: Submission | null;
  onClose: () => void;
  onSave: (saved: Submission) => void;
  onDelete: (id: string) => void;
}

// ── Render helpers (pic2–pic3 view mode) ─────────────────────────────────
function DetailSection({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
function DetailRow({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '12px', color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 700, color: color || 'var(--txt-main)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

const merchTotalCost = (items: MerchItem[] | undefined) =>
  (items || []).reduce((a, i) => a + Number(i.qty) * Number(i.cpu), 0);

export default function SubmissionModal({ open, submission, onClose, onSave, onDelete }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Submission | null>(null);

  // Sync local edit copy whenever the modal opens or the record changes
  useEffect(() => {
    if (open && submission) {
      setEditData({ ...submission });
      setIsEditing(false);
    } else if (!open) {
      setEditData(null);
      setIsEditing(false);
    }
  }, [open, submission]);

  if (!open || !editData) return null;

  const merchTotal = merchTotalCost(editData.merch_items);

  const updateMerch = (idx: number, patch: Partial<MerchItem>) => {
    const items = [...(editData.merch_items || [])];
    items[idx] = { ...items[idx], ...patch };
    setEditData(d => (d ? { ...d, merch_items: items } : d));
  };
  const removeMerch = (idx: number) => {
    setEditData(d => (d ? { ...d, merch_items: d.merch_items.filter((_, i) => i !== idx) } : d));
  };
  const addMerch = () => {
    setEditData(d => (d ? { ...d, merch_items: [...(d.merch_items || []), { name: MERCH_CATALOG[0].name, qty: 1, cpu: MERCH_CATALOG[0].cpu }] } : d));
  };
  const updateStaff = (idx: number, name: string) => {
    setEditData(d => (d ? { ...d, staff_in_charge: d.staff_in_charge.map((s, i) => (i === idx ? name : s)) } : d));
  };
  const removeStaff = (idx: number) => {
    setEditData(d => (d ? { ...d, staff_in_charge: d.staff_in_charge.filter((_, i) => i !== idx) } : d));
  };
  const addStaff = () => {
    setEditData(d => (d ? { ...d, staff_in_charge: [...(d.staff_in_charge || []), STAFF_NAMES[0]] } : d));
  };
  const handleSave = () => {
    onSave({ ...editData, merch_cost: merchTotal });
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
            <div className="card" style={{ width: '100%', maxWidth: '720px', maxHeight: '90vh', overflow: 'auto', padding: '28px' }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', margin: '0', fontWeight: 700 }}>Submission Detail</h2>
            <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginTop: '4px' }}>{editData.branch} · {editData.date}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn" style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', background: 'var(--gold-dim)', color: 'var(--gold)', border: '1px solid rgba(167,123,39,0.3)' }} onClick={() => setIsEditing(true)} title="Edit"><i className="fa-solid fa-pen-to-square"></i> Edit</button>
            <button className="btn" style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(232,84,84,0.3)' }} onClick={() => onDelete(editData.id)} title="Delete"><i className="fa-solid fa-trash"></i> Delete</button>
            <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px', lineHeight: 1, fontSize: '14px' }} title="Close">✕</button>
          </div>
        </div>

        {isEditing ? (
          /* ── Edit form (pic4–pic5) ── */
          <div>
            <div className="grid-2" style={{ marginBottom: '16px', gap: '14px' }}>
              <div className="form-field" style={{ margin: 0 }}><label>Branch / Location</label>
                <input type="text" value={editData.branch} onChange={e => setEditData(d => d ? { ...d, branch: e.target.value } : d)} />
              </div>
              <div className="form-field" style={{ margin: 0 }}><label>Date</label>
                <input type="date" value={editData.date} onChange={e => setEditData(d => d ? { ...d, date: e.target.value } : d)} />
              </div>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>New Customer</div>
            <div className="grid-3" style={{ marginBottom: '16px' }}>
              <div className="form-field" style={{ margin: 0 }}><label>New Reg (NC)</label>
                <input type="number" min={0} value={editData.new_register} onChange={e => setEditData(d => d ? { ...d, new_register: +e.target.value || 0 } : d)} />
              </div>
              <div className="form-field" style={{ margin: 0 }}><label>NC Purchased</label>
                <input type="number" min={0} value={editData.new_reg_purchased} onChange={e => setEditData(d => d ? { ...d, new_reg_purchased: +e.target.value || 0 } : d)} />
              </div>
              <div className="form-field" style={{ margin: 0 }}><label>Existing (EC)</label>
                <input type="number" min={0} value={editData.existing_users} onChange={e => setEditData(d => d ? { ...d, existing_users: +e.target.value || 0 } : d)} />
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: '16px', gap: '14px' }}>
              <div className="form-field" style={{ margin: 0 }}><label>NC Buy Value</label>
                <input type="number" value={editData.buy_value_new} onChange={e => setEditData(d => d ? { ...d, buy_value_new: +e.target.value || 0 } : d)} />
              </div>
              <div className="form-field" style={{ margin: 0 }}><label>EC Buy Value</label>
                <input type="number" value={editData.buy_value_existing} onChange={e => setEditData(d => d ? { ...d, buy_value_existing: +e.target.value || 0 } : d)} />
              </div>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Footfall</div>
            <div className="grid-2" style={{ marginBottom: '16px', gap: '14px' }}>
              <div className="form-field" style={{ margin: 0 }}><label>Total Footfall</label>
                <input type="number" min={0} value={editData.footfall} onChange={e => setEditData(d => d ? { ...d, footfall: +e.target.value || 0 } : d)} />
              </div>
              <div className="form-field" style={{ margin: 0 }}><label>Step-in Booth</label>
                <input type="number" min={0} value={editData.step_in} onChange={e => setEditData(d => d ? { ...d, step_in: +e.target.value || 0 } : d)} />
              </div>
            </div>

            <div className="form-field"><label>Security / Service Cost</label>
              <input type="number" min={0} value={editData.team_cost} onChange={e => setEditData(d => d ? { ...d, team_cost: +e.target.value || 0 } : d)} />
            </div>

                        <hr style={{ border: 'none', height: '1px', background: 'var(--border)', margin: '22px 0' }} />

            {/* Merchandise items */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Merch Items</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--gold)' }}>Total: {fmtLAKShort(merchTotal)}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.85fr 0.45fr', gap: '10px', fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                <span>Item</span><span>Qty</span><span>Cost</span><span></span>
              </div>
              {(editData.merch_items || []).map((item, idx) => {
                const def = MERCH_CATALOG.find(m => m.name === item.name) || MERCH_CATALOG[0];
                const cpu = item.cpu || def.cpu;
                const lineTotal = Number(item.qty) * cpu;
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.85fr 0.45fr', gap: '10px', alignItems: 'end', marginBottom: '8px' }}>
                    <select value={item.name} onChange={e => updateMerch(idx, { name: e.target.value, cpu: (MERCH_CATALOG.find(m => m.name === e.target.value)?.cpu || cpu) })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--txt-main)', padding: '9px 12px', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
                      {MERCH_CATALOG.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                    </select>
                    <input type="number" min={0} value={item.qty} onChange={e => updateMerch(idx, { qty: +e.target.value || 0 })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--txt-main)', padding: '9px 12px', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 500 }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--txt-sub)' }}>{fmtLAK(lineTotal)}</div>
                    <button className="btn" onClick={() => removeMerch(idx)} style={{ padding: '4px', borderRadius: '6px', fontSize: '12px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(232,84,84,0.3)' }} title="Remove">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                );
              })}
              <button className="btn btn-ghost" onClick={addMerch} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>
                <i className="fa-solid fa-plus"></i> Add Item
              </button>
            </div>

            {/* Staff in charge */}
            <div style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Staff In Charge</div>
              </div>
              {(editData.staff_in_charge || []).map((name, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 0.45fr', gap: '10px', alignItems: 'end', marginBottom: '8px' }}>
                  <select value={name} onChange={e => updateStaff(idx, e.target.value)} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--txt-main)', padding: '9px 12px', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
                    {STAFF_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="btn" onClick={() => removeStaff(idx)} style={{ padding: '4px', borderRadius: '6px', fontSize: '12px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(232,84,84,0.3)' }} title="Remove">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost" onClick={addStaff} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>
                <i className="fa-solid fa-plus"></i> Add Staff
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '18px' }}>
              <button className="btn btn-primary" onClick={handleSave} style={{ flex: 1 }}>
                <i className="fa-solid fa-check"></i> Save Changes
              </button>
              <button className="btn btn-ghost" onClick={() => setIsEditing(false)} style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode (pic2–pic3) ── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <span className={`pill ${editData.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{editData.team} Team</span>
              <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>{editData.date}</span>
            </div>

            <DetailSection label="ACQUISITION">
              <DetailRow label="New Customers (NC)" value={editData.new_register} color="var(--gold)" />
              <DetailRow label="NC Purchased" value={editData.new_reg_purchased} />
              <DetailRow label="Existing Customers (EC)" value={editData.existing_users} color="var(--blue)" />
              <DetailRow label="Total Acquisition" value={editData.new_register + editData.existing_users} color="var(--txt-main)" />
            </DetailSection>

            <DetailSection label="BUY VALUE">
              <DetailRow label="NC Buy Value" value={fmtLAKShort(editData.buy_value_new)} color="var(--gold)" />
              <DetailRow label="EC Buy Value" value={fmtLAKShort(editData.buy_value_existing)} color="var(--blue)" />
              <DetailRow label="Total Buy Value" value={fmtLAKShort(editData.buy_value_new + editData.buy_value_existing)} color="var(--green)" />
            </DetailSection>

            <DetailSection label="FOOTFALL">
              <DetailRow label="Total Footfall" value={editData.footfall} />
              <DetailRow label="Step-in Booth" value={editData.step_in} />
            </DetailSection>

            <DetailSection label="COST & EFFICIENCY">
              <DetailRow label="Merch Cost" value={fmtLAKShort(editData.merch_cost)} />
              {(editData.merch_items || []).map(i => (
                <div key={`m-${i.name}-${i.qty}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px 8px 28px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--txt-sub)' }}>{i.name} × {i.qty}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--txt-sub)' }}>{fmtLAK(Number(i.qty) * i.cpu)}</span>
                </div>
              ))}
              <DetailRow label="Service Cost" value={fmtLAK(editData.team_cost)} />
              <DetailRow label="Total Cost" value={fmtLAKShort(editData.team_cost + editData.merch_cost)} color="var(--red)" />
              <DetailRow label="CPA (Cost / NC)" value={editData.new_register > 0 ? fmtLAK(Math.round((editData.team_cost + editData.merch_cost) / editData.new_register)) : '—'} color="#F4A62A" />
              <DetailRow label="CPAO (Cost / NC Buyer)" value={editData.new_reg_purchased > 0 ? fmtLAK(Math.round((editData.team_cost + editData.merch_cost) / editData.new_reg_purchased)) : '—'} color="var(--blue)" />
            </DetailSection>
          </div>
        )}
      </div>
    </div>
  );
}
