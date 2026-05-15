// Moneybird Planner IV - Moneybird API Module
// Version: 1.0.0

// --- PREVIEW ---
function previewSelection() {
    const config = getCurrentConfig();
    const dates = Array.from(appState.selectedDates).sort();
    const desc = document.getElementById('desc').value || (appState.currentHourType === 'wbso' ? 'WBSO R&D Work' : 'Consultancy uren');

    let message = `Preview:\n\nType: ${appState.currentHourType.toUpperCase()}\nDates: ${dates.length} days\nDescription: ${desc}`;

    if (appState.currentHourType === 'facturable' && appState.jobs.length > 0) {
        message += '\n\nJobs per day:';
        var jobSummary = {};
        dates.forEach(function(d) {
            var jobs = getJobsForDate(d);
            jobs.forEach(function(j) {
                if (!jobSummary[j.name]) jobSummary[j.name] = 0;
                jobSummary[j.name]++;
            });
        });
        Object.keys(jobSummary).forEach(function(name) {
            message += '\n  ' + name + ': ' + jobSummary[name] + ' entries';
        });
    }

    if (appState.currentHourType === 'wbso') {
        message += `\n\nWBSO Options:`;
        message += `\n- One entry per commit: ${document.getElementById('oneEntryPerCommit').checked ? 'Yes' : 'No'}`;
        message += `\n- Match commits to dates: ${document.getElementById('matchCommitsToDates').checked ? 'Yes' : 'No'}`;
        message += `\n- Selected commits: ${appState.selectedCommits.length}`;
        message += `\n- Selected PRs: ${appState.selectedPRs.length}`;
    }

    alert(message);
}

// --- REGISTRATION ---
async function startRegistration() {
    const config = getCurrentConfig();

    if (!config.token || !config.adminId || !config.userId) {
        alert('Please configure API settings first (click Settings button)');
        return;
    }

    if (appState.selectedDates.size === 0) {
        alert('Please select at least one day');
        return;
    }

    const oneEntryPerCommit = document.getElementById('oneEntryPerCommit').checked;
    const matchCommitsToDates = document.getElementById('matchCommitsToDates').checked;
    const onlyDaysWithCommits = document.getElementById('onlyDaysWithCommits').checked;

    // Build description
    let baseDesc = document.getElementById('desc').value || '';
    const wbsoComment = document.getElementById('wbsoComment').value;

    // For WBSO with one entry per commit
    if (appState.currentHourType === 'wbso' && oneEntryPerCommit && appState.gitCommitsData && appState.selectedCommits.length > 0) {
        await registerOneEntryPerCommit(config, baseDesc, wbsoComment, matchCommitsToDates, onlyDaysWithCommits);
    } else {
        await registerStandard(config, baseDesc, wbsoComment, matchCommitsToDates, onlyDaysWithCommits);
    }
}

async function registerOneEntryPerCommit(config, baseDesc, wbsoComment, matchCommitsToDates, onlyDaysWithCommits) {
    const commits = appState.selectedCommits.map(i => appState.gitCommitsData[i]);
    const dates = Array.from(appState.selectedDates).sort();

    // Build description without unnecessary prefix
    const buildCommitDesc = (commit) => {
        let desc = `${commit.hash.substring(0, 7)}: ${commit.message}`;
        if (baseDesc) desc = `${baseDesc} | ${desc}`;
        if (wbsoComment) desc += ` | ${wbsoComment}`;
        return desc;
    };

    // Build entries
    let entries = [];

    if (matchCommitsToDates) {
        for (const commit of commits) {
            const commitDate = commit.fullDate;
            if (appState.selectedDates.has(commitDate)) {
                entries.push({
                    date: commitDate,
                    description: buildCommitDesc(commit),
                    commit: commit
                });
            }
        }
    } else {
        // Distribute commits across selected dates
        let dateIdx = 0;
        for (const commit of commits) {
            entries.push({
                date: dates[dateIdx % dates.length],
                description: buildCommitDesc(commit),
                commit: commit
            });
            dateIdx++;
        }
    }

    if (entries.length === 0) {
        alert('No entries to register. Check your commit/date selections.');
        return;
    }

    if (!confirm(`Register ${entries.length} time entries (one per commit)?`)) return;

    let success = 0, failed = 0;

    for (const entry of entries) {
        try {
            // Use individual hours from the commit, fallback to global setting
            const hours = entry.commit.hours || parseFloat(document.getElementById('hoursPerCommit').value) || 1;
            await registerSingleEntry(config, entry.date, entry.description, hours, entry.commit);
            success++;
        } catch (err) {
            console.error('Failed:', err);
            failed++;
        }
    }

    alert(`Registration complete!\n✅ ${success} succeeded\n❌ ${failed} failed`);
}

async function registerStandard(config, baseDesc, wbsoComment, matchCommitsToDates, onlyDaysWithCommits) {
    let dates = Array.from(appState.selectedDates).sort();

    // Build git info for WBSO description
    let gitInfo = '';
    if (appState.currentHourType === 'wbso') {
        if (appState.gitCommitsData && appState.selectedCommits.length > 0) {
            const commits = appState.selectedCommits.map(i => appState.gitCommitsData[i]);
            gitInfo = commits.map((c, i) => `${i + 1}. [${c.hash.substring(0, 7)}] ${c.message}`).join(' /// ');
        }
        if (appState.gitPRsData && appState.selectedPRs.length > 0) {
            const prs = appState.selectedPRs.map(i => appState.gitPRsData[i]);
            if (gitInfo) gitInfo += ' /// ';
            gitInfo += 'PRs: ' + prs.map(p => `#${p.number}`).join(', ');
        }
    }

    // Filter dates if needed (WBSO only)
    if (matchCommitsToDates && onlyDaysWithCommits && appState.gitCommitsData) {
        const commitDates = new Set(appState.selectedCommits.map(i => appState.gitCommitsData[i].fullDate));
        dates = dates.filter(d => commitDates.has(d));
    }

    if (dates.length === 0) {
        alert('No dates to register after filtering.');
        return;
    }

    // Build entries via shared planning module so the diff classification
    // matches exactly what we will POST.
    var entries = window.planning
        ? window.planning.buildPlannedEntries({ type: appState.currentHourType, dates: dates })
        : [];

    if (entries.length === 0) {
        alert('No entries to register.');
        return;
    }

    // ---- DIFF PREVIEW (optimistic) ----
    // Pull existing month entries silently and show a NEW/EXISTING/CONFLICT
    // preview modal instead of a flat confirm().
    let toRegister = entries;
    if (window.diffEngine) {
        const monthKey = document.getElementById('monthPicker').value;
        let existing = [];
        try {
            existing = await window.diffEngine.fetchMonthEntries(config, monthKey);
        } catch (e) {
            console.warn('[diff] fetch failed, falling back to plain confirm:', e.message);
            existing = null;
        }
        if (existing !== null) {
            const diff = window.diffEngine.compute(entries, existing);
            const result = await window.diffEngine.show(diff);
            if (!result || !result.confirmed) return; // user cancelled
            toRegister = result.toRegister || [];
            if (toRegister.length === 0) return;
        } else {
            // Fallback to old confirm flow if Moneybird is unreachable.
            var confirmMsg = 'Register ' + entries.length + ' time entries across ' + dates.length + ' days?';
            if (!confirm(confirmMsg)) return;
        }
    } else {
        var confirmMsg = 'Register ' + entries.length + ' time entries across ' + dates.length + ' days?';
        if (!confirm(confirmMsg)) return;
    }

    let success = 0, failed = 0;
    for (const entry of toRegister) {
        try {
            await registerSingleEntry(config, entry.date, entry.description, null, null, {
                startTime: entry.startTime,
                endTime: entry.endTime,
                lunch: entry.lunch,
                projectId: entry.projectId
            });
            success++;
        } catch (err) {
            console.error('Failed:', err);
            failed++;
        }
    }

    alert('Registration complete!\n' + success + ' succeeded' + (failed > 0 ? ', ' + failed + ' failed' : ''));
}

