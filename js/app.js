// Moneybird Planner IV - Main Application Module
// Version: 1.0.0

// --- INITIALIZATION ---
function init() {
    // Load configuration from localStorage
    loadConfig();

    // Pull shared customer profiles on startup.
    loadCustomerConfigs().catch(error => {
        console.warn('[CUSTOMER_CONFIG] Startup sync failed:', error.message);
    });

    // Pull shared job profiles on startup (git pull + merge).
    loadJobsFromServer().catch(error => {
        console.warn('[Jobs] Startup sync failed:', error.message);
    });

    // Set current month - URL param wins over today.
    const now = new Date();
    let initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let initialView = null;
    if (window.urlState) {
        const u = window.urlState.read();
        if (u.month && /^\d{4}-\d{2}$/.test(u.month)) initialMonth = u.month;
        if (u.type === 'wbso' || u.type === 'facturable') {
            appState.currentHourType = u.type;
        }
        if (u.view === 'compact' || u.view === 'overview') initialView = u.view;
    }
    document.getElementById('monthPicker').value = initialMonth;

    // Render job list and calendar
    renderJobsList();
    renderCalendar();
    renderScheduleGrid();
    setHourType(appState.currentHourType);
    updateGitSourceUI();
    updateAzureAuthUI();
    updateCommitBasedUI();
    renderCustomerOverview();

    const overviewDetails = document.getElementById('customerOverviewDetails');
    if (overviewDetails) {
        if (initialView === 'compact') overviewDetails.open = false;
        if (initialView === 'overview') overviewDetails.open = true;
        overviewDetails.addEventListener('toggle', () => {
            if (window.urlState) {
                window.urlState.write({ view: overviewDetails.open ? 'overview' : 'compact' });
            }
            if (overviewDetails.open) {
                renderCustomerOverview();
            }
        });
    }
}

// --- EVENT BINDINGS ---
function bindEvents() {
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSettings();
    });

    // Month picker change
    document.getElementById('monthPicker').addEventListener('change', () => {
        // Stale Moneybird data from the previous month should not bleed into
        // the new view. Clear and hide the Existing Hours panel so the user
        // has to click Manage Hours to fetch fresh data for the new month.
        if (window.appState) appState.fetchedEntries = [];
        var hoursSection = document.getElementById('hoursManagementSection');
        if (hoursSection) hoursSection.style.display = 'none';
        var hoursList = document.getElementById('hoursList');
        if (hoursList) hoursList.innerHTML = '';
        var hoursCount = document.getElementById('hoursCount');
        if (hoursCount) hoursCount.textContent = '0 entries loaded';
        renderCalendar();
        renderScheduleGrid();
    });

    // Settings save on input change
    const settingsInputs = document.querySelectorAll('#settingsModal input, #settingsModal select');
    settingsInputs.forEach(input => {
        input.addEventListener('change', saveConfig);
    });

    // Hour type tabs
    document.querySelectorAll('.hour-type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.classList.contains('wbso') ? 'wbso' : 'facturable';
            setHourType(type);
        });
    });

    // Hours list checkboxes
    document.getElementById('hoursList').addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            updateHoursCount();
        }
    });
}

// --- INITIALIZE ON DOM READY ---
document.addEventListener('DOMContentLoaded', () => {
    init();
    bindEvents();
});
