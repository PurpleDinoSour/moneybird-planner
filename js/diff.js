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
                        matches: sameProjectEntries.slice(),
                        reason: 'Hours differ: planned ' + (plannedH != null ? plannedH.toFixed(1) : '?') + 'h vs registered ' + (eH != null ? eH.toFixed(1) : '?') + 'h'
                    };
                }
                if (sameProjectEntries.length > 1) {
                    return {
                        status: 'conflict',
                        match: e,
                        matches: sameProjectEntries.slice(),
                        reason: sameProjectEntries.length + ' entries already exist on this project for this date'
                    };
                }
                return { status: 'existing', match: e, reason: 'Same project + description already exists' };
            }
        }

        // Same project, different description -> conflict (would create duplicate).
        if (sameProjectEntries.length > 0) {
            return { status: 'conflict', match: sameProjectEntries[0], matches: sameProjectEntries.slice(), reason: 'Existing entry on this project with a different description' };
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

    // Cache of last-rendered entries indexed for the Fix handler.
    let lastRendered = [];

    function renderRows(entries) {
        // Sort: conflict first, then new, then existing; date ascending within group.
        const order = { conflict: 0, 'new': 1, existing: 2 };
        const sorted = entries.slice().sort((a, b) => {
            if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
            return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        });
        lastRendered = sorted;
        const rows = sorted.map((r, i) => {
            let actionCell = '<td class="diff-action"></td>';
            if (r.status === 'conflict') {
                const matchCount = (r.matches && r.matches.length) || (r.match ? 1 : 0);
                const label = matchCount > 1 ? 'Fix (' + matchCount + ')' : 'Fix';
                actionCell = '<td class="diff-action"><button type="button" class="diff-fix-btn" data-fix-idx="' + i + '" title="Update existing Moneybird entry to match the planned hours (preserves invoice link); deletes any duplicates">' + label + '</button></td>';
            }
            return [
                '<tr class="diff-row diff-row-' + r.status + '">',
                '  <td class="diff-status"><span class="diff-pill diff-pill-' + r.status + '">' + statusLabel(r.status) + '</span></td>',
                '  <td class="diff-date">' + escapeHtml(r.date) + '</td>',
                '  <td class="diff-job">' + escapeHtml(r.jobName || '-') + '</td>',
                '  <td class="diff-time">' + escapeHtml((r.startTime || '') + ' - ' + (r.endTime || '')) + '</td>',
                '  <td class="diff-desc">' + escapeHtml(r.description || '') + '</td>',
                '  <td class="diff-reason">' + escapeHtml(r.reason || '') + '</td>',
                actionCell,
                '</tr>'
            ].join('');
        }).join('');
        return [
            '<table class="diff-table">',
            '  <thead><tr>',
            '    <th>Status</th><th>Date</th><th>Job</th><th>Time</th><th>Description</th><th>Why</th><th></th>',
            '  </tr></thead>',
            '  <tbody>' + rows + '</tbody>',
            '</table>'
        ].join('');
    }

    // Apply the conflict-resolution mutations for a single row WITHOUT any
    // confirms, alerts, or re-render. Returns counters so callers can batch
    // and report once. PATCH-updates the primary matching entry to preserve
    // the invoice link; DELETEs duplicate same-project entries when possible.
    async function applyConflictFix(row, config) {
        const out = { patched: false, patchFailed: 0, deleted: 0, locked: 0, delFailed: 0 };
        const matches = (row.matches && row.matches.length) ? row.matches : (row.match ? [row.match] : []);
        if (matches.length === 0) return out;

        const plannedDescNorm = String(row.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
        let primary = matches.find(function (m) {
            return String(m.description || '').trim().toLowerCase().replace(/\s+/g, ' ') === plannedDescNorm;
        }) || matches[0];
        const extras = matches.filter(function (m) { return m.id !== primary.id; });

        try {
            const pausedDuration = row.lunch ? 3600 : 0;
            const payload = {
                time_entry: {
                    started_at: row.date + ' ' + (row.startTime || '09:00'),
                    ended_at:   row.date + ' ' + (row.endTime   || '17:00'),
                    description: row.description,
                    paused_duration: pausedDuration
                }
            };
            if (row.projectId) payload.time_entry.project_id = row.projectId;
            const resp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/time_entries/' + primary.id, {
                method: 'PATCH',
                headers: {
                    'X-Moneybird-Token': config.token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                out.patched = true;
            } else {
                out.patchFailed++;
                console.error('[fix] PATCH ' + primary.id + ' -> ' + resp.status, await resp.text());
            }
        } catch (e) {
            out.patchFailed++;
            console.error('[fix] patch failed:', e);
        }

        for (const m of extras) {
            try {
                const resp = await fetch(CONFIG.API_BASE_URL + '/moneybird/' + config.adminId + '/time_entries/' + m.id, {
                    method: 'DELETE',
                    headers: { 'X-Moneybird-Token': config.token }
                });
                if (resp.ok || resp.status === 204) {
                    out.deleted++;
                } else {
                    const body = await resp.json().catch(() => ({}));
                    if (body.symbolic && (body.symbolic.id === 'cannot_destroy' || body.symbolic.id === 'forbidden')) {
                        out.locked++;
                    } else {
                        out.delFailed++;
                    }
                }
            } catch (e) {
                console.error('[fix] delete duplicate failed:', e);
                out.delFailed++;
            }
        }
        return out;
    }

    // Re-fetch existing entries and re-render the modal summary + rows. Used
    // by both single-row and batch fix flows so the modal always reflects
    // Moneybird's actual state after mutations.
    async function refreshDiffModal(config, allPlannedEntries) {
        try {
            const monthKey = document.getElementById('monthPicker').value;
            const fresh = await fetchMonthEntries(config, monthKey);
            const planned = allPlannedEntries || [];
            const newDiff = computeDiff(planned, fresh);
            document.getElementById('diffModalSummary').innerHTML = renderSummary(newDiff.summary);
            document.getElementById('diffModalBody').innerHTML = renderRows(newDiff.entries);
            paintCalendarOverlay(newDiff);
            window.__diffPlanned = planned;
        } catch (e) {
            console.error('[fix] refresh failed:', e);
        }
    }

    // Resolve a single conflict row by index into lastRendered.
    // Strategy: PATCH the primary existing entry's started_at/ended_at/
    // description so the calendar correction propagates to Moneybird WITHOUT
    // breaking the invoice link (PATCHing those fields is allowed even on
    // entries already attached to a draft invoice; DELETE is not). Any
    // additional duplicate entries on the same project+date are then DELETEd
    // when possible; invoice-locked duplicates are left alone with a warning.
    async function fixConflict(idx, allPlannedEntries) {
        const row = lastRendered[idx];
        if (!row || row.status !== 'conflict') return;
        if (typeof getCurrentConfig !== 'function' || typeof registerSingleEntry !== 'function') {
            alert('Moneybird helpers not loaded.');
            return;
        }
        const config = getCurrentConfig();
        if (!config.token || !config.adminId) {
            alert('Configure Moneybird API first.');
            return;
        }
        const matches = (row.matches && row.matches.length) ? row.matches : (row.match ? [row.match] : []);
        if (matches.length === 0) return;

        const plannedDescNorm = String(row.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const primary = matches.find(function (m) {
            return String(m.description || '').trim().toLowerCase().replace(/\s+/g, ' ') === plannedDescNorm;
        }) || matches[0];
        const extras = matches.filter(function (m) { return m.id !== primary.id; });

        const msg = 'Resolve conflict on ' + row.date + ' (' + (row.jobName || 'no job') + '):\n\n'
            + '- Update existing entry to ' + (row.startTime || '?') + '-' + (row.endTime || '?') + (row.lunch ? ' (lunch)' : '') + '\n'
            + (extras.length > 0 ? '- Delete ' + extras.length + ' duplicate entr' + (extras.length === 1 ? 'y' : 'ies') + ' on the same project\n' : '')
            + '\nThe invoice link on the primary entry is preserved; the concept invoice will reflect the new hours.\n\nContinue?';
        if (!confirm(msg)) return;

        const r = await applyConflictFix(row, config);

        if (r.patchFailed > 0) {
            alert('Could not update existing entry. Check console for the Moneybird response.');
        }
        if (r.locked > 0 || r.delFailed > 0) {
            alert('Duplicates: ' + r.deleted + ' deleted, ' + r.locked + ' locked (linked to invoice), ' + r.delFailed + ' failed.\n\nLocked duplicates must be freed via the invoice (use "Free entries" on its draft invoice, or detach the relevant line).');
        }

        if (!r.patched && extras.length === 0) {
            return;
        }
        await refreshDiffModal(config, allPlannedEntries);
    }

    // Batch resolution: walk every conflict row currently rendered and apply
    // the same PATCH-primary + DELETE-duplicates strategy. One confirm up
    // front, one summary alert at the end, one modal refresh. Buttons are
    // disabled during the run so the user can't trigger overlapping fixes.
    async function fixAllConflicts(allPlannedEntries) {
        if (typeof getCurrentConfig !== 'function') {
            alert('Moneybird helpers not loaded.');
            return;
        }
        const config = getCurrentConfig();
        if (!config.token || !config.adminId) {
            alert('Configure Moneybird API first.');
            return;
        }
        const conflicts = lastRendered.filter(function (r) { return r.status === 'conflict'; });
        if (conflicts.length === 0) {
            alert('No conflicts to fix.');
            return;
        }
        if (!confirm('Fix all ' + conflicts.length + ' conflict(s)?\n\nEach existing Moneybird entry is updated (PATCH) to match the planned hours/description; duplicates on the same project+date are deleted when possible. Invoice links are preserved.')) {
            return;
        }
        // Lock the UI during the batch.
        const allBtns = document.querySelectorAll('#diffModalBody .diff-fix-btn, #diffFixAllBtn');
        allBtns.forEach(function (b) { b.disabled = true; });
        const fixAllBtn = document.getElementById('diffFixAllBtn');

        let patched = 0, patchFailed = 0, deleted = 0, locked = 0, delFailed = 0;
        for (let i = 0; i < conflicts.length; i++) {
            if (fixAllBtn) fixAllBtn.textContent = 'Fixing ' + (i + 1) + ' / ' + conflicts.length + '...';
            const out = await applyConflictFix(conflicts[i], config);
            if (out.patched) patched++;
            patchFailed += out.patchFailed;
            deleted += out.deleted;
            locked  += out.locked;
            delFailed += out.delFailed;
        }

        const lines = [
            patched   + ' updated',
            patchFailed > 0 ? patchFailed + ' update failed' : null,
            deleted   + ' duplicate(s) deleted',
            locked    > 0 ? locked    + ' duplicate(s) locked (invoice)' : null,
            delFailed > 0 ? delFailed + ' duplicate(s) delete failed'    : null
        ].filter(Boolean);
        alert('Fix all complete:\n\n' + lines.join('\n'));

        await refreshDiffModal(config, allPlannedEntries);
    }

    function renderSummary(summary) {
        const parts = [
            '<span class="diff-stat diff-stat-new"><strong>' + summary.new + '</strong> new</span>',
            '<span class="diff-stat diff-stat-existing"><strong>' + summary.existing + '</strong> already in Moneybird</span>',
            '<span class="diff-stat diff-stat-conflict"><strong>' + summary.conflict + '</strong> conflict</span>'
        ];
        if (summary.conflict > 0) {
            parts.push('<button type="button" id="diffFixAllBtn" class="diff-fix-btn" title="Update every existing Moneybird entry to match the plan; delete duplicates where possible. Invoice links preserved.">Fix all (' + summary.conflict + ')</button>');
        }
        parts.push('<span class="diff-stat-total">Total planned: <strong>' + summary.total + '</strong></span>');
        return parts.join('');
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
        // Cache planned entries so per-row Fix can re-classify after mutating Moneybird.
        window.__diffPlanned = diff.entries.map(r => ({
            date: r.date, description: r.description, startTime: r.startTime,
            endTime: r.endTime, lunch: r.lunch, projectId: r.projectId, jobName: r.jobName
        }));
        // Delegated click handler for Fix buttons (bound once).
        const body = document.getElementById('diffModalBody');
        if (body && !body.__fixHandlerBound) {
            body.addEventListener('click', function (ev) {
                const btn = ev.target.closest('.diff-fix-btn');
                if (!btn) return;
                ev.preventDefault();
                const idx = parseInt(btn.dataset.fixIdx, 10);
                btn.disabled = true;
                btn.textContent = 'Fixing...';
                fixConflict(idx, window.__diffPlanned).catch(e => console.error(e));
            });
            body.__fixHandlerBound = true;
        }
        // Delegated click handler for the Fix all button. Summary is
        // re-rendered after every refresh so we bind on the container, not
        // the button itself.
        const summaryEl = document.getElementById('diffModalSummary');
        if (summaryEl && !summaryEl.__fixAllHandlerBound) {
            summaryEl.addEventListener('click', function (ev) {
                const btn = ev.target.closest('#diffFixAllBtn');
                if (!btn) return;
                ev.preventDefault();
                btn.disabled = true;
                btn.textContent = 'Fixing...';
                fixAllConflicts(window.__diffPlanned).catch(e => console.error(e));
            });
            summaryEl.__fixAllHandlerBound = true;
        }
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
        // Moneybird's time_entries `period:` range filter REQUIRES YYYYMMDD
        // (no hyphens). Using YYYY-MM-DD returns HTTP 400 and the catch
        // path silently disables the diff -- which lets duplicate entries
        // through. Keep this in sync with fetchExistingHours() in
        // moneybird.js.
        const lastDay = new Date(year, month, 0).getDate();
        const startDate = '' + year + String(month).padStart(2, '0') + '01';
        const endDate   = '' + year + String(month).padStart(2, '0') + String(lastDay).padStart(2, '0');
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
