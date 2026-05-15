// Moneybird Planner IV - Configuration
// Version: 1.0.0

// --- CONSTANTS ---
const CONFIG = {
    PORT: 8000,
    API_BASE_URL: 'http://localhost:8000',
    MONEYBIRD_API_URL: 'https://moneybird.com/api/v2'
};

const HOLIDAYS_NL_2026 = {
    "2026-01-01": "Nieuwjaar",
    "2026-04-03": "Goede Vrijdag",
    "2026-04-05": "1e Paasdag",
    "2026-04-06": "2e Paasdag",
    "2026-04-27": "Koningsdag",
    "2026-05-05": "Bevrijdingsdag",
    "2026-05-14": "Hemelvaartsdag",
    "2026-05-24": "1e Pinksterdag",
    "2026-05-25": "2e Pinksterdag",
    "2026-12-25": "1e Kerstdag",
    "2026-12-26": "2e Kerstdag"
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const DEFAULT_PROJECTS = [
    'M365DSC_CICD_PRD',
    'M365DSC_Data_PRD',
    'M365DSC_Data_NPRD',
    'M365DSC_CICD_NPRD'
];

const JOB_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

// --- APPLICATION STATE ---
const appState = {
    currentHourType: 'facturable',
    jobs: [],
    selectedDates: new Set(),
    fetchedEntries: [],
    selectedCommits: [],
    selectedPRs: [],
    gitCommitsData: null,
    gitPRsData: null,
    lastCalendarMonth: null,
    missingDates: [],
    conceptInvoices: []
};

// --- WBSO DASHBOARD STATE ---
const wbsoDashboardState = {
    data: { all: [], year: [], month: [], week: [], today: [] },
    lastRefresh: 0,
    cooldown: 10000 // 10 second cooldown between refreshes
};

// --- LOCAL STORAGE KEYS ---
const STORAGE_KEYS = {
    // BV Settings
    TOKEN_BV: 'mb3_token_bv',
    ADMIN_BV: 'mb3_admin_bv',
    USER_BV: 'mb3_user_bv',
    PROJ_BV: 'mb3_proj_bv',

    // Holding Settings
    TOKEN_HOLDING: 'mb3_token_holding',
    ADMIN_HOLDING: 'mb3_admin_holding',
    USER_HOLDING: 'mb3_user_holding',
    PROJ_HOLDING: 'mb3_proj_holding',
    WBSO_BILLABLE: 'mb3_wbso_billable',
    WBSO_BUDGET: 'mb3_wbso_budget',

    // Git Settings
    GITHUB_TOKEN: 'mb3_github_token',
    GITHUB_REPO: 'mb3_github_repo',
    GIT_SOURCE: 'mb3_git_source',
    AZURE_AUTH_METHOD: 'mb3_azure_auth_method',
    AZURE_USERNAME: 'mb3_azure_username',
    AZURE_TOKEN: 'mb3_azure_token',
    AZURE_PASSWORD: 'mb3_azure_password',
    AZURE_ORG: 'mb3_azure_org',
    AZURE_PROJECTS: 'mb3_azure_projects',
    AUTHOR_FILTER: 'mb3_author_filter',

    // General Settings
    LUNCH: 'mb3_lunch',
    HOUR_TYPE: 'mb3_hour_type',
    HOURS_PER_COMMIT: 'mb3_hours_per_commit',
    MATCH_COMMITS_DATES: 'mb3_match_commits_dates',
    ONLY_DAYS_WITH_COMMITS: 'mb3_only_days_with_commits',
    ONE_ENTRY_PER_COMMIT: 'mb3_one_entry_per_commit',
    JOBS: 'mb3_jobs'
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, HOLIDAYS_NL_2026, DAY_NAMES, MONTH_NAMES, DEFAULT_PROJECTS, appState, wbsoDashboardState, STORAGE_KEYS };
}
