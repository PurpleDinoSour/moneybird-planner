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

    // Build entries: multi-job for facturable, single entry for WBSO
    var entries = [];

    if (appState.currentHourType === 'facturable' && appState.jobs.length > 0) {
        dates.forEach(function(date) {
            var jobsForDate = getJobsForDate(date);
            jobsForDate.forEach(function(job) {
                var sched = getScheduleForJobDate(job, date);
                entries.push({
                    date: date,
                    description: job.description || baseDesc,
                    startTime: sched.start,
                    endTime: sched.end,
                    lunch: sched.lunch,
                    projectId: job.projectId,
                    jobName: job.name
                });
            });
        });
    } else {
        var fullDesc = baseDesc;
        if (gitInfo) fullDesc += ' | ' + gitInfo;
        if (wbsoComment) fullDesc += ' | ' + wbsoComment;

        dates.forEach(function(date) {
            entries.push({
                date: date,
                description: fullDesc,
                startTime: document.getElementById('startTime').value,
                endTime: document.getElementById('endTime').value,
                lunch: document.getElementById('lunchBreak').checked,
                projectId: config.projectId,
                jobName: null
            });
        });
    }

    if (entries.length === 0) {
        alert('No entries to register.');
        return;
    }

    // Confirmation
    var confirmMsg = 'Register ' + entries.length + ' time entries across ' + dates.length + ' days?';
    if (appState.currentHourType === 'facturable' && appState.jobs.length > 0) {
        var jobCounts = {};
        entries.forEach(function(e) {
            var name = e.jobName || 'Default';
            if (!jobCounts[name]) jobCounts[name] = 0;
            jobCounts[name]++;
        });
        confirmMsg += '\n\nBreakdown:';
        Object.keys(jobCounts).forEach(function(name) {
            confirmMsg += '\n  ' + name + ': ' + jobCounts[name] + ' entries';
        });
    }

    if (!confirm(confirmMsg)) return;

    let success = 0, failed = 0;
    for (const entry of entries) {
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
    });

    // Summary header
    var summaryHtml = '<div style="padding:12px 16px;background:var(--card-bg,#f8f9fa);border-radius:8px;margin-bottom:12px;border:1px solid var(--border,#e5e7eb);">';
    summaryHtml += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">';
    summaryHtml += '<div><strong>' + appState.fetchedEntries.length + '</strong> entries</div>';
    summaryHtml += '<div><strong>' + Object.keys(dayMap).length + '</strong> days</div>';
    summaryHtml += '<div><strong>' + totalHours.toFixed(1) + 'h</strong> total</div>';
    if (lockedCount > 0) {
        summaryHtml += '<div style="color:var(--warning,#f59e0b);">🔒 ' + lockedCount + ' on invoice</div>';
    }
    summaryHtml += '</div>';

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

        summaryHtml += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#e5e7eb);font-size:0.85rem;">';
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
        return '<div class="hour-entry">' +
            '<input type="checkbox" data-idx="' + idx + '"' + (isLocked ? ' title="Linked to invoice - cannot delete"' : '') + '>' +
            '<div class="hour-entry-info">' +
                '<div class="hour-entry-date">' + formatEntryDate(entry.started_at) + ' &nbsp; ' + formatTimeRange(entry.started_at, entry.ended_at) + ' &nbsp; <strong>' + hours.toFixed(1) + 'h</strong>' + lockIcon + '</div>' +
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
                if (errBody.symbolic && errBody.symbolic.id === 'cannot_destroy') {
                    // Try to unlink from invoice first, then retry delete
                    try {
                        const unlinkResp = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/time_entries/${entry.id}`, {
                            method: 'PATCH',
                            headers: {
                                'X-Moneybird-Token': config.token,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ time_entry: { sales_invoice_id: '' } })
                        });
                        if (unlinkResp.ok) {
                            // Retry delete after unlinking
                            const retryResp = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/time_entries/${entry.id}`, {
                                method: 'DELETE',
                                headers: { 'X-Moneybird-Token': config.token }
                            });
                            if (retryResp.ok || retryResp.status === 204) {
                                success++;
                            } else {
                                invoiceLocked++;
                            }
                        } else {
                            invoiceLocked++;
                        }
                    } catch (unlinkErr) {
                        console.error('Unlink failed:', unlinkErr);
                        invoiceLocked++;
                    }
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
    if (invoiceLocked > 0) msg += `${invoiceLocked} entries are linked to an invoice and cannot be deleted — remove or delete the invoice in Moneybird first. `;
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

    var html = '<div style="padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:12px;">';
    html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;">';
    html += '<div><strong style="color:#dc2626;">⚠️ ' + entries.length + ' open (non-invoiced) entries</strong></div>';
    html += '<div><strong>' + totalHours.toFixed(1) + 'h</strong> total</div>';
    html += '<div>' + Object.keys(monthGroups).length + ' month(s)</div>';
    html += '</div>';
    html += '<p style="margin:8px 0 0;font-size:0.85rem;color:#991b1b;">These time entries are not linked to any invoice. Select and delete duplicates.</p>';
    html += '</div>';

    // Render entries grouped by month
    var sortedMonths = Object.keys(monthGroups).sort();
    sortedMonths.forEach(function(monthKey) {
        var group = monthGroups[monthKey];
        var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var parts = monthKey.split('-');
        var label = monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0];

        html += '<div style="margin-top:12px;padding:6px 12px;background:var(--card-bg,#f8f9fa);border-radius:6px;font-weight:600;font-size:0.85rem;display:flex;justify-content:space-between;">';
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
        modal.style.cssText = 'background:var(--card-bg,#1e1e2e);border:1px solid var(--border,#444);border-radius:12px;padding:24px;min-width:360px;max-width:500px;max-height:80vh;display:flex;flex-direction:column;color:var(--text,#cdd6f4);';

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
            btn.style.cssText = 'margin-left:12px;padding:6px 14px;border:none;border-radius:6px;background:var(--primary,#89b4fa);color:#000;font-weight:600;cursor:pointer;flex-shrink:0;';

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
        cancelBtn.style.cssText = 'padding:8px 20px;border:1px solid var(--border,#444);border-radius:6px;background:transparent;color:var(--text,#cdd6f4);cursor:pointer;align-self:flex-end;';
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
