// Automated Test Suite for Junior QA Department
// Testing Marketing Report, Event Management, and Event Report functions & calculations

import assert from 'node:assert';

console.log('================================================================');
console.log('🧪 JUNIOR QA AUTOMATED TEST SUITE: EASY GOLD BTL');
console.log('Testing: Marketing Report, Event Management, Event Report');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;
const defects = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    defects.push({ test: name, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: MARKETING REPORT CALCULATIONS & FILTERS
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: MARKETING REPORT CALCULATIONS & FILTERS ---');

// Formula 1: % Change helper
const pctChange = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

test('Formula - pctChange: Normal positive growth', () => {
  const result = pctChange(120, 100);
  assert.strictEqual(result, 20);
});

test('Formula - pctChange: Normal decline', () => {
  const result = pctChange(80, 100);
  assert.strictEqual(result, -20);
});

test('Formula - pctChange: Division by zero handled safely (returns null)', () => {
  const result = pctChange(100, 0);
  assert.strictEqual(result, null);
});

test('Formula - pctChange: Null or undefined prev handled safely', () => {
  assert.strictEqual(pctChange(100, null), null);
  assert.strictEqual(pctChange(100, undefined), null);
});

// Formula 2: Cost Per Acquisition (CPA) and Cost Per Buyer (CPO)
const aggregateMarketing = (rows, types) => {
  let nc = 0, ec = 0, buyNew = 0, buyExisting = 0;
  let teamCost = 0, merchCost = 0, sponsorCost = 0, prodCost = 0, nrp = 0;
  for (const s of rows) {
    nc += s.new_register || 0;
    ec += s.existing_users || 0;
    buyNew += s.buy_value_new || 0;
    buyExisting += s.buy_value_existing || 0;
    teamCost += Number(s.team_cost) || 0;
    merchCost += Number(s.merch_cost) || 0;
    sponsorCost += Number(s.sponsorship_cost) || 0;
    prodCost += Number(s.prod_cost) || 0;
    nrp += s.new_reg_purchased || 0;
  }
  const totalCost = (types.includes('service') ? teamCost : 0)
    + (types.includes('merch') ? merchCost : 0)
    + (types.includes('sponsorship') ? sponsorCost : 0)
    + (types.includes('prod') ? prodCost : 0);

  return {
    nc,
    ec,
    totalAcq: nc + ec,
    totalCost,
    cpa: nc > 0 ? totalCost / nc : 0,
    cpo: (nrp + ec) > 0 ? totalCost / (nrp + ec) : 0,
  };
};

test('Marketing KPI Aggregation: Correct CPA & CPO calculation', () => {
  const sampleRows = [
    { new_register: 10, existing_users: 5, new_reg_purchased: 8, team_cost: 1000000, merch_cost: 500000, sponsorship_cost: 0, prod_cost: 0 },
    { new_register: 15, existing_users: 10, new_reg_purchased: 12, team_cost: 1500000, merch_cost: 500000, sponsorship_cost: 0, prod_cost: 0 },
  ];
  // Total cost = (1000000+1500000) + (500000+500000) = 3,500,000
  // Total NC = 25 -> CPA = 3,500,000 / 25 = 140,000
  // Total buyers = (nrp: 8+12=20) + (ec: 5+10=15) = 35 -> CPO = 3,500,000 / 35 = 100,000
  const agg = aggregateMarketing(sampleRows, ['service', 'merch']);
  assert.strictEqual(agg.totalCost, 3500000);
  assert.strictEqual(agg.nc, 25);
  assert.strictEqual(agg.cpa, 140000);
  assert.strictEqual(agg.cpo, 100000);
});

test('Marketing KPI Aggregation: Zero acquisition avoids NaN/Infinity', () => {
  const sampleRows = [
    { new_register: 0, existing_users: 0, new_reg_purchased: 0, team_cost: 1000000, merch_cost: 0 },
  ];
  const agg = aggregateMarketing(sampleRows, ['service']);
  assert.strictEqual(agg.cpa, 0);
  assert.strictEqual(agg.cpo, 0);
  assert(!isNaN(agg.cpa));
  assert(!isNaN(agg.cpo));
});

// Helper 3: 52/53 Weeks Generator
const formatIsoDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const generate52Weeks = (year) => {
  const weeks = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 6) { d.setDate(d.getDate() - 1); }
  const yearStartSat = new Date(d);

  const nextYearStart = new Date(year + 1, 0, 1);
  while (nextYearStart.getDay() !== 6) { nextYearStart.setDate(nextYearStart.getDate() - 1); }

  const totalWeeks = Math.round((nextYearStart.getTime() - yearStartSat.getTime()) / (7 * 86400000));

  for (let w = 1; w <= totalWeeks; w++) {
    const sDate = new Date(d);
    const eDate = new Date(d);
    eDate.setDate(eDate.getDate() + 8);
    weeks.push({
      key: `W${w}`,
      startDate: formatIsoDate(sDate),
      endDate: formatIsoDate(eDate),
      weekNum: w,
    });
    d.setDate(d.getDate() + 7);
  }
  return weeks;
};

test('Marketing Helper - generate52Weeks: Generates exactly 52 weeks in 2026 & 53 in 2027', () => {
  const weeks2026 = generate52Weeks(2026);
  assert.strictEqual(weeks2026.length, 52);
  assert.strictEqual(weeks2026[0].key, 'W1');
  assert.strictEqual(weeks2026[51].key, 'W52');

  const weeks2027 = generate52Weeks(2027);
  assert.strictEqual(weeks2027.length, 53);
  assert.strictEqual(weeks2027[52].key, 'W53');
});

test('Marketing Helper - generate52Weeks: W41 starts on 2026-10-03 (Sat)', () => {
  const weeks = generate52Weeks(2026);
  const w41 = weeks.find(w => w.key === 'W41');
  assert(w41, 'W41 should exist');
  assert.strictEqual(w41.startDate, '2026-10-03');
  assert.strictEqual(w41.endDate, '2026-10-11');
});

test('Marketing Helper - generate52Weeks: Check date span', () => {
  const weeks = generate52Weeks(2026);
  const w1 = weeks[0];
  const diffDays = Math.round((new Date(w1.endDate) - new Date(w1.startDate)) / 86400000);
  // Window is 8 days difference (9 calendar days)
  assert.strictEqual(diffDays, 8);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: EVENT MANAGEMENT CALCULATIONS & VALIDATIONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: EVENT MANAGEMENT CALCULATIONS & VALIDATIONS ---');

const computeCPMetrics = (totalCost, nc, ec, ncBuyer, impressions, footfall, targetCpm) => {
  const buyers = (ncBuyer > 0 ? ncBuyer : nc) + ec;
  const customers = nc + ec;
  const cpoBase = customers > 0 ? customers : (buyers > 0 ? buyers : 0);

  let cpm = 0;
  if (impressions > 0) {
    const rawPerImpression = totalCost / impressions;
    if (targetCpm && targetCpm > 0 && targetCpm < 500) {
      cpm = Math.round(rawPerImpression);
    } else if (rawPerImpression >= 1000) {
      cpm = Math.round(rawPerImpression);
    } else {
      cpm = Math.round(rawPerImpression * 1000);
    }
  }

  return {
    cpa: nc > 0 ? Math.round(totalCost / nc) : 0,
    cpo: cpoBase > 0 ? Math.round(totalCost / cpoBase) : 0,
    cpm,
    cpf: footfall > 0 ? Math.round(totalCost / footfall) : 0,
  };
};

test('Event Management - computeCPMetrics: LGF benchmark match', () => {
  // LGF from attachment: cost = 279,700,000, nc = 73, ec = 196, buyers = 73 + 196 = 269
  // impressions = 4,370,312, footfall = 2,980, target_cpm = 64
  const cost = 279700000;
  const nc = 73;
  const ec = 196;
  const impressions = 4370312;
  const footfall = 2980;
  const targetCpm = 64;
  const res = computeCPMetrics(cost, nc, ec, 0, impressions, footfall, targetCpm);
  
  assert.strictEqual(res.cpa, Math.round(279700000 / 73));
  assert.strictEqual(res.cpo, 1039777);
  assert.strictEqual(res.cpm, 64);
  assert.strictEqual(res.cpf, Math.round(279700000 / 2980));
});

test('Event Management - computeCPMetrics: Zero division resilience', () => {
  const res = computeCPMetrics(10000000, 0, 0, 0, 0, 0);
  assert.strictEqual(res.cpa, 0);
  assert.strictEqual(res.cpo, 0);
  assert.strictEqual(res.cpm, 0);
  assert.strictEqual(res.cpf, 0);
  assert(!isNaN(res.cpa));
  assert(!isNaN(res.cpo));
});

test('Event Management - Budget Sum Calculation: Sum of 6 cost breakdowns', () => {
  const breakdowns = {
    budget_media: 50000000,
    budget_production: 120000000,
    budget_sponsor: 30000000,
    budget_merch: 40000000,
    budget_operation: 30000000,
    budget_other: 9700000,
  };
  const total = Object.values(breakdowns).reduce((a, b) => a + b, 0);
  assert.strictEqual(total, 279700000);
});

test('Event Management - Merch Items recalculation: Qty * CPU = Total', () => {
  const merchItems = [
    { name: 'Canvas Bag', qty: 300, cpu: 50000 },
    { name: 'Umbrella', qty: 200, cpu: 125000 },
  ];
  const merchTotal = merchItems.reduce((acc, m) => acc + (m.qty * m.cpu), 0);
  assert.strictEqual(merchTotal, 15000000 + 25000000); // 40,000,000
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: EVENT REPORT & TARGET HIT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: EVENT REPORT & TARGET HIT SUMMARY ---');

const fmtPct = (n) => `${Math.round(n)}%`;

const computeEventHitSummary = (event) => {
  const targetCustomers = (event.target_nc || 0) + (event.target_ec || 0);
  const actualCustomers = (event.actual_nc || 0) + (event.actual_ec || 0);
  const hasCustTarget = targetCustomers > 0;
  let custPct = 0;
  let custBeat = false;
  let custStatus = 'no_target';
  let custLabel = 'No target';

  if (hasCustTarget) {
    custPct = (actualCustomers / targetCustomers) * 100;
    custBeat = actualCustomers >= targetCustomers;
    custStatus = custBeat ? 'hit' : 'under';
    custLabel = custBeat ? `${fmtPct(custPct)} — beat target` : (actualCustomers === 0 ? '0% of target' : `${fmtPct(custPct)} of target`);
  }

  const targetNc = event.target_nc || 0;
  const actualNc = event.actual_nc || 0;
  const hasNcTarget = targetNc > 0;
  let ncPct = 0;
  let ncBeat = false;
  let ncStatus = 'no_target';
  let ncLabel = 'No target';

  if (hasNcTarget) {
    ncPct = (actualNc / targetNc) * 100;
    ncBeat = actualNc >= targetNc;
    ncStatus = ncBeat ? 'hit' : 'under';
    ncLabel = ncBeat ? `${fmtPct(ncPct)} — beat target` : (actualNc === 0 ? '0% of target' : `${fmtPct(ncPct)} of target`);
  }

  const targetCpo = event.target_cpo || 0;
  const actualCpo = event.actual_cpo || 0;
  const hasCpoTarget = targetCpo > 0;
  let cpoDiffPct = 0;
  let cpoBeat = false;
  let cpoStatus = 'no_target';
  let cpoLabel = 'No target';

  if (hasCpoTarget) {
    if (actualCpo > 0) {
      cpoDiffPct = ((actualCpo - targetCpo) / targetCpo) * 100;
      cpoBeat = cpoDiffPct <= 0;
      cpoStatus = cpoBeat ? 'hit' : 'under';
      cpoLabel = cpoDiffPct === 0 ? '0.0% — hit target' : (cpoDiffPct < 0 ? `${cpoDiffPct.toFixed(1)}% under target` : `+${cpoDiffPct.toFixed(1)}% over target`);
    } else {
      cpoBeat = false;
      cpoStatus = 'under';
      cpoLabel = 'Under target';
    }
  }

  const targetCpa = event.target_cpa || 0;
  const actualCpa = event.actual_cpa || 0;
  const hasCpaTarget = targetCpa > 0;
  let cpaDiffPct = 0;
  let cpaBeat = false;
  let cpaStatus = 'no_target';
  let cpaLabel = 'No target';

  if (hasCpaTarget) {
    if (actualCpa > 0) {
      cpaDiffPct = ((actualCpa - targetCpa) / targetCpa) * 100;
      cpaBeat = cpaDiffPct <= 0;
      cpaStatus = cpaBeat ? 'hit' : 'under';
      cpaLabel = cpaDiffPct === 0 ? '0.0% — hit target' : (cpaDiffPct < 0 ? `${cpaDiffPct.toFixed(1)}% under target` : `+${cpaDiffPct.toFixed(1)}% over target`);
    } else {
      cpaBeat = false;
      cpaStatus = 'under';
      cpaLabel = 'Under target';
    }
  }

  let hitCount = 0;
  let totalTracked = 0;
  if (hasCustTarget) { totalTracked++; if (custBeat) hitCount++; }
  if (hasNcTarget) { totalTracked++; if (ncBeat) hitCount++; }
  if (hasCpoTarget) { totalTracked++; if (cpoBeat) hitCount++; }
  if (hasCpaTarget) { totalTracked++; if (cpaBeat) hitCount++; }

  return {
    targetCustomers,
    actualCustomers,
    custPct,
    custBeat,
    custStatus,
    custLabel,
    ncPct,
    ncBeat,
    ncStatus,
    ncLabel,
    cpoDiffPct,
    cpoBeat,
    cpoStatus,
    cpoLabel,
    cpaDiffPct,
    cpaBeat,
    cpaStatus,
    cpaLabel,
    hitCount,
    totalTracked,
  };
};

test('Event Report - Hit Summary: Target Hit Logic (NC higher is good, CPO lower is good)', () => {
  const mockEvent = {
    target_nc: 70,
    actual_nc: 88, // beat target!
    target_ec: 130,
    actual_ec: 129,
    target_cpo: 259000,
    actual_cpo: 238710, // beat target (cheaper)!
    target_cpa: 740000,
    actual_cpa: 588636, // beat target (cheaper)!
  };
  const summary = computeEventHitSummary(mockEvent);
  assert.strictEqual(summary.ncBeat, true);
  assert.strictEqual(summary.ncStatus, 'hit');
  assert.strictEqual(summary.cpoBeat, true);
  assert.strictEqual(summary.cpoStatus, 'hit');
  assert.strictEqual(summary.cpaBeat, true);
  assert(summary.cpoDiffPct < 0); // negative means cheaper than target
  assert(summary.cpaDiffPct < 0);
});

test('Event Report - Hit Summary: Over-budget / High CPA triggers beat=false', () => {
  const mockEvent = {
    target_nc: 75,
    actual_nc: 73, // under target
    target_ec: 195,
    actual_ec: 196,
    target_cpo: 1035926,
    actual_cpo: 1039777, // over target cost
    target_cpa: 3729333,
    actual_cpa: 3832877, // over target cost
  };
  const summary = computeEventHitSummary(mockEvent);
  assert.strictEqual(summary.ncBeat, false);
  assert.strictEqual(summary.ncStatus, 'under');
  assert.strictEqual(summary.cpoBeat, false);
  assert.strictEqual(summary.cpoStatus, 'under');
  assert.strictEqual(summary.cpaBeat, false);
  assert(summary.cpoDiffPct > 0);
  assert(summary.cpaDiffPct > 0);
});

test('Event Report - Hit Summary: Unassigned Targets (0/0) -> status "no_target" & label "No target"', () => {
  const mockEvent = {
    target_nc: 0,
    actual_nc: 0,
    target_ec: 0,
    actual_ec: 0,
    target_cpo: 0,
    actual_cpo: 0,
    target_cpa: 0,
    actual_cpa: 0,
  };
  const summary = computeEventHitSummary(mockEvent);
  assert.strictEqual(summary.custStatus, 'no_target');
  assert.strictEqual(summary.custLabel, 'No target');
  assert.strictEqual(summary.ncStatus, 'no_target');
  assert.strictEqual(summary.ncLabel, 'No target');
  assert.strictEqual(summary.cpoStatus, 'no_target');
  assert.strictEqual(summary.cpoLabel, 'No target');
  assert.strictEqual(summary.cpaStatus, 'no_target');
  assert.strictEqual(summary.cpaLabel, 'No target');
  assert.strictEqual(summary.totalTracked, 0);
});

test('Event Report - Hit Summary: Act > 0 but Target = 0 -> status "no_target" & label "No target"', () => {
  const mockEvent = {
    target_nc: 0,
    actual_nc: 50,
    target_cpo: 0,
    actual_cpo: 229000,
    target_cpa: 0,
    actual_cpa: 150000,
  };
  const summary = computeEventHitSummary(mockEvent);
  assert.strictEqual(summary.ncStatus, 'no_target');
  assert.strictEqual(summary.ncLabel, 'No target');
  assert.strictEqual(summary.cpoStatus, 'no_target');
  assert.strictEqual(summary.cpoLabel, 'No target');
});

test('Event Report - Hit Summary: Target > 0 but Act = 0 -> calculate normal as under target (0% / Under target)', () => {
  const mockEvent = {
    target_nc: 100,
    actual_nc: 0,
    target_cpo: 250000,
    actual_cpo: 0,
  };
  const summary = computeEventHitSummary(mockEvent);
  assert.strictEqual(summary.ncStatus, 'under');
  assert.strictEqual(summary.ncLabel, '0% of target');
  assert.strictEqual(summary.ncBeat, false);
  assert.strictEqual(summary.cpoStatus, 'under');
  assert.strictEqual(summary.cpoLabel, 'Under target');
  assert.strictEqual(summary.cpoBeat, false);
});

console.log('\n================================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} automated tests PASSED`);
if (defects.length > 0) {
  console.log(`Defects found: ${defects.length}`);
} else {
  console.log('All mathematical formulas verified successfully.');
}
console.log('================================================================');
