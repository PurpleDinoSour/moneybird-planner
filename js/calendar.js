// Moneybird Planner IV - Calendar Module
// Version: 1.0.0

// --- ISO WEEK NUMBER ---
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// --- GIT HOURS BY DATE ---
function getGitHoursByDate() {
    const hoursByDate = {};

    // Process commits
    if (appState.gitCommitsData) {
        appState.gitCommitsData.forEach(commit => {
            const dateStr = commit.fullDate; // YYYY-MM-DD format
            if (!hoursByDate[dateStr]) {
                hoursByDate[dateStr] = { commits: 0, prs: 0, commitHours: 0, prHours: 0, totalHours: 0 };
            }
            hoursByDate[dateStr].commits++;
            hoursByDate[dateStr].commitHours += commit.hours || 1;
            hoursByDate[dateStr].totalHours += commit.hours || 1;
        });
    }

    // Process PRs
    if (appState.gitPRsData) {
        appState.gitPRsData.forEach(pr => {
            const dateStr = pr.fullDate; // YYYY-MM-DD format
            if (!hoursByDate[dateStr]) {
                hoursByDate[dateStr] = { commits: 0, prs: 0, commitHours: 0, prHours: 0, totalHours: 0 };
            }
            hoursByDate[dateStr].prs++;
            hoursByDate[dateStr].prHours += pr.hours || 1;
            hoursByDate[dateStr].totalHours += pr.hours || 1;
        });
    }

    return hoursByDate;
}

