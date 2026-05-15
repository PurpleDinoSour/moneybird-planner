// Moneybird Planner IV - Git Integration Module
// Version: 1.0.0

// --- GIT UI FUNCTIONS ---
function updateCommitBasedUI() {
    const matchChecked = document.getElementById('matchCommitsToDates').checked;
    const onlyDaysLabel = document.getElementById('onlyDaysWithCommitsLabel');
    const onlyDaysCheckbox = document.getElementById('onlyDaysWithCommits');

    if (matchChecked) {
        onlyDaysLabel.style.opacity = '1';
        onlyDaysCheckbox.disabled = false;
    } else {
        onlyDaysLabel.style.opacity = '0.5';
        onlyDaysCheckbox.disabled = true;
        onlyDaysCheckbox.checked = false;
    }
}

function updateGitSourceUI() {
    const source = document.getElementById('gitSource').value;
    document.getElementById('githubSettings').style.display = source === 'github' ? 'block' : 'none';
    document.getElementById('azureDevOpsSettings').style.display = source === 'azuredevops' ? 'block' : 'none';
}

function updateAzureAuthUI() {
    const method = document.getElementById('azureAuthMethod').value;
    document.getElementById('azureUsernameCol').style.display = method !== 'pat' ? 'block' : 'none';
    document.getElementById('azurePasswordCol').style.display = method === 'password' ? 'block' : 'none';
    document.getElementById('azureTokenCol').style.display = method !== 'password' ? 'block' : 'none';
    document.getElementById('azureTokenLabel').textContent = method === 'pat' ? 'PAT Token' : 'PAT Token';
}

// --- GIT COMMITS FETCHING ---
async function fetchGitCommits() {
    const source = document.getElementById('gitSource').value;
    const list = document.getElementById('gitCommitsList');
    list.innerHTML = '<p style="padding:20px; text-align:center;">Loading commits...</p>';

    try {
        let commits = [];
        const monthPicker = document.getElementById('monthPicker').value;
        const [year, month] = monthPicker.split('-').map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

        if (source === 'azuredevops') {
            commits = await fetchAzureDevOpsCommits(startDate, endDate);
        } else {
            commits = await fetchGitHubCommits(startDate, endDate);
        }

        if (commits.length === 0) {
            list.innerHTML = '<p style="padding:20px; text-align:center; color:var(--muted);">No commits found for this month</p>';
            return;
        }

        const hpc = parseFloat(document.getElementById('hoursPerCommit').value) || 1;
        list.innerHTML = commits.map((commit, idx) => {
            const commitTime = commit.fullDateTime ? new Date(commit.fullDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            return `
            <div class="git-item" onclick="toggleCommitSelection(${idx}, this)">
                <input type="checkbox" ${appState.selectedCommits.includes(idx) ? 'checked' : ''} onclick="event.stopPropagation(); toggleCommitSelection(${idx}, this.parentElement)">
                <div class="git-item-info">
                    <div class="git-hash">${commit.hash.substring(0, 7)} <span style="margin-left:8px; padding:2px 6px; background:var(--surface,#1E293B); border:1px solid var(--border,#334155); border-radius:4px; font-size:0.75rem; color:var(--text-secondary,#94A3B8);">${hpc}h</span></div>
                    <div class="git-msg">${escapeHtml(commit.message)}</div>
                    <div class="git-meta">${commit.author} • ${commit.date}${commitTime ? ' @ ' + commitTime : ''}</div>
                </div>
            </div>
        `}).join('');

        appState.gitCommitsData = commits;
        selectAllCommits(); // Auto-select all commits after fetch
        renderCalendar(); // Update calendar to show hours per day
    } catch (err) {
        list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--danger);">Error: ${err.message}</p>`;
        console.error('Fetch commits error:', err);
    }
}

