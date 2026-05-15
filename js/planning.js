// Moneybird Planner IV - Planning Module
// Builds the canonical "planned entries" list from the current selection.
// Pulled out of moneybird.js so it can be reused by:
//   - registerStandard()                 (actual POST)
//   - autoDiff.runNow()                  (continuous calendar overlay)
//   - dual-mode WBSO overlay             (preview totals)
//
// One source of truth = guaranteed that the diff classification matches
// what will actually be POSTed.

(function () {
    'use strict';

    // Build the planned entries for a given hour-type (defaults to current).
    // Returns an array of { date, description, startTime, endTime, lunch,
    //                       projectId, jobName, hours }
    //
    // NOTE: this mirrors the entry-construction inside registerStandard().
    // If that function changes, update here too.
    function buildPlannedEntries(opts) {
        opts = opts || {};
        var type = opts.type || (window.appState && appState.currentHourType) || 'facturable';
        var dates = opts.dates || (window.appState ? Array.from(appState.selectedDates).sort() : []);

        var baseDesc = '';
        var descEl = document.getElementById('desc');
        if (descEl) baseDesc = descEl.value || '';

        var wbsoCommentEl = document.getElementById('wbsoComment');
        var wbsoComment = wbsoCommentEl ? wbsoCommentEl.value : '';

        var entries = [];

        if (type === 'facturable' && window.appState && appState.jobs.length > 0) {
            dates.forEach(function (date) {
                var jobsForDate = (typeof getJobsForDate === 'function') ? getJobsForDate(date) : [];
                jobsForDate.forEach(function (job) {
                    var sched = (typeof getScheduleForJobDate === 'function')
                        ? getScheduleForJobDate(job, date)
                        : { start: '09:00', end: '17:00', lunch: true };
                    entries.push({
                        date: date,
                        description: job.description || baseDesc,
                        startTime: sched.start,
                        endTime: sched.end,
                        lunch: sched.lunch,
                        projectId: job.projectId,
                        jobName: job.name,
                        hours: (typeof calculateJobHours === 'function') ? calculateJobHours(sched) : null
                    });
                });
            });
        } else {
            // WBSO or facturable without jobs configured
            var startEl = document.getElementById('startTime');
            var endEl   = document.getElementById('endTime');
            var lunchEl = document.getElementById('lunchBreak');
            var startTime = startEl ? startEl.value : '09:00';
            var endTime   = endEl ? endEl.value : '17:00';
            var lunch     = lunchEl ? lunchEl.checked : true;

            // For WBSO build the same description registerStandard would.
            var fullDesc = baseDesc;
            if (type === 'wbso') {
                var gitInfo = '';
                if (appState.gitCommitsData && appState.selectedCommits && appState.selectedCommits.length > 0) {
                    var commits = appState.selectedCommits.map(function (i) { return appState.gitCommitsData[i]; });
                    gitInfo = commits.map(function (c, i) {
                        return (i + 1) + '. [' + c.hash.substring(0, 7) + '] ' + c.message;
                    }).join(' /// ');
                }
                if (appState.gitPRsData && appState.selectedPRs && appState.selectedPRs.length > 0) {
                    var prs = appState.selectedPRs.map(function (i) { return appState.gitPRsData[i]; });
                    if (gitInfo) gitInfo += ' /// ';
                    gitInfo += 'PRs: ' + prs.map(function (p) { return '#' + p.number; }).join(', ');
                }
                if (gitInfo) fullDesc += ' | ' + gitInfo;
                if (wbsoComment) fullDesc += ' | ' + wbsoComment;
            }

            var projectId = opts.projectId
                || (typeof getCurrentConfig === 'function' ? getCurrentConfig().projectId : null);

            dates.forEach(function (date) {
                entries.push({
                    date: date,
                    description: fullDesc,
                    startTime: startTime,
                    endTime: endTime,
                    lunch: lunch,
                    projectId: projectId,
                    jobName: null,
                    hours: null
                });
            });
        }

        return entries;
    }

    window.planning = {
        buildPlannedEntries: buildPlannedEntries
    };
})();