// --- CALENDAR FUNCTIONS ---
function renderCalendar(forceRecompute) {
    const picker = document.getElementById('monthPicker').value;
    if (!picker) return;

    const [year, month] = picker.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const grid = document.getElementById('calendarGrid');

    // Update month title
    document.getElementById('calendarMonthTitle').textContent = `${MONTH_NAMES[month - 1]} ${year}`;

    // Calculate git hours per date
    const gitHoursByDate = getGitHoursByDate();

    // Compute default days from job schedules
    const defaultDays = getDefaultDaysFromJobs();

    // Check if month changed - only reset selections if it did
    const currentMonthKey = `${year}-${month}`;
    const isMonthChange = appState.lastCalendarMonth !== currentMonthKey;
    appState.lastCalendarMonth = currentMonthKey;

    // Persist current month in URL for deep-linking.
    if (window.urlState) {
        window.urlState.write({ month: document.getElementById('monthPicker').value });
    }

    // Try to restore previously saved selection for this (type, month) pair
    // when the user navigates to a fresh month.
    let restoredSelection = null;
    if (isMonthChange && window.selectionState) {
        const saved = window.selectionState.load(appState.currentHourType, document.getElementById('monthPicker').value);
        if (saved && saved.length) restoredSelection = new Set(saved);
    }

    const existingSelections = (isMonthChange || forceRecompute)
        ? (restoredSelection || null)
        : new Set(appState.selectedDates);

    grid.innerHTML = '';
    if (isMonthChange || forceRecompute) appState.selectedDates.clear();

    // Week number for the first row
    const firstWeekNum = getISOWeekNumber(new Date(year, month - 1, 1));
    const wk0 = document.createElement('div');
    wk0.className = 'week-number';
    wk0.textContent = firstWeekNum;
    grid.appendChild(wk0);

    // Add empty cells for alignment
    for (let i = 0; i < firstDayOfWeek; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-card';
        empty.style.visibility = 'hidden';
        grid.appendChild(empty);
    }

    // Track per-week hours for the total column
    var weekJobHours = {};
    appState.jobs.forEach(function(job) { weekJobHours[job.id] = 0; });

    // Helper to build and append the week total cell
    function appendWeekTotal() {
        var totalCell = document.createElement('div');
        totalCell.className = 'week-total';
        if (appState.currentHourType !== 'wbso' && appState.jobs.length > 0) {
            var grandTotal = 0;
            appState.jobs.forEach(function(job) { grandTotal += weekJobHours[job.id]; });
            var html = '<span class="wt-grand">' + grandTotal + 'h</span>';
            if (appState.jobs.length > 1) {
                appState.jobs.forEach(function(job) {
                    if (weekJobHours[job.id] > 0) {
                        var weekChipColor = getExecutiveCustomerColor(job.color, 'chip');
                        html += '<span class="wt-job" style="background:' + weekChipColor + ';">' + escapeHtml(job.name) + ' ' + weekJobHours[job.id] + '</span>';
                    }
                });
            }
            totalCell.innerHTML = html;
        }
        grid.appendChild(totalCell);
        // Reset counters
        appState.jobs.forEach(function(job) { weekJobHours[job.id] = 0; });
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(Date.UTC(year, month - 1, d));
        const dateStr = dateObj.toISOString().split('T')[0];
        const dayOfWeek = new Date(year, month - 1, d).getDay();

        const isHoliday = HOLIDAYS_NL_2026.hasOwnProperty(dateStr);
        const holidayName = isHoliday ? HOLIDAYS_NL_2026[dateStr] : '';

        // Use existing selections if available, otherwise use effective schedule (overrides + template)
        let isActive;
        if (existingSelections) {
            isActive = existingSelections.has(dateStr);
        } else if (appState.currentHourType === 'facturable' && appState.jobs.length > 0) {
            isActive = getJobsForDate(dateStr).length > 0;
        } else {
            isActive = defaultDays.includes(dayOfWeek);
        }

        if (isActive) appState.selectedDates.add(dateStr);

        // Accumulate hours for week total column
        if (appState.currentHourType !== 'wbso') {
            var jobsOnDayForTotal = getJobsForDate(dateStr);
            jobsOnDayForTotal.forEach(function(job) {
                var sched = getScheduleForJobDate(job, dateStr);
                weekJobHours[job.id] += calculateJobHours(sched);
            });
        }

        const card = document.createElement('div');
        const jobsOnDay = getJobsForDate(dateStr);
        card.className = `day-card ${isActive ? 'active' : ''} ${isHoliday ? 'holiday' : ''}`;
        card.dataset.date = dateStr;
        card.dataset.isHoliday = isHoliday;
        card.onclick = () => toggleCard(card, dateStr);

        // Build card content
        let cardHTML = `<span class="day-number">${d}</span><span class="day-name">${DAY_NAMES[dayOfWeek]}</span>`;

        // Job color bars + holiday bar at bottom (show hours per customer)
        var hasBars = (jobsOnDay.length > 0 && appState.currentHourType !== 'wbso') || isHoliday;
        if (hasBars) {
            cardHTML += '<div class="job-bars">';
            if (jobsOnDay.length > 0 && appState.currentHourType !== 'wbso') {
                jobsOnDay.forEach(function(job) {
                    var sched = getScheduleForJobDate(job, dateStr);
                    var hrs = calculateJobHours(sched);
                    var label = escapeHtml(job.name) + ' ' + hrs;
                    var barColor = getExecutiveCustomerColor(job.color, 'bar');
                    cardHTML += '<div class="job-bar" style="background:' + barColor + ';" title="' + escapeHtml(job.name) + ' ' + hrs + 'h">' + label + '</div>';
                });
            }
            if (isHoliday) {
                cardHTML += '<div class="job-bar job-bar-holiday" title="' + escapeHtml(holidayName) + '">' + escapeHtml(holidayName) + '</div>';
            }
            cardHTML += '</div>';
        }

        const dayData = gitHoursByDate[dateStr];
        if (dayData && dayData.totalHours > 0) {
            cardHTML += `<span class="day-hours">${dayData.totalHours.toFixed(1)}h</span>`;
            // Build tooltip
            let tooltip = `${dateStr}\n`;
            if (dayData.commits > 0) tooltip += `${dayData.commits} commit${dayData.commits > 1 ? 's' : ''}: ${dayData.commitHours.toFixed(1)}h\n`;
            if (dayData.prs > 0) tooltip += `${dayData.prs} PR${dayData.prs > 1 ? 's' : ''}: ${dayData.prHours.toFixed(1)}h\n`;
            tooltip += `Total: ${dayData.totalHours.toFixed(1)}h`;
            card.title = tooltip;
        }

        card.innerHTML = cardHTML;
        grid.appendChild(card);

        // End of week row: append total, then week number for next row
        if (dayOfWeek === 6) {
            appendWeekTotal();
            if (d < daysInMonth) {
                const nextDate = new Date(year, month - 1, d + 1);
                const wkNum = getISOWeekNumber(nextDate);
                const wkCell = document.createElement('div');
                wkCell.className = 'week-number';
                wkCell.textContent = wkNum;
                grid.appendChild(wkCell);
            }
        }
    }

    // If the month doesn't end on Saturday, pad remaining cells + add final total
    const lastDayOfWeek = new Date(year, month - 1, daysInMonth).getDay();
    if (lastDayOfWeek !== 6) {
        for (let i = lastDayOfWeek + 1; i <= 6; i++) {
            const empty = document.createElement('div');
            empty.className = 'day-card';
            empty.style.visibility = 'hidden';
            grid.appendChild(empty);
        }
        appendWeekTotal();
    }

    updateCounter();
    renderMonthSummary(year, month);
    // Reapply keyboard focus ring after re-render.
    if (window.keyboardNav) window.keyboardNav.reapplyFocus();
    // Persist restored selection so the next reload still has it.
    if (window.selectionState && isMonthChange) window.selectionState.persistCurrent();
    // Keep overview summary synchronized with month and schedules.
    if (document.getElementById('customerOverviewPanel')) {
        renderCustomerOverview();
    }
}

