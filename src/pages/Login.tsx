import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Custom auth against the users table
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

            if (fetchError || !data) {
        // Fallback for local testing before Supabase is connected
        if (username === 'admin@easygold.la' && password === 'admin123') {
          localStorage.setItem('easygold_user', JSON.stringify({ username, name: 'Admin', role: 'admin', team: 'Admin Team' }));
          navigate('/');
        } else if (username === 'kpv@easygold.la' && password === 'kpv123') {
          localStorage.setItem('easygold_user', JSON.stringify({ username, name: 'Somxay K.', role: 'staff', team: 'KPV' }));
          navigate('/calendar');
        } else if (username === 'agency@easygold.la' && password === 'agency123') {
          localStorage.setItem('easygold_user', JSON.stringify({ username, name: 'Alita P.', role: 'staff', team: 'Agency' }));
          navigate('/calendar');
        } else if (username === 'manager@easygold.la' && password === 'manager123') {
          localStorage.setItem('easygold_user', JSON.stringify({ username, name: 'Souphaxay K.', role: 'admin', team: 'Manager Team' }));
          navigate('/');
        } else {
          setError('Invalid username or password');
        }
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
    } catch (err: any) {
      setError(err.message || 'An error occurred');
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

        {error && (
          <div className="alert alert-info" style={{ background: 'var(--red-dim)', color: 'var(--red)', borderColor: 'rgba(232,84,84,0.2)', marginBottom: '20px' }}>
            <i className="fa-solid fa-circle-exclamation"></i> {error}
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
                      {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Demo Accounts — click to fill</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'space-between', fontSize: '12px', padding: '8px 12px' }} onClick={() => { setUsername('admin@easygold.la'); setPassword('admin123'); }}>
              <span><i className="fa-solid fa-user-shield" style={{ color: 'var(--gold)', marginRight: '8px' }}></i>Admin</span>
              <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>full access</span>
            </button>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'space-between', fontSize: '12px', padding: '8px 12px' }} onClick={() => { setUsername('kpv@easygold.la'); setPassword('kpv123'); }}>
              <span><i className="fa-solid fa-user" style={{ color: 'var(--blue)', marginRight: '8px' }}></i>Staff — KPV</span>
              <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>field workflow</span>
            </button>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'space-between', fontSize: '12px', padding: '8px 12px' }} onClick={() => { setUsername('agency@easygold.la'); setPassword('agency123'); }}>
              <span><i className="fa-solid fa-user" style={{ color: 'var(--green)', marginRight: '8px' }}></i>Staff — Agency</span>
              <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>field workflow</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
