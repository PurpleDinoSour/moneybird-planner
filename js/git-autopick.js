// Moneybird Planner IV - Git Auto-Pick
// One-click select-from-git-activity. Reads the loaded commits/PRs and:
//   - WBSO mode:  selects every date that has commits + selects all commits + all PRs
//   - Facturable: selects every date that has commits (handy for "fill the days I worked")
//
// Only operates within the currently displayed month (avoids accidentally
// selecting dates outside the visible calendar).

(function () {
    'use strict';

    function currentMonthBounds() {
        var picker = document.getElementById('monthPicker');
        if (!picker || !picker.value) return null;
        var p = picker.value.split('-').map(Number);
        var year = p[0];
        var month = p[1];
        var last = new Date(year, month, 0).getDate();
        return {
            monthKey: picker.value,
            year: year,
            month: month,
            firstStr: picker.value + '-01',
            lastStr: picker.value + '-' + String(last).padStart(2, '0')
        };
    }

    function inMonth(dateStr, b) {
        return dateStr && b && dateStr >= b.firstStr && dateStr <= b.lastStr;
    }

    // Apply selection to UI: clear current selection, mark new dates active,
    // mirror to appState.selectedDates.
    function applyDateSelection(dates) {
        appState.selectedDates.clear();
        document.querySelectorAll('.day-card.active').forEach(function (c) { c.classList.remove('active'); });
        dates.forEach(function (d) {
            appState.selectedDates.add(d);
            var card = document.querySelector('.day-card[data-date="' + d + '"]');
            if (card) card.classList.add('active');
        });
    }

    function autoPick() {
        var b = currentMonthBounds();
        if (!b) {
            alert('Pick a month first.');
            return;
        }

        var commits = appState.gitCommitsData || [];
        var prs     = appState.gitPRsData     || [];

        if (commits.length === 0 && prs.length === 0) {
            alert('No git data loaded yet. Click "Load Git" first.');
            return;
        }

        var commitDates = new Set();
        var commitIdx = [];
        commits.forEach(function (c, i) {
            if (inMonth(c.fullDate, b)) {
                commitDates.add(c.fullDate);
                commitIdx.push(i);
            }
        });

        var prIdx = [];
        prs.forEach(function (p, i) {
            if (inMonth(p.fullDate, b)) prIdx.push(i);
        });

        var datesArr = Array.from(commitDates).sort();

        if (datesArr.length === 0 && prIdx.length === 0) {
            alert('No git activity in ' + b.monthKey + '.');
            return;
        }

        applyDateSelection(datesArr);

        if (appState.currentHourType === 'wbso') {
            // Replace commit + PR selection with everything in this month.
            appState.selectedCommits = commitIdx.slice();
            appState.selectedPRs     = prIdx.slice();

            // Refresh checkbox states in the git lists.
            document.querySelectorAll('#commitsList input[type=checkbox]').forEach(function (cb, i) {
                cb.checked = appState.selectedCommits.indexOf(i) !== -1;
            });
            document.querySelectorAll('#prsList input[type=checkbox]').forEach(function (cb, i) {
                cb.checked = appState.selectedPRs.indexOf(i) !== -1;
            });
        }

        if (typeof updateCounter === 'function') updateCounter();
        if (window.selectionState) window.selectionState.persistCurrent();
        if (window.autoDiff) window.autoDiff.triggerSoon();

        var msg = 'Auto-picked ' + datesArr.length + ' day' + (datesArr.length === 1 ? '' : 's')
            + ' from ' + commitIdx.length + ' commit' + (commitIdx.length === 1 ? '' : 's');
        if (appState.currentHourType === 'wbso' && prIdx.length > 0) {
            msg += ' + ' + prIdx.length + ' PR' + (prIdx.length === 1 ? '' : 's');
        }
        // Lightweight toast via the auto-diff badge if available, otherwise alert.
        var badge = document.getElementById('autoDiffBadge');
        if (badge) {
            var prev = badge.textContent;
            var prevState = badge.dataset.state;
            badge.textContent = msg;
            badge.dataset.state = 'clean';
            badge.style.display = '';
            setTimeout(function () {
                if (window.autoDiff && window.autoDiff.isEnabled()) {
                    window.autoDiff.runNow();
                } else {
                    badge.textContent = prev;
                    badge.dataset.state = prevState || 'idle';
                }
            }, 2500);
        } else {
            alert(msg);
        }
    }

    window.gitAutoPick = { run: autoPick };
})();
