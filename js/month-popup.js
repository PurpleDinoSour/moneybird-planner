// Moneybird Planner IV - Month/Year Picker Popup
// Two views: 'months' (year nav + 12 months) and 'years' (decade nav + 12 years).
// Picking a month writes the value back into #monthPicker and dispatches 'change'
// so every existing listener (renderCalendar, overview, autoDiff, ...) just runs.

(function () {
    'use strict';

    var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var popupEl = null;
    var viewYear = null;
    var viewDecade = null;   // first year of currently displayed 12-year block
    var mode = 'months';     // 'months' | 'years'

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
        document.body.appendChild(popupEl);
        return popupEl;
    }

    function render() {
        ensurePopup();
        if (mode === 'months') renderMonths();
        else renderYears();
    }

    function renderMonths() {
        var sel = currentSelection();
        var todayY = new Date().getFullYear();
        var todayM = new Date().getMonth() + 1;

        popupEl.innerHTML = ''
            + '<div class="month-popup-header">'
            + '  <button type="button" class="month-popup-nav" id="mpNavPrev" aria-label="Previous year">&#9664;</button>'
            + '  <button type="button" class="month-popup-year-btn" id="mpYearBtn" title="Pick a year">' + viewYear + '</button>'
            + '  <button type="button" class="month-popup-nav" id="mpNavNext" aria-label="Next year">&#9654;</button>'
            + '</div>'
            + '<div class="month-popup-grid" id="mpGrid"></div>'
            + '<div class="month-popup-footer">'
            + '  <button type="button" class="month-popup-today" id="mpToday">This month</button>'
            + '</div>';

        var gridHtml = '';
        for (var m = 1; m <= 12; m++) {
            var cls = 'month-popup-cell';
            if (viewYear === sel.year && m === sel.month) cls += ' is-selected';
            if (viewYear === todayY && m === todayM) cls += ' is-today';
            gridHtml += '<button type="button" class="' + cls + '" data-month="' + m + '">' + MONTHS_SHORT[m - 1] + '</button>';
        }
        document.getElementById('mpGrid').innerHTML = gridHtml;

        document.getElementById('mpNavPrev').addEventListener('click', function (e) { e.stopPropagation(); viewYear -= 1; renderMonths(); });
        document.getElementById('mpNavNext').addEventListener('click', function (e) { e.stopPropagation(); viewYear += 1; renderMonths(); });
        document.getElementById('mpYearBtn').addEventListener('click', function (e) { e.stopPropagation(); openYearView(); });
        document.getElementById('mpToday').addEventListener('click', function (e) { e.stopPropagation(); var n = new Date(); apply(n.getFullYear(), n.getMonth() + 1); });
        document.getElementById('mpGrid').querySelectorAll('[data-month]').forEach(function (b) {
            b.addEventListener('click', function (e) { e.stopPropagation(); apply(viewYear, parseInt(b.dataset.month, 10)); });
        });
    }

    function openYearView() {
        viewDecade = viewYear - (((viewYear % 12) + 12) % 12); // align to 12-year block
        mode = 'years';
        renderYears();
    }

    function renderYears() {
        var sel = currentSelection();
        var todayY = new Date().getFullYear();
        var rangeLabel = viewDecade + ' - ' + (viewDecade + 11);

        popupEl.innerHTML = ''
            + '<div class="month-popup-header">'
            + '  <button type="button" class="month-popup-nav" id="mpNavPrev" aria-label="Previous years">&#9664;</button>'
            + '  <button type="button" class="month-popup-year-btn" id="mpBackBtn" title="Back to months">' + rangeLabel + '</button>'
            + '  <button type="button" class="month-popup-nav" id="mpNavNext" aria-label="Next years">&#9654;</button>'
            + '</div>'
            + '<div class="month-popup-grid" id="mpGrid"></div>'
            + '<div class="month-popup-footer">'
            + '  <button type="button" class="month-popup-today" id="mpToday">This month</button>'
            + '</div>';

        var gridHtml = '';
        for (var i = 0; i < 12; i++) {
            var y = viewDecade + i;
            var cls = 'month-popup-cell';
            if (y === sel.year) cls += ' is-selected';
            if (y === todayY) cls += ' is-today';
            gridHtml += '<button type="button" class="' + cls + '" data-year="' + y + '">' + y + '</button>';
        }
        document.getElementById('mpGrid').innerHTML = gridHtml;

        document.getElementById('mpNavPrev').addEventListener('click', function (e) { e.stopPropagation(); viewDecade -= 12; renderYears(); });
        document.getElementById('mpNavNext').addEventListener('click', function (e) { e.stopPropagation(); viewDecade += 12; renderYears(); });
        document.getElementById('mpBackBtn').addEventListener('click', function (e) { e.stopPropagation(); mode = 'months'; renderMonths(); });
        document.getElementById('mpToday').addEventListener('click', function (e) { e.stopPropagation(); var n = new Date(); apply(n.getFullYear(), n.getMonth() + 1); });
        document.getElementById('mpGrid').querySelectorAll('[data-year]').forEach(function (b) {
            b.addEventListener('click', function (e) { e.stopPropagation(); viewYear = parseInt(b.dataset.year, 10); mode = 'months'; renderMonths(); });
        });
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
        mode = 'months';
        render();
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
            if (popupEl && (popupEl.contains(ev.target) || ev.target === btn)) return;
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
