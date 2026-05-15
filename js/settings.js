// Moneybird Planner IV - Settings Modal
// Centralised preferences UI. Mirrors the quick-toggle chips in the action
// bar and adds settings that do not need to be on the main UI surface
// (BTW rate, default times, etc.).
//
// All settings are persisted in localStorage under "mb3_settings" + the
// existing per-feature keys (mb3_auto_diff, mb3_wbso_overlay).

(function () {
    'use strict';

    var STORAGE_KEY = 'mb3_settings';

    var defaults = {
        autoDiff: true,
        wbsoOverlay: false,
        showGhostBars: true,   // ghost job-bars on weekdays
        btwRate: 0.21,
        defaultStart: '09:00',
        defaultEnd: '17:00',
        defaultLunch: true
    };

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return Object.assign({}, defaults);
            var parsed = JSON.parse(raw);
            return Object.assign({}, defaults, parsed);
        } catch (e) {
            return Object.assign({}, defaults);
        }
    }

    function save(s) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
        applyRuntime(s);
    }

    // Apply settings to the live runtime (modules that read at boot must
    // also accept push updates).
    function applyRuntime(s) {
        if (window.autoDiff && typeof window.autoDiff.setEnabled === 'function') {
            window.autoDiff.setEnabled(s.autoDiff);
        }
        if (window.wbsoOverlay && typeof window.wbsoOverlay.setEnabled === 'function') {
            window.wbsoOverlay.setEnabled(s.wbsoOverlay);
        }
        document.documentElement.dataset.ghostBars = s.showGhostBars ? '1' : '0';
        // Sync chips
        var ad = document.getElementById('autoDiffToggle');
        if (ad) ad.checked = s.autoDiff;
        var wb = document.getElementById('wbsoOverlayToggle');
        if (wb) wb.checked = s.wbsoOverlay;
    }

    function ensureModal() {
        var el = document.getElementById('preferencesModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'preferencesModal';
        el.className = 'settings-modal';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Preferences');
        el.innerHTML = [
            '<div class="settings-modal-card">',
            '  <div class="settings-modal-header">',
            '    <h3>Preferences</h3>',
            '    <button class="settings-modal-close" aria-label="Close">Esc</button>',
            '  </div>',
            '  <div class="settings-modal-body">',
            '    <section class="settings-section">',
            '      <h4>Calendar overlays</h4>',
            '      <label class="settings-row"><input type="checkbox" data-key="autoDiff"><span><strong>Auto-diff</strong><em>Continuously compare selection with Moneybird</em></span></label>',
            '      <label class="settings-row"><input type="checkbox" data-key="wbsoOverlay"><span><strong>WBSO overlay</strong><em>Show existing Holding-admin WBSO hours in Facturable view</em></span></label>',
            '      <label class="settings-row"><input type="checkbox" data-key="showGhostBars"><span><strong>Inactive job hints</strong><em>Show + chips on weekdays for jobs not yet active that day</em></span></label>',
            '    </section>',
            '    <section class="settings-section">',
            '      <h4>Pricing</h4>',
            '      <label class="settings-row"><span><strong>BTW rate</strong><em>Used by the customer overview totals</em></span><input type="number" step="0.01" min="0" max="1" data-key="btwRate" class="settings-num"></label>',
            '    </section>',
            '    <section class="settings-section">',
            '      <h4>Default working hours</h4>',
            '      <label class="settings-row"><span><strong>Start</strong></span><input type="time" data-key="defaultStart" class="settings-num"></label>',
            '      <label class="settings-row"><span><strong>End</strong></span><input type="time" data-key="defaultEnd" class="settings-num"></label>',
            '      <label class="settings-row"><input type="checkbox" data-key="defaultLunch"><span><strong>Lunch break by default</strong><em>Subtracts 1 hour from each entry</em></span></label>',
            '    </section>',
            '  </div>',
            '  <div class="settings-modal-actions">',
            '    <button class="btn btn-ghost" id="settingsResetBtn">Reset defaults</button>',
            '    <button class="btn btn-primary" id="settingsSaveBtn">Save</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(el);

        el.addEventListener('click', function (ev) {
            if (ev.target === el || ev.target.classList.contains('settings-modal-close')) close();
        });
        document.getElementById('settingsResetBtn').addEventListener('click', function () {
            populate(Object.assign({}, defaults));
        });
        document.getElementById('settingsSaveBtn').addEventListener('click', function () {
            var current = collect(el);
            save(current);
            close();
        });
        return el;
    }

    function populate(s) {
        var el = document.getElementById('preferencesModal');
        if (!el) return;
        el.querySelectorAll('[data-key]').forEach(function (input) {
            var k = input.dataset.key;
            if (input.type === 'checkbox') input.checked = !!s[k];
            else input.value = s[k];
        });
    }

    function collect(el) {
        var out = {};
        el.querySelectorAll('[data-key]').forEach(function (input) {
            var k = input.dataset.key;
            if (input.type === 'checkbox') out[k] = input.checked;
            else if (input.type === 'number') out[k] = Number(input.value) || 0;
            else out[k] = input.value;
        });
        return out;
    }

    function open() {
        var el = ensureModal();
        populate(load());
        el.classList.add('visible');
        // Focus first interactive element
        var first = el.querySelector('input');
        if (first) first.focus();
    }

    function close() {
        var el = document.getElementById('preferencesModal');
        if (el) el.classList.remove('visible');
    }

    function init() {
        applyRuntime(load());
    }

    window.settingsModal = {
        open: open,
        close: close,
        load: load,
        save: save,
        init: init
    };

    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
            var el = document.getElementById('preferencesModal');
            if (el && el.classList.contains('visible')) {
                close();
                ev.stopPropagation();
            }
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }
})();