async function registerSingleEntry(config, date, description, hoursOverride, commit, options) {
    options = options || {};
    let startTime = options.startTime || document.getElementById('startTime').value;
    let endTime = options.endTime || document.getElementById('endTime').value;
    var includeLunch = options.hasOwnProperty('lunch') ? options.lunch : document.getElementById('lunchBreak').checked;
    let pausedDuration = includeLunch ? 3600 : 0;
    var projectId = options.projectId || config.projectId;

    // For WBSO with commit: use commit time as end, calculate start backwards
    if (hoursOverride !== null && commit && commit.fullDateTime) {
        const commitDate = new Date(commit.fullDateTime);
        const endH = commitDate.getHours();
        const endM = commitDate.getMinutes();
        endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

        const endMinutes = endH * 60 + endM;
        const startMinutes = endMinutes - Math.round(hoursOverride * 60);
        const startH = Math.floor(startMinutes / 60);
        const startM = startMinutes % 60;
        startTime = `${String(Math.max(0, startH)).padStart(2, '0')}:${String(Math.abs(startM)).padStart(2, '0')}`;
        pausedDuration = 0;
    } else if (hoursOverride !== null) {
        // Fallback: use start time and calculate end
        const [startH, startM] = startTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = startMinutes + Math.round(hoursOverride * 60);
        const endH = Math.floor(endMinutes / 60);
        const endM = endMinutes % 60;
        endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        pausedDuration = 0;
    }

    const payload = {
        time_entry: {
            started_at: `${date} ${startTime}`,
            ended_at: `${date} ${endTime}`,
            description: description,
            user_id: config.userId,
            billable: config.billable,
            paused_duration: pausedDuration
        }
    };

    if (projectId) {
        payload.time_entry.project_id = projectId;
    }

    const response = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/time_entries`, {
        method: 'POST',
        headers: {
            'X-Moneybird-Token': config.token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
}

// --- HOURS MANAGEMENT ---
async function fetchExistingHours() {
    const config = getCurrentConfig();
    if (!config.token || !config.adminId) {
        alert('Please configure API settings first');
        return;
    }

    const picker = document.getElementById('monthPicker').value;
    if (!picker) { alert('Select a month first'); return; }

    const [year, month] = picker.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    document.getElementById('hoursManagementSection').style.display = 'block';
    document.getElementById('hoursList').innerHTML = '<p style="padding:20px; text-align:center;">Loading...</p>';

    try {
        // Paginate: Moneybird returns max 100 per page
        var allEntries = [];
        var page = 1;
        var hasMore = true;
        while (hasMore) {
            const response = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/time_entries?filter=period:${startDate}..${endDate}&per_page=100&page=${page}`, {
                headers: { 'X-Moneybird-Token': config.token }
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            var pageEntries = await response.json();
            allEntries = allEntries.concat(pageEntries);
            hasMore = pageEntries.length === 100;
            page++;
        }

        // Filter by current user
        appState.fetchedEntries = allEntries.filter(e => e.user_id === config.userId);

        renderHoursList();
    } catch (err) {
        document.getElementById('hoursList').innerHTML = `<p style="padding:20px; text-align:center; color:var(--danger);">Error: ${err.message}</p>`;
    }
}

function parseEntryHours(entry) {
    if (!entry.started_at || !entry.ended_at) return 0;
    var start = new Date(entry.started_at);
    var end = new Date(entry.ended_at);
    if (isNaN(start) || isNaN(end)) return 0;
    var ms = end - start;
    // Subtract paused_duration if present (in seconds)
    if (entry.paused_duration) ms -= entry.paused_duration * 1000;
    return ms / 3600000;
}

