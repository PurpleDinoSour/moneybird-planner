// Moneybird Planner IV - Keyboard Module
// Global keyboard shortcuts + help overlay.
// Shortcuts are disabled while user is typing in inputs/textareas.

(function () {
    'use strict';

    // ---- FOCUS STATE ------------------------------------------------------
    // The "focused day" is the keyboard cursor on the calendar. Distinct
    // from selection (active class). Stored as YYYY-MM-DD or null.
    let focusedDate = null;

    function getDayCard(dateStr) {
        if (!dateStr) return null;
        return document.querySelector('.day-card[data-date="' + dateStr + '"]');
    }

    function setFocusedDate(dateStr, opts) {
        document.querySelectorAll('.day-card.kbd-focus').forEach(el => el.classList.remove('kbd-focus'));
        focusedDate = dateStr || null;
        if (focusedDate) {
            const card = getDayCard(focusedDate);
            if (card) {
                card.classList.add('kbd-focus');
                if (!opts || opts.scroll !== false) {
                    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }
            if (window.urlState) window.urlState.write({ focus: focusedDate });
        } else if (window.urlState) {
            window.urlState.write({ focus: null });
        }
    }

    function getFocusedDate() {
        return focusedDate;
    }

    // Find first available day in the currently rendered calendar.
    function firstDayInCalendar() {
        const card = document.querySelector('.day-card[data-date]');
        return card ? card.dataset.date : null;
    }

    function shiftDate(dateStr, days) {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() + days);
        const iso = dt.toISOString().split('T')[0];
        // Only return if it exists in the current calendar (same month).
        return getDayCard(iso) ? iso : null;
    }

    // ---- HELP OVERLAY -----------------------------------------------------
    function ensureHelpOverlay() {
        let el = document.getElementById('keyboardHelpOverlay');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'keyboardHelpOverlay';
        el.className = 'kbd-overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Keyboard shortcuts');
        el.innerHTML = [
            '<div class="kbd-overlay-card">',
            '  <div class="kbd-overlay-header">',
            '    <h3>Keyboard shortcuts</h3>',
            '    <button class="kbd-overlay-close" aria-label="Close">Esc</button>',
            '  </div>',
            '  <div class="kbd-overlay-grid">',
            '    <div class="kbd-group">',
            '      <h4>Navigation</h4>',
            '      <ul>',
            '        <li><kbd>&larr;</kbd> <kbd>&rarr;</kbd> <kbd>&uarr;</kbd> <kbd>&darr;</kbd><span>Move day cursor</span></li>',
            '        <li><kbd>h</kbd> <kbd>l</kbd><span>Prev / next day</span></li>',
            '        <li><kbd>j</kbd> <kbd>k</kbd><span>Next / prev week</span></li>',
            '        <li><kbd>m</kbd><span>Focus month picker</span></li>',
            '        <li><kbd>[</kbd> <kbd>]</kbd><span>Prev / next month</span></li>',
            '      </ul>',
            '    </div>',
            '    <div class="kbd-group">',
            '      <h4>Selection</h4>',
            '      <ul>',
            '        <li><kbd>Space</kbd><span>Toggle focused day</span></li>',
            '        <li><kbd>a</kbd><span>Select all days</span></li>',
            '        <li><kbd>c</kbd><span>Clear selection</span></li>',
            '      </ul>',
            '    </div>',
            '    <div class="kbd-group">',
            '      <h4>Actions</h4>',
            '      <ul>',
            '        <li><kbd>p</kbd><span>Preview registration</span></li>',
            '        <li><kbd>r</kbd><span>Register hours</span></li>',
            '        <li><kbd>t</kbd><span>Toggle Facturable / WBSO</span></li>',
            '        <li><kbd>o</kbd><span>Toggle customer overview</span></li>',
            '        <li><kbd>i</kbd><span>Open invoices</span></li>',
            '        <li><kbd>u</kbd><span>Open hours management</span></li>',
            '      </ul>',
            '    </div>',
            '    <div class="kbd-group">',
            '      <h4>General</h4>',
            '      <ul>',
            '        <li><kbd>?</kbd><span>Show this help</span></li>',
            '        <li><kbd>Esc</kbd><span>Close overlay / modal</span></li>',
            '      </ul>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(el);
        el.addEventListener('click', (ev) => {
            if (ev.target === el || ev.target.classList.contains('kbd-overlay-close')) {
                hideHelp();
            }
        });
        return el;
    }

    function showHelp() {
        const el = ensureHelpOverlay();
        el.classList.add('visible');
    }
    function hideHelp() {
        const el = document.getElementById('keyboardHelpOverlay');
        if (el) el.classList.remove('visible');
    }
    function helpVisible() {
        const el = document.getElementById('keyboardHelpOverlay');
        return !!(el && el.classList.contains('visible'));
    }

    // ---- ACTION HELPERS ---------------------------------------------------
    function shiftMonth(delta) {
        const picker = document.getElementById('monthPicker');
        if (!picker || !picker.value) return;
        const [y, m] = picker.value.split('-').map(Number);
        const dt = new Date(y, m - 1 + delta, 1);
        const newVal = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
        picker.value = newVal;
        // Trigger the same path as the user changing the picker.
        picker.dispatchEvent(new Event('change'));
    }

    function toggleHourType() {
        const next = (typeof appState !== 'undefined' && appState.currentHourType === 'wbso') ? 'facturable' : 'wbso';
        if (typeof setHourType === 'function') setHourType(next);
    }

    function toggleOverview() {
        const det = document.getElementById('customerOverviewDetails');
        if (det) det.open = !det.open;
    }

    function toggleFocusedDay() {
        if (!focusedDate) {
            focusedDate = firstDayInCalendar();
            setFocusedDate(focusedDate);
            return;
        }
        const card = getDayCard(focusedDate);
        if (card && typeof toggleCard === 'function') toggleCard(card, focusedDate);
    }

    // ---- DISPATCH ---------------------------------------------------------
    function isTypingTarget(target) {
        if (!target) return false;
        const tag = (target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        if (target.isContentEditable) return true;
        return false;
    }

    function handleKeydown(ev) {
        // Always allow Esc to close help / modal even when typing.
        if (ev.key === 'Escape') {
            if (helpVisible()) { hideHelp(); ev.preventDefault(); return; }
            if (typeof closeSettings === 'function') closeSettings();
            return;
        }

        if (isTypingTarget(ev.target)) return;
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

        const key = ev.key;

        // Help
        if (key === '?') { showHelp(); ev.preventDefault(); return; }

        // Month navigation
        if (key === '[') { shiftMonth(-1); ev.preventDefault(); return; }
        if (key === ']') { shiftMonth(1); ev.preventDefault(); return; }
        if (key === 'm') {
            const p = document.getElementById('monthPicker');
            if (p) { p.focus(); ev.preventDefault(); }
            return;
        }

        // Day cursor movement
        const moveMap = {
            'ArrowLeft': -1, 'h': -1,
            'ArrowRight': 1, 'l': 1,
            'ArrowUp': -7, 'k': -7,
            'ArrowDown': 7, 'j': 7
        };
        if (Object.prototype.hasOwnProperty.call(moveMap, key)) {
            const start = focusedDate || firstDayInCalendar();
            const next = shiftDate(start, moveMap[key]) || start;
            setFocusedDate(next);
            ev.preventDefault();
            return;
        }

        // Selection
        if (key === ' ' || key === 'Spacebar') {
            toggleFocusedDay();
            ev.preventDefault();
            return;
        }
        if (key === 'a') {
            if (typeof selectAllCalendarDays === 'function') {
                selectAllCalendarDays();
                if (typeof updateCounter === 'function') updateCounter();
                document.querySelectorAll('.day-card.active[data-date]').forEach(c => {
                    if (typeof appState !== 'undefined') appState.selectedDates.add(c.dataset.date);
                });
                if (window.selectionState) window.selectionState.persistCurrent();
            }
            ev.preventDefault();
            return;
        }
        if (key === 'c') {
            if (typeof clearAll === 'function') clearAll();
            ev.preventDefault();
            return;
        }

        // Actions
        if (key === 'p') {
            if (typeof previewSelection === 'function') previewSelection();
            ev.preventDefault();
            return;
        }
        if (key === 'r') {
            if (typeof startRegistration === 'function') startRegistration();
            ev.preventDefault();
            return;
        }
        if (key === 't') { toggleHourType(); ev.preventDefault(); return; }
        if (key === 'o') { toggleOverview(); ev.preventDefault(); return; }
        if (key === 'i') {
            if (typeof fetchConceptInvoices === 'function') fetchConceptInvoices();
            ev.preventDefault();
            return;
        }
        if (key === 'u') {
            if (typeof fetchExistingHours === 'function') fetchExistingHours();
            ev.preventDefault();
            return;
        }
    }

    // ---- INIT -------------------------------------------------------------
    function init() {
        document.addEventListener('keydown', handleKeydown);
        // Restore focused date from URL if provided.
        if (window.urlState) {
            const u = window.urlState.read();
            if (u.focus && getDayCard(u.focus)) {
                setFocusedDate(u.focus, { scroll: false });
            }
        }
    }

    // Expose so re-renders can reapply the visual focus.
    window.keyboardNav = {
        getFocusedDate: getFocusedDate,
        setFocusedDate: setFocusedDate,
        reapplyFocus: function () {
            if (focusedDate) {
                const card = getDayCard(focusedDate);
                if (card) card.classList.add('kbd-focus');
            }
        },
        showHelp: showHelp,
        hideHelp: hideHelp
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
