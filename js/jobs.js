// Moneybird Planner IV - Job Profiles Module
// Version: 4.0.0
// Manages multiple concurrent job profiles with weekly templates + per-date overrides
// Jobs are synced between laptops via git-tracked jobs-config.json

// --- PERSISTENCE (server-synced + localStorage cache) ---
function saveJobs() {
    var data = JSON.stringify(appState.jobs);
    // Always cache to localStorage for offline/fast access
    localStorage.setItem(STORAGE_KEYS.JOBS, data);
    console.log('[Jobs] Cached', appState.jobs.length, 'jobs locally');

    // Push to server (which commits + pushes to git)
    fetch('/api/config/jobs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobs: appState.jobs,
            lastModified: new Date().toISOString()
        })
    }).then(function(resp) {
        return resp.json();
    }).then(function(result) {
        if (result.success) {
            console.log('[Jobs] Synced to server' + (result.changed ? ' (pushed)' : ' (unchanged)'));
        } else {
            console.warn('[Jobs] Server sync failed:', result.error);
        }
    }).catch(function(err) {
        console.warn('[Jobs] Server sync error:', err.message);
    });
}

function loadJobs() {
    // Try loading from localStorage first (fast, always available)
    var saved = localStorage.getItem(STORAGE_KEYS.JOBS);
    if (saved) {
        try {
            appState.jobs = JSON.parse(saved);
            console.log('[Jobs] Loaded', appState.jobs.length, 'jobs from cache');
        } catch (e) {
            console.error('[Jobs] Failed to parse cached jobs:', e);
            appState.jobs = [];
        }
    } else {
        console.log('[Jobs] No cached jobs, checking for legacy data...');
        migrateFromLegacy();
    }
}

// Pull shared jobs from server (git pull + read file). Call on startup.
function loadJobsFromServer() {
    return fetch('/api/config/jobs')
        .then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        })
        .then(function(data) {
            var serverJobs = data.jobs || [];
            if (serverJobs.length > 0) {
                appState.jobs = serverJobs;
                localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(serverJobs));
                console.log('[Jobs] Synced', serverJobs.length, 'jobs from server');
                // Re-render UI with synced data
                renderJobsList();
                renderScheduleGrid();
                renderCalendar();
            } else {
                console.log('[Jobs] Server has no jobs, keeping local data');
                // If we have local jobs but server is empty, push ours up
                if (appState.jobs.length > 0) {
                    console.log('[Jobs] Pushing local jobs to server...');
                    saveJobs();
                }
            }
        })
        .catch(function(err) {
            console.warn('[Jobs] Server load failed, using cache:', err.message);
        });
}

function migrateFromLegacy() {
    var oldDefaults = localStorage.getItem('mb3_defaults');
    if (!oldDefaults) return;

    var defaultDays = JSON.parse(oldDefaults);
    var projectId = localStorage.getItem(STORAGE_KEYS.PROJ_BV) || '';
    var startTime = '09:00';
    var endTime = '18:00';
    var lunch = true;

    // Read from DOM if available
    var startEl = document.getElementById('startTime');
    var endEl = document.getElementById('endTime');
    var lunchEl = document.getElementById('lunchBreak');
    if (startEl) startTime = startEl.value || startTime;
    if (endEl) endTime = endEl.value || endTime;
    if (lunchEl) lunch = lunchEl.checked;

    // Build main job schedule from old default days
    var schedule = {};
    defaultDays.forEach(function(dayIdx) {
        schedule[String(dayIdx)] = { start: startTime, end: endTime, lunch: lunch };
    });

    // Create main job
    appState.jobs.push({
        id: 'job_migrated_main',
        name: 'Main',
        color: JOB_COLORS[0],
        projectId: projectId,
        projectName: '',
        description: 'Consultancy uren',
        schedule: schedule,
        dateOverrides: {}
    });

    // Check for split day -> create second job
    var splitDay = localStorage.getItem('mb3_split_day');
    var splitProjectId = localStorage.getItem('mb3_split_project');
    if (splitDay !== null && splitProjectId) {
        var splitStart = localStorage.getItem('mb3_split_start_time') || '10:00';
        var splitEnd = localStorage.getItem('mb3_split_end_time') || '19:00';

        appState.jobs.push({
            id: 'job_migrated_split',
            name: 'Split Job',
            color: JOB_COLORS[1],
            projectId: splitProjectId,
            projectName: '',
            description: 'Consultancy uren',
            schedule: { [splitDay]: { start: splitStart, end: splitEnd, lunch: false } },
            dateOverrides: {}
        });
    }

    saveJobs();

    // Clean up old keys
    localStorage.removeItem('mb3_defaults');
    localStorage.removeItem('mb3_split_day');
    localStorage.removeItem('mb3_split_project');
    localStorage.removeItem('mb3_split_start_time');
    localStorage.removeItem('mb3_split_end_time');
}

