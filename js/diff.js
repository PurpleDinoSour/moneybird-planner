// Moneybird Planner IV - Registration Diff Module
// Computes a NEW / EXISTING / CONFLICT diff between the user's planned
// registration and what is already in Moneybird, and presents it as a
// modal preview before any POST happens.

(function () {
    'use strict';

    // ---- DIFF COMPUTATION -------------------------------------------------
    function normaliseDescription(s) {
        if (!s) return '';
        return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function entryDateOnly(e) {
        if (!e || !e.started_at) return null;
        // Moneybird returns either "YYYY-MM-DD HH:mm" or full ISO string.
        const raw = String(e.started_at);
        const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
    }

    function entryProjectId(e) {
        if (!e) return null;
        return e.project_id || (e.project && e.project.id) || null;
    }

    // Hours computed from started_at / ended_at minus paused_duration.
    // Mirrors parseEntryHours in moneybird.js so diff and Manage Hours stay
    // consistent.
    function entryHours(e) {
        if (!e || !e.started_at || !e.ended_at) return null;
        var s = new Date(e.started_at);
        var en = new Date(e.ended_at);
        if (isNaN(s) || isNaN(en)) return null;
        var ms = en - s;
        if (e.paused_duration) ms -= e.paused_duration * 1000;
        return ms / 3600000;
    }

    function plannedHours(p) {
        if (typeof p.hours === 'number') return p.hours;
        if (!p.startTime || !p.endTime) return null;
        var sp = p.startTime.split(':').map(Number);
        var ep = p.endTime.split(':').map(Number);
        var h = (ep[0] * 60 + (ep[1] || 0) - sp[0] * 60 - (sp[1] || 0)) / 60;
        if (p.lunch) h -= 1;
        return Math.max(0, h);
    }

    function hoursMatch(a, b) {
        if (a === null || b === null) return true; // can't tell -> don't flag
        return Math.abs(a - b) < 0.05; // 3-minute tolerance
    }

    // Build a quick lookup of existing entries grouped by date.
    function indexExisting(existing) {
        const byDate = {};
        (existing || []).forEach(e => {
            const date = entryDateOnly(e);
            if (!date) return;
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(e);
        });
        return byDate;
    }

    // Classify a planned entry against existing ones for the same date.
    // Returns { status: 'new'|'existing'|'conflict', match, reason }
    function classify(planned, existingForDate) {
        if (!existingForDate || existingForDate.length === 0) {
            return { status: 'new', match: null, reason: 'No entries on this date' };
        }
        const plannedProj = planned.projectId ? String(planned.projectId) : null;
        const plannedDesc = normaliseDescription(planned.description);
        const plannedH    = plannedHours(planned);

        // Collect all entries on the same project (matters for hour-diff and duplicates).
        const sameProjectEntries = existingForDate.filter(e => {
            const eProj = entryProjectId(e);
            return plannedProj && eProj && String(eProj) === plannedProj;
        });

        // Exact-ish match: same project + similar description.
        for (const e of sameProjectEntries) {
            const eDesc = normaliseDescription(e.description);
            if (eDesc === plannedDesc) {
                const eH = entryHours(e);
                if (!hoursMatch(plannedH, eH)) {
                    return {
                        status: 'conflict',
                        match: e,
                        reason: 'Hours differ: planned ' + (plannedH != null ? plannedH.toFixed(1) : '?') + 'h vs registered ' + (eH != null ? eH.toFixed(1) : '?') + 'h'
                    };
                }
                if (sameProjectEntries.length > 1) {
                    return {
                        status: 'conflict',
                        match: e,
                        reason: sameProjectEntries.length + ' entries already exist on this project for this date'
                    };
                }
                return { status: 'existing', match: e, reason: 'Same project + description already exists' };
            }
        }

        // Same project, different description -> conflict (would create duplicate).
        if (sameProjectEntries.length > 0) {
            return { status: 'conflict', match: sameProjectEntries[0], reason: 'Existing entry on this project with a different description' };
        }

        // Different project on same date is allowed (split day) -> still new.
        return { status: 'new', match: null, reason: 'No matching project entry on this date' };
    }

    function computeDiff(plannedEntries, existingEntries) {
        const byDate = indexExisting(existingEntries);
        const results = (plannedEntries || []).map(p => {
            const dateExisting = byDate[p.date] || [];
            const c = classify(p, dateExisting);
            return Object.assign({}, p, c);
        });
        const summary = {
            total: results.length,
            new: results.filter(r => r.status === 'new').length,
            existing: results.filter(r => r.status === 'existing').length,
            conflict: results.filter(r => r.status === 'conflict').length
        };
        return { entries: results, summary: summary };
    }

    // ---- CALENDAR OVERLAY -------------------------------------------------
    function clearCalendarOverlay() {
        document.querySelectorAll('.day-card.diff-new, .day-card.diff-existing, .day-card.diff-conflict')
            .forEach(c => c.classList.remove('diff-new', 'diff-existing', 'diff-conflict'));
    }

    function paintCalendarOverlay(diff) {
        clearCalendarOverlay();
        const byDate = {};
        diff.entries.forEach(r => {
            // Conflict beats existing beats new.
            const cur = byDate[r.date];
            const rank = { 'new': 1, 'existing': 2, 'conflict': 3 };
            if (!cur || rank[r.status] > rank[cur]) byDate[r.date] = r.status;
        });
        Object.keys(byDate).forEach(date => {
            const card = document.querySelector('.day-card[data-date="' + date + '"]');
            if (card) card.classList.add('diff-' + byDate[date]);
        });
    }

    // ---- MODAL ------------------------------------------------------------
    function ensureModal() {
        let el = document.getElementById('diffPreviewModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'diffPreviewModal';
        el.className = 'diff-modal';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Registration preview');
        el.innerHTML = [
            '<div class="diff-modal-card">',
            '  <div class="diff-modal-header">',
            '    <h3>Registration preview <span id="diffModeBadge" class="diff-mode-badge"></span></h3>',
            '    <button class="diff-modal-close" aria-label="Close">Esc</button>',
            '  </div>',
            '  <div class="diff-modal-warning" id="diffModalWarning" style="display:none;"></div>',
            '  <div class="diff-modal-summary" id="diffModalSummary"></div>',
            '  <div class="diff-modal-body" id="diffModalBody"></div>',
            '  <div class="diff-modal-actions">',
            '    <button class="btn btn-ghost" id="diffModalCancel">Cancel</button>',
            '    <button class="btn btn-primary" id="diffModalConfirm">Register new entries</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(el);
        el.addEventListener('click', (ev) => {
            if (ev.target === el || ev.target.classList.contains('diff-modal-close')) {
                close();
            }
        });
        document.getElementById('diffModalCancel').addEventListener('click', close);
        return el;
    }

    let pendingResolve = null;

    function close(result) {
        const el = document.getElementById('diffPreviewModal');
        if (el) el.classList.remove('visible');
        clearCalendarOverlay();
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            r(result || null);
        }
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function statusLabel(s) {
        if (s === 'new') return 'NEW';
        if (s === 'existing') return 'EXISTS';
        return 'CONFLICT';
    }

    function renderRows(entries) {
        // Sort: conflict first, then new, then existing; date ascending within group.
        const order = { conflict: 0, 'new': 1, existing: 2 };
        const sorted = entries.slice().sort((a, b) => {
            if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
            return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        });
        const rows = sorted.map(r => {
            return [
                '<tr class="diff-row diff-row-' + r.status + '">',
                '  <td class="diff-status"><span class="diff-pill diff-pill-' + r.status + '">' + statusLabel(r.status) + '</span></td>',
                '  <td class="diff-date">' + escapeHtml(r.date) + '</td>',
                '  <td class="diff-job">' + escapeHtml(r.jobName || '-') + '</td>',
                '  <td class="diff-time">' + escapeHtml((r.startTime || '') + ' - ' + (r.endTime || '')) + '</td>',
                '  <td class="diff-desc">' + escapeHtml(r.description || '') + '</td>',
                '  <td class="diff-reason">' + escapeHtml(r.reason || '') + '</td>',
                '</tr>'
            ].join('');
        }).join('');
        return [
            '<table class="diff-table">',
            '  <thead><tr>',
            '    <th>Status</th><th>Date</th><th>Job</th><th>Time</th><th>Description</th><th>Why</th>',
            '  </tr></thead>',
            '  <tbody>' + rows + '</tbody>',
            '</table>'
        ].join('');
    }

    function renderSummary(summary) {
        return [
            '<span class="diff-stat diff-stat-new"><strong>' + summary.new + '</strong> new</span>',
            '<span class="diff-stat diff-stat-existing"><strong>' + summary.existing + '</strong> already in Moneybird</span>',
            '<span class="diff-stat diff-stat-conflict"><strong>' + summary.conflict + '</strong> conflict</span>',
            '<span class="diff-stat-total">Total planned: <strong>' + summary.total + '</strong></span>'
        ].join('');
    }

    // Show the modal and return a promise that resolves to:
    //   { confirmed: true, toRegister: [entries with status 'new'] }
    //   or null if cancelled.
    function show(diff) {
        const el = ensureModal();
        // Mode badge + sanity warning
        const mode = (window.appState && appState.currentHourType) || 'facturable';
        const badge = document.getElementById('diffModeBadge');
        if (badge) {
            badge.textContent = mode.toUpperCase();
            badge.dataset.mode = mode;
        }
        const warn = document.getElementById('diffModalWarning');
        const hasJobs = window.appState && Array.isArray(appState.jobs) && appState.jobs.length > 0;
        const noJobNames = diff.entries.every(function (r) { return !r.jobName; });
        if (warn) {
            if (mode === 'wbso' && hasJobs && noJobNames) {
                warn.innerHTML = '<strong>Heads-up:</strong> you are in <em>WBSO</em> mode but have ' + appState.jobs.length
                    + ' Facturable job(s) configured. WBSO entries are not split per job. Switch to <em>Facturable</em> at the top (or press <kbd>t</kbd>) if you wanted DNB / RIVM project assignments.';
                warn.style.display = '';
            } else if (mode === 'facturable' && !hasJobs) {
                warn.innerHTML = '<strong>Heads-up:</strong> Facturable mode but no jobs configured. Entries will use the single project from Settings.';
                warn.style.display = '';
            } else {
                warn.style.display = 'none';
                warn.innerHTML = '';
            }
        }
        document.getElementById('diffModalSummary').innerHTML = renderSummary(diff.summary);
        document.getElementById('diffModalBody').innerHTML = renderRows(diff.entries);
        const confirmBtn = document.getElementById('diffModalConfirm');
        if (diff.summary.new === 0) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Nothing new to register';
        } else {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Register ' + diff.summary.new + ' new ' + (diff.summary.new === 1 ? 'entry' : 'entries');
        }
        // Replace listener to capture latest diff.
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', () => {
            close({ confirmed: true, toRegister: diff.entries.filter(r => r.status === 'new') });
        });
        paintCalendarOverlay(diff);
        el.classList.add('visible');
        return new Promise(resolve => { pendingResolve = resolve; });
    }

    // ---- FETCH EXISTING ---------------------------------------------------
    // Pull existing time entries for the current month so the diff has data.
    async function fetchMonthEntries(config, monthKey) {
        if (!monthKey) return [];
        const [year, month] = monthKey.split('-').map(Number);
        const startDate = year + '-' + String(month).padStart(2, '0') + '-01';
        const endDate = year + '-' + String(month).padStart(2, '0') + '-' + new Date(year, month, 0).getDate();
        let all = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const url = CONFIG.API_BASE_URL + '/moneybird/' + config.adminId
                + '/time_entries?filter=period:' + startDate + '..' + endDate
                + '&per_page=100&page=' + page;
            const res = await fetch(url, { headers: { 'X-Moneybird-Token': config.token } });
            if (!res.ok) throw new Error('API error: ' + res.status);
            const pageEntries = await res.json();
            all = all.concat(pageEntries);
            hasMore = pageEntries.length === 100;
            page++;
        }
        return all.filter(e => !config.userId || e.user_id === config.userId);
    }

    // ---- PUBLIC API -------------------------------------------------------
    window.diffEngine = {
        compute: computeDiff,
        show: show,
        close: close,
        fetchMonthEntries: fetchMonthEntries,
        paintCalendarOverlay: paintCalendarOverlay,
        clearCalendarOverlay: clearCalendarOverlay
    };

    // Hook Esc to close the diff modal too.
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            const el = document.getElementById('diffPreviewModal');
            if (el && el.classList.contains('visible')) {
                close();
                ev.stopPropagation();
            }
        }
    });
})();