async function fetchGitHubCommits(startDate, endDate) {
    const token = document.getElementById('githubToken').value;
    const repo = document.getElementById('githubRepo').value;
    if (!repo) throw new Error('GitHub repository not configured');

    const since = startDate.toISOString();
    const until = endDate.toISOString();

    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const resp = await fetch(`https://api.github.com/repos/${repo}/commits?since=${since}&until=${until}&per_page=100`, { headers });
    if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);

    const data = await resp.json();
    return data.map(c => ({
        hash: c.sha,
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: new Date(c.commit.author.date).toLocaleDateString(),
        fullDate: c.commit.author.date.split('T')[0],
        fullDateTime: c.commit.author.date // Full ISO timestamp
    }));
}

async function fetchAzureDevOpsCommits(startDate, endDate) {
    const selectedProjects = [];
    document.querySelectorAll('#azureProjectList input:checked').forEach(cb => selectedProjects.push(cb.value));
    if (selectedProjects.length === 0) throw new Error('No Azure DevOps projects selected');

    const org = document.getElementById('azureOrg').value;
    const authMethod = document.getElementById('azureAuthMethod').value;
    let authHeader = '';

    if (authMethod === 'pat') {
        const token = document.getElementById('azureToken').value;
        authHeader = 'Basic ' + btoa(':' + token);
    } else if (authMethod === 'basic') {
        const username = document.getElementById('azureUsername').value;
        const token = document.getElementById('azureToken').value;
        authHeader = 'Basic ' + btoa(username + ':' + token);
    } else {
        const username = document.getElementById('azureUsername').value;
        const password = document.getElementById('azurePassword').value;
        authHeader = 'Basic ' + btoa(username + ':' + password);
    }

    const authorFilter = document.getElementById('authorFilter').value.split(',').map(a => a.trim().toLowerCase()).filter(a => a);
    let allCommits = [];

    for (const project of selectedProjects) {
        try {
            const fromDate = startDate.toISOString().split('T')[0];
            const toDate = endDate.toISOString().split('T')[0];
            console.log(`[Git] Fetching commits from ${project}...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const resp = await fetch(`${CONFIG.API_BASE_URL}/azure-commits?org=${encodeURIComponent(org)}&project=${encodeURIComponent(project)}&repo=${encodeURIComponent(project)}&fromDate=${fromDate}&toDate=${toDate}`, {
                headers: { 'Authorization': authHeader },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!resp.ok) {
                console.warn(`[Git] ${project} returned ${resp.status}`);
                continue;
            }
            const data = await resp.json();
            if (data.value) {
                const commits = data.value.map(c => ({
                    hash: c.commitId,
                    message: c.comment?.split('\n')[0] || 'No message',
                    author: c.author?.name || 'Unknown',
                    date: new Date(c.author?.date).toLocaleDateString(),
                    fullDate: c.author?.date?.split('T')[0],
                    fullDateTime: c.author?.date, // Full ISO timestamp
                    project: project
                }));

                if (authorFilter.length > 0) {
                    const filtered = commits.filter(c => authorFilter.some(a => c.author.toLowerCase().includes(a)));
                    allCommits = allCommits.concat(filtered);
                } else {
                    allCommits = allCommits.concat(commits);
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.error(`[Git] Timeout fetching from ${project} - is the server running?`);
            } else {
                console.warn(`[Git] Failed to fetch from ${project}:`, e.message);
            }
        }
    }

    if (allCommits.length === 0 && selectedProjects.length > 0) {
        console.warn('[Git] No commits found - check if server is running (./StartServerV3.ps1)');
    }

    allCommits.sort((a, b) => new Date(b.fullDate) - new Date(a.fullDate));
    return allCommits;
}

// --- GIT PR FETCHING ---
async function fetchGitPRs() {
    const source = document.getElementById('gitSource').value;
    const list = document.getElementById('gitPRsList');
    list.innerHTML = '<p style="padding:20px; text-align:center;">Loading PRs...</p>';

    try {
        let prs = [];
        const monthPicker = document.getElementById('monthPicker').value;
        const [year, month] = monthPicker.split('-').map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

        if (source === 'azuredevops') {
            prs = await fetchAzureDevOpsPRs(startDate, endDate);
        } else {
            prs = await fetchGitHubPRs(startDate, endDate);
        }

        if (prs.length === 0) {
            list.innerHTML = '<p style="padding:20px; text-align:center; color:var(--muted);">No PRs found for this month</p>';
            return;
        }

        const hpc = parseFloat(document.getElementById('hoursPerCommit').value) || 1;
        list.innerHTML = prs.map((pr, idx) => `
            <div class="git-item" onclick="togglePRSelection(${idx}, this)">
                <input type="checkbox" ${appState.selectedPRs.includes(idx) ? 'checked' : ''} onclick="event.stopPropagation(); togglePRSelection(${idx}, this.parentElement)">
                <div class="git-item-info">
                    <div class="git-hash">#${pr.number} <span style="margin-left:8px; padding:2px 6px; background:var(--surface,#1E293B); border:1px solid var(--border,#334155); border-radius:4px; font-size:0.75rem; color:var(--text-secondary,#94A3B8);">${hpc}h</span></div>
                    <div class="git-msg">${escapeHtml(pr.title)}</div>
                    <div class="git-meta">${pr.author} • ${pr.date}${pr.status ? ' • ' + pr.status : ''}</div>
                </div>
            </div>
        `).join('');

        appState.gitPRsData = prs;
        selectAllPRs(); // Auto-select all PRs after fetch
    } catch (err) {
        list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--danger);">Error: ${err.message}</p>`;
        console.error('Fetch PRs error:', err);
    }
}

async function fetchGitHubPRs(startDate, endDate) {
    const token = document.getElementById('githubToken').value;
    const repo = document.getElementById('githubRepo').value;
    if (!repo) throw new Error('GitHub repository not configured');

    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const resp = await fetch(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=100`, { headers });
    if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);

    const data = await resp.json();
    return data.filter(pr => {
        const prDate = new Date(pr.created_at);
        return prDate >= startDate && prDate <= endDate;
    }).map(pr => ({
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        date: new Date(pr.created_at).toLocaleDateString(),
        status: pr.state,
        fullDate: pr.created_at.split('T')[0]
    }));
}

async function fetchAzureDevOpsPRs(startDate, endDate) {
    const selectedProjects = [];
    document.querySelectorAll('#azureProjectList input:checked').forEach(cb => selectedProjects.push(cb.value));
    if (selectedProjects.length === 0) throw new Error('No Azure DevOps projects selected');

    const org = document.getElementById('azureOrg').value;
    const authMethod = document.getElementById('azureAuthMethod').value;
    let authHeader = '';

    if (authMethod === 'pat') {
        const token = document.getElementById('azureToken').value;
        authHeader = 'Basic ' + btoa(':' + token);
    } else if (authMethod === 'basic') {
        const username = document.getElementById('azureUsername').value;
        const token = document.getElementById('azureToken').value;
        authHeader = 'Basic ' + btoa(username + ':' + token);
    } else {
        const username = document.getElementById('azureUsername').value;
        const password = document.getElementById('azurePassword').value;
        authHeader = 'Basic ' + btoa(username + ':' + password);
    }

    const authorFilter = document.getElementById('authorFilter').value.split(',').map(a => a.trim().toLowerCase()).filter(a => a);
    let allPRs = [];

    for (const project of selectedProjects) {
        try {
            const fromDate = startDate.toISOString().split('T')[0];
            const toDate = endDate.toISOString().split('T')[0];
            console.log(`[Git] Fetching PRs from ${project}...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const resp = await fetch(`${CONFIG.API_BASE_URL}/azure-prs?org=${encodeURIComponent(org)}&project=${encodeURIComponent(project)}&repo=${encodeURIComponent(project)}&fromDate=${fromDate}&toDate=${toDate}`, {
                headers: { 'Authorization': authHeader },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!resp.ok) {
                console.warn(`[Git] PRs ${project} returned ${resp.status}`);
                continue;
            }
            const data = await resp.json();
            if (data.value) {
                const prs = data.value.map(pr => ({
                    number: pr.pullRequestId,
                    title: pr.title,
                    author: pr.createdBy?.displayName || 'Unknown',
                    date: new Date(pr.creationDate).toLocaleDateString(),
                    status: pr.status,
                    fullDate: pr.creationDate?.split('T')[0],
                    project: project
                }));

                if (authorFilter.length > 0) {
                    const filtered = prs.filter(pr => authorFilter.some(a => pr.author.toLowerCase().includes(a)));
                    allPRs = allPRs.concat(filtered);
                } else {
                    allPRs = allPRs.concat(prs);
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.error(`[Git] Timeout fetching PRs from ${project} - is the server running?`);
            } else {
                console.warn(`[Git] Failed to fetch PRs from ${project}:`, e.message);
            }
        }
    }

    allPRs.sort((a, b) => new Date(b.fullDate) - new Date(a.fullDate));
    return allPRs;
}

// --- SELECTION FUNCTIONS ---
function toggleCommitSelection(idx, el) {
    const checkbox = el.querySelector('input');
    if (appState.selectedCommits.includes(idx)) {
        appState.selectedCommits = appState.selectedCommits.filter(i => i !== idx);
        checkbox.checked = false;
    } else {
        appState.selectedCommits.push(idx);
        checkbox.checked = true;
    }
}

function togglePRSelection(idx, el) {
    const checkbox = el.querySelector('input');
    if (appState.selectedPRs.includes(idx)) {
        appState.selectedPRs = appState.selectedPRs.filter(i => i !== idx);
        checkbox.checked = false;
    } else {
        appState.selectedPRs.push(idx);
        checkbox.checked = true;
    }
}

function selectAllCommits() {
    if (!appState.gitCommitsData) return;
    appState.selectedCommits = appState.gitCommitsData.map((_, i) => i);
    document.querySelectorAll('.commit-item input[type="checkbox"]').forEach(cb => cb.checked = true);
}

function deselectAllCommits() {
    appState.selectedCommits = [];
    document.querySelectorAll('.commit-item input[type="checkbox"]').forEach(cb => cb.checked = false);
}

function selectAllPRs() {
    if (!appState.gitPRsData) return;
    appState.selectedPRs = appState.gitPRsData.map((_, i) => i);
    document.querySelectorAll('.pr-item input[type="checkbox"]').forEach(cb => cb.checked = true);
}

function deselectAllPRs() {
    appState.selectedPRs = [];
    document.querySelectorAll('.pr-item input[type="checkbox"]').forEach(cb => cb.checked = false);
}

// Unified Git functions
function selectAllGitItems() {
    selectAllCommits();
    selectAllPRs();
}

function deselectAllGitItems() {
    deselectAllCommits();
    deselectAllPRs();
}

async function fetchAllGitData() {
    console.log('[Git] Starting fetchAllGitData...');
    const list = document.getElementById('gitCombinedList');
    list.innerHTML = '<p style="padding:20px; text-align:center;">Loading commits and PRs...</p>';

    const source = document.getElementById('gitSource').value;
    console.log('[Git] Source:', source);
    const monthPicker = document.getElementById('monthPicker').value;
    const [year, month] = monthPicker.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    console.log('[Git] Date range:', startDate.toISOString(), 'to', endDate.toISOString());

    let commits = [];
    let prs = [];
    let errors = [];

    // Fetch commits
    try {
        console.log('[Git] Fetching commits...');
        if (source === 'azuredevops') {
            commits = await fetchAzureDevOpsCommits(startDate, endDate);
        } else {
            commits = await fetchGitHubCommits(startDate, endDate);
        }
        console.log('[Git] Commits fetched:', commits.length);
    } catch (err) {
        console.error('[Git] Commits error:', err);
        errors.push(`Commits: ${err.message}`);
    }

    // Fetch PRs
    try {
        console.log('[Git] Fetching PRs...');
        if (source === 'azuredevops') {
            prs = await fetchAzureDevOpsPRs(startDate, endDate);
        } else {
            prs = await fetchGitHubPRs(startDate, endDate);
        }
        console.log('[Git] PRs fetched:', prs.length);
    } catch (err) {
        console.error('[Git] PRs error:', err);
        errors.push(`PRs: ${err.message}`);
    }

    // Store data with individual hours
    const defaultHours = parseFloat(document.getElementById('hoursPerCommit').value) || 1;
    appState.gitCommitsData = commits.map(c => ({ ...c, hours: defaultHours }));
    appState.gitPRsData = prs.map(p => ({ ...p, hours: defaultHours }));
    appState.selectedCommits = [];
    appState.selectedPRs = [];

    if (commits.length === 0 && prs.length === 0) {
        list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--muted);">No commits or PRs found${errors.length ? '<br><small style="color:var(--danger);">' + errors.join(', ') + '</small>' : ''}</p>`;
        return;
    }

    // Build table-like layout
    let html = `
    <div class="git-table-header">
        <span></span>
        <span>Type</span>
        <span>ID</span>
        <span>Description</span>
        <span>Timestamp</span>
        <span>Hours</span>
    </div>`;

    // Add commits
    commits.forEach((commit, idx) => {
        const commitTime = commit.fullDateTime ? new Date(commit.fullDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        const timestamp = `${commit.date}${commitTime ? ' ' + commitTime : ''}`;
        html += `
        <div class="git-row commit-item" data-idx="${idx}" onclick="toggleCommitSelection(${idx}, this)">
            <input type="checkbox" onclick="event.stopPropagation(); toggleCommitSelection(${idx}, this.parentElement)">
            <span class="type-badge commit">Commit</span>
            <span class="git-id">${commit.hash.substring(0, 7)}</span>
            <span class="git-desc" title="${escapeHtml(commit.message)}">${escapeHtml(commit.message)}</span>
            <span class="git-time">${timestamp}</span>
            <input type="number" class="hours-input" value="${defaultHours}" min="0.25" step="0.25" max="24"
                   onclick="event.stopPropagation()"
                   onchange="updateCommitHours(${idx}, this.value)">
        </div>`;
    });

    // Add PRs
    prs.forEach((pr, idx) => {
        const prTime = pr.fullDateTime ? new Date(pr.fullDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        const timestamp = `${pr.date}${prTime ? ' ' + prTime : ''}`;
        html += `
        <div class="git-row pr-item" data-idx="${idx}" onclick="togglePRSelection(${idx}, this)">
            <input type="checkbox" onclick="event.stopPropagation(); togglePRSelection(${idx}, this.parentElement)">
            <span class="type-badge pr">PR</span>
            <span class="git-id">#${pr.number}</span>
            <span class="git-desc" title="${escapeHtml(pr.title)}">${escapeHtml(pr.title)}</span>
            <span class="git-time">${timestamp}</span>
            <input type="number" class="hours-input" value="${defaultHours}" min="0.25" step="0.25" max="24"
                   onclick="event.stopPropagation()"
                   onchange="updatePRHours(${idx}, this.value)">
        </div>`;
    });

    list.innerHTML = html;

    // Auto-select all
    selectAllGitItems();

    // Update calendar with git hours
    renderCalendar();

    if (errors.length) {
        console.warn('Fetch warnings:', errors);
    }
}

// Update individual item hours
function updateCommitHours(idx, value) {
    if (appState.gitCommitsData && appState.gitCommitsData[idx]) {
        appState.gitCommitsData[idx].hours = isNaN(parseFloat(value)) ? 1 : parseFloat(value);
        renderCalendar(); // Update calendar hours display
    }
}

function updatePRHours(idx, value) {
    if (appState.gitPRsData && appState.gitPRsData[idx]) {
        appState.gitPRsData[idx].hours = isNaN(parseFloat(value)) ? 1 : parseFloat(value);
        renderCalendar(); // Update calendar hours display
    }
}

function selectAllProjects() {
    document.querySelectorAll('#azureProjectList input').forEach(cb => cb.checked = true);
    saveConfig();
}

function deselectAllProjects() {
    document.querySelectorAll('#azureProjectList input').forEach(cb => cb.checked = false);
    saveConfig();
}

function selectDefaultProjects() {
    document.querySelectorAll('#azureProjectList input').forEach(cb => {
        cb.checked = DEFAULT_PROJECTS.includes(cb.value);
    });
    saveConfig();
}

// --- AZURE DEVOPS CONNECTION ---
async function fetchAzureProjects() {
    const org = document.getElementById('azureOrg').value;
    const authMethod = document.getElementById('azureAuthMethod').value;
    let authHeader = '';

    if (authMethod === 'pat') {
        const token = document.getElementById('azureToken').value;
        authHeader = 'Basic ' + btoa(':' + token);
    } else if (authMethod === 'basic') {
        const username = document.getElementById('azureUsername').value;
        const token = document.getElementById('azureToken').value;
        authHeader = 'Basic ' + btoa(username + ':' + token);
    } else {
        const username = document.getElementById('azureUsername').value;
        const password = document.getElementById('azurePassword').value;
        authHeader = 'Basic ' + btoa(username + ':' + password);
    }

    if (!org) {
        alert('Please enter organization name');
        return;
    }

    try {
        const resp = await fetch(`${CONFIG.API_BASE_URL}/azure-projects?org=${encodeURIComponent(org)}`, {
            headers: { 'Authorization': authHeader }
        });

        if (!resp.ok) throw new Error(`Error: ${resp.status}`);

        const data = await resp.json();
        if (data.value && data.value.length > 0) {
            const list = document.getElementById('azureProjectList');
            list.innerHTML = data.value.map(p => `
                <label class="checkbox-label mb-0" style="padding:4px 0;">
                    <input type="checkbox" value="${p.name}" onchange="saveConfig()">
                    <span>${p.name}</span>
                </label>
            `).join('');

            // Auto-select defaults
            selectDefaultProjects();
            alert(`Found ${data.value.length} projects`);
        } else {
            alert('No projects found');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function testAzureConnection() {
    const result = document.getElementById('azureTestResult');
    result.style.display = 'block';
    result.style.background = '#fef3c7';
    result.textContent = 'Testing connection...';

    try {
        const org = document.getElementById('azureOrg').value;
        const authMethod = document.getElementById('azureAuthMethod').value;
        let authHeader = '';

        if (authMethod === 'pat') {
            const token = document.getElementById('azureToken').value;
            authHeader = 'Basic ' + btoa(':' + token);
        } else if (authMethod === 'basic') {
            const username = document.getElementById('azureUsername').value;
            const token = document.getElementById('azureToken').value;
            authHeader = 'Basic ' + btoa(username + ':' + token);
        } else {
            const username = document.getElementById('azureUsername').value;
            const password = document.getElementById('azurePassword').value;
            authHeader = 'Basic ' + btoa(username + ':' + password);
        }

        const resp = await fetch(`${CONFIG.API_BASE_URL}/azure-projects?org=${encodeURIComponent(org)}`, {
            headers: { 'Authorization': authHeader }
        });

        if (resp.ok) {
            const data = await resp.json();
            const count = data.value?.length || 0;
            if (count > 0) {
                result.style.background = '#d1fae5';
                result.textContent = `Connected! Found ${count} projects`;
            } else {
                result.style.background = '#fef3c7';
                const org = document.getElementById('azureOrg').value;
                result.innerHTML = `Connected but found 0 projects.<br><span style="font-size:0.85em;">Your PAT token is likely scoped to a different organization. Create a new PAT at <b>dev.azure.com/${org}/_usersSettings/tokens</b> or use a PAT with <b>All accessible organizations</b> scope.</span>`;
            }
        } else if (resp.status === 401 || resp.status === 403) {
            result.style.background = '#fee2e2';
            result.textContent = `Authentication failed (${resp.status}). Check your PAT token.`;
        } else {
            result.style.background = '#fee2e2';
            result.textContent = `Error: ${resp.status}`;
        }
    } catch (err) {
        result.style.background = '#fee2e2';
        result.textContent = `Error: ${err.message}`;
    }
}
