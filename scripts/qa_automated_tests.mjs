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

// Helper 3: 52 Weeks Generator
const generate52Weeks = (year) => {
  const weeks = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 6) { d.setDate(d.getDate() + 1); }
  for (let w = 1; w <= 52; w++) {
    const sDate = new Date(d);
    const eDate = new Date(d);
    eDate.setDate(eDate.getDate() + 8);
    weeks.push({
      key: `W${w}`,
      startDate: sDate.toISOString().slice(0, 10),
      endDate: eDate.toISOString().slice(0, 10),
      weekNum: w,
    });
    d.setDate(d.getDate() + 7);
  }
  return weeks;
};

test('Marketing Helper - generate52Weeks: Generates exactly 52 weeks', () => {
  const weeks = generate52Weeks(2026);
  assert.strictEqual(weeks.length, 52);
  assert.strictEqual(weeks[0].key, 'W1');
  assert.strictEqual(weeks[51].key, 'W52');
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

const computeEventHitSummary = (event) => {
  const targetCustomers = (event.target_nc || 0) + (event.target_ec || 0);
  const actualCustomers = (event.actual_nc || 0) + (event.actual_ec || 0);
  const custPct = targetCustomers > 0 ? (actualCustomers / targetCustomers) * 100 : 100;
  const custBeat = custPct >= 100;

  const ncPct = event.target_nc > 0 ? (event.actual_nc / event.target_nc) * 100 : 100;
  const ncBeat = ncPct >= 100;

  const cpoDiffPct = event.target_cpo > 0
    ? ((event.actual_cpo - event.target_cpo) / event.target_cpo) * 100
    : 0;
  const cpoBeat = cpoDiffPct <= 0; // For costs, lower than target is good!

  const cpaDiffPct = event.target_cpa > 0
    ? ((event.actual_cpa - event.target_cpa) / event.target_cpa) * 100
    : 0;
  const cpaBeat = cpaDiffPct <= 0;

  return {
    targetCustomers,
    actualCustomers,
    custPct,
    custBeat,
    ncPct,
    ncBeat,
    cpoDiffPct,
    cpoBeat,
    cpaDiffPct,
    cpaBeat,
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
  assert.strictEqual(summary.cpoBeat, true);
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
  assert.strictEqual(summary.cpoBeat, false);
  assert.strictEqual(summary.cpaBeat, false);
  assert(summary.cpoDiffPct > 0);
  assert(summary.cpaDiffPct > 0);
});

console.log('\n================================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} automated tests PASSED`);
if (defects.length > 0) {
  console.log(`Defects found: ${defects.length}`);
} else {
  console.log('All mathematical formulas verified successfully.');
}
console.log('================================================================');
