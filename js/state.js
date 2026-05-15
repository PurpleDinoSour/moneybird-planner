// Moneybird Planner IV - State Module
// Handles URL-based deep linking + per-month selection persistence.
// Loads BEFORE app.js so init() can read URL state on boot.

(function () {
    'use strict';

    // ---- URL STATE ---------------------------------------------------------
    // URL params we own:
    //   month=YYYY-MM      current month picker
    //   type=facturable|wbso  current hour type
    //   view=overview|compact closed/open of customer overview
    //   focus=YYYY-MM-DD   currently keyboard-focused day
    const URL_KEYS = ['month', 'type', 'view', 'focus'];

    function readUrl() {
        const params = new URLSearchParams(window.location.search);
        const out = {};
        URL_KEYS.forEach(k => {
            const v = params.get(k);
            if (v) out[k] = v;
        });
        return out;
    }

    function writeUrl(partial, opts) {
        const params = new URLSearchParams(window.location.search);
        Object.keys(partial).forEach(k => {
            if (partial[k] === null || partial[k] === undefined || partial[k] === '') {
                params.delete(k);
            } else {
                params.set(k, partial[k]);
            }
        });
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        if (opts && opts.push) {
            window.history.pushState({}, '', newUrl);
        } else {
            window.history.replaceState({}, '', newUrl);
        }
    }

    // ---- SELECTION PERSISTENCE --------------------------------------------
    // Selections are scoped per (hourType, month) so switching context does
    // not mix WBSO and Facturable selections.
    const SEL_PREFIX = 'mb3_sel_';

    function selectionKey(type, monthKey) {
        return SEL_PREFIX + type + '_' + monthKey;
    }

    function saveSelection(type, monthKey, dates) {
        if (!type || !monthKey) return;
        try {
            const arr = Array.from(dates).sort();
            if (arr.length === 0) {
                localStorage.removeItem(selectionKey(type, monthKey));
            } else {
                localStorage.setItem(selectionKey(type, monthKey), JSON.stringify(arr));
            }
        } catch (e) {
            console.warn('[state] saveSelection failed:', e.message);
        }
    }

    function loadSelection(type, monthKey) {
        if (!type || !monthKey) return null;
        try {
            const raw = localStorage.getItem(selectionKey(type, monthKey));
            if (!raw) return null;
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : null;
        } catch (e) {
            return null;
        }
    }

    function clearSelection(type, monthKey) {
        if (!type || !monthKey) return;
        localStorage.removeItem(selectionKey(type, monthKey));
    }

    // ---- HELPERS ----------------------------------------------------------
    function currentMonthKey() {
        const picker = document.getElementById('monthPicker');
        return picker ? picker.value : null;
    }

    function currentType() {
        return (typeof appState !== 'undefined' && appState.currentHourType) || 'facturable';
    }

    // Sync current appState.selectedDates to localStorage. Called whenever
    // selection changes.
    function persistCurrentSelection() {
        const type = currentType();
        const monthKey = currentMonthKey();
        if (typeof appState === 'undefined' || !appState.selectedDates) return;
        saveSelection(type, monthKey, appState.selectedDates);
    }

    // Try to restore a previously saved selection for the active month/type.
    // Returns the restored array, or null if no saved state.
    function restoreCurrentSelection() {
        const type = currentType();
        const monthKey = currentMonthKey();
        return loadSelection(type, monthKey);
    }

    // ---- PUBLIC API -------------------------------------------------------
    window.urlState = {
        read: readUrl,
        write: writeUrl
    };

    window.selectionState = {
        save: saveSelection,
        load: loadSelection,
        clear: clearSelection,
        persistCurrent: persistCurrentSelection,
        restoreCurrent: restoreCurrentSelection,
        currentMonthKey: currentMonthKey,
        currentType: currentType
    };
})();
