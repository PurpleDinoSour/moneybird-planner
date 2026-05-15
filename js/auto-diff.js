// Moneybird Planner IV - Auto Diff Module
// Continuously paints a NEW / EXISTING / CONFLICT overlay on the calendar
// without requiring the user to click "Register". Fetches existing month
// entries from Moneybird, caches them per (adminId, monthKey) for 60s,
// and re-renders the overlay on every selection change (debounced).
//
// Also displays a small status badge in the action bar so the user can
// see at a glance: "5 new, 3 in MB, 1 conflict".

(function () {
    'use strict';

    var CACHE_TTL_MS = 60 * 1000;
    var DEBOUNCE_MS  = 600;

    var cache = {};       // key = adminId + ':' + monthKey -> { ts, entries }
    var debounceTimer = null;
    var enabled = true;
    var inFlight = false;
    var lastBadgeText = '';

    // ---- BADGE -----------------------------------------------------------
    function ensureBadge() {
        var bar = document.querySelector('.action-bar .buttons');
        if (!bar) return null;
        var b = document.getElementById('autoDiffBadge');
        if (b) return b;
        b = document.createElement('span');
        b.id = 'autoDiffBadge';
        b.className = 'auto-diff-badge';
        b.title = 'Continuous comparison with Moneybird (toggle with the gear icon)';
        // Insert at the very front of the .buttons row.
        bar.insertBefore(b, bar.firstChild);
        return b;
    }

    function setBadge(text, kind) {
        var b = ensureBadge();
        if (!b) return;
        b.textContent = text;
        b.dataset.state = kind || 'idle';
        b.style.display = enabled && text ? '' : 'none';
        lastBadgeText = text || '';
    }

    function setIdle()    { setBadge('', 'idle'); }
    function setLoading() { setBadge('Comparing...', 'loading'); }
    function setError(m)  { setBadge('Diff: ' + m, 'error'); }

    function setSummary(summary) {
        var parts = [];
        if (summary.new      > 0) parts.push(summary.new      + ' new');
        if (summary.existing > 0) parts.push(summary.existing + ' in MB');
        if (summary.conflict > 0) parts.push(summary.conflict + ' conflict');
        if (parts.length === 0) {
            setBadge('Nothing to register', 'clean');
        } else {
            var kind = summary.conflict > 0 ? 'conflict'
                     : summary.new      > 0 ? 'new'
                     : 'clean';
            setBadge(parts.join(' \u00B7 '), kind);
        }
    }

    // ---- CACHE -----------------------------------------------------------
    function cacheKey(adminId, monthKey) { return adminId + ':' + monthKey; }

    function getCached(adminId, monthKey) {
        var entry = cache[cacheKey(adminId, monthKey)];
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
        return entry.entries;
    }

    function putCached(adminId, monthKey, entries) {
        cache[cacheKey(adminId, monthKey)] = { ts: Date.now(), entries: entries };
    }

    function invalidate(adminId, monthKey) {
        if (adminId && monthKey) {
            delete cache[cacheKey(adminId, monthKey)];
        } else {
            cache = {};
        }
    }

    // ---- CORE ------------------------------------------------------------
    async function runNow() {
        if (!enabled) return;
        if (!window.diffEngine || !window.planning) return;

        var monthKey = document.getElementById('monthPicker') && document.getElementById('monthPicker').value;
        if (!monthKey) return;

        var config = (typeof getCurrentConfig === 'function') ? getCurrentConfig() : null;
        if (!config || !config.token || !config.adminId) {
            setIdle();
            window.diffEngine.clearCalendarOverlay();
            return;
        }

        var dates = Array.from(appState.selectedDates).sort();
        var planned = window.planning.buildPlannedEntries({
            type: appState.currentHourType,
            dates: dates
        });
        if (planned.length === 0) {
            setIdle();
            window.diffEngine.clearCalendarOverlay();
            return;
        }

        // Fetch (cached) existing entries for the month.
        var existing = getCached(config.adminId, monthKey);
        if (!existing) {
            if (inFlight) return; // a previous run is still resolving
            inFlight = true;
            setLoading();
            try {
                existing = await window.diffEngine.fetchMonthEntries(config, monthKey);
                putCached(config.adminId, monthKey, existing);
            } catch (e) {
                console.warn('[auto-diff] fetch failed:', e.message);
                setError(e.message.length > 30 ? 'fetch failed' : e.message);
                window.diffEngine.clearCalendarOverlay();
                inFlight = false;
                return;
            }
            inFlight = false;
        }

        var diff = window.diffEngine.compute(planned, existing);
        window.diffEngine.paintCalendarOverlay(diff);
        setSummary(diff.summary);
    }

    function triggerSoon() {
        if (!enabled) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runNow, DEBOUNCE_MS);
    }

    function setEnabled(v) {
        enabled = !!v;
        try { localStorage.setItem('mb3_auto_diff', enabled ? '1' : '0'); } catch (e) {}
        if (!enabled) {
            if (window.diffEngine) window.diffEngine.clearCalendarOverlay();
            setBadge('', 'idle');
        } else {
            triggerSoon();
        }
    }

    function init() {
        try {
            var saved = localStorage.getItem('mb3_auto_diff');
            if (saved !== null) enabled = saved === '1';
        } catch (e) {}
        // Sync UI checkbox if present.
        var cb = document.getElementById('autoDiffToggle');
        if (cb) cb.checked = enabled;
        ensureBadge();
        if (enabled) triggerSoon();
    }

    window.autoDiff = {
        runNow: runNow,
        triggerSoon: triggerSoon,
        invalidate: invalidate,
        setEnabled: setEnabled,
        isEnabled: function () { return enabled; },
        init: init
    };

    // Self-init on DOM ready (action bar must exist).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // already loaded; defer one tick so other modules finish wiring.
        setTimeout(init, 0);
    }
})();
