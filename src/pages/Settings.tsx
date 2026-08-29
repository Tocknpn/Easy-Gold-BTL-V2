import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentDateHelpers } from '../lib/submissions';
import { fetchStaff, addStaffRecord, updateStaffRecord, deleteStaffRecord, suggestStaffId } from '../lib/workflow';
import type { StaffMember } from '../lib/workflow';

const NumberInput = ({ value, onChange, placeholder, style }: any) => {
  const [str, setStr] = useState(value ? Number(value).toLocaleString() : '');
  useEffect(() => {
    if (!value && str !== '') setStr('');
    else if (value && Number(str.replace(/,/g, '')) !== Number(value)) setStr(Number(value).toLocaleString());
  }, [value]);
  
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={str}
      style={style}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(raw)) {
          setStr(raw ? Number(raw).toLocaleString() : '');
          onChange(raw);
        }
      }}
    />
  );
};

// ── Staff Directory (Admin-managed; feeds Submit Results "Staff In Charge" for KPV) ──
function StaffDirectory() {
  const [list, setList] = useState<StaffMember[]>([]);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState<'KPV' | 'Agency'>('KPV');
  const [editingId, setEditingId] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    const data = await fetchStaff();
    setList(data);
    setNewId(suggestStaffId(data, newTeam));
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const sid = newId.trim() || suggestStaffId(list, newTeam);
    const newStaff: StaffMember = { id: `stf-${Date.now()}`, staffId: sid, name, team: newTeam };
    
    // Optimistic UI update
    setList([...list, newStaff]);
    setNewName('');
    setNewId(suggestStaffId([...list, newStaff], newTeam));

    await addStaffRecord(newStaff);
    await loadStaff();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this staff member?")) return;
    setList(list.filter(s => s.id !== id));
    await deleteStaffRecord(id);
    await loadStaff();
  };

  const startEdit = (s: StaffMember) => { setEditingId(s.id); setEditCode(s.staffId || ''); setEditName(s.name); };
  
  const rename = async (id: string) => {
    if (!window.confirm("Are you sure you want to save these changes?")) return;
    const name = editName.trim();
    if (!name) return;
    
    const target = list.find(s => s.id === id);
    if (!target) return;
    const updated = { ...target, staffId: editCode.trim(), name };

    setList(list.map(s => (s.id === id ? updated : s)));
    setEditingId('');
    setEditCode('');
    setEditName('');

    await updateStaffRecord(updated);
    await loadStaff();
  };

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--gold)', fontSize: '18px' }}><i className="fa-solid fa-id-card-clip"></i></span>
        <h2 style={{ margin: 0, fontSize: '15px' }}>Staff Directory (KPV &amp; Agency)</h2>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--txt-dim)', marginBottom: '16px' }}>
        KPV teams pick from this list when recording “Staff In Charge” on submissions.
      </div>

            {/* Add staff */}
      <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 2fr 0.8fr auto', gap: '10px', alignItems: 'end', marginBottom: '16px' }}>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Staff ID</label>
          <input type="text" value={newId} onChange={e => setNewId(e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Staff Name</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. ບຸນມີທິບ ວົງພັດທະນະ" />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Team</label>
          <select value={newTeam} onChange={e => { const t = e.target.value as 'KPV' | 'Agency'; setNewTeam(t); setNewId(suggestStaffId(list, t)); }}>
            <option value="KPV">KPV</option>
            <option value="Agency">Agency</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={add} disabled={!newName.trim()} style={{ opacity: newName.trim() ? 1 : 0.5 }}>
          <i className="fa-solid fa-plus"></i> Add Staff
        </button>
      </div>

      {/* Staff table */}
      <table className="data-table">
        <thead>
          <tr><th>Staff ID</th><th>Name</th><th>Team</th><th></th></tr>
        </thead>
        <tbody>
          {list.map(s => (
            <tr key={s.id}>
              <td>
                {editingId === s.id ? (
                  <input type="text" value={editCode} onChange={e => setEditCode(e.target.value)} autoFocus style={{ padding: '5px 10px', fontSize: '13px', fontFamily: 'var(--font-mono)', width: '110px' }} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{s.staffId || '—'}</span>
                )}
              </td>
              <td>
                {editingId === s.id ? (
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: '5px 10px', fontSize: '13px' }} />
                ) : (
                  s.name
                )}
              </td>
              <td><span className={`pill ${s.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{s.team}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {editingId === s.id ? (
                  <>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => rename(s.id)}><i className="fa-solid fa-check"></i></button>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px', marginLeft: '4px' }} onClick={() => setEditingId('')}>✕</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px' }} title="Edit ID / Name" onClick={() => startEdit(s)}>
                      <i className="fa-solid fa-pen"></i>
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px', marginLeft: '4px', color: 'var(--red)' }} title="Remove" onClick={() => remove(s.id)}>
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '18px' }}>No staff yet — add the first one above.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────
interface RouteRow {
  id: string;
  date: string;
  team: string;
  location_name: string;
  lat: string;
  lng: string;
}

interface TargetRow {
  id: string;
  team: string;
  month: string;
  new_reg_target: number;
  buy_value_target: number;
  footfall_target: number;
  cost_budget: number;
  cpo_target: number;
  cpa_target: number;
  cpao_target: number;
}

interface MerchItem {
  id: string;
  itemName: string;
  cpu: number;
}

interface TargetForm {
  new_reg_target: string;
  buy_value_target: string;
  footfall_target: string;
  cost_budget: string;
  cpo_target: string;
  cpa_target: string;
  cpao_target: string;
}

type AlertMsg = { type: 'ok' | 'err'; text: string };

// ── Helpers ──────────────────────────────────────────────────────────────
const uid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const normalizeTeam = (t: string) => {
  const s = t.trim();
  if (/KPV/i.test(s)) return 'KPV';
  if (/Agency/i.test(s)) return 'Agency';
  return s;
};

const fmtLAK = (n: number) => `₭${n.toLocaleString('en-US')}`;

// ── Seeds (aligned with the rest of the app / demo) ─────────────────────
const seedRoutes: Omit<RouteRow, 'id'>[] = [
  { date: '2025-03-03', team: 'KPV', location_name: 'That Luang', lat: '17.9757', lng: '102.6331' },
  { date: '2025-03-04', team: 'Agency', location_name: 'NUOL Campus', lat: '18.0500', lng: '102.6400' },
  { date: '2025-03-10', team: 'KPV', location_name: 'Talat Sao', lat: '17.9641', lng: '102.5998' },
  { date: '2025-03-11', team: 'KPV', location_name: 'Sikhottabong', lat: '17.9638', lng: '102.6221' },
  { date: '2025-03-17', team: 'Agency', location_name: 'Wattay Airport', lat: '17.9883', lng: '102.5633' },
  { date: '2025-03-18', team: 'KPV', location_name: 'Parkson Mall', lat: '17.9702', lng: '102.6187' },
  { date: '2025-03-24', team: 'KPV', location_name: 'Patuxay', lat: '17.9706', lng: '102.6137' },
  { date: '2025-03-25', team: 'Agency', location_name: 'Evening Market', lat: '17.9607', lng: '102.6011' },
  { date: '2025-03-31', team: 'KPV', location_name: 'That Luang', lat: '17.9757', lng: '102.6331' },
];

const seedTargets: TargetRow[] = [
  { id: 'KPV|2025-04', team: 'KPV', month: '2025-04', new_reg_target: 900, buy_value_target: 60000000, footfall_target: 0, cost_budget: 20000000, cpo_target: 60000, cpa_target: 100000, cpao_target: 130000 },
  { id: 'Agency|2025-04', team: 'Agency', month: '2025-04', new_reg_target: 600, buy_value_target: 40000000, footfall_target: 0, cost_budget: 15000000, cpo_target: 60000, cpa_target: 90000, cpao_target: 120000 },
];

const seedMerch: MerchItem[] = [
  { id: 'm1', itemName: 'Gold Flyer', cpu: 2000 },
  { id: 'm2', itemName: 'Tote Bag', cpu: 15000 },
  { id: 'm3', itemName: 'Pen Set', cpu: 5000 },
  { id: 'm4', itemName: 'Phone Stand', cpu: 8000 },
  { id: 'm5', itemName: 'Umbrella', cpu: 35000 },
];

// ── localStorage loaders (lazy init) ────────────────────────────────────
const loadRoutes = (): RouteRow[] => {
  try {
    const raw = localStorage.getItem('easygold_route_plan');
    if (raw) return JSON.parse(raw) as RouteRow[];
  } catch { /* ignore */ }
  return seedRoutes.map(r => ({ ...r, id: uid() }));
};




// ── CSV parser: date, team, location_name, lat, lng ─────────────────────
const parseRouteCSV = (text: string): RouteRow[] => {
  const out: RouteRow[] = [];
  text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      if (i === 0 && /^date/i.test(line)) return; // skip header row
      const cols = line.split(',').map(c => c.trim());
      if (cols.length < 3) return;
      const [date, team, location_name, lat = '', lng = ''] = cols;
      if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return;
      out.push({ id: uid(), date, team: normalizeTeam(team), location_name, lat, lng });
    });
  return out;
};

const emptyTargetForm = (): TargetForm => ({
  new_reg_target: '900',
  buy_value_target: '60000000',
  footfall_target: '0',
  cost_budget: '20000000',
  cpo_target: '60000',
  cpa_target: '100000',
  cpao_target: '130000',
});
export default function Settings() {
  const { currentMonthStr } = getCurrentDateHelpers();
  const [routes, setRoutes] = useState<RouteRow[]>(loadRoutes);
  const [routeTeam, setRouteTeam] = useState('KPV Team');
  const [routeMonth, setRouteMonth] = useState(currentMonthStr);
  const [routeFile, setRouteFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [routeMsg, setRouteMsg] = useState<AlertMsg | null>(null);

  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [targetTeam, setTargetTeam] = useState('KPV Team');
  const [targetMonth, setTargetMonth] = useState(currentMonthStr);
  const [targetForm, setTargetForm] = useState<TargetForm>(emptyTargetForm);
  const [targetMsg, setTargetMsg] = useState<AlertMsg | null>(null);

  const [merch, setMerch] = useState<MerchItem[]>([]);
  const [merchLoading, setMerchLoading] = useState(true);
  const [merchSaving, setMerchSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ itemName: '', cpu: '' });
  const [newItem, setNewItem] = useState({ itemName: '', cpu: '' });
  const [merchMsg, setMerchMsg] = useState<AlertMsg | null>(null);

  // Persist routes to localStorage on every change
  useEffect(() => { localStorage.setItem('easygold_route_plan', JSON.stringify(routes)); }, [routes]);

  // Load targets from Supabase on mount
  useEffect(() => {
    supabase.from('targets').select('*').then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        setTargets(data.map((r: any) => ({
          id: r.id,
          team: r.team,
          month: r.month,
          new_reg_target: Number(r.new_reg_target) || 0,
          buy_value_target: Number(r.buy_value_target) || 0,
          footfall_target: Number(r.footfall_target) || 0,
          cost_budget: Number(r.cost_budget) || 0,
          cpo_target: Number(r.cpo_target) || 0,
          cpa_target: Number(r.cpa_target) || 0,
          cpao_target: Number(r.cpao_target) || 0,
        })));
      } else {
        setTargets(seedTargets.map(t => ({ ...t })));
      }
    });
  }, []);

  // Load merch from Supabase on mount
  useEffect(() => {
    setMerchLoading(true);
    supabase.from('merch').select('*').order('itemname').then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        setMerch(data.map((r: any) => ({ id: r.itemname, itemName: r.itemname, cpu: Number(r.cpu) || 0 })));
      } else {
        // fallback to seed if table empty
        setMerch(seedMerch.map(m => ({ ...m })));
      }
      setMerchLoading(false);
    });
  }, []);

  // Pre-fill target form whenever team/month changes and a saved target exists
  useEffect(() => {
    const team = normalizeTeam(targetTeam);
    // DB stores month as YYYY-MM-01; compare by stripping the -01
    const found = targets.find(t => t.team === team && (t.month === `${targetMonth}-01` || t.month === targetMonth));
    if (found) {
      setTargetForm({
        new_reg_target: String(found.new_reg_target),
        buy_value_target: String(found.buy_value_target),
        footfall_target: String(found.footfall_target),
        cost_budget: String(found.cost_budget),
        cpo_target: String(found.cpo_target),
        cpa_target: String(found.cpa_target),
        cpao_target: String(found.cpao_target),
      });
    } else {
      setTargetForm(emptyTargetForm());
    }
  }, [targetTeam, targetMonth, targets]);

  // ── Route plan handlers ──────────────────────────────────────────────
  const handleUpload = () => {
    if (!routeFile) {
      setRouteMsg({ type: 'err', text: 'Please choose a CSV file first (click the drop zone or drag a file in).' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      const parsed = parseRouteCSV(text);
      if (parsed.length === 0) {
        setRouteMsg({ type: 'err', text: 'No valid rows found. Expected format: date, team, location_name, lat, lng' });
        return;
      }
      setRoutes(prev => [...prev, ...parsed]);
      setRouteFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setRouteMsg({ type: 'ok', text: `Uploaded ${parsed.length} route(s) for ${normalizeTeam(routeTeam)} (${routeMonth}).` });
    };
    reader.readAsText(routeFile);
  };

  const handleSampleCSV = () => {
    const m = routeMonth || '2025-04';
    const sample =
      'date, team, location_name, lat, lng\n' +
      `${m}-01, ${routeTeam}, That Luang, 17.9757, 102.6331\n` +
      `${m}-02, ${routeTeam}, Talat Sao, 17.9641, 102.5998\n`;
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `route_plan_${m}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteRoute = (id: string) => {
    setRoutes(prev => prev.filter(r => r.id !== id));
    setRouteMsg({ type: 'ok', text: 'Route removed.' });
  };

  const previewRoutes = routes.filter(r => r.date.startsWith(routeMonth) && r.team === normalizeTeam(routeTeam));

  // ── Target handlers ──────────────────────────────────────────────────
  const [targetSaving, setTargetSaving] = useState(false);

  const saveTarget = async () => {
    setTargetSaving(true);
    const team = normalizeTeam(targetTeam);
    const monthDate = `${targetMonth}-01`;
    const payload = {
      team,
      month: monthDate,
      new_reg_target: Number(targetForm.new_reg_target) || 0,
      buy_value_target: Number(targetForm.buy_value_target) || 0,
      footfall_target: Number(targetForm.footfall_target) || 0,
      cost_budget: Number(targetForm.cost_budget) || 0,
      cpo_target: Number(targetForm.cpo_target) || 0,
      cpa_target: Number(targetForm.cpa_target) || 0,
      cpao_target: Number(targetForm.cpao_target) || 0,
    };

    // Check if a record already exists for this team + month
    const existing = targets.find(t => t.team === team && (t.month === monthDate || t.month === targetMonth));

    let error;
    if (existing) {
      // Update the existing row using its real UUID
      ({ error } = await supabase.from('targets').update(payload).eq('id', existing.id));
    } else {
      // Insert a new row — let Supabase generate the UUID
      ({ error } = await supabase.from('targets').insert(payload));
    }

    if (error) {
      setTargetMsg({ type: 'err', text: 'Failed to save targets: ' + error.message });
      setTargetSaving(false);
      return;
    }

    // Reload from Supabase so we have the real UUID
    const { data: fresh } = await supabase.from('targets').select('*');
    if (fresh) {
      setTargets(fresh.map((r: any) => ({
        id: r.id, team: r.team, month: r.month,
        new_reg_target: Number(r.new_reg_target) || 0,
        buy_value_target: Number(r.buy_value_target) || 0,
        footfall_target: Number(r.footfall_target) || 0,
        cost_budget: Number(r.cost_budget) || 0,
        cpo_target: Number(r.cpo_target) || 0,
        cpa_target: Number(r.cpa_target) || 0,
        cpao_target: Number(r.cpao_target) || 0,
      })));
    }
    setTargetMsg({ type: 'ok', text: `Targets saved for ${team} (${targetMonth}).` });
    setTargetSaving(false);
  };

  const deleteTarget = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this target?")) return;
    await supabase.from('targets').delete().eq('id', id);
    setTargets(prev => prev.filter(t => t.id !== id));
    setTargetMsg({ type: 'ok', text: 'Target entry removed.' });
  };

  const loadTargetIntoForm = (id: string) => {
    const found = targets.find(t => t.id === id);
    if (!found) return;
    // DB month is YYYY-MM-01, strip -01 for the month input
    const monthStr = found.month.length === 10 ? found.month.slice(0, 7) : found.month;
    setTargetTeam(found.team === 'KPV' ? 'KPV Team' : 'Agency Team');
    setTargetMonth(monthStr);
    setTargetMsg({ type: 'ok', text: `Loaded target for ${found.team} (${monthStr}) into the form.` });
  };

  // ── Merch handlers (Supabase) ────────────────────────────────────────
  const startMerchEdit = (m: MerchItem) => {
    setEditingId(m.id);
    setEditForm({ itemName: m.itemName, cpu: String(m.cpu) });
  };

  const saveMerchEdit = async (id: string) => {
    if (!editForm.itemName.trim()) {
      setMerchMsg({ type: 'err', text: 'Item name cannot be empty.' });
      return;
    }
    setMerchSaving(true);
    const newName = editForm.itemName.trim();
    const newCpu = Number(editForm.cpu) || 0;
    // If name changed: delete old row & insert new one (itemname is PK)
    if (newName !== id) {
      await supabase.from('merch').delete().eq('itemname', id);
      await supabase.from('merch').insert({ itemname: newName, cpu: newCpu });
    } else {
      await supabase.from('merch').update({ cpu: newCpu }).eq('itemname', id);
    }
    setMerch(prev => prev.map(m => (m.id === id ? { id: newName, itemName: newName, cpu: newCpu } : m)));
    setEditingId(null);
    setMerchMsg({ type: 'ok', text: 'Item updated in Supabase.' });
    setMerchSaving(false);
  };

  const deleteMerch = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this merchandise?")) return;
    setMerchSaving(true);
    await supabase.from('merch').delete().eq('itemname', id);
    setMerch(prev => prev.filter(m => m.id !== id));
    setMerchMsg({ type: 'ok', text: 'Item removed from Supabase.' });
    setMerchSaving(false);
  };

  const addMerch = async () => {
    if (!newItem.itemName.trim()) {
      setMerchMsg({ type: 'err', text: 'Enter an item name first.' });
      return;
    }
    setMerchSaving(true);
    const name = newItem.itemName.trim();
    const cpu = Number(newItem.cpu) || 0;
    const { error } = await supabase.from('merch').insert({ itemname: name, cpu });
    if (error) {
      setMerchMsg({ type: 'err', text: 'Failed to add: ' + error.message });
      setMerchSaving(false);
      return;
    }
    setMerch(prev => [...prev, { id: name, itemName: name, cpu }]);
    setNewItem({ itemName: '', cpu: '' });
    setMerchMsg({ type: 'ok', text: 'New item saved to Supabase.' });
    setMerchSaving(false);
  };

  const saveMerchConfig = () => {
    setMerchMsg({ type: 'ok', text: `All ${merch.length} items are live in Supabase — changes are saved instantly.` });
  };

return (
    <div>
      <div className="demo-banner"><i className="fa-solid fa-circle-info"></i> Admin-only page. Managers can set targets; only admins can change the Merch catalog.</div>

      <div className="grid-2" style={{ alignItems: 'start', marginBottom: '24px' }}>
        {/* ═══ ROUTE PLAN UPLOAD ═══ */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <span style={{ color: 'var(--blue)', fontSize: '18px' }}><i className="fa-solid fa-calendar-days"></i></span>
            <h2 style={{ margin: 0, fontSize: '15px' }}>Upload Monthly Route Plan</h2>
          </div>

          <div className="grid-2" style={{ gap: '14px', marginBottom: '14px' }}>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Team</label>
              <select value={routeTeam} onChange={e => setRouteTeam(e.target.value)}>
                <option>KPV Team</option>
                <option>Agency Team</option>
              </select>
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Month</label>
              <input type="month" value={routeMonth} onChange={e => setRouteMonth(e.target.value)} />
            </div>
          </div>

          <div style={{ background: 'var(--blue-dim)', border: '1px solid rgba(77,158,255,0.25)', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--blue)', marginBottom: '4px' }}><i className="fa-solid fa-circle-info"></i> REQUIRED CSV FORMAT</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--txt-sub)', lineHeight: '1.7' }}>
              date, team, location_name, lat, lng<br />
              <span style={{ color: 'var(--txt-dim)' }}>2026-04-01, KPV Team, That Luang, 17.9757, 102.6331</span>
            </div>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px', marginTop: '8px' }} onClick={handleSampleCSV}>
              <i className="fa-solid fa-download"></i> Download sample CSV
            </button>
          </div>

          <div
            style={{ border: '2px dashed var(--border)', borderRadius: '10px', padding: '28px', textAlign: 'center', marginBottom: '14px', cursor: 'pointer' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setRouteFile(f);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={e => setRouteFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ fontSize: '28px', color: 'var(--gold)', marginBottom: '6px' }}><i className="fa-solid fa-folder-open"></i></div>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>{routeFile ? routeFile.name : 'Drop CSV or click to upload'}</div>
            <div style={{ fontSize: '11px', color: 'var(--txt-sub)', marginTop: '4px' }}>Format: date, team, location_name, lat, lng</div>
          </div>

          {routeMsg && (
            <div className={`alert ${routeMsg.type === 'ok' ? 'alert-ok' : 'alert-info'}`} style={{ marginBottom: '14px' }}>
              <i className={`fa-solid ${routeMsg.type === 'ok' ? 'fa-check' : 'fa-triangle-exclamation'}`}></i> {routeMsg.text}
            </div>
          )}

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleUpload}>
            <i className="fa-solid fa-upload"></i> Upload Route Plan
          </button>

          <div style={{ marginTop: '18px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
              <i className="fa-solid fa-map-location-dot" style={{ color: 'var(--blue)', marginRight: '5px' }}></i>
              Routes for {routeMonth} · {normalizeTeam(routeTeam)} ({previewRoutes.length})
            </div>
            {previewRoutes.length > 0 ? (
              <table className="data-table" style={{ marginTop: '4px' }}>
                <thead>
                  <tr><th>Date</th><th>Location</th><th>Lat</th><th>Lng</th><th></th></tr>
                </thead>
                <tbody>
                  {previewRoutes.map(r => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{r.location_name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.lat || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.lng || '—'}</td>
                      <td>
                        <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--red)' }} onClick={() => deleteRoute(r.id)}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--txt-dim)', padding: '12px 0' }}>No routes uploaded yet for this team &amp; month.</div>
            )}
          </div>
        </div>
{/* ═══ SET MONTHLY TARGETS ═══ */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <span style={{ color: 'var(--red)', fontSize: '18px' }}><i className="fa-solid fa-bullseye"></i></span>
            <h2 style={{ margin: 0, fontSize: '15px' }}>Set Monthly Targets</h2>
          </div>

          <div className="grid-2" style={{ gap: '14px', marginBottom: '14px' }}>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Team</label>
              <select value={targetTeam} onChange={e => setTargetTeam(e.target.value)}>
                <option>KPV Team</option>
                <option>Agency Team</option>
              </select>
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Month</label>
              <input type="month" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} />
            </div>
          </div>

          <div className="grid-2" style={{ gap: '14px', marginBottom: '14px' }}>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Acquisition Target</label>
              <NumberInput value={targetForm.new_reg_target} placeholder="e.g. 1500" onChange={(v: string) => setTargetForm(f => ({ ...f, new_reg_target: v }))} />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Buy Value Target (LAK)</label>
              <NumberInput value={targetForm.buy_value_target} placeholder="e.g. 100,000,000" onChange={(v: string) => setTargetForm(f => ({ ...f, buy_value_target: v }))} />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Cost Budget (LAK)</label>
              <NumberInput value={targetForm.cost_budget} placeholder="e.g. 20,000,000" onChange={(v: string) => setTargetForm(f => ({ ...f, cost_budget: v }))} />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Footfall Target</label>
              <NumberInput value={targetForm.footfall_target} placeholder="e.g. 5,000" onChange={(v: string) => setTargetForm(f => ({ ...f, footfall_target: v }))} />
            </div>
          </div>

          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '10px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <i className="fa-solid fa-bullseye" style={{ color: 'var(--blue)', marginRight: '5px' }}></i>Cost Efficiency Targets
          </div>
          <div className="grid-2" style={{ gap: '14px', marginBottom: '16px' }}>
            <div className="form-field" style={{ margin: 0 }}>
              <label>CPO Target (LAK)</label>
              <NumberInput value={targetForm.cpo_target} placeholder="e.g. 60,000" onChange={(v: string) => setTargetForm(f => ({ ...f, cpo_target: v }))} />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>CPA Target (LAK)</label>
              <NumberInput value={targetForm.cpa_target} placeholder="e.g. 100,000" onChange={(v: string) => setTargetForm(f => ({ ...f, cpa_target: v }))} />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>CPAO Target (LAK)</label>
              <NumberInput value={targetForm.cpao_target} placeholder="e.g. 130,000" onChange={(v: string) => setTargetForm(f => ({ ...f, cpao_target: v }))} />
            </div>
          </div>

          {targetMsg && (
            <div className={`alert ${targetMsg.type === 'ok' ? 'alert-ok' : 'alert-info'}`} style={{ marginBottom: '14px' }}>
              <i className={`fa-solid ${targetMsg.type === 'ok' ? 'fa-check' : 'fa-triangle-exclamation'}`}></i> {targetMsg.text}
            </div>
          )}

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: targetSaving ? 0.6 : 1 }} onClick={saveTarget} disabled={targetSaving}>
            <i className={`fa-solid ${targetSaving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i> {targetSaving ? 'Saving...' : 'Save Targets'}
          </button>
{/* Saved targets table */}
          <div style={{ marginTop: '18px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
              <i className="fa-solid fa-database" style={{ color: 'var(--gold)', marginRight: '5px' }}></i>Saved Targets ({targets.length})
            </div>
            {targets.length > 0 ? (
              <table className="data-table" style={{ marginTop: '4px' }}>
                <thead>
                  <tr><th>Team</th><th>Month</th><th>NC</th><th>Buy Value</th><th>Budget</th><th></th></tr>
                </thead>
                <tbody>
                  {targets.map(t => (
                    <tr key={t.id}>
                      <td><span className={`pill ${t.team === 'KPV' ? 'pill-gold' : 'pill-blue'}`}>{t.team}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t.month}</td>
                      <td>{t.new_reg_target}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{fmtLAK(t.buy_value_target)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{fmtLAK(t.cost_budget)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => loadTargetIntoForm(t.id)}>
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px', marginLeft: '6px', color: 'var(--red)' }} onClick={() => deleteTarget(t.id)}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--txt-dim)', padding: '12px 0' }}>No targets saved yet. Fill the form above and click "Save Targets".</div>
            )}
          </div>
        </div>
      </div>
            {/* ═══ STAFF DIRECTORY ═══ */}
      <StaffDirectory />

      {/* ═══ MERCH CATALOG ═══ */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <span style={{ color: 'var(--gold)', fontSize: '18px' }}><i className="fa-solid fa-box"></i></span>
          <h2 style={{ margin: 0, fontSize: '15px' }}>Merch Catalog (Admin — Set CPU)</h2>
        </div>

        <table className="data-table" style={{ marginBottom: '20px' }}>
          <thead>
            <tr><th>ITEM NAME</th><th>COST PER UNIT (LAK)</th><th>EDIT</th></tr>
          </thead>
          <tbody>
            {merchLoading ? (
              <tr><td colSpan={3} style={{ color: 'var(--txt-dim)', textAlign: 'center', padding: '20px' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>Loading from Supabase…
              </td></tr>
            ) : (
              merch.map(m => (
                <tr key={m.id}>
                  {editingId === m.id ? (
                    <>
                      <td>
                        <input type="text" value={editForm.itemName} placeholder="Item name" style={{ padding: '6px 8px', fontSize: '13px' }} onChange={e => setEditForm(f => ({ ...f, itemName: e.target.value }))} />
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        <NumberInput value={editForm.cpu} placeholder="CPU (LAK)" style={{ padding: '6px 8px', fontSize: '13px' }} onChange={(v: string) => setEditForm(f => ({ ...f, cpu: v }))} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => saveMerchEdit(m.id)} disabled={merchSaving}>
                          <i className="fa-solid fa-check"></i> {merchSaving ? '...' : 'Save'}
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px', marginLeft: '6px' }} onClick={() => setEditingId(null)} disabled={merchSaving}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{m.itemName}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtLAK(m.cpu)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => startMerchEdit(m)} disabled={merchSaving}>
                          <i className="fa-solid fa-pen"></i> Edit
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px', marginLeft: '6px', color: 'var(--red)' }} onClick={() => deleteMerch(m.id)} disabled={merchSaving}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
            {!merchLoading && merch.length === 0 && (
              <tr><td colSpan={3} style={{ color: 'var(--txt-dim)' }}>No merchandise items yet. Add one below.</td></tr>
            )}
          </tbody>
        </table>

        <div className="grid-2" style={{ gap: '14px', alignItems: 'end', marginBottom: '14px' }}>
          <div className="form-field" style={{ margin: 0 }}>
            <label>New Item Name</label>
            <input type="text" placeholder="Name" value={newItem.itemName} onChange={e => setNewItem(n => ({ ...n, itemName: e.target.value }))} disabled={merchSaving} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'end' }}>
            <div className="form-field" style={{ margin: 0, flex: 1 }}>
              <label>Cost (LAK)</label>
              <NumberInput placeholder="0" value={newItem.cpu} onChange={(v: string) => setNewItem(n => ({ ...n, cpu: v }))} disabled={merchSaving} />
            </div>
            <button className="btn btn-ghost" style={{ height: '42px', padding: '0 16px', opacity: merchSaving ? 0.6 : 1 }} onClick={addMerch} disabled={merchSaving}>
              <i className="fa-solid fa-plus"></i> {merchSaving ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        {merchMsg && (
          <div role="status" className={`alert ${merchMsg.type === 'ok' ? 'alert-ok' : 'alert-info'}`} style={{ marginBottom: '14px' }}>
            <i className={`fa-solid ${merchMsg.type === 'ok' ? 'fa-check' : 'fa-triangle-exclamation'}`} aria-hidden="true"></i> {merchMsg.text}
          </div>
        )}

        <button className="btn btn-primary" onClick={saveMerchConfig}>
          <i className="fa-solid fa-save"></i> Save Merch Configuration
        </button>
      </div>
    </div>
  );
}