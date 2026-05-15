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

    // Set current month
    const now = new Date();
    document.getElementById('monthPicker').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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
        overviewDetails.addEventListener('toggle', () => {
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
