import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentDateHelpers } from '../lib/submissions';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

export default function Dashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { startOfMonth, endOfMonth } = getCurrentDateHelpers();
  const [startDate, setStartDate] = useState(startOfMonth);
  const [endDate, setEndDate] = useState(endOfMonth);
  const [teamFilter, setTeamFilter] = useState('All Teams');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: submissions, error } = await supabase
      .from('submissions')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) console.error('Error fetching submissions:', error);
    if (submissions) setData(submissions);
    setLoading(false);
  };

  // Mock Data for charts if database is empty
  const hasData = data.length > 0;
  
  const lineData = {
    labels: ['1 Mar', '5 Mar', '10 Mar', '15 Mar', '20 Mar', '25 Mar', '30 Mar'],
    datasets: [{
      label: 'Acquisitions',
      data: hasData ? [] : [12, 19, 30, 25, 42, 50, 65],
      borderColor: '#A77B27',
      backgroundColor: 'rgba(167, 123, 39, 0.2)',
      tension: 0.4
    }]
  };

  const donutAcqData = {
    labels: ['New Customer', 'Existing Customers'],
    datasets: [{
      data: [67.5, 32.5],
      backgroundColor: ['#D4A843', '#4D9EFF'],
      borderWidth: 0,
    }]
  };

  return (
    <div>
      <div className="demo-banner">
        <i className="fa-solid fa-circle-info"></i> {loading ? 'Loading data...' : hasData ? 'Live Data Loaded' : 'Showing Sample Data. Connect to Supabase to see real data.'}
      </div>

      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '7px 12px', fontSize: '12px', width: 'auto' }} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '7px 12px', fontSize: '12px', width: 'auto' }} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Team</label>
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: '12px', width: 'auto' }}>
            <option>All Teams</option>
            <option>KPV Team</option>
            <option>Agency Team</option>
          </select>
        </div>
        <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); setTeamFilter('All Teams'); }} style={{ padding: '7px 14px', fontSize: '12px', marginTop: '16px' }}>
          <i className="fa-solid fa-xmark"></i> Clear
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="card kpi-card" style={{ position: 'relative' }}>
          <div className="kpi-badge" style={{ background: 'rgba(212,168,67,0.18)', color: 'var(--gold)', border: '1px solid rgba(212,168,67,0.35)' }}>87% of Target</div>
          <div className="kpi-icon"><i className="fa-solid fa-users" style={{ color: '#fff' }}></i></div>
          <div className="kpi-label">Acquisition (NC + EC)</div>
          <div className="kpi-val">1,847</div>
          <div className="kpi-sub">NC: 1,247 &nbsp;|&nbsp; EC: 600</div>
          <div className="kpi-tgt" style={{ color: 'var(--gold)' }}>▲ +12% vs prev month</div>
        </div>
        
        <div className="card kpi-card green" style={{ position: 'relative' }}>
          <div className="kpi-badge" style={{ background: 'rgba(46,194,122,0.15)', color: 'var(--green)', border: '1px solid rgba(46,194,122,0.35)' }}>92% of Target</div>
          <div className="kpi-icon"><i className="fa-solid fa-sack-dollar" style={{ color: '#fff' }}></i></div>
          <div className="kpi-label">Total Buy Value</div>
          <div className="kpi-val">₭92.4M</div>
          <div className="kpi-sub">Target: ₭100M</div>
          <div className="kpi-tgt" style={{ color: 'var(--green)' }}>▲ +8% vs prev month</div>
        </div>
        
        <div className="card kpi-card red">
          <div className="kpi-icon"><i className="fa-solid fa-money-bill-wave" style={{ color: '#fff' }}></i></div>
          <div className="kpi-label">Total Spending</div>
          <div className="kpi-val">₭28.6M</div>
          <div className="kpi-sub">Team: ₭21.3M · Merch: ₭7.3M</div>
          <div className="kpi-tgt" style={{ color: 'var(--red)' }}>Budget: ₭35M</div>
        </div>

        <div className="card kpi-card orange">
          <div className="kpi-icon"><i className="fa-solid fa-chart-line" style={{ color: '#fff' }}></i></div>
          <div className="kpi-label">CPA (Cost / NC)</div>
          <div className="kpi-val">₭22,933</div>
          <div className="kpi-sub">28,600,000 ÷ 1,247</div>
          <div className="kpi-tgt" style={{ color: '#F4A62A' }}>Target: ₭100,000 ✓ Under</div>
        </div>

        <div className="card kpi-card blue">
          <div className="kpi-icon"><i className="fa-solid fa-cart-shopping" style={{ color: '#fff' }}></i></div>
          <div className="kpi-label">CPO (Cost / Buyers)</div>
          <div className="kpi-val">₭35,074</div>
          <div className="kpi-sub">28,600,000 ÷ 815</div>
          <div className="kpi-tgt" style={{ color: 'var(--blue)' }}>Target: ₭60,000 ✓ Under</div>
        </div>

        <div className="card kpi-card teal">
          <div className="kpi-icon"><i className="fa-solid fa-receipt" style={{ color: '#fff' }}></i></div>
          <div className="kpi-label">CPAO (Cost / Acq. Order)</div>
          <div className="kpi-val">₭15,508</div>
          <div className="kpi-sub">28,600,000 ÷ 1,847</div>
          <div className="kpi-tgt" style={{ color: '#3ECFCF' }}>Target: ₭130,000 ✓ Under</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '14px', margin: 0 }}>Acquisition Trend</h3>
          </div>
          <div style={{ height: '220px' }}>
            <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '4px', fontSize: '14px' }}>Acquisition % Contribution</h3>
          <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginBottom: '12px' }}>New Customer vs Existing share of total</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '160px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '140px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#D4A843', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>New Customer</span>
                <strong style={{ color: 'var(--gold)', marginLeft: 'auto' }}>67.5%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#4D9EFF', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>Existing Customers</span>
                <strong style={{ color: 'var(--blue)', marginLeft: 'auto' }}>32.5%</strong>
              </div>
            </div>
            <div style={{ width: '150px', height: '150px', flexShrink: 0, marginLeft: 'auto' }}>
              <Doughnut data={donutAcqData} options={{ responsive: true, maintainAspectRatio: false }} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '15px' }}>Recent Submissions</h3>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Team</th><th>Branch</th><th>Total Acq.</th><th>Buy Value</th><th>Cost</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>26 Mar 25</td>
              <td><span className="pill pill-gold">KPV</span></td>
              <td>That Luang</td>
              <td>62</td>
              <td>₭4.2M</td>
              <td>₭950,000</td>
              <td><span className="pill pill-green">Active</span></td>
            </tr>
            <tr>
              <td>26 Mar 25</td>
              <td><span className="pill pill-blue">Agency</span></td>
              <td>NUOL Campus</td>
              <td>78</td>
              <td>₭5.1M</td>
              <td>₭1,100,000</td>
              <td><span className="pill pill-green">Active</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
