import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// Demo credentials — only work when no real Supabase DB is configured
const DEMO_USERS: Record<string, { name: string; role: string; team: string; dest: string }> = {
  'admin@easygold.la:admin123':   { name: 'Admin',       role: 'admin', team: 'Admin Team',   dest: '/' },
  'manager@easygold.la:manager123': { name: 'Souphaxay K.', role: 'admin', team: 'Manager Team', dest: '/' },
  'kpv@easygold.la:kpv123':       { name: 'Somxay K.',   role: 'staff', team: 'KPV',          dest: '/calendar' },
  'agency@easygold.la:agency123': { name: 'Alita P.',    role: 'staff', team: 'Agency',        dest: '/calendar' },
};

const hasRealDB = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return url.length > 0 && !url.includes('xyzcompany');
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isTimeout, setIsTimeout] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsTimeout(false);
    setLoading(true);

    try {
      if (hasRealDB()) {
        // ── Real Supabase login with 8-second timeout ─────────────────────
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('__timeout__')), 8000)
        );
        const query = supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .eq('password', password)
          .single();

        const { data, error: fetchError } = await Promise.race([query, timeoutPromise]);

        if (fetchError || !data) {
          setError('Invalid username or password.');
        } else {
          const role = data.role === 'admin' || data.role === 'manager' ? 'admin' : 'staff';
          localStorage.setItem('easygold_user', JSON.stringify({
            username: data.username ?? username,
            name: data.name ?? username,
            role,
            team: role === 'staff' ? (data.team === 'Agency' ? 'Agency' : 'KPV') : (data.team || ''),
          }));
          navigate(role === 'admin' ? '/' : '/calendar');
        }
      } else {
        // ── No real DB configured — use local demo credentials ─────────────
        const key = `${username}:${password}`;
        const match = DEMO_USERS[key];
        if (match) {
          localStorage.setItem('easygold_user', JSON.stringify({ username, name: match.name, role: match.role, team: match.team }));
          navigate(match.dest);
        } else {
          setError('Invalid username or password.');
        }
      }
    } catch (err: any) {
      if (err.message === '__timeout__') {
        // Supabase didn't reply in time → show a retry message, NOT demo data
        setIsTimeout(true);
        setError('');
      } else {
        setError(err.message || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', background: 'var(--ink)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="logo-mark" style={{ width: '48px', height: '48px', fontSize: '24px', margin: '0 auto 16px' }}>🏅</div>
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>Easy Gold</h1>
          <div style={{ color: 'var(--txt-sub)' }}>Sign in to BTL Tracker</div>
        </div>

        {/* Normal error */}
        {error && (
          <div className="alert" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(224,82,82,0.2)', marginBottom: '20px' }}>
            <i className="fa-solid fa-circle-exclamation"></i> {error}
          </div>
        )}

        {/* Timeout — special message with retry hint */}
        {isTimeout && (
          <div style={{
            background: 'rgba(244,148,58,0.1)',
            border: '1px solid rgba(244,148,58,0.35)',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '20px',
            fontSize: '13px',
          }}>
            <div style={{ fontWeight: 700, color: '#F4943A', marginBottom: '6px' }}>
              <i className="fa-solid fa-wifi" style={{ marginRight: '8px' }}></i>
              Server is taking too long to respond
            </div>
            <div style={{ color: 'var(--txt-sub)', fontSize: '12px', lineHeight: 1.5 }}>
              Your internet is fine, but our server didn't reply in time.
              <br />Please <strong>tap Sign In again</strong> to retry — it usually works on the 2nd attempt.
            </div>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-field">
            <label>Username</label>
            <input
              type="text"
              placeholder="e.g. manager@easygold.la"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '15px' }}
            disabled={loading}
          >
            {loading
              ? <><i className="fa-solid fa-spinner fa-spin"></i> Signing in…</>
              : isTimeout
              ? <><i className="fa-solid fa-rotate-right"></i> Retry Sign In</>
              : 'Sign In'
            }
          </button>
        </form>

        {!hasRealDB() && (
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Demo Accounts — click to fill
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button type="button" className="btn btn-ghost" style={{ justifyContent: 'space-between', fontSize: '12px', padding: '8px 12px' }} onClick={() => { setUsername('admin@easygold.la'); setPassword('admin123'); setError(''); setIsTimeout(false); }}>
                <span><i className="fa-solid fa-user-shield" style={{ color: 'var(--accent)', marginRight: '8px' }}></i>Admin</span>
                <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>full access</span>
              </button>
              <button type="button" className="btn btn-ghost" style={{ justifyContent: 'space-between', fontSize: '12px', padding: '8px 12px' }} onClick={() => { setUsername('kpv@easygold.la'); setPassword('kpv123'); setError(''); setIsTimeout(false); }}>
                <span><i className="fa-solid fa-user" style={{ color: 'var(--blue)', marginRight: '8px' }}></i>Staff — KPV</span>
                <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>field workflow</span>
              </button>
              <button type="button" className="btn btn-ghost" style={{ justifyContent: 'space-between', fontSize: '12px', padding: '8px 12px' }} onClick={() => { setUsername('agency@easygold.la'); setPassword('agency123'); setError(''); setIsTimeout(false); }}>
                <span><i className="fa-solid fa-user" style={{ color: 'var(--green)', marginRight: '8px' }}></i>Staff — Agency</span>
                <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>field workflow</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