// --- QUERY HELPERS ---

// Check if a job is active on a specific date (overrides > template)
// Override values: true = on, false = off, {start,end,lunch} = on with custom hours
function isJobActiveOnDate(job, dateStr) {
    var overrides = job.dateOverrides || {};
    if (overrides.hasOwnProperty(dateStr)) {
        var ov = overrides[dateStr];
        return ov !== false; // true or schedule object = active
    }
    var d = new Date(dateStr + 'T00:00:00');
    return job.schedule.hasOwnProperty(String(d.getDay()));
}

// Get the schedule entry (start/end/lunch) for a job on a date
// If dateOverride is a schedule object, use it (custom hours for that day)
function getScheduleForJobDate(job, dateStr) {
    var overrides = job.dateOverrides || {};
    if (overrides.hasOwnProperty(dateStr)) {
        var ov = overrides[dateStr];
        if (ov && typeof ov === 'object' && ov.start) return ov;
    }
    var d = new Date(dateStr + 'T00:00:00');
    var dayOfWeek = d.getDay();
    if (job.schedule.hasOwnProperty(String(dayOfWeek))) {
        return job.schedule[String(dayOfWeek)];
    }
    // Override-added day with no template: use first available schedule or defaults
    var keys = Object.keys(job.schedule);
    if (keys.length > 0) return job.schedule[keys[0]];
    return { start: '09:00', end: '18:00', lunch: false };
}

function getJobsForDate(dateStr) {
    return appState.jobs.filter(function(job) {
        return isJobActiveOnDate(job, dateStr);
    });
}

function getDefaultDaysFromJobs() {
    var days = new Set();
    appState.jobs.forEach(function(job) {
        Object.keys(job.schedule).forEach(function(dayStr) {
            days.add(parseInt(dayStr));
        });
    });
    return Array.from(days).sort();
}

// Check if a specific date has any override for any job
function hasOverridesForMonth(year, month) {
    var prefix = year + '-' + String(month).padStart(2, '0');
    return appState.jobs.some(function(job) {
        var overrides = job.dateOverrides || {};
        return Object.keys(overrides).some(function(d) { return d.startsWith(prefix); });
    });
}

function calculateJobHours(scheduleEntry) {
    if (!scheduleEntry) return 0;
    var startParts = scheduleEntry.start.split(':').map(Number);
    var endParts = scheduleEntry.end.split(':').map(Number);
    var hours = (endParts[0] * 60 + endParts[1] - startParts[0] * 60 - startParts[1]) / 60;
    if (scheduleEntry.lunch) hours -= 1;
    return Math.max(0, hours);
}

function getConfigForJob(job) {
    return {
        token: document.getElementById('apiTokenBV').value,
        adminId: document.getElementById('adminIdBV').value,
        userId: document.getElementById('userIdBV').value,
        projectId: job.projectId,
        billable: true
    };
}

