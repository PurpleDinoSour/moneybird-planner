# Moneybird Planner IV

Modern, refactored hour registration tool with Git integration for WBSO (R&D) time tracking.

## 📁 Project Structure

```
moneybird-planner/
├── index.html          # Main HTML file
├── server.ps1          # PowerShell HTTP server with API proxy
├── css/
│   └── styles.css      # All application styles
└── js/
    ├── config.js       # Configuration, constants, state management
    ├── utils.js        # Utility functions, settings modal, config save/load
    ├── calendar.js     # Calendar rendering and date selection
    ├── git.js          # Git integration (GitHub, Azure DevOps)
    ├── moneybird.js    # Moneybird API functions for hour registration
    ├── dashboard.js    # WBSO budget dashboard
    └── app.js          # Main initialization and event bindings
```

## 🚀 Getting Started

1. **Start the server:**
   ```powershell
   cd moneybird-planner
   .\server.ps1
   ```

2. **Open browser automatically** to `http://localhost:8000`

3. **Configure settings** (click ⚙️ Settings):
   - BV Administration credentials (Facturable hours)
   - Holding Administration credentials (WBSO hours)
   - Git integration (GitHub or Azure DevOps)

## ✨ Features

### Hour Types
- **Facturable**: Regular billable hours for BV administration
- **WBSO (R&D)**: Research & Development hours for Holding administration

### Git Integration
- Fetch commits and PRs from GitHub or Azure DevOps
- Match git activity to calendar dates
- One time entry per commit option
- Adjustable hours per commit/PR

### WBSO Dashboard
- Real-time budget tracking
- Year/Month/Week/Today breakdowns
- Progress visualization

### Calendar
- Visual day selection
- Default working days configuration
- Holiday awareness (NL 2026)
- Git hours overlay

## 📝 Configuration Storage

All settings are stored in `localStorage` with the `mb3_` prefix:

- API tokens and credentials
- User preferences (default days, lunch break)
- Git source settings
- WBSO budget configuration

## 🔧 Server API Endpoints

The PowerShell server provides:

| Endpoint | Description |
|----------|-------------|
| `/azure-commits` | Proxy for Azure DevOps commits |
| `/azure-prs` | Proxy for Azure DevOps pull requests |
| `/azure-projects` | Fetch Azure DevOps project list |
| `/github/prs` | Proxy for GitHub PRs |
| `/git/commits` | Local git commits |

## 📋 JavaScript Modules

### config.js
- `CONFIG` - Server port, API URLs
- `HOLIDAYS_NL_2026` - Dutch holidays
- `DAY_NAMES`, `MONTH_NAMES` - Localization
- `appState` - Application state object
- `STORAGE_KEYS` - localStorage key constants

### utils.js
- `escapeHtml()` - Prevent XSS
- `openSettings()`, `closeSettings()` - Modal management
- `saveConfig()`, `loadConfig()` - Settings persistence
- `getCurrentConfig()` - Get active Moneybird configuration
- `setHourType()` - Switch between Facturable/WBSO
- `updateTimeNotation()` - Update hours defaults

### calendar.js
- `renderCalendar()` - Generate calendar grid
- `toggleCard()` - Toggle day selection
- `selectAllCalendarDays()` - Select all days
- `clearAll()` - Clear selections
- `getGitHoursByDate()` - Calculate git hours per day

### git.js
- `fetchAllGitData()` - Fetch commits and PRs
- `fetchGitHubCommits()`, `fetchAzureDevOpsCommits()` - API calls
- `toggleCommitSelection()`, `togglePRSelection()` - Selection management
- `updateGitSourceUI()`, `updateAzureAuthUI()` - UI state

### moneybird.js
- `startRegistration()` - Begin hour registration
- `registerOneEntryPerCommit()` - Individual commit entries
- `registerStandard()` - Bulk registration
- `fetchExistingHours()` - Load registered hours
- `deleteSelectedHours()` - Remove entries
- `fetchUsers()`, `fetchProjects()` - Moneybird API helpers

### dashboard.js
- `refreshWbsoDashboard()` - Fetch and display WBSO stats
- `calculateHours()` - Sum entry durations
- `renderWbsoDashboard()` - Update UI

### app.js
- `init()` - Application initialization
- `bindEvents()` - Event listeners

## 🎨 CSS Structure

Organized into sections:
- Root variables (colors, shadows, border-radius)
- Base styles (body, container)
- Component styles (cards, buttons, forms)
- Calendar styles
- Git section styles
- Dashboard styles
- Modal styles
- Responsive utilities

## ⚠️ Notes

- Server runs on port 8000 by default
- Settings persist across sessions
- WBSO dashboard has rate limiting (10s cooldown)
- Azure DevOps requires running the local server for CORS proxy

## 📄 License

Internal project - Integra Management Group
