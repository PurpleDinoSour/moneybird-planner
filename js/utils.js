// Moneybird Planner IV - Utility Functions
// Version: 1.0.0

// --- HTML ESCAPE ---
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function normalizeHexColor(hex) {
    if (!hex || typeof hex !== 'string') return '#3B82F6';
    var value = hex.trim();
    if (value.charAt(0) !== '#') value = '#' + value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
        return '#' + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2) + value.charAt(3) + value.charAt(3);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    return '#3B82F6';
}

function hexToRgb(hex) {
    var normalized = normalizeHexColor(hex);
    return {
        r: parseInt(normalized.substring(1, 3), 16),
        g: parseInt(normalized.substring(3, 5), 16),
        b: parseInt(normalized.substring(5, 7), 16)
    };
}

function rgbToHex(r, g, b) {
    function toHex(v) {
        var clamped = Math.max(0, Math.min(255, Math.round(v)));
        var hex = clamped.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function rgbToHsl(r, g, b) {
    var rn = r / 255;
    var gn = g / 255;
    var bn = b / 255;
    var max = Math.max(rn, gn, bn);
    var min = Math.min(rn, gn, bn);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;

    if (max !== min) {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case rn:
                h = (gn - bn) / d + (gn < bn ? 6 : 0);
                break;
            case gn:
                h = (bn - rn) / d + 2;
                break;
            default:
                h = (rn - gn) / d + 4;
                break;
        }
        h = h / 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
    var hn = ((h % 360) + 360) % 360;
    var sn = Math.max(0, Math.min(100, s)) / 100;
    var ln = Math.max(0, Math.min(100, l)) / 100;

    if (sn === 0) {
        var gray = ln * 255;
        return { r: gray, g: gray, b: gray };
    }

    var q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    var p = 2 * ln - q;

    function hueToRgb(t) {
        var tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
    }

    var hk = hn / 360;
    return {
        r: hueToRgb(hk + 1 / 3) * 255,
        g: hueToRgb(hk) * 255,
        b: hueToRgb(hk - 1 / 3) * 255
    };
}

function getExecutiveCustomerColor(hex, variant) {
    var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var palette = [
        { h: 220, color: '#3B82F6' },
        { h: 192, color: '#06B6D4' },
        { h: 168, color: '#14B8A6' },
        { h: 36, color: '#D97706' },
        { h: 262, color: '#8B5CF6' },
        { h: 344, color: '#E11D48' }
    ];

    function hueDistance(a, b) {
        var direct = Math.abs(a - b);
        return Math.min(direct, 360 - direct);
    }

    var nearest = palette[0];
    var bestDist = hueDistance(hsl.h, nearest.h);
    for (var i = 1; i < palette.length; i++) {
        var dist = hueDistance(hsl.h, palette[i].h);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = palette[i];
        }
    }

    var base = hexToRgb(nearest.color);
    var targetHsl = rgbToHsl(base.r, base.g, base.b);
    var tone = {
        h: targetHsl.h,
        s: targetHsl.s,
        l: targetHsl.l
    };

    if (variant === 'chip') {
        tone.s = 38;
        tone.l = 42;
    } else if (variant === 'dot') {
        tone.s = 48;
        tone.l = 58;
    } else if (variant === 'bar') {
        tone.s = 42;
        tone.l = 46;
    } else {
        tone.s = 42;
        tone.l = 48;
    }

    var tonedRgb = hslToRgb(tone.h, tone.s, tone.l);
    return rgbToHex(tonedRgb.r, tonedRgb.g, tonedRgb.b);
}

// --- SETTINGS MODAL ---
function openSettings() {
    document.getElementById('settingsModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    // Load customer profiles
    initializeCustomerUI();
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
    document.body.style.overflow = '';
    // Refresh project picker in case admin/token changed
    projectCache = { bv: null, holding: null };
    loadProjectPicker();
}

// --- CONFIGURATION SAVE/LOAD ---
function saveConfig() {
    // BV settings
    localStorage.setItem(STORAGE_KEYS.TOKEN_BV, document.getElementById('apiTokenBV').value);
    localStorage.setItem(STORAGE_KEYS.ADMIN_BV, document.getElementById('adminIdBV').value);
    localStorage.setItem(STORAGE_KEYS.USER_BV, document.getElementById('userIdBV').value);
    const projBV = document.getElementById('projectIdBV').value;
    if (projBV && projBV.trim() !== '') localStorage.setItem(STORAGE_KEYS.PROJ_BV, projBV);
    else localStorage.removeItem(STORAGE_KEYS.PROJ_BV);

    // Holding settings
    localStorage.setItem(STORAGE_KEYS.TOKEN_HOLDING, document.getElementById('apiTokenHolding').value);
    localStorage.setItem(STORAGE_KEYS.ADMIN_HOLDING, document.getElementById('adminIdHolding').value);
    localStorage.setItem(STORAGE_KEYS.USER_HOLDING, document.getElementById('userIdHolding').value);
    const projHolding = document.getElementById('projectIdHolding').value;
    if (projHolding && projHolding.trim() !== '') localStorage.setItem(STORAGE_KEYS.PROJ_HOLDING, projHolding);
    else localStorage.removeItem(STORAGE_KEYS.PROJ_HOLDING);
    localStorage.setItem(STORAGE_KEYS.WBSO_BILLABLE, document.getElementById('wbsoBillable').checked);
    localStorage.setItem(STORAGE_KEYS.WBSO_BUDGET, document.getElementById('wbsoBudget').value);
    localStorage.setItem(STORAGE_KEYS.MATCH_COMMITS_DATES, document.getElementById('matchCommitsToDates').checked);
    localStorage.setItem(STORAGE_KEYS.ONLY_DAYS_WITH_COMMITS, document.getElementById('onlyDaysWithCommits').checked);
    localStorage.setItem(STORAGE_KEYS.ONE_ENTRY_PER_COMMIT, document.getElementById('oneEntryPerCommit').checked);

    // GitHub settings
    localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, document.getElementById('githubToken').value);
    localStorage.setItem(STORAGE_KEYS.GITHUB_REPO, document.getElementById('githubRepo').value);

    // Azure DevOps settings
    localStorage.setItem(STORAGE_KEYS.GIT_SOURCE, document.getElementById('gitSource').value);
    localStorage.setItem(STORAGE_KEYS.AZURE_AUTH_METHOD, document.getElementById('azureAuthMethod').value);
    localStorage.setItem(STORAGE_KEYS.AZURE_USERNAME, document.getElementById('azureUsername').value);
    localStorage.setItem(STORAGE_KEYS.AZURE_TOKEN, document.getElementById('azureToken').value);
    localStorage.setItem(STORAGE_KEYS.AZURE_PASSWORD, document.getElementById('azurePassword').value);
    localStorage.setItem(STORAGE_KEYS.AZURE_ORG, document.getElementById('azureOrg').value);

    // Save selected projects
    const selectedProjects = [];
    document.querySelectorAll('#azureProjectList input:checked').forEach(cb => {
        selectedProjects.push(cb.value);
    });
    localStorage.setItem(STORAGE_KEYS.AZURE_PROJECTS, JSON.stringify(selectedProjects));
    localStorage.setItem(STORAGE_KEYS.AUTHOR_FILTER, document.getElementById('authorFilter').value);

    // General settings
    localStorage.setItem(STORAGE_KEYS.LUNCH, document.getElementById('lunchBreak').checked);
    localStorage.setItem(STORAGE_KEYS.HOUR_TYPE, appState.currentHourType);
    localStorage.setItem(STORAGE_KEYS.HOURS_PER_COMMIT, document.getElementById('hoursPerCommit').value);

    // Jobs
    saveJobs();
}

function loadConfig() {
    // Load BV settings
    if (localStorage.getItem(STORAGE_KEYS.TOKEN_BV)) document.getElementById('apiTokenBV').value = localStorage.getItem(STORAGE_KEYS.TOKEN_BV);
    if (localStorage.getItem(STORAGE_KEYS.ADMIN_BV)) document.getElementById('adminIdBV').value = localStorage.getItem(STORAGE_KEYS.ADMIN_BV);
    if (localStorage.getItem(STORAGE_KEYS.USER_BV)) document.getElementById('userIdBV').value = localStorage.getItem(STORAGE_KEYS.USER_BV);
    if (localStorage.getItem(STORAGE_KEYS.PROJ_BV)) document.getElementById('projectIdBV').value = localStorage.getItem(STORAGE_KEYS.PROJ_BV);

    // Load Holding settings
    if (localStorage.getItem(STORAGE_KEYS.TOKEN_HOLDING)) document.getElementById('apiTokenHolding').value = localStorage.getItem(STORAGE_KEYS.TOKEN_HOLDING);
    if (localStorage.getItem(STORAGE_KEYS.ADMIN_HOLDING)) document.getElementById('adminIdHolding').value = localStorage.getItem(STORAGE_KEYS.ADMIN_HOLDING);
    if (localStorage.getItem(STORAGE_KEYS.USER_HOLDING)) document.getElementById('userIdHolding').value = localStorage.getItem(STORAGE_KEYS.USER_HOLDING);
    if (localStorage.getItem(STORAGE_KEYS.PROJ_HOLDING)) document.getElementById('projectIdHolding').value = localStorage.getItem(STORAGE_KEYS.PROJ_HOLDING);
    if (localStorage.getItem(STORAGE_KEYS.WBSO_BILLABLE) !== null) document.getElementById('wbsoBillable').checked = localStorage.getItem(STORAGE_KEYS.WBSO_BILLABLE) === 'true';
    if (localStorage.getItem(STORAGE_KEYS.MATCH_COMMITS_DATES) !== null) document.getElementById('matchCommitsToDates').checked = localStorage.getItem(STORAGE_KEYS.MATCH_COMMITS_DATES) === 'true';
    if (localStorage.getItem(STORAGE_KEYS.ONLY_DAYS_WITH_COMMITS) !== null) document.getElementById('onlyDaysWithCommits').checked = localStorage.getItem(STORAGE_KEYS.ONLY_DAYS_WITH_COMMITS) === 'true';
    if (localStorage.getItem(STORAGE_KEYS.ONE_ENTRY_PER_COMMIT) !== null) document.getElementById('oneEntryPerCommit').checked = localStorage.getItem(STORAGE_KEYS.ONE_ENTRY_PER_COMMIT) === 'true';
    else document.getElementById('oneEntryPerCommit').checked = true;
    if (localStorage.getItem(STORAGE_KEYS.WBSO_BUDGET)) document.getElementById('wbsoBudget').value = localStorage.getItem(STORAGE_KEYS.WBSO_BUDGET);

    // Load GitHub settings
    if (localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)) document.getElementById('githubToken').value = localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN);
    if (localStorage.getItem(STORAGE_KEYS.GITHUB_REPO)) document.getElementById('githubRepo').value = localStorage.getItem(STORAGE_KEYS.GITHUB_REPO);

    // Load Azure DevOps settings
    if (localStorage.getItem(STORAGE_KEYS.GIT_SOURCE)) document.getElementById('gitSource').value = localStorage.getItem(STORAGE_KEYS.GIT_SOURCE);
    if (localStorage.getItem(STORAGE_KEYS.AZURE_AUTH_METHOD)) document.getElementById('azureAuthMethod').value = localStorage.getItem(STORAGE_KEYS.AZURE_AUTH_METHOD);
    if (localStorage.getItem(STORAGE_KEYS.AZURE_USERNAME)) document.getElementById('azureUsername').value = localStorage.getItem(STORAGE_KEYS.AZURE_USERNAME);
    if (localStorage.getItem(STORAGE_KEYS.AZURE_TOKEN)) document.getElementById('azureToken').value = localStorage.getItem(STORAGE_KEYS.AZURE_TOKEN);
    if (localStorage.getItem(STORAGE_KEYS.AZURE_PASSWORD)) document.getElementById('azurePassword').value = localStorage.getItem(STORAGE_KEYS.AZURE_PASSWORD);
    if (localStorage.getItem(STORAGE_KEYS.AZURE_ORG)) document.getElementById('azureOrg').value = localStorage.getItem(STORAGE_KEYS.AZURE_ORG);

    // Load selected projects
    if (localStorage.getItem(STORAGE_KEYS.AZURE_PROJECTS)) {
        const savedProjects = JSON.parse(localStorage.getItem(STORAGE_KEYS.AZURE_PROJECTS));
        document.querySelectorAll('#azureProjectList input').forEach(cb => {
            cb.checked = savedProjects.includes(cb.value);
        });
    } else {
        document.querySelectorAll('#azureProjectList input').forEach(cb => {
            cb.checked = DEFAULT_PROJECTS.includes(cb.value);
        });
    }
    if (localStorage.getItem(STORAGE_KEYS.AUTHOR_FILTER)) document.getElementById('authorFilter').value = localStorage.getItem(STORAGE_KEYS.AUTHOR_FILTER);

    // Load general settings
    if (localStorage.getItem(STORAGE_KEYS.LUNCH) !== null) document.getElementById('lunchBreak').checked = localStorage.getItem(STORAGE_KEYS.LUNCH) === 'true';
    if (localStorage.getItem(STORAGE_KEYS.HOUR_TYPE)) appState.currentHourType = localStorage.getItem(STORAGE_KEYS.HOUR_TYPE);
    if (localStorage.getItem(STORAGE_KEYS.HOURS_PER_COMMIT)) document.getElementById('hoursPerCommit').value = localStorage.getItem(STORAGE_KEYS.HOURS_PER_COMMIT);

    // Load jobs (with migration from old format)
    loadJobs();
}

