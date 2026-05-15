// Moneybird Planner IV - Pricing Module
// Pure, dependency-free pricing math. Single source of truth for
// hours x rate x BTW calculations and currency formatting.
// All functions are pure and side-effect free so they are unit-testable
// in isolation (see tests/pricing.test.js).

(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;          // node / tests
    }
    if (typeof window !== 'undefined') {
        window.pricing = api;          // browser
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var BTW_RATE = 0.21;

    // Round to 2 decimals using "round half away from zero" (banker-safe enough
    // for invoice display; Moneybird does the authoritative rounding server-side).
    function roundCurrency(amount) {
        if (typeof amount !== 'number' || !isFinite(amount)) return 0;
        var sign = amount < 0 ? -1 : 1;
        return sign * Math.round(Math.abs(amount) * 100) / 100;
    }

    function computeLineExcl(hours, rate) {
        var h = Number(hours) || 0;
        var r = Number(rate) || 0;
        return roundCurrency(h * r);
    }

    function applyVat(amount, vatRate) {
        var a = Number(amount) || 0;
        var v = (vatRate === undefined || vatRate === null) ? BTW_RATE : Number(vatRate);
        return roundCurrency(a * (1 + v));
    }

    function vatAmount(amount, vatRate) {
        var a = Number(amount) || 0;
        var v = (vatRate === undefined || vatRate === null) ? BTW_RATE : Number(vatRate);
        return roundCurrency(a * v);
    }

    // { hours, rate } -> { hours, excl, vat, incl }
    function computeJobTotals(job, vatRate) {
        var hours = Number(job && job.hours) || 0;
        var rate  = Number(job && job.rate)  || 0;
        var excl  = computeLineExcl(hours, rate);
        return {
            hours: hours,
            excl: excl,
            vat: vatAmount(excl, vatRate),
            incl: applyVat(excl, vatRate)
        };
    }

    // [{hours, rate}, ...] -> { hours, excl, vat, incl }
    function computeOverviewTotals(jobs, vatRate) {
        var totals = { hours: 0, excl: 0, vat: 0, incl: 0 };
        (jobs || []).forEach(function (j) {
            var t = computeJobTotals(j, vatRate);
            totals.hours += t.hours;
            totals.excl  += t.excl;
            totals.vat   += t.vat;
            totals.incl  += t.incl;
        });
        totals.hours = Math.round(totals.hours * 100) / 100;
        totals.excl  = roundCurrency(totals.excl);
        totals.vat   = roundCurrency(totals.vat);
        totals.incl  = roundCurrency(totals.incl);
        return totals;
    }

    function computeShare(jobIncl, totalIncl) {
        var ji = Number(jobIncl) || 0;
        var ti = Number(totalIncl) || 0;
        if (ti <= 0) return 0;
        return Math.round((ji / ti) * 1000) / 10; // one decimal
    }

    // Dutch notation: "EUR 1.234,56" (no thousands separator below 1000).
    function formatEur(amount) {
        var n = roundCurrency(Number(amount) || 0);
        var sign = n < 0 ? '-' : '';
        var abs = Math.abs(n).toFixed(2);
        var parts = abs.split('.');
        var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return '\u20AC ' + sign + intPart + ',' + parts[1];
    }

    return {
        BTW_RATE: BTW_RATE,
        roundCurrency: roundCurrency,
        computeLineExcl: computeLineExcl,
        applyVat: applyVat,
        vatAmount: vatAmount,
        computeJobTotals: computeJobTotals,
        computeOverviewTotals: computeOverviewTotals,
        computeShare: computeShare,
        formatEur: formatEur
    };
}));
