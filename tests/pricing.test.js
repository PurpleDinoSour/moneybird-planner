'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const pricing = require('../js/pricing.js');

test('roundCurrency: rounds to 2 decimals', () => {
    // Note: tests use values whose binary float representation does not
    // sit exactly on a tie (.x05) - the underlying Math.round inherits
    // IEEE 754 quirks. For invoice display this is fine because Moneybird
    // performs the authoritative rounding on its side.
    assert.strictEqual(pricing.roundCurrency(1.234), 1.23);
    assert.strictEqual(pricing.roundCurrency(1.236), 1.24);
    assert.strictEqual(pricing.roundCurrency(0),     0);
    assert.strictEqual(pricing.roundCurrency(-1.234), -1.23);
    assert.strictEqual(pricing.roundCurrency(-1.236), -1.24);
});

test('roundCurrency: handles non-numeric input', () => {
    assert.strictEqual(pricing.roundCurrency(NaN), 0);
    assert.strictEqual(pricing.roundCurrency(Infinity), 0);
    assert.strictEqual(pricing.roundCurrency(undefined), 0);
    assert.strictEqual(pricing.roundCurrency(null), 0);
});

test('computeLineExcl: hours x rate', () => {
    assert.strictEqual(pricing.computeLineExcl(8,    125),    1000);
    assert.strictEqual(pricing.computeLineExcl(7.5,  125),    937.5);
    assert.strictEqual(pricing.computeLineExcl(0,    125),    0);
    assert.strictEqual(pricing.computeLineExcl(8,    0),      0);
    assert.strictEqual(pricing.computeLineExcl('8',  '125'),  1000); // coerce
});

test('applyVat: adds 21% by default', () => {
    assert.strictEqual(pricing.applyVat(100),       121);
    assert.strictEqual(pricing.applyVat(1000),      1210);
    assert.strictEqual(pricing.applyVat(937.5),     1134.38);
});

test('applyVat: custom vat rate', () => {
    assert.strictEqual(pricing.applyVat(100, 0.09), 109);
    assert.strictEqual(pricing.applyVat(100, 0),    100);
});

test('vatAmount: returns just the VAT portion', () => {
    assert.strictEqual(pricing.vatAmount(100),      21);
    assert.strictEqual(pricing.vatAmount(937.5),    196.88);
    assert.strictEqual(pricing.vatAmount(100, 0.09), 9);
});

test('computeJobTotals: returns full breakdown', () => {
    const t = pricing.computeJobTotals({ hours: 8, rate: 125 });
    assert.deepStrictEqual(t, { hours: 8, excl: 1000, vat: 210, incl: 1210 });
});

test('computeJobTotals: zero/missing fields', () => {
    assert.deepStrictEqual(pricing.computeJobTotals({}),                 { hours: 0, excl: 0, vat: 0, incl: 0 });
    assert.deepStrictEqual(pricing.computeJobTotals(null),               { hours: 0, excl: 0, vat: 0, incl: 0 });
    assert.deepStrictEqual(pricing.computeJobTotals({ hours: 8 }),       { hours: 8, excl: 0, vat: 0, incl: 0 });
    assert.deepStrictEqual(pricing.computeJobTotals({ rate: 100 }),      { hours: 0, excl: 0, vat: 0, incl: 0 });
});

test('computeOverviewTotals: aggregates correctly', () => {
    const t = pricing.computeOverviewTotals([
        { hours: 8,   rate: 125 },   // 1000 / 210 / 1210
        { hours: 4,   rate: 95 },    // 380  / 79.8 / 459.8
        { hours: 0,   rate: 200 }    // 0
    ]);
    assert.strictEqual(t.hours, 12);
    assert.strictEqual(t.excl,  1380);
    assert.strictEqual(t.vat,   289.8);
    assert.strictEqual(t.incl,  1669.8);
});

test('computeOverviewTotals: empty list', () => {
    assert.deepStrictEqual(pricing.computeOverviewTotals([]),
        { hours: 0, excl: 0, vat: 0, incl: 0 });
    assert.deepStrictEqual(pricing.computeOverviewTotals(null),
        { hours: 0, excl: 0, vat: 0, incl: 0 });
});

test('computeShare: percentage with one decimal', () => {
    assert.strictEqual(pricing.computeShare(500,  1000), 50);
    assert.strictEqual(pricing.computeShare(333,  1000), 33.3);
    assert.strictEqual(pricing.computeShare(1000, 1000), 100);
    assert.strictEqual(pricing.computeShare(0,    1000), 0);
    assert.strictEqual(pricing.computeShare(500,     0), 0); // div-by-zero
});

test('formatEur: Dutch notation', () => {
    assert.strictEqual(pricing.formatEur(0),         '\u20AC 0,00');
    assert.strictEqual(pricing.formatEur(1.5),       '\u20AC 1,50');
    assert.strictEqual(pricing.formatEur(123.45),    '\u20AC 123,45');
    assert.strictEqual(pricing.formatEur(1234.56),   '\u20AC 1.234,56');
    assert.strictEqual(pricing.formatEur(1234567.8), '\u20AC 1.234.567,80');
    assert.strictEqual(pricing.formatEur(-99.5),     '\u20AC -99,50');
});

test('integration: a real month total adds up to a sensible incl-VAT figure', () => {
    // 18 days of mixed work
    const jobs = [
        { hours: 96,  rate: 125 },  // DNB    12000  / 2520 / 14520
        { hours: 64,  rate: 110 },  // RIVM    7040  / 1478.4 / 8518.4
        { hours: 16,  rate: 95 }    // SecuraSigna 1520 / 319.2 / 1839.2
    ];
    const t = pricing.computeOverviewTotals(jobs);
    assert.strictEqual(t.hours, 176);
    assert.strictEqual(t.excl, 20560);
    assert.strictEqual(t.vat,  4317.6);
    assert.strictEqual(t.incl, 24877.6);

    // Shares should sum to ~100
    const s1 = pricing.computeShare(14520,  t.incl);
    const s2 = pricing.computeShare(8518.4, t.incl);
    const s3 = pricing.computeShare(1839.2, t.incl);
    const total = s1 + s2 + s3;
    assert.ok(Math.abs(total - 100) < 0.5, 'shares sum near 100, got ' + total);
});