function renderMonthSummary(year, month) {
    var container = document.getElementById('monthSummary');
    if (!container) return;
    if (appState.currentHourType === 'wbso' || appState.jobs.length === 0) {
        container.innerHTML = '';
        return;
    }

    var daysInMonth = new Date(year, month, 0).getDate();

    // Build week data: { weekNum: { jobId: hours } }
    var weekData = {};
    var monthTotals = {};
    var weekOrder = [];

    appState.jobs.forEach(function(job) {
        monthTotals[job.id] = 0;
    });

    for (var d = 1; d <= daysInMonth; d++) {
        var dateObj = new Date(year, month - 1, d);
        var dateStr = new Date(Date.UTC(year, month - 1, d)).toISOString().split('T')[0];
        var wk = getISOWeekNumber(dateObj);

        if (!weekData[wk]) {
            weekData[wk] = {};
            weekOrder.push(wk);
            appState.jobs.forEach(function(job) { weekData[wk][job.id] = 0; });
        }

        appState.jobs.forEach(function(job) {
            if (isJobActiveOnDate(job, dateStr)) {
                var sched = getScheduleForJobDate(job, dateStr);
                var hrs = calculateJobHours(sched);
                weekData[wk][job.id] += hrs;
                monthTotals[job.id] += hrs;
            }
        });
    }

    // Grand total
    var grandTotal = 0;
    appState.jobs.forEach(function(job) { grandTotal += monthTotals[job.id]; });

    // Render table
    var html = '<table class="month-summary-table"><thead><tr>';
    html += '<th>Week</th>';
    appState.jobs.forEach(function(job) {
        var monthDotColor = getExecutiveCustomerColor(job.color, 'dot');
        html += '<th><span class="ms-job-dot" style="background:' + monthDotColor + ';"></span>' + escapeHtml(job.name) + '</th>';
    });
    if (appState.jobs.length > 1) html += '<th>Total</th>';
    html += '</tr></thead><tbody>';

    weekOrder.forEach(function(wk) {
        html += '<tr><td class="ms-wk">Wk ' + wk + '</td>';
        var weekTotal = 0;
        appState.jobs.forEach(function(job) {
            var hrs = weekData[wk][job.id];
            weekTotal += hrs;
            html += '<td class="ms-hrs">' + (hrs > 0 ? hrs + 'h' : '-') + '</td>';
        });
        if (appState.jobs.length > 1) {
            html += '<td class="ms-hrs ms-total">' + (weekTotal > 0 ? weekTotal + 'h' : '-') + '</td>';
        }
        html += '</tr>';
    });

    // Month total row
    html += '<tr class="ms-month-row"><td class="ms-wk">Month</td>';
    appState.jobs.forEach(function(job) {
        var hrs = monthTotals[job.id];
        html += '<td class="ms-hrs ms-month">' + hrs + 'h</td>';
    });
    if (appState.jobs.length > 1) {
        html += '<td class="ms-hrs ms-month ms-grand">' + grandTotal + 'h</td>';
    }
    html += '</tr></tbody></table>';

    container.innerHTML = html;
}

function toggleCard(el, dateStr) {
    if (el.classList.contains('active')) {
        el.classList.remove('active');
        appState.selectedDates.delete(dateStr);
    } else {
        el.classList.add('active');
        appState.selectedDates.add(dateStr);
    }
    updateCounter();
    if (window.selectionState) window.selectionState.persistCurrent();
    if (window.diffEngine) window.diffEngine.clearCalendarOverlay();
}

function updateCounter() {
    const typeLabel = appState.currentHourType === 'wbso' ? 'WBSO' : 'Facturable';
    document.getElementById('selectionCount').innerText = `${appState.selectedDates.size} days selected (${typeLabel})`;
}

function clearAll() {
    if (appState.selectedDates.size === 0) {
        alert("No days selected!");
        return;
    }
    if (confirm(`Clear all ${appState.selectedDates.size} selected days?`)) {
        document.querySelectorAll('.day-card.active').forEach(card => card.classList.remove('active'));
        appState.selectedDates.clear();
        updateCounter();
        if (window.selectionState) window.selectionState.persistCurrent();
        if (window.diffEngine) window.diffEngine.clearCalendarOverlay();
    }
}

function selectAllCalendarDays() {
    const picker = document.getElementById('monthPicker').value;
    if (!picker) return;

    document.querySelectorAll('.day-card').forEach(card => {
        if (card.style.visibility !== 'hidden' && !card.classList.contains('active')) {
            card.classList.add('active');
        }
    });

    const [year, month] = picker.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    appState.selectedDates.clear();
    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(Date.UTC(year, month - 1, d));
        const dateStr = dateObj.toISOString().split('T')[0];
        appState.selectedDates.add(dateStr);
    }
    updateCounter();
    if (window.selectionState) window.selectionState.persistCurrent();
}
