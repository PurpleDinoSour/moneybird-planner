// Moneybird Planner IV - Customer Overview Module
// Version: 1.0.0
// Financial overview: hours, revenue (excl/incl BTW) per job, with bar charts

var BTW_RATE = 0.21;

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
    var totalHours = 0;
    var totalExcl = 0;
    var totalIncl = 0;

    appState.jobs.forEach(function(job) {
        var hours = getJobMonthHours(job, year, month);
        var rate = job.hourlyRate || 0;
        var excl = hours * rate;
        var incl = excl * (1 + BTW_RATE);

        results.push({
            id: job.id,
            name: job.name,
            color: job.color,
            hours: hours,
            rate: rate,
            excl: excl,
            incl: incl
        });

        totalHours += hours;
        totalExcl += excl;
        totalIncl += incl;
    });

    return {
        jobs: results,
        totals: { hours: totalHours, excl: totalExcl, incl: totalIncl }
    };
}

// Format currency (Dutch notation)
function formatEur(amount) {
    return '\u20AC ' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/\.(\d{2})$/, ',$1');
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

    if (data.jobs.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--muted); padding:24px 0;">No jobs configured. Add jobs to see financial overview.</p>';
        return;
    }

    var maxHours = Math.max.apply(null, data.jobs.map(function(j) { return j.hours; })) || 1;
    var maxExcl = Math.max.apply(null, data.jobs.map(function(j) { return j.excl; })) || 1;

    var html = '';

    // Per-job cards
    html += '<div class="overview-grid">';
    data.jobs.forEach(function(job) {
        var hoursPercent = Math.round((job.hours / maxHours) * 100);
        var revenuePercent = job.excl > 0 ? Math.round((job.excl / maxExcl) * 100) : 0;

        html += '<div class="overview-card">';
        html += '<div class="overview-card-header">';
        html += '<span class="overview-dot" style="background:' + job.color + ';"></span>';
        html += '<span class="overview-name">' + escapeHtml(job.name) + '</span>';
        html += '<span class="overview-rate">' + (job.rate > 0 ? '\u20AC' + job.rate.toFixed(2).replace('.', ',') + '/h' : 'No rate set') + '</span>';
        html += '</div>';

        // Hours bar
        html += '<div class="overview-metric">';
        html += '<div class="overview-metric-label"><span>Hours</span><span class="overview-metric-value">' + job.hours.toFixed(1) + 'h</span></div>';
        html += '<div class="overview-bar-track"><div class="overview-bar" style="width:' + hoursPercent + '%; background:' + job.color + ';"></div></div>';
        html += '</div>';

        // Revenue bar
        html += '<div class="overview-metric">';
        html += '<div class="overview-metric-label"><span>Excl. BTW</span><span class="overview-metric-value">' + formatEur(job.excl) + '</span></div>';
        html += '<div class="overview-bar-track"><div class="overview-bar" style="width:' + revenuePercent + '%; background:' + job.color + '; opacity:0.7;"></div></div>';
        html += '</div>';

        // Incl BTW
        html += '<div class="overview-metric">';
        html += '<div class="overview-metric-label"><span>Incl. BTW (21%)</span><span class="overview-metric-value">' + formatEur(job.incl) + '</span></div>';
        html += '</div>';

        html += '</div>';
    });
    html += '</div>';

    // Totals summary
    html += '<div class="overview-totals">';
    html += '<div class="overview-total-item">';
    html += '<span class="overview-total-label">Total Hours</span>';
    html += '<span class="overview-total-value">' + data.totals.hours.toFixed(1) + 'h</span>';
    html += '</div>';
    html += '<div class="overview-total-item">';
    html += '<span class="overview-total-label">Total Excl. BTW</span>';
    html += '<span class="overview-total-value">' + formatEur(data.totals.excl) + '</span>';
    html += '</div>';
    html += '<div class="overview-total-item highlight">';
    html += '<span class="overview-total-label">Total Incl. BTW (21%)</span>';
    html += '<span class="overview-total-value">' + formatEur(data.totals.incl) + '</span>';
    html += '</div>';
    html += '</div>';

    container.innerHTML = html;
}

// Toggle overview visibility
function toggleCustomerOverview() {
    var panel = document.getElementById('customerOverviewPanel');
    if (!panel) return;
    var isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) renderCustomerOverview();
}
