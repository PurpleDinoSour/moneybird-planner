// Moneybird Planner IV - Utility Functions
// Version: 1.0.0

// --- HTML ESCAPE ---
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    }

    updateCounter();
    if (type === 'wbso') loadProjectPicker();
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