function formatEntryDate(dateStr) {
    if (!dateStr) return 'Unknown';
    var d = new Date(dateStr);
    if (isNaN(d)) return dateStr.split('T')[0] || dateStr.split(' ')[0] || dateStr;
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()] + ' ' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatTimeRange(startStr, endStr) {
    var fmt = function(s) {
        if (!s) return '??:??';
        var d = new Date(s);
        if (isNaN(d)) {
            var parts = s.split(' ');
            return parts.length > 1 ? parts[1].substring(0, 5) : s;
        }
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    return fmt(startStr) + ' - ' + fmt(endStr);
}

function renderHoursList() {
    const list = document.getElementById('hoursList');

    if (appState.fetchedEntries.length === 0) {
        list.innerHTML = '<p style="padding:20px; text-align:center; color:var(--muted);">No hours found for this month</p>';
        document.getElementById('hoursCount').textContent = '0 entries';
        return;
    }

    // Calculate summary
    var totalHours = 0;
    var dayMap = {};
    var lockedCount = 0;
    var projectMap = {}; // projectId -> { hours, count }
    appState.fetchedEntries.forEach(function(entry) {
        var hours = parseEntryHours(entry);
        totalHours += hours;
        var dateKey = formatEntryDate(entry.started_at);
        if (!dayMap[dateKey]) dayMap[dateKey] = { hours: 0, count: 0 };
        dayMap[dateKey].hours += hours;
        dayMap[dateKey].count++;
        if (entry.events && entry.events.some(function(ev) { return ev.action === 'time_entry_invoice_added'; })) {
            lockedCount++;
        }
        var pid = entry.project_id || (entry.project && entry.project.id) || '_none';
        if (!projectMap[pid]) projectMap[pid] = { hours: 0, count: 0, name: (entry.project && entry.project.name) || 'No project' };
        projectMap[pid].hours += hours;
        projectMap[pid].count++;
    });

    // Summary header
    var summaryHtml = '<div style="padding:12px 16px;background:var(--bg-elevated,#F8FAFC);border-radius:8px;margin-bottom:12px;border:1px solid var(--border,#E2E8F0);">';
    summaryHtml += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">';
    summaryHtml += '<div><strong>' + appState.fetchedEntries.length + '</strong> entries</div>';
    summaryHtml += '<div><strong>' + Object.keys(dayMap).length + '</strong> days</div>';
    summaryHtml += '<div><strong>' + totalHours.toFixed(1) + 'h</strong> total</div>';
    if (lockedCount > 0) {
        summaryHtml += '<div style="color:var(--warning,#f59e0b);">🔒 ' + lockedCount + ' on invoice</div>';
    }
    summaryHtml += '</div>';

    // Per-project breakdown (DNB / RIVM / ...)
    var projectKeys = Object.keys(projectMap);
    if (projectKeys.length > 0) {
        var pillsHtml = '<div class="hours-project-summary">';
        projectKeys.forEach(function(pid) {
            var info = projectMap[pid];
            var matchJob = (appState.jobs || []).find(function(j) {
                return j.projectId && String(j.projectId) === String(pid);
            });
            if (matchJob) {
                pillsHtml += '<span class="hour-entry-pill" style="background:' + escapeHtml(matchJob.color || '#64748b') + ';">' + escapeHtml(matchJob.name) + '<strong>' + info.hours.toFixed(1) + 'h</strong></span>';
            } else {
                pillsHtml += '<span class="hour-entry-pill hour-entry-pill-unknown">' + escapeHtml(info.name) + '<strong>' + info.hours.toFixed(1) + 'h</strong></span>';
            }
        });
        pillsHtml += '</div>';
        summaryHtml += pillsHtml;
    }

    // Compare with selected calendar dates
    var selectedDates = Array.from(appState.selectedDates).sort();
    var missing = [];
    var extra = [];
    if (selectedDates.length > 0) {
        var existingDates = new Set();
        appState.fetchedEntries.forEach(function(entry) {
            if (entry.started_at) {
                var d = new Date(entry.started_at);
                if (!isNaN(d)) {
                    existingDates.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                }
            }
        });
        missing = selectedDates.filter(function(d) { return !existingDates.has(d); });
        extra = Array.from(existingDates).filter(function(d) { return !appState.selectedDates.has(d); }).sort();

        summaryHtml += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#E2E8F0);font-size:0.85rem;">';
        summaryHtml += '<strong>Calendar vs Moneybird:</strong> ';
        if (missing.length === 0 && extra.length === 0) {
            summaryHtml += '<span style="color:var(--success,#22c55e);">All ' + selectedDates.length + ' selected days match Moneybird</span>';
        } else {
            if (missing.length > 0) {
                summaryHtml += '<div style="margin-top:4px;color:var(--danger,#ef4444);">Missing in Moneybird (' + missing.length + '): ' + missing.join(', ');
                summaryHtml += ' <button onclick="registerMissingDays()" style="margin-left:8px;padding:2px 10px;border:none;border-radius:4px;background:var(--success,#22c55e);color:#fff;font-weight:600;cursor:pointer;font-size:0.85rem;">Register Missing</button>';
                summaryHtml += '</div>';
            }
            if (extra.length > 0) {
                summaryHtml += '<div style="margin-top:4px;color:var(--warning,#f59e0b);">In Moneybird but not selected (' + extra.length + '): ' + extra.join(', ') + '</div>';
            }
        }
        summaryHtml += '</div>';
    }

    // Store missing dates for the register button
    appState.missingDates = missing;

    summaryHtml += '</div>';

    // Render entries grouped by date
    list.innerHTML = summaryHtml + appState.fetchedEntries.map(function(entry, idx) {
        var hours = parseEntryHours(entry);
        var isLocked = entry.events && entry.events.some(function(ev) { return ev.action === 'time_entry_invoice_added'; });
        var lockIcon = isLocked ? ' 🔒' : '';

        // Match the entry's project to one of our configured jobs so we can
        // show the customer name + colour dynamically (DNB / RIVM / ...).
        var entryProjId = entry.project_id || (entry.project && entry.project.id) || null;
        var projectPill = '';
        if (entryProjId && appState.jobs && appState.jobs.length > 0) {
            var matchJob = appState.jobs.find(function(j) {
                return j.projectId && String(j.projectId) === String(entryProjId);
            });
            if (matchJob) {
                projectPill = '<span class="hour-entry-pill" style="background:' + escapeHtml(matchJob.color || '#64748b') + ';">' + escapeHtml(matchJob.name) + '</span>';
            } else if (entry.project && entry.project.name) {
                projectPill = '<span class="hour-entry-pill hour-entry-pill-unknown">' + escapeHtml(entry.project.name) + '</span>';
            }
        } else if (entry.project && entry.project.name) {
            projectPill = '<span class="hour-entry-pill hour-entry-pill-unknown">' + escapeHtml(entry.project.name) + '</span>';
        }

        return '<div class="hour-entry">' +
            '<input type="checkbox" data-idx="' + idx + '"' + (isLocked ? ' title="Linked to invoice - cannot delete"' : '') + '>' +
            '<div class="hour-entry-info">' +
                '<div class="hour-entry-date">' + projectPill + formatEntryDate(entry.started_at) + ' &nbsp; ' + formatTimeRange(entry.started_at, entry.ended_at) + ' &nbsp; <strong>' + hours.toFixed(1) + 'h</strong>' + lockIcon + '</div>' +
                '<div class="hour-entry-desc">' + escapeHtml(entry.description || 'No description') + '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    updateHoursCount();
}

function updateHoursCount() {
    const selected = document.querySelectorAll('#hoursList input:checked').length;
    var totalH = 0;
    appState.fetchedEntries.forEach(function(e) { totalH += parseEntryHours(e); });
    document.getElementById('hoursCount').textContent = appState.fetchedEntries.length + ' entries, ' + totalH.toFixed(1) + 'h total' + (selected > 0 ? ', ' + selected + ' selected' : '');
}

function selectAllHours() {
    document.querySelectorAll('#hoursList input').forEach(cb => cb.checked = true);
    updateHoursCount();
}

function deselectAllHours() {
    document.querySelectorAll('#hoursList input').forEach(cb => cb.checked = false);
    updateHoursCount();
}

async function deleteSelectedHours() {
    const config = getCurrentConfig();
    const selected = Array.from(document.querySelectorAll('#hoursList input:checked')).map(cb => parseInt(cb.dataset.idx));

    if (selected.length === 0) {
        alert('No hours selected');
        return;
    }

    if (!confirm(`Delete ${selected.length} time entries? This cannot be undone.`)) return;

    let success = 0, failed = 0, invoiceLocked = 0;
    for (const idx of selected) {
        try {
            const entry = appState.fetchedEntries[idx];
            const response = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/time_entries/${entry.id}`, {
                method: 'DELETE',
                headers: { 'X-Moneybird-Token': config.token }
            });

            if (response.ok || response.status === 204) {
                success++;
            } else {
                const errBody = await response.json().catch(function() { return {}; });
                if (errBody.symbolic && (errBody.symbolic.id === 'cannot_destroy' || errBody.symbolic.id === 'forbidden')) {
                    invoiceLocked++;
                } else {
                    failed++;
                }
            }
        } catch (err) {
            console.error('Delete failed:', err);
            failed++;
        }
    }

    let msg = '';
    if (success > 0) msg += `Deleted ${success} entries. `;
    if (invoiceLocked > 0) msg += `${invoiceLocked} entries are linked to an invoice — use the Concept Invoices button to detach them first. `;
    if (failed > 0) msg += `${failed} failed for other reasons.`;
    alert(msg.trim());
    fetchExistingHours();
}

async function registerMissingDays() {
    var missing = appState.missingDates;
    if (!missing || missing.length === 0) {
        alert('No missing days to register.');
        return;
    }

    var config = getCurrentConfig();
    if (!config.token || !config.adminId || !config.userId) {
        alert('Please configure API settings first (click Settings button)');
        return;
    }

    var desc = document.getElementById('desc').value || (appState.currentHourType === 'wbso' ? 'WBSO R&D Work' : 'Consultancy uren');

    // Build entries using job schedules for facturable
    var entries = [];
    if (appState.currentHourType === 'facturable' && appState.jobs.length > 0) {
        missing.forEach(function(date) {
            var jobsForDate = getJobsForDate(date);
            jobsForDate.forEach(function(job) {
                var sched = getScheduleForJobDate(job, date);
                entries.push({
                    date: date,
                    description: job.description || desc,
                    startTime: sched.start,
                    endTime: sched.end,
                    lunch: sched.lunch,
                    projectId: job.projectId,
                    jobName: job.name
                });
            });
        });
    } else {
        var startTime = document.getElementById('startTime').value;
        var endTime = document.getElementById('endTime').value;
        var lunchChecked = document.getElementById('lunchBreak').checked;
        missing.forEach(function(date) {
            entries.push({
                date: date,
                description: desc,
                startTime: startTime,
                endTime: endTime,
                lunch: lunchChecked,
                projectId: config.projectId,
                jobName: null
            });
        });
    }

    if (entries.length === 0) {
        alert('No entries to register for missing days.');
        return;
    }

    if (!confirm('Register ' + entries.length + ' entries for ' + missing.length + ' missing day(s)?')) {
        return;
    }

    var success = 0, failed = 0;
    for (var i = 0; i < entries.length; i++) {
        try {
            await registerSingleEntry(config, entries[i].date, entries[i].description, null, null, {
                startTime: entries[i].startTime,
                endTime: entries[i].endTime,
                lunch: entries[i].lunch,
                projectId: entries[i].projectId
            });
            success++;
        } catch (err) {
            console.error('Failed to register ' + entries[i].date + ':', err);
            failed++;
        }
    }

    alert('Registration complete!\n' + success + ' succeeded' + (failed > 0 ? ', ' + failed + ' failed' : ''));
    fetchExistingHours();
}

// --- CLEANUP OPEN HOURS ---
async function fetchOpenHours() {
    var config = getCurrentConfig();
    if (!config.token || !config.adminId) {
        alert('Please configure API settings first');
        return;
    }

    document.getElementById('hoursManagementSection').style.display = 'block';
    document.getElementById('hoursList').innerHTML = '<p style="padding:20px; text-align:center;">Loading all open hours for this year...</p>';

    try {
        // Fetch all open (non-invoiced) time entries for this year, handle pagination
        var allEntries = [];
        var page = 1;
        var hasMore = true;
        while (hasMore) {
            var response = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/time_entries?filter=state:open,period:this_year&per_page=100&page=' + page, {
                headers: { 'X-Moneybird-Token': config.token }
            });

            if (!response.ok) throw new Error('API error: ' + response.status);

            var pageEntries = await response.json();
            allEntries = allEntries.concat(pageEntries);
            hasMore = pageEntries.length === 100;
            page++;
        }

        // Filter by current user
        allEntries = allEntries.filter(function(e) { return e.user_id === config.userId; });

        appState.fetchedEntries = allEntries;
        renderOpenHoursList();
    } catch (err) {
        document.getElementById('hoursList').innerHTML = '<p style="padding:20px; text-align:center; color:var(--danger);">Error: ' + err.message + '</p>';
    }
}

function renderOpenHoursList() {
    var list = document.getElementById('hoursList');
    var entries = appState.fetchedEntries;

    if (entries.length === 0) {
        list.innerHTML = '<p style="padding:20px; text-align:center; color:var(--success,#22c55e);">No open hours found -- all clean!</p>';
        document.getElementById('hoursCount').textContent = '0 open entries';
        return;
    }

    // Group by month
    var monthGroups = {};
    var totalHours = 0;
    entries.forEach(function(entry) {
        var hours = parseEntryHours(entry);
        totalHours += hours;
        var d = new Date(entry.started_at);
        var monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!monthGroups[monthKey]) monthGroups[monthKey] = { entries: [], hours: 0 };
        monthGroups[monthKey].entries.push(entry);
        monthGroups[monthKey].hours += hours;
    });

    var html = '<div style="padding:12px 16px;background:var(--danger-light,rgba(239,68,68,0.12));border:1px solid rgba(239,68,68,0.2);border-radius:8px;margin-bottom:12px;">';
    html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;">';
    html += '<div><strong style="color:var(--danger,#EF4444);">' + entries.length + ' open (non-invoiced) entries</strong></div>';
    html += '<div><strong>' + totalHours.toFixed(1) + 'h</strong> total</div>';
    html += '<div>' + Object.keys(monthGroups).length + ' month(s)</div>';
    html += '</div>';
    html += '<p style="margin:8px 0 0;font-size:0.85rem;color:var(--danger,#EF4444);">These time entries are not linked to any invoice. Select and delete duplicates.</p>';
    html += '</div>';

    // Render entries grouped by month
    var sortedMonths = Object.keys(monthGroups).sort();
    sortedMonths.forEach(function(monthKey) {
        var group = monthGroups[monthKey];
        var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var parts = monthKey.split('-');
        var label = monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0];

        html += '<div style="margin-top:12px;padding:6px 12px;background:var(--bg-elevated,#F8FAFC);border-radius:6px;font-weight:600;font-size:0.85rem;display:flex;justify-content:space-between;">';
        html += '<span>' + label + '</span>';
        html += '<span>' + group.entries.length + ' entries / ' + group.hours.toFixed(1) + 'h</span>';
        html += '</div>';

        group.entries.sort(function(a, b) {
            return new Date(a.started_at) - new Date(b.started_at);
        });

        group.entries.forEach(function(entry) {
            var idx = appState.fetchedEntries.indexOf(entry);
            var hours = parseEntryHours(entry);
            var projectName = entry.project ? entry.project.name : 'No project';
            html += '<div class="hour-entry">' +
                '<input type="checkbox" data-idx="' + idx + '" checked>' +
                '<div class="hour-entry-info">' +
                    '<div class="hour-entry-date">' + formatEntryDate(entry.started_at) + ' &nbsp; ' + formatTimeRange(entry.started_at, entry.ended_at) + ' &nbsp; <strong>' + hours.toFixed(1) + 'h</strong></div>' +
                    '<div class="hour-entry-desc">' + escapeHtml(entry.description || 'No description') + ' &nbsp; <span style="color:var(--muted);font-size:0.8rem;">(' + escapeHtml(projectName) + ')</span></div>' +
                '</div>' +
            '</div>';
        });
    });

    list.innerHTML = html;
    updateHoursCount();
}

// --- USER/PROJECT LOOKUP ---
function showPickerModal(title, items) {
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:var(--surface,#FFFFFF);border:1px solid var(--border,#E2E8F0);border-radius:12px;padding:24px;min-width:360px;max-width:500px;max-height:80vh;display:flex;flex-direction:column;color:var(--text,#0F172A);box-shadow:0 20px 40px -12px rgba(15,23,42,0.18);';

        var heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.cssText = 'margin:0 0 16px 0;font-size:1.1rem;';
        modal.appendChild(heading);

        var list = document.createElement('div');
        list.style.cssText = 'overflow-y:auto;flex:1;margin-bottom:16px;';

        items.forEach(function(item) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border,#444);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:background 0.15s;';
            row.onmouseenter = function() { row.style.background = 'rgba(137,180,250,0.15)'; };
            row.onmouseleave = function() { row.style.background = 'none'; };

            var info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';
            var nameEl = document.createElement('div');
            nameEl.textContent = item.name;
            nameEl.style.cssText = 'font-weight:600;margin-bottom:2px;';
            var idEl = document.createElement('div');
            idEl.textContent = item.id;
            idEl.style.cssText = 'font-size:0.85rem;color:var(--muted,#888);user-select:all;';
            info.appendChild(nameEl);
            info.appendChild(idEl);

            var btn = document.createElement('button');
            btn.textContent = 'Select';
            btn.style.cssText = 'margin-left:12px;padding:6px 14px;border:none;border-radius:6px;background:var(--accent,#10B981);color:#fff;font-weight:600;cursor:pointer;flex-shrink:0;';

            btn.onclick = function(e) {
                e.stopPropagation();
                document.body.removeChild(overlay);
                resolve(item.id);
            };
            row.onclick = function() {
                document.body.removeChild(overlay);
                resolve(item.id);
            };

            row.appendChild(info);
            row.appendChild(btn);
            list.appendChild(row);
        });

        modal.appendChild(list);

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 20px;border:1px solid var(--border,#E2E8F0);border-radius:6px;background:transparent;color:var(--text-secondary,#475569);cursor:pointer;align-self:flex-end;';
        cancelBtn.onclick = function() {
            document.body.removeChild(overlay);
            resolve(null);
        };
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(null);
            }
        };
        document.body.appendChild(overlay);
    });
}

async function fetchUsers(type) {
    const config = type === 'bv' ? {
        token: document.getElementById('apiTokenBV').value,
        adminId: document.getElementById('adminIdBV').value
    } : {
        token: document.getElementById('apiTokenHolding').value,
        adminId: document.getElementById('adminIdHolding').value
    };

    if (!config.token || !config.adminId) {
        alert('Please fill in API Token and Admin ID first');
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/users`, {
            headers: { 'X-Moneybird-Token': config.token }
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const users = await response.json();
        const items = users.map(function(u) { return { name: u.name, id: String(u.id) }; });
        const userId = await showPickerModal('Select User', items);

        if (userId) {
            document.getElementById(type === 'bv' ? 'userIdBV' : 'userIdHolding').value = userId;
            saveConfig();
        }
    } catch (err) {
        alert('Error fetching users: ' + err.message);
    }
}

async function fetchProjects(type) {
    const config = type === 'bv' ? {
        token: document.getElementById('apiTokenBV').value,
        adminId: document.getElementById('adminIdBV').value
    } : {
        token: document.getElementById('apiTokenHolding').value,
        adminId: document.getElementById('adminIdHolding').value
    };

    if (!config.token || !config.adminId) {
        alert('Please fill in API Token and Admin ID first');
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/projects`, {
            headers: { 'X-Moneybird-Token': config.token }
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const projects = await response.json();
        const activeProjects = projects.filter(function(p) { return p.state === 'active'; });
        const items = activeProjects.map(function(p) { return { name: p.name, id: String(p.id) }; });
        const projectId = await showPickerModal('Select Project', items);

        if (projectId) {
            document.getElementById(type === 'bv' ? 'projectIdBV' : 'projectIdHolding').value = projectId;
            saveConfig();
        }
    } catch (err) {
        alert('Error fetching projects: ' + err.message);
    }
}

// --- QUICK PROJECT PICKER ---
var projectCache = { bv: null, holding: null };

async function loadProjectPicker() {
    var type = appState.currentHourType === 'wbso' ? 'holding' : 'bv';
    var container = document.getElementById('projectPicker');
    if (!container) return;

    var token = document.getElementById(type === 'bv' ? 'apiTokenBV' : 'apiTokenHolding').value;
    var adminId = document.getElementById(type === 'bv' ? 'adminIdBV' : 'adminIdHolding').value;
    var currentProjectId = document.getElementById(type === 'bv' ? 'projectIdBV' : 'projectIdHolding').value;

    if (!token || !adminId) {
        container.innerHTML = '<span class="text-sm text-muted">Configure API settings first</span>';
        return;
    }

    // Use cache if available
    var cacheKey = type;
    if (!projectCache[cacheKey]) {
        container.innerHTML = '<span class="text-sm text-muted">Loading...</span>';
        try {
            var response = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + adminId + '/projects', {
                headers: { 'X-Moneybird-Token': token }
            });
            if (!response.ok) throw new Error('API error: ' + response.status);
            var projects = await response.json();
            projectCache[cacheKey] = projects.filter(function(p) { return p.state === 'active'; });
        } catch (err) {
            container.innerHTML = '<span class="text-sm text-muted">Failed to load projects</span>';
            return;
        }
    }

    var projects = projectCache[cacheKey];
    container.innerHTML = '';

    // "None" button
    var noneBtn = document.createElement('button');
    noneBtn.className = 'project-btn' + (!currentProjectId ? ' active' : '');
    noneBtn.textContent = 'None';
    noneBtn.onclick = function() { selectQuickProject('', type); };
    container.appendChild(noneBtn);

    projects.forEach(function(p) {
        var btn = document.createElement('button');
        btn.className = 'project-btn' + (currentProjectId === String(p.id) ? ' active' : '');
        btn.textContent = p.name;
        btn.title = 'ID: ' + p.id;
        btn.onclick = function() { selectQuickProject(String(p.id), type); };
        container.appendChild(btn);
    });
}

function selectQuickProject(projectId, type) {
    var inputId = type === 'bv' ? 'projectIdBV' : 'projectIdHolding';
    document.getElementById(inputId).value = projectId;
    saveConfig();
    // Update button states
    var container = document.getElementById('projectPicker');
    container.querySelectorAll('.project-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    // Find the clicked one by matching project id
    var buttons = container.querySelectorAll('.project-btn');
    buttons.forEach(function(btn) {
        var btnProjId = btn.title ? btn.title.replace('ID: ', '') : '';
        if (btnProjId === projectId || (!projectId && btn.textContent === 'None')) {
            btn.classList.add('active');
        }
    });
}

// --- CONCEPT INVOICES ---
async function fetchConceptInvoices() {
    var config = getCurrentConfig();
    if (!config.token || !config.adminId) {
        alert('Please configure API settings first');
        return;
    }

    var section = document.getElementById('conceptInvoicesSection');
    section.style.display = 'block';
    var list = document.getElementById('conceptInvoicesList');
    list.innerHTML = '<p class="invoice-loading">Loading concept invoices...</p>';

    try {
        var allInvoices = [];
        var page = 1;
        var hasMore = true;
        while (hasMore) {
            var response = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/sales_invoices?filter=state:draft&per_page=100&page=' + page, {
                headers: { 'X-Moneybird-Token': config.token }
            });
            if (!response.ok) throw new Error('API error: ' + response.status);
            var pageInvoices = await response.json();
            allInvoices = allInvoices.concat(pageInvoices);
            hasMore = pageInvoices.length === 100;
            page++;
        }

        // List endpoint omits time_entry_ids — fetch each invoice individually for full details
        list.innerHTML = '<p class="invoice-loading">Loading details for ' + allInvoices.length + ' invoice(s)...</p>';
        var fullInvoices = [];
        for (var i = 0; i < allInvoices.length; i++) {
            try {
                var detailResp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/sales_invoices/' + allInvoices[i].id, {
                    headers: { 'X-Moneybird-Token': config.token }
                });
                if (detailResp.ok) {
                    fullInvoices.push(await detailResp.json());
                } else {
                    fullInvoices.push(allInvoices[i]);
                }
            } catch (e) {
                fullInvoices.push(allInvoices[i]);
            }
        }

        appState.conceptInvoices = fullInvoices;
        renderConceptInvoicesList();
    } catch (err) {
        list.innerHTML = '<p class="invoice-error">Error: ' + escapeHtml(err.message) + '</p>';
    }
}

function renderConceptInvoicesList() {
    var list = document.getElementById('conceptInvoicesList');
    var invoices = appState.conceptInvoices || [];

    document.getElementById('conceptInvoiceCount').textContent = invoices.length + ' concept invoice' + (invoices.length !== 1 ? 's' : '');

    if (invoices.length === 0) {
        list.innerHTML = '<p class="invoice-empty">No concept invoices found</p>';
        return;
    }

    var html = '<div class="concept-invoice-list">';
    invoices.forEach(function(inv, idx) {
        var contactName = (inv.contact && inv.contact.company_name) ? inv.contact.company_name : (inv.contact ? inv.contact.firstname + ' ' + inv.contact.lastname : 'Unknown');
        var totalPrice = inv.total_price_incl_tax_base ? parseFloat(inv.total_price_incl_tax_base).toFixed(2) : '0.00';
        var detailCount = inv.details ? inv.details.length : 0;
        var timeEntryCount = 0;
        if (inv.details) {
            inv.details.forEach(function(d) {
                if (d.time_entry_ids && d.time_entry_ids.length > 0) {
                    timeEntryCount += d.time_entry_ids.length;
                }
            });
        }
        var invoiceDate = inv.invoice_date || inv.created_at || '';
        if (invoiceDate && invoiceDate.length > 10) invoiceDate = invoiceDate.substring(0, 10);

        html += '<article class="invoice-card">';
        html += '<button type="button" class="invoice-card-header" onclick="toggleInvoiceDetails(' + idx + ')">';
        html += '<div class="invoice-card-main">';
        html += '<div class="invoice-customer">' + escapeHtml(contactName) + '</div>';
        html += '<div class="invoice-meta">';
        html += (inv.invoice_id ? '#' + inv.invoice_id : 'Draft') + ' &middot; ' + invoiceDate + ' &middot; ' + detailCount + ' line(s)';
        if (timeEntryCount > 0) html += ' &middot; ' + timeEntryCount + ' time entries';
        html += '</div>';
        html += '</div>';
        html += '<div class="invoice-card-right">';
        html += '<span class="invoice-total">EUR ' + escapeHtml(totalPrice) + '</span>';
        html += '<span class="invoice-chevron" id="invoiceChevron' + idx + '">&#9660;</span>';
        html += '</div>';
        html += '</button>';

        // Detail lines (collapsed by default)
        html += '<div id="invoiceDetails' + idx + '" class="invoice-details" hidden>';
        html += '<div class="invoice-actions">';
        html += '<button class="btn btn-sm btn-secondary" onclick="linkHoursToInvoice(' + idx + ')">+ Add Hours</button>';
        if (inv.details && inv.details.length > 0) {
            html += '<button class="btn btn-sm btn-ghost" onclick="selectAllInvoiceLines(' + idx + ')">Select All</button>';
            html += '<button class="btn btn-sm btn-ghost" onclick="deselectAllInvoiceLines(' + idx + ')">Deselect All</button>';
            html += '<button class="btn btn-sm btn-ghost" onclick="detachSelectedLines(' + idx + ')">Detach Selected</button>';
        }
        html += '<button class="btn btn-sm btn-danger" onclick="deleteConceptInvoice(' + idx + ')">Delete Invoice</button>';
        html += '</div>';
        if (inv.details && inv.details.length > 0) {
            html += '<div class="invoice-lines-wrap">';
            html += '<table class="invoice-lines-table">';
            html += '<thead><tr><th></th><th>Description</th><th>Qty</th><th>Rate</th><th>Period</th><th>Links</th><th></th></tr></thead><tbody>';
            inv.details.forEach(function(detail, dIdx) {
                var desc = detail.description || 'No description';
                var qty = detail.amount || '';
                var price = detail.price ? parseFloat(detail.price).toFixed(2) : '0.00';
                var period = detail.period || '';
                var hasTimeEntries = detail.time_entry_ids && detail.time_entry_ids.length > 0;
                var teCount = hasTimeEntries ? detail.time_entry_ids.length : 0;

                html += '<tr data-inv-row="' + idx + '" data-detail-idx="' + dIdx + '">';
                html += '<td><input type="checkbox" data-inv="' + idx + '" data-detail="' + dIdx + '" class="inv-line-cb"></td>';
                html += '<td class="invoice-line-desc">' + escapeHtml(desc) + '</td>';
                html += '<td class="invoice-line-num" data-cell="qty">' + escapeHtml(String(qty)) + '</td>';
                html += '<td class="invoice-line-num" data-cell="rate">EUR ' + escapeHtml(price) + '</td>';
                html += '<td class="invoice-line-period">' + escapeHtml(period || '-') + '</td>';
                html += '<td class="invoice-line-links" data-cell="links">' + (hasTimeEntries ? teCount + ' linked' : '-') + '</td>';
                html += '<td class="invoice-line-action"><button type="button" class="btn btn-sm btn-secondary" onclick="billLineFromTimeEntries(' + idx + ', ' + dIdx + ')" title="Attach all time entries linked to this invoice to THIS line so Moneybird recomputes qty + rate">Bill from linked hours</button></td>';
                html += '</tr>';
            });
            html += '</tbody></table></div>';
        } else {
            html += '<p class="invoice-no-lines">No detail lines</p>';
        }
        // Linked time entries section (lazy-loaded on expand)
        html += '<div class="invoice-linked-section" id="invoiceLinked' + idx + '">';
        html += '<h5 class="invoice-linked-title">Linked time entries</h5>';
        html += '<div class="invoice-linked-body" data-loaded="0">Open to load...</div>';
        html += '</div>';
        html += '</div>';
        html += '</article>';
    });
    html += '</div>';

    list.innerHTML = html;
}

function toggleInvoiceDetails(idx) {
    var details = document.getElementById('invoiceDetails' + idx);
    var chevron = document.getElementById('invoiceChevron' + idx);
    if (details.hidden) {
        details.hidden = false;
        chevron.classList.add('is-open');
        // Lazy-load linked time entries the first time this invoice is expanded.
        var section = document.getElementById('invoiceLinked' + idx);
        if (section) {
            var body = section.querySelector('.invoice-linked-body');
            if (body && body.dataset.loaded !== '1') {
                loadInvoiceLinkedEntries(idx).catch(function(e) { console.error(e); });
            }
        }
    } else {
        details.hidden = true;
        chevron.classList.remove('is-open');
    }
}

// Fetch all time entries currently linked to this concept invoice and render them
// under the invoice details panel. Caches result on appState.
async function loadInvoiceLinkedEntries(idx) {
    var inv = appState.conceptInvoices[idx];
    if (!inv) return;
    var section = document.getElementById('invoiceLinked' + idx);
    if (!section) return;
    var body = section.querySelector('.invoice-linked-body');
    body.innerHTML = 'Loading...';
    var config = getCurrentConfig();
    try {
        var resp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/time_entries?filter=sales_invoice_id:' + inv.id + '&per_page=100', {
            headers: { 'X-Moneybird-Token': config.token }
        });
        if (!resp.ok) throw new Error('API ' + resp.status);
        var entries = await resp.json();
        // Cache so billLineFromTimeEntries can grab the ids without refetching.
        inv.__linkedEntries = entries;
        body.dataset.loaded = '1';
        if (!entries || entries.length === 0) {
            body.innerHTML = '<p class="invoice-linked-empty">No time entries are linked to this invoice yet. Use <strong>+ Add Hours</strong> above.</p>';
            return;
        }
        var jobs = (window.appState && Array.isArray(appState.jobs)) ? appState.jobs : [];
        // Group by project for a quick at-a-glance summary.
        var byProject = {};
        var totalH = 0;
        entries.forEach(function(e) {
            var pid = e.project_id || (e.project && e.project.id) || '_none';
            var pidStr = String(pid);
            var matchJob = jobs.find(function(j) { return String(j.projectId || '') === pidStr; });
            var name = matchJob ? matchJob.name : ((e.project && e.project.name) || 'No project');
            var color = matchJob ? matchJob.color : null;
            var hours = 0;
            if (e.started_at && e.ended_at) {
                hours = (new Date(e.ended_at) - new Date(e.started_at)) / 3600000;
                if (e.paused_duration) hours -= e.paused_duration / 3600;
            }
            totalH += hours;
            if (!byProject[pidStr]) byProject[pidStr] = { name: name, color: color, count: 0, hours: 0 };
            byProject[pidStr].count++;
            byProject[pidStr].hours += hours;
        });
        var summary = '<div class="invoice-linked-summary">';
        summary += '<strong>' + entries.length + ' time entr' + (entries.length === 1 ? 'y' : 'ies') + '</strong> &middot; ' + totalH.toFixed(1) + 'h total';
        Object.keys(byProject).forEach(function(k) {
            var p = byProject[k];
            var style = p.color ? ' style="background:' + p.color + ';"' : '';
            var cls = 'hour-entry-pill' + (p.color ? '' : ' hour-entry-pill-unknown');
            summary += ' <span class="' + cls + '"' + style + '>' + escapeHtml(p.name) + ' ' + p.count + ' / ' + p.hours.toFixed(1) + 'h</span>';
        });
        summary += '</div>';
        // Sorted entry list, newest first.
        var sorted = entries.slice().sort(function(a, b) {
            var da = (a.started_at || '').substring(0, 10);
            var db = (b.started_at || '').substring(0, 10);
            if (da !== db) return da < db ? 1 : -1;
            return 0;
        });
        var rows = '<table class="invoice-linked-table"><thead><tr><th>Date</th><th>Hours</th><th>Project</th><th>Description</th></tr></thead><tbody>';
        sorted.forEach(function(e) {
            var date = (e.started_at || '').substring(0, 10);
            var pid = e.project_id || (e.project && e.project.id) || '';
            var matchJob = jobs.find(function(j) { return String(j.projectId || '') === String(pid); });
            var name = matchJob ? matchJob.name : ((e.project && e.project.name) || 'No project');
            var color = matchJob ? matchJob.color : null;
            var hours = 0;
            if (e.started_at && e.ended_at) {
                hours = (new Date(e.ended_at) - new Date(e.started_at)) / 3600000;
                if (e.paused_duration) hours -= e.paused_duration / 3600;
            }
            var pillStyle = color ? ' style="background:' + color + ';"' : '';
            var pillCls = 'hour-entry-pill' + (color ? '' : ' hour-entry-pill-unknown');
            rows += '<tr>';
            rows += '<td>' + escapeHtml(date) + '</td>';
            rows += '<td>' + hours.toFixed(1) + 'h</td>';
            rows += '<td><span class="' + pillCls + '"' + pillStyle + '>' + escapeHtml(name) + '</span></td>';
            rows += '<td>' + escapeHtml(e.description || '-') + '</td>';
            rows += '</tr>';
        });
        rows += '</tbody></table>';
        body.innerHTML = summary + rows;
        // Annotate detail line cells with the preview that Bill from linked hours would apply.
        annotateInvoiceLinesWithPreview(idx);
    } catch (err) {
        body.innerHTML = '<p class="invoice-linked-error">Error loading linked entries: ' + escapeHtml(err.message) + '</p>';
    }
}

// Show 'qty -> 140.0', 'EUR 0.00 -> 107.50', 'N (preview)' on each unbilled line
// of an invoice once we have its linked time entries cached.
function annotateInvoiceLinesWithPreview(idx) {
    var inv = appState.conceptInvoices[idx];
    if (!inv || !inv.__linkedEntries || inv.__linkedEntries.length === 0) return;
    var jobs = (window.appState && Array.isArray(appState.jobs)) ? appState.jobs : [];
    var totalHours = 0;
    var rateBuckets = {};
    inv.__linkedEntries.forEach(function(e) {
        var h = 0;
        if (e.started_at && e.ended_at) {
            h = (new Date(e.ended_at) - new Date(e.started_at)) / 3600000;
            if (e.paused_duration) h -= e.paused_duration / 3600;
        }
        totalHours += h;
        var pid = e.project_id || (e.project && e.project.id) || '';
        var matchJob = jobs.find(function(j) { return String(j.projectId || '') === String(pid); });
        var rate = matchJob && matchJob.hourlyRate ? matchJob.hourlyRate : 0;
        if (!rateBuckets[rate]) rateBuckets[rate] = 0;
        rateBuckets[rate] += h;
    });
    // Use the rate carrying the most hours as the representative rate.
    var bestRate = 0, bestHours = -1;
    Object.keys(rateBuckets).forEach(function(r) {
        if (rateBuckets[r] > bestHours) { bestHours = rateBuckets[r]; bestRate = parseFloat(r); }
    });
    var entryCount = inv.__linkedEntries.length;
    var rows = document.querySelectorAll('tr[data-inv-row="' + idx + '"]');
    rows.forEach(function(tr) {
        var dIdx = parseInt(tr.dataset.detailIdx, 10);
        var detail = inv.details && inv.details[dIdx];
        if (!detail) return;
        // Only annotate lines that aren't billed from time entries yet.
        if (detail.time_entry_ids && detail.time_entry_ids.length > 0) return;
        var qtyCell = tr.querySelector('[data-cell="qty"]');
        var rateCell = tr.querySelector('[data-cell="rate"]');
        var linksCell = tr.querySelector('[data-cell="links"]');
        if (qtyCell) qtyCell.innerHTML = escapeHtml(String(detail.amount || '1')) + ' <span class="invoice-line-preview">&rarr; ' + totalHours.toFixed(1) + '</span>';
        if (rateCell) {
            var currentRate = detail.price ? parseFloat(detail.price).toFixed(2) : '0.00';
            if (bestRate > 0) {
                rateCell.innerHTML = 'EUR ' + currentRate + ' <span class="invoice-line-preview">&rarr; ' + bestRate.toFixed(2) + '</span>';
            }
        }
        if (linksCell) linksCell.innerHTML = entryCount + ' <span class="invoice-line-preview">(preview)</span>';
    });
}

// Attach all time entries currently linked to the invoice to a specific detail line
// so Moneybird recomputes qty + rate from the entries instead of the manual values.
async function billLineFromTimeEntries(invIdx, dIdx) {
    var config = getCurrentConfig();
    var inv = appState.conceptInvoices[invIdx];
    if (!inv || !inv.details || !inv.details[dIdx]) return;
    var detail = inv.details[dIdx];
    var linked = inv.__linkedEntries;
    if (!linked) {
        // Make sure we have them.
        await loadInvoiceLinkedEntries(invIdx);
        linked = inv.__linkedEntries;
    }
    if (!linked || linked.length === 0) {
        alert('No time entries are linked to this invoice yet. Use + Add Hours first.');
        return;
    }
    var ids = linked.map(function(e) { return String(e.id); });
    var totalH = 0;
    linked.forEach(function(e) {
        if (e.started_at && e.ended_at) {
            var h = (new Date(e.ended_at) - new Date(e.started_at)) / 3600000;
            if (e.paused_duration) h -= e.paused_duration / 3600;
            totalH += h;
        }
    });
    var msg = 'Bill ' + ids.length + ' linked time entries (' + totalH.toFixed(1) + 'h) on the line:\n\n'
        + '"' + (detail.description || '-') + '"\n\n'
        + 'Moneybird will replace the line\'s qty + rate with values derived from the linked time entries (qty = sum of hours, rate = project hourly rate). Continue?';
    if (!confirm(msg)) return;
    try {
        var resp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/sales_invoices/' + inv.id, {
            method: 'PATCH',
            headers: { 'X-Moneybird-Token': config.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales_invoice: { details_attributes: [ { id: detail.id, time_entry_ids: ids } ] } })
        });
        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error('API ' + resp.status + ': ' + errText);
        }
        // Refresh the invoices list so qty + rate update.
        await fetchConceptInvoices();
    } catch (err) {
        alert('Could not update the invoice line: ' + err.message);
    }
}

// Persistent map: invoice contactId -> [projectId, ...] so the picker remembers
// which projects (e.g. DNB project) belong to which broker invoice (e.g. Wortell).
function getInvoiceProjectMap() {
    try { return JSON.parse(localStorage.getItem('mb3_invoice_project_map') || '{}'); }
    catch (e) { return {}; }
}
function rememberInvoiceProjects(contactId, projectIds) {
    if (!contactId || !projectIds || projectIds.length === 0) return;
    var map = getInvoiceProjectMap();
    var existing = map[contactId] || [];
    projectIds.forEach(function(pid) { if (pid && existing.indexOf(pid) === -1) existing.push(pid); });
    map[contactId] = existing;
    try { localStorage.setItem('mb3_invoice_project_map', JSON.stringify(map)); } catch (e) {}
}

async function linkHoursToInvoice(invIdx) {
    var config = getCurrentConfig();
    var invoice = appState.conceptInvoices[invIdx];
    if (!invoice) return;

    var contactId = invoice.contact_id || (invoice.contact && invoice.contact.id) || null;
    var contactName = (invoice.contact && invoice.contact.company_name) ? invoice.contact.company_name : 'this contact';

    // Fetch open (non-invoiced) time entries
    try {
        var allEntries = [];
        var page = 1;
        var hasMore = true;
        while (hasMore) {
            var resp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/time_entries?filter=state:open&per_page=100&page=' + page, {
                headers: { 'X-Moneybird-Token': config.token }
            });
            if (!resp.ok) throw new Error('API error: ' + resp.status);
            var pageEntries = await resp.json();
            allEntries = allEntries.concat(pageEntries);
            hasMore = pageEntries.length === 100;
            page++;
        }

        if (allEntries.length === 0) {
            alert('No open (non-invoiced) time entries found.');
            return;
        }

        // Resolve each entry to a project (job pill) and figure out what should be auto-checked.
        var jobs = (window.appState && Array.isArray(appState.jobs)) ? appState.jobs : [];
        var projectMap = getInvoiceProjectMap();
        var rememberedProjects = projectMap[contactId] || [];
        var directContactMatch = allEntries.some(function(e) { return e.contact_id === contactId; });

        var items = allEntries.map(function(e) {
            var date = e.started_at ? e.started_at.substring(0, 10) : '';
            var hours = 0;
            if (e.started_at && e.ended_at) {
                hours = (new Date(e.ended_at) - new Date(e.started_at)) / 3600000;
                if (e.paused_duration) hours -= e.paused_duration / 3600;
            }
            var pid = e.project_id || (e.project && e.project.id) || null;
            var pidStr = pid != null ? String(pid) : '';
            var matchJob = jobs.find(function(j) { return String(j.projectId || '') === pidStr; });
            var projectName = matchJob ? matchJob.name : ((e.project && e.project.name) || (pidStr ? 'Project ' + pidStr : 'No project'));
            var projectColor = matchJob ? matchJob.color : null;
            // Auto-check if: a) entry contact matches invoice contact directly, OR
            //               b) entry project was previously linked to this contact.
            var match = (e.contact_id && e.contact_id === contactId)
                     || (pidStr && rememberedProjects.indexOf(pidStr) !== -1);
            return {
                id: e.id,
                date: date,
                hours: hours,
                desc: e.description || '',
                projectId: pidStr,
                projectName: projectName,
                projectColor: projectColor,
                match: match
            };
        });

        // Sort: matches first, then by date descending (newest first), then by project name.
        items.sort(function(a, b) {
            if (a.match !== b.match) return a.match ? -1 : 1;
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return a.projectName.localeCompare(b.projectName);
        });

        // Show picker modal
        var pickerTitle = 'Add hours to ' + contactName;
        if (!directContactMatch && rememberedProjects.length === 0) {
            pickerTitle += ' (no auto-match - filter by project below)';
        }
        var selected = await showTimeEntryPicker(pickerTitle, items);
        if (!selected || selected.length === 0) return;

        // Remember which projects the user picked for this invoice contact.
        var pickedProjectIds = [];
        selected.forEach(function(id) {
            var item = items.find(function(it) { return it.id === id; });
            if (item && item.projectId) pickedProjectIds.push(item.projectId);
        });
        rememberInvoiceProjects(contactId, pickedProjectIds);

        // Link each selected time entry to this invoice
        var success = 0;
        var failed = 0;
        for (var i = 0; i < selected.length; i++) {
            try {
                var linkResp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/time_entries/' + selected[i], {
                    method: 'PATCH',
                    headers: {
                        'X-Moneybird-Token': config.token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ time_entry: { sales_invoice_id: String(invoice.id) } })
                });
                if (linkResp.ok) {
                    success++;
                } else {
                    failed++;
                    var errText = await linkResp.text();
                    console.error('Link failed for ' + selected[i] + ':', errText);
                }
            } catch (err) {
                failed++;
                console.error('Link error for ' + selected[i] + ':', err);
            }
        }

        var msg = 'Linked ' + success + ' time entr' + (success === 1 ? 'y' : 'ies') + ' to invoice';
        if (failed > 0) msg += ', ' + failed + ' failed';
        msg += '.\n\nThe link is set on the time entries, but the invoice line still shows its original qty/rate. Expand the invoice and click "Bill from linked hours" on the line to roll the hours into the total.';
        alert(msg);
        fetchConceptInvoices();
    } catch (err) {
        alert('Error fetching time entries: ' + err.message);
    }
}

function showTimeEntryPicker(title, items) {
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.className = 'te-picker-overlay';

        var modal = document.createElement('div');
        modal.className = 'te-picker-modal';

        var heading = document.createElement('h3');
        heading.textContent = title;
        heading.className = 'te-picker-title';
        modal.appendChild(heading);

        var selectBar = document.createElement('div');
        selectBar.className = 'te-picker-selectbar';
        var selAllBtn = document.createElement('button');
        selAllBtn.textContent = 'Select All';
        selAllBtn.className = 'btn btn-sm btn-ghost';
        selAllBtn.onclick = function() { modal.querySelectorAll('.te-pick-cb').forEach(function(cb) { cb.checked = true; }); };
        var desAllBtn = document.createElement('button');
        desAllBtn.textContent = 'Deselect All';
        desAllBtn.className = 'btn btn-sm btn-ghost';
        desAllBtn.onclick = function() { modal.querySelectorAll('.te-pick-cb').forEach(function(cb) { cb.checked = false; }); };
        selectBar.appendChild(selAllBtn);
        selectBar.appendChild(desAllBtn);
        modal.appendChild(selectBar);

        var list = document.createElement('div');
        list.className = 'te-picker-list';

        // Build a set of unique projects present in the items (for filter chips).
        var projectsInItems = {};
        items.forEach(function(it) {
            var key = it.projectId || '_none';
            if (!projectsInItems[key]) {
                projectsInItems[key] = { id: key, name: it.projectName, color: it.projectColor, count: 0, hours: 0 };
            }
            projectsInItems[key].count++;
            projectsInItems[key].hours += it.hours;
        });

        if (items.length > 0) {
            var filterRow = document.createElement('div');
            filterRow.className = 'te-picker-filterbar';
            var allChip = document.createElement('button');
            allChip.type = 'button';
            allChip.className = 'te-picker-chip te-picker-chip-active';
            allChip.dataset.filter = '_all';
            allChip.textContent = 'All (' + items.length + ')';
            filterRow.appendChild(allChip);
            Object.keys(projectsInItems).forEach(function(key) {
                var p = projectsInItems[key];
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'te-picker-chip';
                chip.dataset.filter = key;
                chip.textContent = p.name + ' (' + p.count + ' / ' + p.hours.toFixed(1) + 'h)';
                if (p.color) {
                    chip.style.borderColor = p.color;
                    chip.style.setProperty('--chip-accent', p.color);
                }
                filterRow.appendChild(chip);
            });
            modal.appendChild(filterRow);
            filterRow.addEventListener('click', function(ev) {
                var btn = ev.target.closest('.te-picker-chip');
                if (!btn) return;
                filterRow.querySelectorAll('.te-picker-chip').forEach(function(c) { c.classList.remove('te-picker-chip-active'); });
                btn.classList.add('te-picker-chip-active');
                var filter = btn.dataset.filter;
                modal.querySelectorAll('.te-picker-row').forEach(function(tr) {
                    if (filter === '_all') tr.style.display = '';
                    else tr.style.display = (tr.dataset.project === filter) ? '' : 'none';
                });
            });
        }

        if (items.length === 0) {
            list.innerHTML = '<p class="te-picker-empty">No open time entries found</p>';
        } else {
            var html = '<table class="te-picker-table">';
            html += '<thead><tr><th></th><th>Date</th><th>Hours</th><th>Project</th><th>Description</th></tr></thead><tbody>';
            items.forEach(function(item) {
                var rowCls = 'te-picker-row' + (item.match ? '' : ' te-picker-mismatch');
                html += '<tr class="' + rowCls + '" data-project="' + escapeHtml(item.projectId || '_none') + '">';
                html += '<td><input type="checkbox" class="te-pick-cb" data-id="' + item.id + '"' + (item.match ? ' checked' : '') + '></td>';
                html += '<td class="te-picker-date">' + escapeHtml(item.date) + '</td>';
                html += '<td class="te-picker-hours">' + item.hours.toFixed(1) + 'h</td>';
                if (item.projectColor) {
                    html += '<td class="te-picker-project"><span class="hour-entry-pill" style="background:' + escapeHtml(item.projectColor) + ';">' + escapeHtml(item.projectName) + '</span></td>';
                } else {
                    html += '<td class="te-picker-project"><span class="hour-entry-pill hour-entry-pill-unknown">' + escapeHtml(item.projectName) + '</span></td>';
                }
                html += '<td class="te-picker-desc">' + escapeHtml(item.desc || '-') + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
            list.innerHTML = html;
        }
        modal.appendChild(list);

        // Select All / Deselect All respect the current filter (only visible rows).
        selAllBtn.onclick = function() {
            modal.querySelectorAll('.te-picker-row').forEach(function(tr) {
                if (tr.style.display !== 'none') {
                    var cb = tr.querySelector('.te-pick-cb');
                    if (cb) cb.checked = true;
                }
            });
        };
        desAllBtn.onclick = function() {
            modal.querySelectorAll('.te-picker-row').forEach(function(tr) {
                if (tr.style.display !== 'none') {
                    var cb = tr.querySelector('.te-pick-cb');
                    if (cb) cb.checked = false;
                }
            });
        };

        var btnRow = document.createElement('div');
        btnRow.className = 'te-picker-actions';
        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'btn btn-ghost';
        cancelBtn.onclick = function() { document.body.removeChild(overlay); resolve(null); };
        var addBtn = document.createElement('button');
        addBtn.textContent = 'Add Selected';
        addBtn.className = 'btn btn-primary';
        addBtn.onclick = function() {
            var ids = [];
            modal.querySelectorAll('.te-pick-cb:checked').forEach(function(cb) { ids.push(cb.dataset.id); });
            document.body.removeChild(overlay);
            resolve(ids);
        };
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(addBtn);
        modal.appendChild(btnRow);

        overlay.appendChild(modal);
        overlay.onclick = function(e) { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } };
        document.body.appendChild(overlay);
    });
}

function selectAllInvoiceLines(invIdx) {
    document.querySelectorAll('.inv-line-cb[data-inv="' + invIdx + '"]').forEach(function(cb) {
        if (!cb.disabled) cb.checked = true;
    });
}

function deselectAllInvoiceLines(invIdx) {
    document.querySelectorAll('.inv-line-cb[data-inv="' + invIdx + '"]').forEach(function(cb) {
        cb.checked = false;
    });
}

async function detachSelectedLines(invIdx) {
    var config = getCurrentConfig();
    var invoice = appState.conceptInvoices[invIdx];
    if (!invoice || !invoice.details) return;

    var selectedCbs = document.querySelectorAll('.inv-line-cb[data-inv="' + invIdx + '"]:checked');
    if (selectedCbs.length === 0) {
        alert('No lines selected');
        return;
    }

    // Collect detail IDs to destroy from the invoice
    var detailsToDestroy = [];
    var totalTimeEntries = 0;
    selectedCbs.forEach(function(cb) {
        var dIdx = parseInt(cb.dataset.detail);
        var detail = invoice.details[dIdx];
        if (detail && detail.id) {
            detailsToDestroy.push(detail.id);
            if (detail.time_entry_ids) totalTimeEntries += detail.time_entry_ids.length;
        }
    });

    if (detailsToDestroy.length === 0) {
        alert('No lines to detach');
        return;
    }

    var msg = 'Remove ' + detailsToDestroy.length + ' line(s) from this invoice?';
    if (totalTimeEntries > 0) msg += '\n\n' + totalTimeEntries + ' time entr' + (totalTimeEntries === 1 ? 'y' : 'ies') + ' will become open (unlinked) again.';
    if (!confirm(msg)) return;

    // PATCH the invoice: destroy selected detail lines
    var detailsAttributes = detailsToDestroy.map(function(detailId) {
        return { id: detailId, _destroy: true };
    });

    try {
        var resp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/sales_invoices/' + invoice.id, {
            method: 'PATCH',
            headers: {
                'X-Moneybird-Token': config.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sales_invoice: { details_attributes: detailsAttributes } })
        });
        if (resp.ok) {
            alert('Removed ' + detailsToDestroy.length + ' line(s) from invoice. Time entries are now open.');
        } else {
            var errBody = await resp.text();
            alert('Failed to update invoice: ' + resp.status + '\n' + errBody);
        }
    } catch (err) {
        alert('Error updating invoice: ' + err.message);
    }

    // Refresh the invoices list
    fetchConceptInvoices();
}

async function deleteConceptInvoice(invIdx) {
    var config = getCurrentConfig();
    var invoice = appState.conceptInvoices[invIdx];
    if (!invoice) return;

    var contactName = (invoice.contact && invoice.contact.company_name) ? invoice.contact.company_name : 'Unknown';
    if (!confirm('Delete concept invoice for ' + contactName + '?\n\nThis will unlink all time entries and delete the invoice. The time entries will become open again.')) {
        return;
    }

    try {
        var resp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/sales_invoices/' + invoice.id, {
            method: 'DELETE',
            headers: { 'X-Moneybird-Token': config.token }
        });

        if (resp.ok || resp.status === 204) {
            alert('Invoice deleted. Time entries are now open.');
            fetchConceptInvoices();
        } else {
            var errText = await resp.text();
            alert('Failed to delete invoice: ' + resp.status + '\n' + errText);
        }
    } catch (err) {
        alert('Error deleting invoice: ' + err.message);
    }
}
