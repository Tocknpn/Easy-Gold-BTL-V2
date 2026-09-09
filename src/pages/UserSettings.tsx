import { useEffect, useState } from 'react';
import {
  fetchUsers,
  addUserRecord,
  updateUserRecord,
  deleteUserRecord,
  setUserActive,
  writeAuditLog,
  getCurrentUser,
  roleLabel,
} from '../lib/workflow';
import type { AppUserRow } from '../lib/workflow';

const ROLES = ['admin', 'manager', 'team_member'];
const TEAMS = ['KPV', 'Agency', 'KPV Team', 'Agency Team', 'Admin Team', 'Manager Team'];

const rolePill = (r: string) =>
  r === 'admin' ? 'pill-red' : r === 'manager' ? 'pill-gold' : 'pill-blue';

// Some environments expose confirm() as a global; fall back to allowing the action.
const confirmDialog = (msg: string): boolean => {
  const c = (typeof window !== 'undefined' ? (window as any).confirm : undefined) ?? (globalThis as any).confirm;
  if (typeof c === 'function') {
    try { return !!c(msg); } catch { return true; }
  }
  return true;
};

const emptyNewForm = () => ({ username: '', name: '', role: 'team_member', team: 'KPV', password: '' });

export default function UserSettings() {
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [newForm, setNewForm] = useState(emptyNewForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyNewForm);

  const me = getCurrentUser() || { username: '', name: '', role: 'staff', team: '' };

  useEffect(() => { void loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    setUsers(await fetchUsers());
    setLoading(false);
  };

  const addUser = async () => {
    const username = newForm.username.trim();
    const name = newForm.name.trim();
    const password = newForm.password;
    if (!username || !name || !password) {
      setMsg({ type: 'err', text: 'Username, full name and password are all required.' });
      return;
    }
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      setMsg({ type: 'err', text: `Username "${username}" already exists.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    const err = await addUserRecord({ username, name, role: newForm.role, team: newForm.team, password });
    if (err) {
      setMsg({ type: 'err', text: `Failed to add user: ${err.message}` });
    } else {
      setMsg({ type: 'ok', text: `User "${username}" created.` });
      setNewForm(emptyNewForm());
      await writeAuditLog('user.create', { username, role: newForm.role, team: newForm.team }, 'success', me.team);
      await loadUsers();
    }
    setBusy(false);
  };

  const startEdit = (u: AppUserRow) => {
    setEditingId(u.id);
    setEditForm({ username: u.username, name: u.name, role: u.role, team: u.team, password: '' });
    setMsg(null);
  };

  const saveEdit = async (id: string) => {
    const username = editForm.username.trim();
    const name = editForm.name.trim();
    if (!username || !name) {
      setMsg({ type: 'err', text: 'Username and full name are required.' });
      return;
    }
    if (users.some(u => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
      setMsg({ type: 'err', text: `Username "${username}" already exists.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    const fields: Record<string, any> = { username, name, role: editForm.role, team: editForm.team };
    const passwordChanged = editForm.password.trim().length > 0;
    if (passwordChanged) fields.password = editForm.password.trim();
    const err = await updateUserRecord(id, fields);
    if (err) {
      setMsg({ type: 'err', text: `Failed to update user: ${err.message}` });
    } else {
      setMsg({ type: 'ok', text: `User "${username}" updated.` });
      await writeAuditLog('user.update', { username, role: editForm.role, team: editForm.team, password_changed: passwordChanged }, 'success', me.team);
      setEditingId(null);
      await loadUsers();
    }
    setBusy(false);
  };

  const toggleActive = async (u: AppUserRow) => {
    if (u.username === me.username) {
      setMsg({ type: 'err', text: 'You cannot deactivate your own account.' });
      return;
    }
    const next = !u.is_active;
    const actionWord = next ? 'Reactivate' : 'Deactivate';
    if (!confirmDialog(`${actionWord} user "${u.username}"? ${next ? '' : 'He/she will no longer be able to sign in.'}`)) return;
    setBusy(true);
    setMsg(null);
    const err = await setUserActive(u.id, next);
    if (err) {
      setMsg({ type: 'err', text: `Failed to ${next ? 'activate' : 'deactivate'} user: ${err.message}` });
    } else {
      setMsg({ type: 'ok', text: `User "${u.username}" ${next ? 'activated' : 'deactivated'}.` });
      await writeAuditLog(next ? 'user.activate' : 'user.deactivate', { username: u.username }, 'success', me.team);
      await loadUsers();
    }
    setBusy(false);
  };

  const removeUser = async (u: AppUserRow) => {
    if (u.username === me.username) {
      setMsg({ type: 'err', text: 'You cannot delete your own account.' });
      return;
    }
    if (!confirmDialog(`Permanently delete user "${u.username}"? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    const err = await deleteUserRecord(u.id);
    if (err) {
      setMsg({ type: 'err', text: `Failed to delete user: ${err.message}` });
    } else {
      setMsg({ type: 'ok', text: `User "${u.username}" deleted.` });
      await writeAuditLog('user.delete', { username: u.username }, 'success', me.team);
      await loadUsers();
    }
    setBusy(false);
  };

  const isActive = (u: AppUserRow) => u.is_active !== false;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--red)', fontSize: '18px' }}><i className="fa-solid fa-user-gear"></i></span>
        <h2 style={{ margin: 0, fontSize: '15px' }}>User Setting</h2>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--txt-dim)', marginBottom: '16px' }}>
        Create, edit, deactivate and delete login accounts (users table). All changes are recorded in the Audit Log.
      </div>

      {/* Add user */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.6fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end', marginBottom: '18px' }}>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Username</label>
          <input type="text" value={newForm.username} onChange={e => setNewForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. kpv2@easygold.la" disabled={busy} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Full Name</label>
          <input type="text" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ບຸນມີທິບ ວົງພັດທະນະ" disabled={busy} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Role</label>
          <select value={newForm.role} onChange={e => setNewForm(f => ({ ...f, role: e.target.value }))} disabled={busy}>
            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Team</label>
          <select value={newForm.team} onChange={e => setNewForm(f => ({ ...f, team: e.target.value }))} disabled={busy}>
            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Password</label>
          <input type="text" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••" disabled={busy} />
        </div>
        <button className="btn btn-primary" onClick={addUser} disabled={busy} style={{ height: '42px', padding: '0 14px', opacity: busy ? 0.6 : 1 }}>
          <i className="fa-solid fa-plus"></i> Add User
        </button>
      </div>

      {/* Users table */}
      <table className="data-table">
        <thead>
          <tr><th>Username</th><th>Name</th><th>Role</th><th>Team</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ color: 'var(--txt-dim)', textAlign: 'center', padding: '20px' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>Loading users…
            </td></tr>
          ) : (
            users.map(u => (
              <tr key={u.id} style={!isActive(u) && editingId !== u.id ? { opacity: 0.55 } : undefined}>
                {editingId === u.id ? (
                  <>
                    <td>
                      <input type="text" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} style={{ padding: '5px 10px', fontSize: '13px', width: '150px' }} disabled={busy} />
                    </td>
                    <td>
                      <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ padding: '5px 10px', fontSize: '13px', width: '160px' }} disabled={busy} />
                    </td>
                    <td>
                      <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} style={{ padding: '5px 10px', fontSize: '13px' }} disabled={busy}>
                        {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={editForm.team} onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))} style={{ padding: '5px 10px', fontSize: '13px' }} disabled={busy}>
                        {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      {isActive(u) ? (
                        <span className="pill pill-green"><i className="fa-solid fa-circle-check"></i> Active</span>
                      ) : (
                        <span className="pill pill-red"><i className="fa-solid fa-circle-xmark"></i> Inactive</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <input type="text" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="New password" title="Leave blank to keep the current password" style={{ width: '118px', padding: '4px 8px', fontSize: '11px' }} disabled={busy} />
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => saveEdit(u.id)} disabled={busy}>
                        <i className="fa-solid fa-check"></i> Save
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px', marginLeft: '6px' }} onClick={() => setEditingId(null)} disabled={busy}>✕</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{u.username}</span>
                      {u.username === me.username && <span className="pill pill-blue" style={{ marginLeft: '6px' }}>You</span>}
                    </td>
                    <td>{u.name}</td>
                    <td><span className={`pill ${rolePill(u.role)}`}>{roleLabel(u.role)}</span></td>
                    <td><span className="pill pill-blue">{u.team || '—'}</span></td>
                    <td>
                      {isActive(u) ? (
                        <span className="pill pill-green"><i className="fa-solid fa-circle-check"></i> Active</span>
                      ) : (
                        <span className="pill pill-red"><i className="fa-solid fa-circle-xmark"></i> Inactive</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px' }} title="Edit user" onClick={() => startEdit(u)} disabled={busy}>
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px', marginLeft: '6px' }}
                        title={isActive(u) ? 'Deactivate user' : 'Activate user'}
                        onClick={() => toggleActive(u)}
                        disabled={busy || u.username === me.username}>
                        <i className={`fa-solid ${isActive(u) ? 'fa-ban' : 'fa-circle-check'}`}></i>
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px', marginLeft: '6px', color: 'var(--red)' }}
                        title="Delete user" onClick={() => removeUser(u)} disabled={busy || u.username === me.username}>
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))
          )}
          {!loading && users.length === 0 && (
            <tr><td colSpan={6} style={{ color: 'var(--txt-dim)', textAlign: 'center', padding: '20px' }}>
              No login accounts found in the users table. Add the first one above.
            </td></tr>
          )}
        </tbody>
      </table>

      {msg && (
        <div role="status" className={`alert ${msg.type === 'ok' ? 'alert-ok' : 'alert-info'}`} style={{ marginBottom: '14px' }}>
          <i className={`fa-solid ${msg.type === 'ok' ? 'fa-check' : 'fa-triangle-exclamation'}`} aria-hidden="true"></i> {msg.text}
        </div>
      )}
    </div>
  );
}