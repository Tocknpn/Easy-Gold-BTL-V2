import { getCurrentDateHelpers } from '../lib/submissions';

export default function Targets() {
  const { currentMonthStr } = getCurrentDateHelpers();
  return (
    <div>
      <div className="demo-banner"><i className="fa-solid fa-circle-info"></i> Shows MTD performance vs monthly targets. Visible to all roles.</div>
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-calendar-range" style={{ color: 'var(--gold)', fontSize: '15px' }}></i>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Target Period</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="month" defaultValue={currentMonthStr} style={{ padding: '6px 10px', fontSize: '12px', width: 'auto' }} />
            <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '11px' }}><i className="fa-solid fa-rotate"></i> This Month</button>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginBottom: '20px', fontSize: '15px' }}>KPV Team Performance</h2>
          
          <div className="tgt-row">
            <div className="tgt-label"><span>New Acquisition</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: 900</span></div>
            <div className="tgt-val val-gold">724 <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/900</span></div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: '80.4%', background: 'var(--gold)' }}></div></div>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>80.4% of target · <span style={{ color: 'var(--gold)' }}>On track</span></div>
          </div>
          
          <div className="tgt-row">
            <div className="tgt-label"><span>Buy Value</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: ₭60M</span></div>
            <div className="tgt-val val-green">₭54.2M <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/₭60M</span></div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: '90.3%', background: 'var(--green)' }}></div></div>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>90.3% of target · <span style={{ color: 'var(--green)' }}>Almost there</span></div>
          </div>

          <div className="tgt-row">
            <div className="tgt-label"><span>CPA (Cost Per Acquisition)</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: ≤₭100K</span></div>
            <div className="tgt-val val-gold">₭22,480</div>
            <div style={{ fontSize: '10px', color: 'var(--green)', marginTop: '4px', fontWeight: 700 }}>✓ Excellent — 4.4x under target</div>
          </div>

          <div className="tgt-row">
            <div className="tgt-label"><span>Cost Budget</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Budget: ₭20M</span></div>
            <div className="tgt-val val-red">₭16.3M <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/₭20M</span></div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: '81.5%', background: 'var(--red)' }}></div></div>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>81.5% used · <span style={{ color: 'var(--green)' }}>₭3.7M remaining</span></div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '20px', fontSize: '15px' }}>Agency Team Performance</h2>
          
          <div className="tgt-row">
            <div className="tgt-label"><span>New Acquisition</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: 600</span></div>
            <div className="tgt-val val-gold">523 <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/600</span></div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: '87.2%', background: 'var(--gold)' }}></div></div>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>87.2% of target · <span style={{ color: 'var(--gold)' }}>On track</span></div>
          </div>
          
          <div className="tgt-row">
            <div className="tgt-label"><span>Buy Value</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: ₭40M</span></div>
            <div className="tgt-val val-green">₭38.2M <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/₭40M</span></div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: '95.5%', background: 'var(--green)' }}></div></div>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>95.5% of target · <span style={{ color: 'var(--green)' }}>Almost there</span></div>
          </div>

          <div className="tgt-row">
            <div className="tgt-label"><span>CPA (Cost Per Acquisition)</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: ≤₭90K</span></div>
            <div className="tgt-val val-gold">₭23,518</div>
            <div style={{ fontSize: '10px', color: 'var(--green)', marginTop: '4px', fontWeight: 700 }}>✓ Excellent — 3.8x under target</div>
          </div>

          <div className="tgt-row">
            <div className="tgt-label"><span>Cost Budget</span><span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Budget: ₭15M</span></div>
            <div className="tgt-val val-red">₭12.3M <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/₭15M</span></div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: '82%', background: 'var(--red)' }}></div></div>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>82% used · <span style={{ color: 'var(--green)' }}>₭2.7M remaining</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
