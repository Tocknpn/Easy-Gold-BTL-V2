import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchSubmissions } from '../lib/submissions';

interface TargetRow {
  id: string;
  team: string;
  month: string; // stored as YYYY-MM-01
  new_reg_target: number;
  buy_value_target: number;
  cost_budget: number;
  cpa_target: number;
  cpo_target: number;
  cpao_target: number;
  footfall_target: number;
}

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `₭${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₭${(n / 1_000).toFixed(0)}K`;
  return `₭${n.toLocaleString()}`;
};

const pct = (val: number, target: number) =>
  target > 0 ? Math.min((val / target) * 100, 100) : 0;

const statusLabel = (p: number) => {
  if (p >= 100) return { text: 'Achieved!', color: 'var(--green)' };
  if (p >= 80) return { text: 'On track', color: 'var(--gold)' };
  if (p >= 50) return { text: 'Almost there', color: 'var(--gold)' };
  return { text: 'Needs attention', color: 'var(--red)' };
};

const cpaStatus = (cpa: number, target: number) => {
  if (!target || !cpa) return null;
  const ratio = target / cpa;
  if (ratio >= 2) return { text: `✓ Excellent — ${ratio.toFixed(1)}x under target`, color: 'var(--green)' };
  if (ratio >= 1) return { text: `✓ Within target`, color: 'var(--green)' };
  return { text: `⚠ Over target by ${((cpa / target - 1) * 100).toFixed(0)}%`, color: 'var(--red)' };
};