// --- GET CURRENT CONFIG BASED ON HOUR TYPE ---
function getCurrentConfig() {
    if (appState.currentHourType === 'wbso') {
        return {
            token: document.getElementById('apiTokenHolding').value,
            adminId: document.getElementById('adminIdHolding').value,
            userId: document.getElementById('userIdHolding').value,
            projectId: document.getElementById('projectIdHolding').value,
            billable: document.getElementById('wbsoBillable').checked
        };
    } else {
        return {
            token: document.getElementById('apiTokenBV').value,
            adminId: document.getElementById('adminIdBV').value,
            userId: document.getElementById('userIdBV').value,
            projectId: document.getElementById('projectIdBV').value,
            billable: true
        };
    }
}

// --- HOUR TYPE SWITCHING ---
function setHourType(type) {
    appState.currentHourType = type;
    saveConfig();
    if (window.urlState) window.urlState.write({ type: type });

    // Update tabs
    document.querySelectorAll('.hour-type-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector('.hour-type-tab.' + type).classList.add('active');

    // Toggle body class
    document.body.classList.toggle('wbso-mode', type === 'wbso');

    // Show/hide mode-specific sections
    document.getElementById('gitSection').style.display = type === 'wbso' ? 'block' : 'none';
    document.getElementById('wbsoComment').style.display = type === 'wbso' ? 'block' : 'none';
    document.getElementById('jobsCard').style.display = type === 'wbso' ? 'none' : 'block';
    document.getElementById('workingHoursCard').style.display = type === 'wbso' ? 'block' : 'none';
    document.getElementById('projectPickerCard').style.display = type === 'wbso' ? 'block' : 'none';
    renderScheduleGrid();
    document.getElementById('facturableTimeSettings').style.display = 'none';
    document.getElementById('wbsoTimeSettings').style.display = type === 'wbso' ? 'block' : 'none';

    // Update description
    if (type === 'wbso') {
        document.getElementById('desc').placeholder = 'WBSO R&D Work';
        document.getElementById('desc').value = '';
        selectAllCalendarDays();
        refreshWbsoDashboard();
    } else {
        document.getElementById('desc').placeholder = 'Consultancy uren';
        document.getElementById('desc').value = 'Consultancy uren';
        // Recompute calendar so the (type, month) saved selection is loaded.
        appState.lastCalendarMonth = null;
        if (typeof renderCalendar === 'function') renderCalendar();
    }

    updateCounter();
    if (type === 'wbso') loadProjectPicker();
    // Type switch swaps Moneybird admin -> invalidate auto-diff cache.
    if (window.autoDiff) {
        window.autoDiff.invalidate();
        window.autoDiff.triggerSoon();
    }
}

// --- UPDATE TIME NOTATION ---
function updateTimeNotation() {
    const hpc = parseFloat(document.getElementById('hoursPerCommit').value) || 1;
    // Update all hours inputs in the git list to the new default
    document.querySelectorAll('#gitCombinedList .hours-input').forEach((input, idx) => {
        input.value = hpc;
    });
    // Also update the stored data
    if (appState.gitCommitsData) {
        appState.gitCommitsData.forEach(c => c.hours = hpc);
    }
    if (appState.gitPRsData) {
        appState.gitPRsData.forEach(p => p.hours = hpc);
    }
    // Update calendar hours display
    renderCalendar();
}
