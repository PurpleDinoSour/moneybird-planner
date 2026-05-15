// Moneybird Planner IV - WBSO Overlay Module (dual-mode)
// While the user is in Facturable view, fetch existing WBSO entries from
// the Holding admin and paint a sky-blue "WBSO Xh" bar onto each day-card.
// Lets you see in one glance how the month combines facturable + WBSO
// without flipping between modes.
//
// Toggle: localStorage.mb3_wbso_overlay = '1' | '0'  (default off)
// Settings checkbox: #wbsoOverlayToggle
//
// Cache: per (holdingAdminId, monthKey) for 60s (shared shape with auto-diff).

(function () {
    'use strict';

    var CACHE_TTL_MS = 60 * 1000;
    var cache = {};       // key = adminId + ':' + monthKey -> { ts, entries }
    var enabled = false;
    var inFlight = false;

    function holdingConfig() {
        var t = document.getElementById('apiTokenHolding');
        var a = document.getElementById('adminIdHolding');
        var u = document.getElementById('userIdHolding');
        if (!t || !a) return null;
        return {
            token:   t.value,
            adminId: a.value,
            userId:  u ? u.value : '',
            projectId: ''
        };
    }

    function isApplicable() {
        return enabled
            && window.appState
            && appState.currentHourType === 'facturable';
    }

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

    function invalidate() { cache = {}; }

    // --- Hours math (WBSO entries can use started_at / ended_at strings) ---
    function entryHours(e) {
        if (!e || !e.started_at || !e.ended_at) return 0;
        var s = new Date(String(e.started_at).replace(' ', 'T'));
        var en = new Date(String(e.ended_at).replace(' ', 'T'));
        if (isNaN(s) || isNaN(en)) return 0;
        var ms = en - s - (Number(e.paused_duration) || 0) * 1000;
        return Math.max(0, ms / (1000 * 60 * 60));
    }

    function entryDate(e) {
        if (!e || !e.started_at) return null;
        var m = String(e.started_at).match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
    }

    function clearOverlay() {
        document.querySelectorAll('.day-card .job-bar.wbso-overlay-bar')
            .forEach(function (b) { b.remove(); });
        document.querySelectorAll('.day-card.has-wbso-overlay')
            .forEach(function (c) { c.classList.remove('has-wbso-overlay'); });
    }

    function paint(entriesByDate) {
        clearOverlay();
        Object.keys(entriesByDate).forEach(function (date) {
            var hrs = entriesByDate[date];
            if (hrs <= 0) return;
            var card = document.querySelector('.day-card[data-date="' + date + '"]');
            if (!card) return;
            var bars = card.querySelector('.job-bars');
            if (!bars) {
                bars = document.createElement('div');
                bars.className = 'job-bars';
                card.appendChild(bars);
            }
            var bar = document.createElement('div');
            bar.className = 'job-bar wbso-overlay-bar';
            bar.title = 'WBSO already in Holding: ' + hrs.toFixed(1) + 'h';
            bar.textContent = 'WBSO ' + (Math.round(hrs * 10) / 10) + 'h';
            bars.appendChild(bar);
            card.classList.add('has-wbso-overlay');
        });
    }

    async function refresh() {
        if (!isApplicable()) {
            clearOverlay();
            return;
        }
        if (!window.diffEngine) return;
        var monthKey = document.getElementById('monthPicker') && document.getElementById('monthPicker').value;
        if (!monthKey) return;
        var cfg = holdingConfig();
        if (!cfg || !cfg.token || !cfg.adminId) {
            clearOverlay();
            return;
        }

        var existing = getCached(cfg.adminId, monthKey);
        if (!existing) {
            if (inFlight) return;
            inFlight = true;
            try {
                existing = await window.diffEngine.fetchMonthEntries(cfg, monthKey);
                putCached(cfg.adminId, monthKey, existing);
            } catch (e) {
                console.warn('[wbso-overlay] fetch failed:', e.message);
                inFlight = false;
                return;
            }
            inFlight = false;
        }

        // Aggregate hours per date.
        var byDate = {};
        existing.forEach(function (e) {
            var d = entryDate(e);
            if (!d) return;
            byDate[d] = (byDate[d] || 0) + entryHours(e);
        });
        paint(byDate);
    }

    function setEnabled(v) {
        enabled = !!v;
        try { localStorage.setItem('mb3_wbso_overlay', enabled ? '1' : '0'); } catch (e) {}
        if (!enabled) clearOverlay();
        else refresh();
    }

    function init() {
        try {
            var saved = localStorage.getItem('mb3_wbso_overlay');
            if (saved !== null) enabled = saved === '1';
        } catch (e) {}
        // Sync any existing checkbox.
        var cb = document.getElementById('wbsoOverlayToggle');
        if (cb) {
            cb.checked = enabled;
            cb.addEventListener('change', function () { setEnabled(cb.checked); });
        }
        if (enabled) refresh();
    }

    window.wbsoOverlay = {
        refresh: refresh,
        setEnabled: setEnabled,
        isEnabled: function () { return enabled; },
        invalidate: invalidate,
        init: init
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }
})();
