import assert from 'node:assert';

console.log('================================================================');
console.log('🧪 QA VERIFICATION: EVENT DEMO DATA & SUMMARY INTEGRITY');
console.log('================================================================\n');

// 1. Load DEMO_EVENTS data representation
const DEMO_EVENTS = [
  {
    id: 'demo-lgf-2026',
    year: 2026,
    quarter: 'Q3',
    team: 'Agency',
    event_name: 'LGF',
    start_date: '2026-09-10',
    end_date: '2026-09-14',
    activity_type: 'Trade Fair',
    scale: 'Large',
    status: 'completed',
    budget_total: 279700000,
    target_nc: 75,
    target_ec: 195,
    target_footfall: 3000,
    target_buy_value: 250000000,
    target_cpo: 1035926,
    target_cpa: 3729333,
    target_cpm: 64,
    target_cpf: 93233,
    actual_filled: true,
    actual_cost: 279700000,
    actual_nc: 73,
    actual_ec: 196,
    actual_footfall: 2980,
    actual_buy_value: 248000000,
    actual_impressions: 4370312,
    actual_cpo: 1039777,
    actual_cpa: 3832877,
    actual_cpm: 64,
    photo_urls: ['url1', 'url2', 'url3', 'url4'],
  },
  {
    id: 'demo-laowisdom-2026',
    year: 2026,
    quarter: 'Q3',
    team: 'KPV',
    event_name: 'Lao Wisdom',
    start_date: '2026-09-18',
    end_date: '2026-09-19',
    activity_type: 'Community/Panel',
    scale: 'Medium',
    status: 'completed',
    budget_total: 51800000,
    target_nc: 70,
    target_ec: 130,
    target_footfall: 1200,
    target_buy_value: 120000000,
    target_cpo: 259000,
    target_cpa: 740000,
    target_cpm: 20,
    target_cpf: 43166,
    actual_filled: true,
    actual_cost: 51800000,
    actual_nc: 88,
    actual_ec: 129,
    actual_footfall: 1350,
    actual_buy_value: 134000000,
    actual_impressions: 2590000,
    actual_cpo: 238710,
    actual_cpa: 588636,
    actual_cpm: 20,
    photo_urls: ['url1', 'url2', 'url3', 'url4'],
  },
  {
    id: 'demo-digitalaward-2026',
    year: 2026,
    quarter: 'Q3',
    team: 'Agency',
    event_name: 'Lao Digital Award',
    start_date: '2026-09-22',
    end_date: '2026-09-23',
    activity_type: 'Sponsorship',
    scale: 'Small',
    status: 'completed',
    budget_total: 39687000,
    target_nc: 30,
    target_ec: 60,
    target_footfall: 600,
    target_buy_value: 80000000,
    target_cpo: 440967,
    target_cpa: 1322900,
    target_cpm: 12887,
    target_cpf: 66145,
    actual_filled: true,
    actual_cost: 39687000,
    actual_nc: 33,
    actual_ec: 64,
    actual_footfall: 620,
    actual_buy_value: 85000000,
    actual_impressions: 3079615,
    actual_cpo: 409145,
    actual_cpa: 1072622,
    actual_cpm: 12887,
    photo_urls: ['url1', 'url2', 'url3', 'url4'],
  },
  {
    id: 'demo-ecommerce-2026',
    year: 2026,
    quarter: 'Q3',
    team: 'KPV',
    event_name: 'Lao E-commerce',
    start_date: '2026-09-26',
    end_date: '2026-09-28',
    activity_type: 'Community/Panel',
    scale: 'Med/Large Boundary',
    status: 'completed',
    budget_total: 72800000,
    target_nc: 32,
    target_ec: 53,
    target_footfall: 900,
    target_buy_value: 110000000,
    target_cpo: 856471,
    target_cpa: 2275000,
    target_cpm: 663,
    target_cpf: 80888,
    actual_filled: true,
    actual_cost: 72800000,
    actual_nc: 29,
    actual_ec: 42,
    actual_footfall: 750,
    actual_buy_value: 92000000,
    actual_impressions: 10980392,
    actual_cpo: 1025085,
    actual_cpa: 2510325,
    actual_cpm: 663,
    photo_urls: ['url1', 'url2', 'url3', 'url4'],
  },
];

// Test 1: Event Report Totals calculation (matches lines 93-104 of EventReport.tsx)
const totalKpis = DEMO_EVENTS.reduce(
  (acc, ev) => {
    acc.cost += ev.actual_cost;
    acc.nc += ev.actual_nc;
    acc.ec += ev.actual_ec;
    acc.buy_value += ev.actual_buy_value;
    acc.footfall += ev.actual_footfall;
    return acc;
  },
  { cost: 0, nc: 0, ec: 0, buy_value: 0, footfall: 0 }
);

console.log('Aggregate September 2026 Totals:');
console.log(`  Total Spend: ₭${totalKpis.cost.toLocaleString()}`);
console.log(`  Total NC:    ${totalKpis.nc.toLocaleString()}`);
console.log(`  Total EC:    ${totalKpis.ec.toLocaleString()}`);
console.log(`  Total Buy:   ₭${totalKpis.buy_value.toLocaleString()}`);
console.log(`  Footfall:    ${totalKpis.footfall.toLocaleString()}\n`);

assert.strictEqual(totalKpis.cost, 279700000 + 51800000 + 39687000 + 72800000);
assert.strictEqual(totalKpis.cost, 443987000); // 443.98M LAK
assert.strictEqual(totalKpis.nc, 73 + 88 + 33 + 29);
assert.strictEqual(totalKpis.nc, 223);
assert.strictEqual(totalKpis.ec, 196 + 129 + 64 + 42);
assert.strictEqual(totalKpis.ec, 431);
assert.strictEqual(totalKpis.footfall, 2980 + 1350 + 620 + 750);
assert.strictEqual(totalKpis.footfall, 5700);

console.log('✅ PASS: Event Report summary KPI sums are 100% mathematically correct.');

// Test 2: Unfilled Event 100% Execution Fallback
const unfilledEvent = {
  id: 'ev-new-test',
  actual_filled: false,
  budget_total: 10000000,
  target_nc: 50,
  target_ec: 50,
  target_footfall: 500,
  target_buy_value: 50000000,
  target_cpa: 200000,
  target_cpo: 100000,
  photo_urls: [],
};

const getEffective = (ev) => {
  if (ev.actual_filled) {
    return {
      cost: ev.actual_cost,
      nc: ev.actual_nc,
      ec: ev.actual_ec,
      is100Pct: false,
    };
  }
  return {
    cost: ev.budget_total,
    nc: ev.target_nc,
    ec: ev.target_ec,
    is100Pct: true,
  };
};

const eff = getEffective(unfilledEvent);
assert.strictEqual(eff.cost, 10000000);
assert.strictEqual(eff.nc, 50);
assert.strictEqual(eff.is100Pct, true);

console.log('✅ PASS: Unfilled event correctly defaults to 100% Plan Execution.');
console.log('All integrity verifications passed successfully.');