export default function Targets() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Actuals per team for the selected month
  const [actuals, setActuals] = useState<Record<string, { nc: number; buyValue: number; totalCost: number }>>({});

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('targets').select('*'),
      fetchSubmissions(),
    ]).then(([{ data: tData }, { data: sData }]) => {
      if (tData) {
        setTargets(tData.map((r: any) => ({
          id: r.id,
          team: r.team,
          month: r.month,
          new_reg_target: Number(r.new_reg_target) || 0,
          buy_value_target: Number(r.buy_value_target) || 0,
          cost_budget: Number(r.cost_budget) || 0,
          cpa_target: Number(r.cpa_target) || 0,
          cpo_target: Number(r.cpo_target) || 0,
          cpao_target: Number(r.cpao_target) || 0,
          footfall_target: Number(r.footfall_target) || 0,
        })));
      }

      if (sData) {
        const byTeam: Record<string, { nc: number; buyValue: number; totalCost: number }> = {};
        for (const s of sData) {
          if (!s.date || !s.date.startsWith(selectedMonth)) continue;
          const team = s.team || 'KPV';
          if (!byTeam[team]) byTeam[team] = { nc: 0, buyValue: 0, totalCost: 0 };
          byTeam[team].nc += Number(s.new_register) || 0;
          byTeam[team].buyValue += Number(s.buy_value_new) || 0;
          byTeam[team].totalCost += (Number(s.merch_cost) || 0) + (Number(s.team_cost) || 0);
        }
        setActuals(byTeam);
      }

      setLoading(false);
    });
  }, [selectedMonth]);

  // Get the target row for a team in selected month
  const getTarget = (team: string) =>
    targets.find(t => t.team === team && (t.month === `${selectedMonth}-01` || t.month === selectedMonth));

  const TeamCard = ({ team }: { team: string }) => {
    const tgt = getTarget(team);
    const act = actuals[team] || { nc: 0, buyValue: 0, totalCost: 0 };
    const cpa = act.nc > 0 ? act.totalCost / act.nc : 0;

    return (
      <div className="card">
        <h2 style={{ marginBottom: '20px', fontSize: '15px' }}>{team} Team Performance</h2>

        {!tgt ? (
          <div style={{ fontSize: '13px', color: 'var(--txt-dim)', padding: '16px 0', textAlign: 'center' }}>
            <i className="fa-solid fa-circle-info" style={{ marginRight: '6px', color: 'var(--gold)' }}></i>
            No target set for {team} in {selectedMonth}.
          </div>
        ) : (
          <>
            {/* New Acquisition */}
            <div className="tgt-row">
              <div className="tgt-label">
                <span>New Acquisition</span>
                <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: {tgt.new_reg_target.toLocaleString()}</span>
              </div>
              <div className="tgt-val val-gold">
                {act.nc.toLocaleString()} <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/{tgt.new_reg_target.toLocaleString()}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct(act.nc, tgt.new_reg_target)}%`, background: 'var(--gold)' }}></div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>
                {pct(act.nc, tgt.new_reg_target).toFixed(1)}% of target ·{' '}
                <span style={{ color: statusLabel(pct(act.nc, tgt.new_reg_target)).color }}>
                  {statusLabel(pct(act.nc, tgt.new_reg_target)).text}
                </span>
              </div>
            </div>

            {/* Buy Value */}
            <div className="tgt-row">
              <div className="tgt-label">
                <span>Buy Value</span>
                <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: {fmtShort(tgt.buy_value_target)}</span>
              </div>
              <div className="tgt-val val-green">
                {fmtShort(act.buyValue)} <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/{fmtShort(tgt.buy_value_target)}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct(act.buyValue, tgt.buy_value_target)}%`, background: 'var(--green)' }}></div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>
                {pct(act.buyValue, tgt.buy_value_target).toFixed(1)}% of target ·{' '}
                <span style={{ color: statusLabel(pct(act.buyValue, tgt.buy_value_target)).color }}>
                  {statusLabel(pct(act.buyValue, tgt.buy_value_target)).text}
                </span>
              </div>
            </div>

            {/* CPA */}
            {tgt.cpa_target > 0 && (
              <div className="tgt-row">
                <div className="tgt-label">
                  <span>CPA (Cost Per Acquisition)</span>
                  <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Target: ≤{fmtShort(tgt.cpa_target)}</span>
                </div>
                <div className="tgt-val val-gold">{cpa > 0 ? fmtShort(cpa) : '—'}</div>
                {cpa > 0 && (() => {
                  const s = cpaStatus(cpa, tgt.cpa_target);
                  return s ? (
                    <div style={{ fontSize: '10px', color: s.color, marginTop: '4px', fontWeight: 700 }}>{s.text}</div>
                  ) : null;
                })()}
              </div>
            )}

            {/* Cost Budget */}
            {tgt.cost_budget > 0 && (
              <div className="tgt-row">
                <div className="tgt-label">
                  <span>Cost Budget</span>
                  <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Budget: {fmtShort(tgt.cost_budget)}</span>
                </div>
                <div className="tgt-val val-red">
                  {fmtShort(act.totalCost)} <span style={{ fontSize: '13px', color: 'var(--txt-sub)' }}>/{fmtShort(tgt.cost_budget)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct(act.totalCost, tgt.cost_budget)}%`, background: 'var(--red)' }}></div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>
                  {pct(act.totalCost, tgt.cost_budget).toFixed(1)}% used ·{' '}
                  {act.totalCost < tgt.cost_budget ? (
                    <span style={{ color: 'var(--green)' }}>{fmtShort(tgt.cost_budget - act.totalCost)} remaining</span>
                  ) : (
                    <span style={{ color: 'var(--red)' }}>Over budget by {fmtShort(act.totalCost - tgt.cost_budget)}</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-calendar-range" style={{ color: 'var(--gold)', fontSize: '15px' }}></i>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Target Period</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', width: 'auto' }}
            />
            <button
              className="btn btn-ghost"
              style={{ padding: '5px 12px', fontSize: '11px' }}
              onClick={() => {
                const n = new Date();
                setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`);
              }}
            >
              <i className="fa-solid fa-rotate"></i> This Month
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--txt-dim)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '24px', marginBottom: '12px', display: 'block' }}></i>
          Loading targets & performance data…
        </div>
      ) : (
        <div className="grid-2">
          <TeamCard team="KPV" />
          <TeamCard team="Agency" />
        </div>
      )}
    </div>
  );
}
