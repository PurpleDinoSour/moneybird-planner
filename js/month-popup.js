// Moneybird Planner IV - Month/Year Picker Popup
// Clickable popover with year navigation + 4x3 month grid. Sits next to the
// native <input type="month"> so manual typing keeps working as before. Picking
// a month writes the value back into #monthPicker and dispatches 'change' so
// every existing listener (renderCalendar, overview, autoDiff, ...) just runs.

(function () {
    'use strict';

    var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var popupEl = null;
    var viewYear = null;

    function getPickerInput() { return document.getElementById('monthPicker'); }
    function getTriggerBtn() { return document.getElementById('monthPopupBtn'); }

    function currentSelection() {
        var inp = getPickerInput();
        if (!inp || !inp.value) {
            var now = new Date();
            return { year: now.getFullYear(), month: now.getMonth() + 1 };
        }
        var parts = inp.value.split('-').map(Number);
        return { year: parts[0], month: parts[1] };
    }

    function ensurePopup() {
        if (popupEl) return popupEl;
        popupEl = document.createElement('div');
        popupEl.id = 'monthPickerPopup';
        popupEl.className = 'month-popup';
        popupEl.setAttribute('role', 'dialog');
        popupEl.setAttribute('aria-label', 'Pick month');
        popupEl.innerHTML = [
            '<div class="month-popup-header">',
            '  <button type="button" class="month-popup-nav" data-nav="-1" aria-label="Previous year">&#9664;</button>',
            '  <span class="month-popup-year" id="monthPopupYear"></span>',
            '  <button type="button" class="month-popup-nav" data-nav="1" aria-label="Next year">&#9654;</button>',
            '</div>',
            '<div class="month-popup-grid" id="monthPopupGrid"></div>',
            '<div class="month-popup-footer">',
            '  <button type="button" class="month-popup-today" id="monthPopupToday">This month</button>',
            '</div>'
        ].join('');
        document.body.appendChild(popupEl);

        popupEl.addEventListener('click', function (ev) {
            var nav = ev.target.closest('[data-nav]');
            if (nav) { viewYear += parseInt(nav.dataset.nav, 10); renderGrid(); return; }
            var cell = ev.target.closest('[data-month]');
            if (cell) { apply(viewYear, parseInt(cell.dataset.month, 10)); return; }
            if (ev.target.id === 'monthPopupToday') {
                var n = new Date(); apply(n.getFullYear(), n.getMonth() + 1); return;
            }
        });

        return popupEl;
    }

    function renderGrid() {
        var sel = currentSelection();
        var todayY = new Date().getFullYear();
        var todayM = new Date().getMonth() + 1;
        document.getElementById('monthPopupYear').textContent = viewYear;
        var grid = document.getElementById('monthPopupGrid');
        var html = '';
        for (var m = 1; m <= 12; m++) {
            var cls = 'month-popup-cell';
            if (viewYear === sel.year && m === sel.month) cls += ' is-selected';
            if (viewYear === todayY && m === todayM) cls += ' is-today';
            html += '<button type="button" class="' + cls + '" data-month="' + m + '">' + MONTHS_SHORT[m - 1] + '</button>';
        }
        grid.innerHTML = html;
    }

    function position() {
        var btn = getTriggerBtn();
        if (!btn || !popupEl) return;
        var r = btn.getBoundingClientRect();
        popupEl.style.position = 'fixed';
        popupEl.style.top = (r.bottom + 6) + 'px';
        var w = 260;
        var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
        popupEl.style.left = left + 'px';
    }

    function open() {
        ensurePopup();
        var sel = currentSelection();
        viewYear = sel.year;
        renderGrid();
        popupEl.classList.add('is-open');
        position();
        var btn = getTriggerBtn(); if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    function close() {
        if (!popupEl) return;
        popupEl.classList.remove('is-open');
        var btn = getTriggerBtn(); if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function isOpen() { return popupEl && popupEl.classList.contains('is-open'); }

    function apply(year, month) {
        var inp = getPickerInput();
        if (!inp) return;
        inp.value = year + '-' + String(month).padStart(2, '0');
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        close();
    }

    function init() {
        var btn = getTriggerBtn();
        if (!btn) return;
        btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (isOpen()) close(); else open();
        });
        document.addEventListener('click', function (ev) {
            if (!isOpen()) return;
            if (popupEl.contains(ev.target) || ev.target === btn) return;
            close();
        });
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && isOpen()) { close(); ev.stopPropagation(); }
        });
        window.addEventListener('resize', function () { if (isOpen()) position(); });
        window.addEventListener('scroll', function () { if (isOpen()) position(); }, true);
    }

    window.monthPopup = { open: open, close: close };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();