// --- SCHEDULE GRID (Excel-like weekly table) ---
function getISOWeek(dateObj) {
    var d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function buildMonthWeeks(year, month) {
    var daysInMonth = new Date(year, month, 0).getDate();
    var weeks = [];
    var currentWeek = null;
    for (var d = 1; d <= daysInMonth; d++) {
        var dateObj = new Date(year, month - 1, d);
        var dow = dateObj.getDay(); // 0=Sun
        var wk = getISOWeek(dateObj);
        if (!currentWeek || currentWeek.wk !== wk) {
            currentWeek = { wk: wk, days: [null, null, null, null, null] }; // Mon-Fri
            weeks.push(currentWeek);
        }
        // Map: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4 (skip Sat/Sun)
        var slot = (dow === 0) ? -1 : dow - 1; // Sun=-1, Mon=0..Fri=4, Sat=5
        if (slot >= 0 && slot <= 4) {
            var dateStr = new Date(Date.UTC(year, month - 1, d)).toISOString().split('T')[0];
            currentWeek.days[slot] = { day: d, dateStr: dateStr, dow: dow };
        }
    }
    return weeks;
}

function renderScheduleGrid() {
    var container = document.getElementById('scheduleGrid');
    if (!container) return;
    if (appState.jobs.length === 0 || appState.currentHourType === 'wbso') {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    var picker = document.getElementById('monthPicker').value;
    if (!picker) return;
    var parts = picker.split('-').map(Number);
    var year = parts[0];
    var month = parts[1];
    var weeks = buildMonthWeeks(year, month);
    var dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    var overrideCount = 0;

    // Count overrides this month
    var prefix = picker;
    appState.jobs.forEach(function(job) {
        var ov = job.dateOverrides || {};
        Object.keys(ov).forEach(function(d) { if (d.startsWith(prefix)) overrideCount++; });
    });

    var html = '<div class="sg-header">';
    html += '<div class="sg-header-left">';
    html += '<span class="sg-title">Schedule</span>';
    html += '<span class="sg-hint">Click to toggle on/off, right-click to edit hours</span>';
    html += '</div>';
    if (overrideCount > 0) {
        html += '<button class="sg-reset-btn" onclick="resetAllOverrides()">';
        html += 'Reset ' + overrideCount + ' override' + (overrideCount > 1 ? 's' : '') + '</button>';
    }
    html += '</div>';

    // Table
    html += '<table class="sg-table"><thead><tr><th class="sg-wk-col">Wk</th>';
    for (var c = 0; c < 5; c++) {
        html += '<th class="sg-day-col">' + dayNames[c] + '</th>';
    }
    html += '</tr></thead><tbody>';

    // One row per week
    weeks.forEach(function(week) {
        html += '<tr><td class="sg-wk-cell">' + week.wk + '</td>';
        for (var c = 0; c < 5; c++) {
            var info = week.days[c];
            if (!info) {
                html += '<td class="sg-empty"></td>';
                continue;
            }
            var dateStr = info.dateStr;
            var isHoliday = HOLIDAYS_NL_2026.hasOwnProperty(dateStr);
            var holidayName = isHoliday ? HOLIDAYS_NL_2026[dateStr] : '';
            var cellCls = 'sg-day';
            if (isHoliday) cellCls += ' sg-holiday';

            html += '<td class="' + cellCls + '">';
            html += '<div class="sg-date-num">' + info.day;
            if (isHoliday) html += ' <span class="sg-holiday-dot" title="' + escapeHtml(holidayName) + '">&#9679;</span>';
            html += '</div>';

            // Job chips
            appState.jobs.forEach(function(job) {
                var active = isJobActiveOnDate(job, dateStr);
                var hasOverride = (job.dateOverrides || {}).hasOwnProperty(dateStr);
                var sched = active ? getScheduleForJobDate(job, dateStr) : null;
                var hrs = sched ? calculateJobHours(sched) : 0;
                var isHourOverride = hasOverride && typeof (job.dateOverrides || {})[dateStr] === 'object';
                var chipCls = 'sg-chip';
                if (active) chipCls += ' sg-chip-on';
                if (hasOverride) chipCls += ' sg-chip-override';

                html += '<div class="' + chipCls + '" ';
                html += 'data-job="' + job.id + '" data-date="' + dateStr + '" ';
                html += 'onclick="toggleScheduleCell(this)" ';
                html += 'oncontextmenu="event.preventDefault(); openHourEditor(this);" ';
                html += 'style="' + (active ? 'background:' + job.color + '; color:#fff; border-color:' + job.color + ';' : '') + '" ';
                html += 'title="' + escapeHtml(job.name) + (hrs > 0 ? ' ' + hrs + 'h' : '') + (isHourOverride ? ' (custom hours)' : hasOverride ? ' (manual override)' : '') + ' — right-click to edit hours">';
                html += escapeHtml(job.name);
                if (active && hrs > 0) html += ' ' + hrs + 'h';
                if (hasOverride) html += ' *';
                html += '</div>';
            });

            html += '</td>';
        }
        html += '</tr>';
    });

    html += '</tbody></table>';

    // Legend
    html += '<div class="sg-legend">';
    appState.jobs.forEach(function(job) {
        html += '<span class="sg-legend-item"><span class="sg-legend-dot" style="background:' + job.color + ';"></span>' + escapeHtml(job.name) + '</span>';
    });
    html += '<span class="sg-legend-item"><span class="sg-legend-dot" style="background:#f59e0b;"></span>Holiday</span>';
    html += '<span class="sg-legend-item sg-legend-muted">* = manual override</span>';
    html += '</div>';

    container.innerHTML = html;
}

function toggleScheduleCell(cell) {
    var jobId = cell.dataset.job;
    var dateStr = cell.dataset.date;
    var job = appState.jobs.find(function(j) { return j.id === jobId; });
    if (!job) return;

    if (!job.dateOverrides) job.dateOverrides = {};

    var currentlyActive = isJobActiveOnDate(job, dateStr);
    var d = new Date(dateStr + 'T00:00:00');
    var templateActive = job.schedule.hasOwnProperty(String(d.getDay()));

    if (currentlyActive) {
        // Turn off: if template says on, store false override; if override-on, remove it
        if (templateActive) {
            job.dateOverrides[dateStr] = false;
        } else {
            delete job.dateOverrides[dateStr];
        }
    } else {
        // Turn on: if template says off, store true override; if override-off, remove it
        if (!templateActive) {
            job.dateOverrides[dateStr] = true;
        } else {
            delete job.dateOverrides[dateStr];
        }
    }

    saveJobs();
    renderScheduleGrid();
    renderCalendar(true);
}

function openHourEditor(chip) {
    // Remove any existing hour editor
    var old = document.getElementById('hourEditorPopup');
    if (old) old.remove();

    var jobId = chip.dataset.job;
    var dateStr = chip.dataset.date;
    var job = appState.jobs.find(function(j) { return j.id === jobId; });
    if (!job) return;

    // Get current schedule for this date
    var sched = getScheduleForJobDate(job, dateStr);
    var hrs = calculateJobHours(sched);

    // Position popup near the chip
    var rect = chip.getBoundingClientRect();

    var popup = document.createElement('div');
    popup.id = 'hourEditorPopup';
    popup.className = 'hour-editor-popup';
    popup.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    popup.style.left = (rect.left + window.scrollX) + 'px';

    var d = new Date(dateStr + 'T00:00:00');
    var dayLabel = DAY_NAMES[d.getDay()] + ' ' + dateStr.split('-')[2] + ' — ' + escapeHtml(job.name);

    popup.innerHTML = '<div class="he-title">' + dayLabel + '</div>' +
        '<div class="he-row">' +
            '<label>Start</label><input type="time" id="heStart" value="' + sched.start + '">' +
            '<label>End</label><input type="time" id="heEnd" value="' + sched.end + '">' +
        '</div>' +
        '<div class="he-row">' +
            '<label class="checkbox-label compact"><input type="checkbox" id="heLunch"' + (sched.lunch ? ' checked' : '') + '><span>Lunch break (-1h)</span></label>' +
            '<span class="he-hours" id="heHoursPreview">' + hrs + 'h</span>' +
        '</div>' +
        '<div class="he-actions">' +
            '<button class="btn btn-ghost btn-sm" onclick="resetDayHours(\'' + jobId + '\', \'' + dateStr + '\')">Reset</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="closeHourEditor()">Cancel</button>' +
            '<button class="btn btn-primary btn-sm" onclick="saveHourEditor(\'' + jobId + '\', \'' + dateStr + '\')">Save</button>' +
        '</div>';

    document.body.appendChild(popup);

    // Live preview
    var startEl = document.getElementById('heStart');
    var endEl = document.getElementById('heEnd');
    var lunchEl = document.getElementById('heLunch');
    function updatePreview() {
        var preview = calculateJobHours({ start: startEl.value, end: endEl.value, lunch: lunchEl.checked });
        document.getElementById('heHoursPreview').textContent = preview + 'h';
    }
    startEl.addEventListener('input', updatePreview);
    endEl.addEventListener('input', updatePreview);
    lunchEl.addEventListener('change', updatePreview);

    // Close on outside click
    setTimeout(function() {
        document.addEventListener('mousedown', closeHourEditorOutside);
    }, 10);
}

function closeHourEditorOutside(e) {
    var popup = document.getElementById('hourEditorPopup');
    if (popup && !popup.contains(e.target)) closeHourEditor();
}

function closeHourEditor() {
    var popup = document.getElementById('hourEditorPopup');
    if (popup) popup.remove();
    document.removeEventListener('mousedown', closeHourEditorOutside);
}

function saveHourEditor(jobId, dateStr) {
    var job = appState.jobs.find(function(j) { return j.id === jobId; });
    if (!job) return;

    var start = document.getElementById('heStart').value;
    var end = document.getElementById('heEnd').value;
    var lunch = document.getElementById('heLunch').checked;

    if (!job.dateOverrides) job.dateOverrides = {};

    // Check if this differs from the template
    var d = new Date(dateStr + 'T00:00:00');
    var templateSched = job.schedule[String(d.getDay())];
    if (templateSched && templateSched.start === start && templateSched.end === end && templateSched.lunch === lunch) {
        // Same as template — remove override
        delete job.dateOverrides[dateStr];
    } else {
        job.dateOverrides[dateStr] = { start: start, end: end, lunch: lunch };
    }

    saveJobs();
    closeHourEditor();
    renderScheduleGrid();
    renderCalendar(true);
}

function resetDayHours(jobId, dateStr) {
    var job = appState.jobs.find(function(j) { return j.id === jobId; });
    if (!job) return;
    if (job.dateOverrides) delete job.dateOverrides[dateStr];
    saveJobs();
    closeHourEditor();
    renderScheduleGrid();
    renderCalendar(true);
}

function resetAllOverrides() {
    var monthPicker = document.getElementById('monthPicker').value;
    if (!monthPicker) return;
    var prefix = monthPicker; // "2026-04"
    if (!confirm('Reset all manual overrides for ' + monthPicker + ' back to weekly templates?')) return;

    appState.jobs.forEach(function(job) {
        if (!job.dateOverrides) return;
        Object.keys(job.dateOverrides).forEach(function(dateStr) {
            if (dateStr.startsWith(prefix)) {
                delete job.dateOverrides[dateStr];
            }
        });
    });
    saveJobs();
    renderScheduleGrid();
    renderCalendar(true);
}

// --- SIDEBAR RENDERING ---
function renderJobsList() {
    var container = document.getElementById('jobsList');
    if (!container) return;

    if (appState.jobs.length === 0) {
        container.innerHTML = '<p class="text-sm text-muted" style="text-align:center; padding:16px 0;">No jobs configured yet.</p>';
        return;
    }

    container.innerHTML = appState.jobs.map(function(job) {
        var dayNames = Object.keys(job.schedule).sort().map(function(d) {
            return DAY_NAMES[parseInt(d)];
        });
        var totalWeeklyHours = 0;
        Object.keys(job.schedule).forEach(function(d) {
            totalWeeklyHours += calculateJobHours(job.schedule[d]);
        });

        return '<div class="job-card" style="border-left:3px solid ' + job.color + ';">' +
            '<div class="job-card-header">' +
                '<div class="job-card-info">' +
                    '<span class="job-dot" style="background:' + job.color + ';"></span>' +
                    '<strong>' + escapeHtml(job.name) + '</strong>' +
                '</div>' +
                '<div class="job-card-actions">' +
                    '<button class="btn-icon" onclick="openJobEditor(\'' + job.id + '\')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon" onclick="deleteJob(\'' + job.id + '\')" title="Delete">&#128465;</button>' +
                '</div>' +
            '</div>' +
            '<div class="job-card-details">' +
                '<span>' + dayNames.join(', ') + '</span>' +
                '<span> &middot; ' + totalWeeklyHours.toFixed(0) + 'h/week</span>' +
                (job.hourlyRate ? '<span> &middot; \u20AC' + job.hourlyRate.toFixed(2).replace('.', ',') + '/h</span>' : '') +
                (job.projectName ? '<br><span style="opacity:0.7;">' + escapeHtml(job.projectName) + '</span>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

// --- JOB EDITOR MODAL ---
function openJobEditor(jobId) {
    var job = jobId ? appState.jobs.find(function(j) { return j.id === jobId; }) : null;
    var isNew = !job;

    if (isNew) {
        var colorIdx = appState.jobs.length % JOB_COLORS.length;
        job = {
            id: 'job_' + Date.now(),
            name: '',
            color: JOB_COLORS[colorIdx],
            projectId: '',
            projectName: '',
            description: 'Consultancy uren',
            schedule: {}
        };
    }

    var overlay = document.createElement('div');
    overlay.id = 'jobEditorOverlay';
    overlay.className = 'modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'job-editor-modal';

    var html = '<h3 style="margin:0 0 16px 0;">' + (isNew ? 'Add Job' : 'Edit Job') + '</h3>';

    // Name
    html += '<div class="editor-field"><label>Job Name</label>';
    html += '<input type="text" id="jobEditorName" value="' + escapeHtml(job.name) + '" placeholder="e.g. DNB, RIVM"></div>';

    // Color
    html += '<div class="editor-field"><label>Color</label><div class="color-picker">';
    JOB_COLORS.forEach(function(c) {
        html += '<button type="button" class="color-swatch' + (c === job.color ? ' active' : '') + '" style="background:' + c + ';" data-color="' + c + '" onclick="selectJobColor(this)"></button>';
    });
    html += '</div></div>';

    // Project
    html += '<div class="editor-field"><label>Project</label>';
    html += '<div id="jobEditorProjectPicker" class="project-picker"><span class="text-sm text-muted">Loading...</span></div></div>';

    // Hourly Rate
    html += '<div class="editor-field"><label>Hourly Rate (excl. BTW)</label>';
    html += '<div style="display:flex; align-items:center; gap:6px;"><span style="font-weight:600; color:var(--muted);">\u20AC</span>';
    html += '<input type="number" id="jobEditorRate" value="' + (job.hourlyRate || 0) + '" min="0" step="0.50" style="width:120px;" placeholder="112.00"></div></div>';

    // Description
    html += '<div class="editor-field"><label>Description (for invoice)</label>';
    html += '<input type="text" id="jobEditorDesc" value="' + escapeHtml(job.description) + '" placeholder="Consultancy uren"></div>';

    // Schedule
    html += '<div class="editor-field"><label>Schedule</label>';
    html += '<div class="config-days" id="jobEditorDays">';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function(name, idx) {
        var isActive = job.schedule.hasOwnProperty(String(idx));
        html += '<div class="config-day' + (isActive ? ' selected' : '') + '" data-day="' + idx + '" onclick="toggleJobDay(this)">' + name + '</div>';
    });
    html += '</div></div>';

    // Per-day time settings
    html += '<div id="jobEditorTimes">';
    for (var d = 0; d < 7; d++) {
        var sched = job.schedule[String(d)];
        var display = sched ? 'flex' : 'none';
        var start = sched ? sched.start : '09:00';
        var end = sched ? sched.end : '18:00';
        var lunch = sched ? sched.lunch : true;
        html += '<div class="job-day-time" id="jobTime_' + d + '" style="display:' + display + ';">';
        html += '<span class="day-label">' + DAY_NAMES[d] + '</span>';
        html += '<input type="time" value="' + start + '" class="time-input" data-day="' + d + '" data-field="start">';
        html += '<span style="color:var(--muted);">-</span>';
        html += '<input type="time" value="' + end + '" class="time-input" data-day="' + d + '" data-field="end">';
        html += '<label class="checkbox-label compact"><input type="checkbox"' + (lunch ? ' checked' : '') + ' data-day="' + d + '" data-field="lunch"><span>Lunch</span></label>';
        html += '</div>';
    }
    html += '</div>';

    // Buttons
    html += '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">';
    html += '<button class="btn btn-ghost" onclick="closeJobEditor()" style="background:#e5e7eb; color:#374151;">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="saveJobFromEditor(\'' + job.id + '\', ' + isNew + ')">Save</button>';
    html += '</div>';

    modal.innerHTML = html;
    overlay.appendChild(modal);
    overlay.onclick = function(e) { if (e.target === overlay) closeJobEditor(); };
    document.body.appendChild(overlay);

    // Load project picker
    loadJobProjectPicker(job.projectId);
}

function closeJobEditor() {
    var overlay = document.getElementById('jobEditorOverlay');
    if (overlay) overlay.remove();
}

function selectJobColor(btn) {
    btn.parentElement.querySelectorAll('.color-swatch').forEach(function(s) {
        s.classList.remove('active');
    });
    btn.classList.add('active');
}

function toggleJobDay(el) {
    var day = el.dataset.day;
    el.classList.toggle('selected');
    var timeRow = document.getElementById('jobTime_' + day);
    if (timeRow) {
        timeRow.style.display = el.classList.contains('selected') ? 'flex' : 'none';
    }
}

async function loadJobProjectPicker(currentProjectId) {
    var container = document.getElementById('jobEditorProjectPicker');
    if (!container) return;

    var token = document.getElementById('apiTokenBV').value;
    var adminId = document.getElementById('adminIdBV').value;

    if (!token || !adminId) {
        container.innerHTML = '<span class="text-sm text-muted">Configure BV API settings first</span>';
        return;
    }

    if (!projectCache.bv) {
        try {
            var response = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + adminId + '/projects', {
                headers: { 'X-Moneybird-Token': token }
            });
            if (!response.ok) throw new Error('API error: ' + response.status);
            var projects = await response.json();
            projectCache.bv = projects.filter(function(p) { return p.state === 'active'; });
        } catch (err) {
            container.innerHTML = '<span class="text-sm text-muted">Failed to load projects</span>';
            return;
        }
    }

    container.innerHTML = '';
    projectCache.bv.forEach(function(p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'project-btn' + (currentProjectId === String(p.id) ? ' active' : '');
        btn.textContent = p.name;
        btn.dataset.projectId = String(p.id);
        btn.dataset.projectName = p.name;
        btn.onclick = function() {
            container.querySelectorAll('.project-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
        };
        container.appendChild(btn);
    });
}

function saveJobFromEditor(jobId, isNew) {
    var name = document.getElementById('jobEditorName').value.trim();
    if (!name) { alert('Please enter a job name'); return; }

    var colorBtn = document.querySelector('#jobEditorOverlay .color-swatch.active');
    var color = colorBtn ? colorBtn.dataset.color : JOB_COLORS[0];

    var projectBtn = document.querySelector('#jobEditorProjectPicker .project-btn.active');
    var projectId = projectBtn ? projectBtn.dataset.projectId : '';
    var projectName = projectBtn ? projectBtn.dataset.projectName : '';

    var description = document.getElementById('jobEditorDesc').value.trim() || 'Consultancy uren';
    var hourlyRate = parseFloat(document.getElementById('jobEditorRate').value) || 0;

    // Build schedule from selected days + time inputs
    var schedule = {};
    document.querySelectorAll('#jobEditorDays .config-day.selected').forEach(function(dayEl) {
        var day = dayEl.dataset.day;
        var startInput = document.querySelector('#jobEditorTimes input[data-day="' + day + '"][data-field="start"]');
        var endInput = document.querySelector('#jobEditorTimes input[data-day="' + day + '"][data-field="end"]');
        var lunchInput = document.querySelector('#jobEditorTimes input[data-day="' + day + '"][data-field="lunch"]');
        schedule[day] = {
            start: startInput ? startInput.value : '09:00',
            end: endInput ? endInput.value : '18:00',
            lunch: lunchInput ? lunchInput.checked : true
        };
    });

    if (Object.keys(schedule).length === 0) {
        alert('Please select at least one day');
        return;
    }

    if (isNew) {
        appState.jobs.push({
            id: jobId,
            name: name,
            color: color,
            projectId: projectId,
            projectName: projectName,
            description: description,
            hourlyRate: hourlyRate,
            schedule: schedule,
            dateOverrides: {}
        });
    } else {
        var existing = appState.jobs.find(function(j) { return j.id === jobId; });
        if (existing) {
            existing.name = name;
            existing.color = color;
            existing.projectId = projectId;
            existing.projectName = projectName;
            existing.description = description;
            existing.hourlyRate = hourlyRate;
            existing.schedule = schedule;
        }
    }

    saveJobs();
    closeJobEditor();
    renderJobsList();
    renderCalendar();
    renderScheduleGrid();
}

function deleteJob(jobId) {
    var job = appState.jobs.find(function(j) { return j.id === jobId; });
    if (!job) return;
    if (!confirm('Delete job "' + job.name + '"?')) return;

    appState.jobs = appState.jobs.filter(function(j) { return j.id !== jobId; });
    saveJobs();
    renderJobsList();
    renderCalendar();
    renderScheduleGrid();
}
