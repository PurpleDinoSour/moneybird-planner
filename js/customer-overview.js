// Moneybird Planner IV - Customer Overview Module
// Version: 1.1.0
// Financial overview: hours, revenue (excl/incl BTW) per job, with bar charts.
// All money math delegated to window.pricing (see js/pricing.js).

var BTW_RATE = (window.pricing && window.pricing.BTW_RATE) || 0.21;

// Calculate total working hours for a job in a given month
function getJobMonthHours(job, year, month) {
    var totalHours = 0;
    var daysInMonth = new Date(year, month, 0).getDate();

    for (var day = 1; day <= daysInMonth; day++) {
        var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        if (isJobActiveOnDate(job, dateStr)) {
            var sched = getScheduleForJobDate(job, dateStr);
            totalHours += calculateJobHours(sched);
        }
    }
    return totalHours;
}

// Build overview data for all jobs for a given month
function buildOverviewData(year, month) {
    var results = [];

    appState.jobs.forEach(function(job) {
        var hours = getJobMonthHours(job, year, month);
        var rate = job.hourlyRate || 0;
        var t = window.pricing.computeJobTotals({ hours: hours, rate: rate });

        results.push({
            id: job.id,
            name: job.name,
            color: job.color,
            hours: hours,
            rate: rate,
            excl: t.excl,
            incl: t.incl,
            vat:  t.vat
        });
    });

    var totals = window.pricing.computeOverviewTotals(
        results.map(function (r) { return { hours: r.hours, rate: r.rate }; })
    );

    return {
        jobs: results,
        totals: { hours: totals.hours, excl: totals.excl, incl: totals.incl, vat: totals.vat }
    };
}

// Format currency (Dutch notation) - delegated to pricing module
function formatEur(amount) {
    return window.pricing.formatEur(amount);
}

// Render the customer overview panel
function renderCustomerOverview() {
    var container = document.getElementById('customerOverviewBody');
    if (!container) return;

    var picker = document.getElementById('monthPicker').value;
    if (!picker) return;

    var parts = picker.split('-').map(Number);
    var year = parts[0];
    var month = parts[1];
    var data = buildOverviewData(year, month);

    // Month label
    var monthLabel = MONTH_NAMES[month - 1] + ' ' + year;
    var titleEl = document.getElementById('overviewMonthLabel');
    if (titleEl) titleEl.textContent = monthLabel;

    var summaryHoursEl = document.getElementById('overviewSummaryHours');
    if (summaryHoursEl) summaryHoursEl.textContent = data.totals.hours.toFixed(1) + 'h';

    var summaryRevenueEl = document.getElementById('overviewSummaryRevenue');
    if (summaryRevenueEl) summaryRevenueEl.textContent = formatEur(data.totals.incl);

    if (data.jobs.length === 0) {
        container.innerHTML = '<p class="overview-empty">No jobs configured. Add jobs to see financial overview.</p>';
        return;
    }

    var sortedJobs = data.jobs.slice().sort(function(a, b) {
        return b.incl - a.incl;
    });

    var html = '';

    html += '<div class="overview-kpis">';
    html += '<div class="overview-kpi"><span class="overview-kpi-label">Total Hours</span><span class="overview-kpi-value">' + data.totals.hours.toFixed(1) + 'h</span></div>';
    html += '<div class="overview-kpi"><span class="overview-kpi-label">Excl. BTW</span><span class="overview-kpi-value">' + formatEur(data.totals.excl) + '</span></div>';
    html += '<div class="overview-kpi overview-kpi-highlight"><span class="overview-kpi-label">Incl. BTW</span><span class="overview-kpi-value">' + formatEur(data.totals.incl) + '</span></div>';
    html += '<div class="overview-kpi"><span class="overview-kpi-label">Active Jobs</span><span class="overview-kpi-value">' + sortedJobs.length + '</span></div>';
    html += '</div>';

    html += '<div class="overview-table-wrap">';
    html += '<table class="overview-table">';
    html += '<thead><tr>';
    html += '<th>Customer</th>';
    html += '<th>Hours</th>';
    html += '<th>Rate</th>';
    html += '<th>Excl. BTW</th>';
    html += '<th>Incl. BTW</th>';
    html += '<th>Share</th>';
    html += '</tr></thead><tbody>';

    sortedJobs.forEach(function(job) {
        var share = window.pricing.computeShare(job.incl, data.totals.incl);
        var dotColor = getExecutiveCustomerColor(job.color, 'dot');
        var shareBarColor = getExecutiveCustomerColor(job.color, 'bar');
        html += '<tr>';
        html += '<td>';
        html += '<div class="overview-customer">';
        html += '<span class="overview-dot" style="background:' + dotColor + ';"></span>';
        html += '<span class="overview-name">' + escapeHtml(job.name) + '</span>';
        html += '</div>';
        html += '</td>';
        html += '<td class="overview-num">' + job.hours.toFixed(1) + 'h</td>';
        html += '<td class="overview-num">' + (job.rate > 0 ? '\u20AC ' + job.rate.toFixed(2).replace('.', ',') : '-') + '</td>';
        html += '<td class="overview-num">' + formatEur(job.excl) + '</td>';
        html += '<td class="overview-num">' + formatEur(job.incl) + '</td>';
        html += '<td>';
        html += '<div class="overview-share">';
        html += '<div class="overview-share-track"><div class="overview-share-bar" style="width:' + share.toFixed(1) + '%; background:' + shareBarColor + ';"></div></div>';
        html += '<span class="overview-share-value">' + share.toFixed(1) + '%</span>';
        html += '</div>';
        html += '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';

    container.innerHTML = html;
}

function isOverviewExpanded() {
    var details = document.getElementById('customerOverviewDetails');
    return !!(details && details.open);
}

// Toggle overview visibility
function toggleCustomerOverview() {
    var details = document.getElementById('customerOverviewDetails');
    if (!details) return;
    details.open = !details.open;
    if (details.open) renderCustomerOverview();
}
