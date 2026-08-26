import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { addCheckIn, getCheckIns, getCurrentUser } from '../lib/workflow';
import type { CheckInRecord } from '../lib/workflow';
import { labelDate } from '../lib/submissions';

// Fallback coordinates (Vientiane centre) when GPS is unavailable
const FALLBACK = { lat: 17.9757, lng: 102.6331 };

export default function CheckIn() {
  const [params] = useSearchParams();
  const user = getCurrentUser();

  // Prefilled when arriving from a Calendar plan ticket (?date=…&location=…)
  const plannedDate = params.get('date') || new Date().toISOString().slice(0, 10);
  const plannedLocation = params.get('location') || '';

  const [date, setDate] = useState(plannedDate);
  const [location, setLocation] = useState(plannedLocation);
  const [capturing, setCapturing] = useState(false);
  const [lastCapture, setLastCapture] = useState<CheckInRecord | null>(null);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<CheckInRecord[]>(getCheckIns());

    const finishCapture = (lat: number, lng: number, note = '') => {
    const rec: CheckInRecord = {
      id: `ck-${Date.now()}`,
      date,
      time: new Date().toTimeString().slice(0, 5),
      location: location.trim() || 'Unspecified location',
      team: user?.team || 'KPV',
      user: user?.name || 'Unknown',
      lat,
      lng,
    };
    addCheckIn(rec);
    setHistory(getCheckIns());
    setLastCapture(rec);
    setNotice(note);
  };

  // "Capture My Location Now" — records GPS so the staff is marked on standby at the spot
  const handleCapture = () => {
    setNotice('');
    if (!location.trim()) {
      setNotice('Please fill the Branch / Place first.');
      return;
    }
    if (!navigator.geolocation) {
      finishCapture(FALLBACK.lat, FALLBACK.lng, 'GPS not supported — approximate city-centre coordinates saved.');
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCapturing(false);
        finishCapture(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setCapturing(false);
        finishCapture(FALLBACK.lat, FALLBACK.lng, 'GPS permission denied — approximate coordinates saved.');
      },
            { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div>
      <div className="demo-banner">
        <i className="fa-solid fa-circle-info"></i> Pick a plan in Calendar &amp; Route to prefill this page, then capture your GPS location to mark yourself on standby. After the activity, go to Submit Results.
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* ── Capture card ── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <span style={{ color: 'var(--gold)', fontSize: '18px' }}><i className="fa-solid fa-location-dot"></i></span>
            <h2 style={{ margin: 0, fontSize: '15px' }}>Record My Location</h2>
          </div>

          {plannedLocation && (
            <div className="alert alert-ok" style={{ marginBottom: '20px' }}>
              <i className="fa-solid fa-route"></i> Prefilled from assigned plan: {plannedLocation} · {plannedDate}
            </div>
          )}

          <div className="grid-3" style={{ gap: '14px', marginBottom: '20px' }}>
            <div className="form-field" style={{ margin: 0 }}><label>Check-In Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-field" style={{ margin: 0 }}><label>Team</label>
              <select disabled><option>{user?.team || 'KPV'} Team</option></select>
            </div>
            <div className="form-field" style={{ margin: 0 }}><label>Branch / Place</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. That Luang" />
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ padding: '12px 24px', fontSize: '14px', width: '100%', justifyContent: 'center' }}
            onClick={handleCapture}
            disabled={capturing}
          >
            <span style={{ color: 'var(--red)', marginRight: '8px' }}>
              <i className={`fa-solid ${capturing ? 'fa-spinner fa-spin' : 'fa-location-dot'}`}></i>
            </span>
            {capturing ? 'Locating…' : 'Capture My Location Now'}
          </button>

          {lastCapture && (
            <div className="alert alert-ok" style={{ marginTop: '14px', display: 'block' }}>
              <div><i className="fa-solid fa-check"></i> <strong>Checked in:</strong> {lastCapture.location} — {lastCapture.lat.toFixed(4)}, {lastCapture.lng.toFixed(4)} at {lastCapture.time}</div>
              {notice && <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>{notice}</div>}
              <Link to="/submit" className="btn btn-primary" style={{ marginTop: '10px', padding: '8px 16px', fontSize: '12px', display: 'inline-flex' }}>
                Activity finished? Submit Results <i className="fa-solid fa-arrow-right" style={{ marginLeft: '6px' }}></i>
              </Link>
            </div>
          )}
        </div>

        {/* ── History card ── */}
        <div className="card">
          <h3 style={{ marginBottom: '4px', fontSize: '15px' }}>My Captured Check-Ins</h3>
          <div style={{ fontSize: '11px', color: 'var(--txt-dim)', marginBottom: '14px' }}>
            These are the activity check-ins you can select later in Submit Results.
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '24px', fontSize: '13px' }}>
              No check-ins captured yet — capture your location above.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Date &amp; Time</th><th>Team</th><th>Branch / Place</th><th>Coords</th></tr>
              </thead>
              <tbody>
                {history.slice(0, 12).map(c => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{labelDate(c.date)} · {c.time}</td>
                    <td><span className={`pill ${c.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{c.team}</span></td>
                    <td>{c.location}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--txt-dim)' }}>
                      {c.lat.toFixed(3)}, {c.lng.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
