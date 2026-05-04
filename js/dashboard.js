// Moneybird Planner IV - WBSO Dashboard Module
// Version: 1.0.0

// --- WBSO DASHBOARD ---
async function refreshWbsoDashboard() {
    console.log('[WBSO] Starting dashboard refresh...');

    // Rate limit protection
    const now = Date.now();
    if (now - wbsoDashboardState.lastRefresh < wbsoDashboardState.cooldown) {
        const wait = Math.ceil((wbsoDashboardState.cooldown - (now - wbsoDashboardState.lastRefresh)) / 1000);
        console.log(`[WBSO] Rate limited - wait ${wait}s`);
        document.getElementById('dashSpent').textContent = `Wait ${wait}s`;
        return;
    }
    wbsoDashboardState.lastRefresh = now;

    const config = {
        token: document.getElementById('apiTokenHolding').value,
        adminId: document.getElementById('adminIdHolding').value,
        userId: document.getElementById('userIdHolding').value
    };
    console.log('[WBSO] Config:', { adminId: config.adminId, userId: config.userId, hasToken: !!config.token });

    if (!config.token || !config.adminId) {
        console.log('[WBSO] Missing credentials, rendering empty dashboard');
        renderWbsoDashboard(); // Render with empty data
        return;
    }

    // Show loading state
    document.getElementById('dashSpent').textContent = '...';
    document.getElementById('dashRemaining').textContent = '...';

    try {
        // Fetch ALL time entries for the entire year (and potentially previous year for WBSO period)
        const currentDate = new Date();
        const year = currentDate.getFullYear();

        // Fetch from Jan 1 of current year to today
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        console.log(`[WBSO] Fetching time entries for ${startDate} to ${endDate}...`);
        const response = await fetch(`${CONFIG.API_BASE_URL}/moneybird/${config.adminId}/time_entries?filter=period:${startDate}..${endDate}`, {
            headers: { 'X-Moneybird-Token': config.token }
        });

        console.log(`[WBSO] API response status: ${response.status}`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        let entries = await response.json();
        console.log(`[WBSO] Total entries fetched: ${entries.length}`);

        // Filter by user
        entries = entries.filter(e => e.user_id === config.userId);
        console.log(`[WBSO] Entries for user ${config.userId}: ${entries.length}`);

        // Calculate time periods
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Sunday

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const yearStart = new Date(today.getFullYear(), 0, 1);

        wbsoDashboardState.data = {
            all: entries,
            year: entries.filter(e => {
                const d = new Date(e.started_at);
                return d >= yearStart;
            }),
            month: entries.filter(e => {
                const d = new Date(e.started_at);
                return d >= monthStart;
            }),
            week: entries.filter(e => {
                const d = new Date(e.started_at);
                return d >= weekStart;
            }),
            today: entries.filter(e => {
                const d = new Date(e.started_at);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime();
            })
        };

        console.log('[WBSO] Breakdown:', {
            year: wbsoDashboardState.data.year.length + ' entries',
            month: wbsoDashboardState.data.month.length + ' entries',
            week: wbsoDashboardState.data.week.length + ' entries',
            today: wbsoDashboardState.data.today.length + ' entries'
        });

        renderWbsoDashboard();
        console.log('[WBSO] Dashboard rendered successfully');
    } catch (err) {
        console.error('[WBSO] Dashboard fetch error:', err);
        if (err.message.includes('429')) {
            console.warn('[WBSO] Rate limited by Moneybird API - enforcing 60s cooldown');
            document.getElementById('dashSpent').textContent = 'Rate limited';
            document.getElementById('dashRemaining').textContent = 'Wait 1 min';
            wbsoDashboardState.lastRefresh = Date.now() + 50000; // Force longer wait after 429
        } else if (err.message.includes('403')) {
            document.getElementById('dashSpent').textContent = 'No access';
            document.getElementById('dashRemaining').textContent = '-';
            console.error('[WBSO] 403 - Check Holding API token and Admin ID in Settings');
        } else {
            document.getElementById('dashSpent').textContent = 'Error';
            document.getElementById('dashRemaining').textContent = '-';
        }
    }
}

function calculateHours(entries) {
    let totalMinutes = 0;
    entries.forEach(entry => {
        if (entry.started_at && entry.ended_at) {
            const start = new Date(entry.started_at);
            const end = new Date(entry.ended_at);
            totalMinutes += (end - start) / 1000 / 60;
        }
    });
    return totalMinutes / 60;
}

function formatHours(hours) {
    if (isNaN(hours)) return '-';
    return hours.toFixed(1) + 'h';
}

function renderWbsoDashboard() {
    const budget = parseFloat(document.getElementById('wbsoBudget')?.value) || 1210;
    const data = wbsoDashboardState.data;

    const spentYear = calculateHours(data.year);
    const spentMonth = calculateHours(data.month);
    const spentWeek = calculateHours(data.week);
    const spentToday = calculateHours(data.today);

    // Use year total as spent (assuming WBSO period is the calendar year)
    const totalSpent = spentYear;
    const remaining = budget - totalSpent;
    const percentUsed = Math.min((totalSpent / budget) * 100, 100);
    const percentRemaining = 100 - percentUsed;

    // Update main stats
    document.getElementById('dashSpent').textContent = formatHours(totalSpent);
    document.getElementById('dashSpentPercent').textContent = percentUsed.toFixed(1) + '% used';
    document.getElementById('dashRemaining').textContent = formatHours(remaining);
    document.getElementById('dashTotal').textContent = budget;
    document.getElementById('dashTotalLabel').textContent = budget + 'h';
    document.getElementById('dashRemainingPercent').textContent = percentRemaining.toFixed(1) + '% of budget';

    // Update progress bar
    const progressBar = document.getElementById('dashProgress');
    progressBar.style.width = percentUsed + '%';
    progressBar.className = 'progress-bar';
    if (percentUsed >= 90) progressBar.classList.add('danger');
    else if (percentUsed >= 75) progressBar.classList.add('warning');
    document.getElementById('dashProgressLabel').textContent = percentUsed.toFixed(1) + '% used';

    // Update detail stats
    const avgPerMonth = totalSpent / Math.max(1, new Date().getMonth() + 1);
    const avgPerWeek = spentMonth / Math.max(1, Math.ceil(new Date().getDate() / 7));

    document.getElementById('dashYear').textContent = formatHours(spentYear);
    document.getElementById('dashYearDetail').textContent = `${data.year.length} entries`;

    document.getElementById('dashMonth').textContent = formatHours(spentMonth);
    document.getElementById('dashMonthDetail').textContent = `${data.month.length} entries`;

    document.getElementById('dashWeek').textContent = formatHours(spentWeek);
    document.getElementById('dashWeekDetail').textContent = `${data.week.length} entries`;

    document.getElementById('dashToday').textContent = formatHours(spentToday);
    document.getElementById('dashTodayDetail').textContent = `${data.today.length} entries`;
}
