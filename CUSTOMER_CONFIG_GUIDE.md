# Customer Configuration System

## Overview

The Moneybird Planner uses a **safe, local configuration system** for storing customer names and colors. Each laptop maintains its own customer profile list, and these settings sync between laptops automatically without requiring any credentials or sensitive data to be stored in version control.

## Architecture

### Files

- **`customer-config.template.json`** - Committed to git; serves as a reference template with example structure
- **`customer-config.json`** - **NOT committed** (in `.gitignore`); local per laptop, created automatically from template on first run
- **`js/customer-config.js`** - Client-side API for loading/saving customer configs
- **Server endpoint**: `/api/config/customers` (GET to load, POST to save)

### How It Works

1. **First Run**: When you open the Moneybird Planner on a new laptop, the server checks if `customer-config.json` exists.
2. **Initialization**: If it doesn't exist, the server copies `customer-config.template.json` to `customer-config.json`.
3. **Local Storage**: The JavaScript client loads customer data into `customersData` and caches in `localStorage` for offline fallback.
4. **Editing**: When you add/edit/delete customers in ⚙️ Settings → "Customer Profiles", changes are saved to the local `customer-config.json` file.
5. **No Sync Needed**: Each laptop is independent. No secrets, tokens, or keys are stored.

## Usage

### On Each Laptop

1. Open the Moneybird Planner
2. Click ⚙️ **Settings** button in the header
3. Scroll to **"Customer Profiles"** section
4. Enter a customer name and pick a color
5. Click **+ Add**
6. Your customer is saved locally to `customer-config.json` on that laptop

### Adding Shared Customers to Template

If you want a set of **default customers** to appear on all new laptops:

1. Edit `customer-config.template.json`:
   ```json
   {
     "customers": [
       {
         "id": "dnb",
         "name": "DNB",
         "color": "#3b82f6",
         "enabled": true
       },
       {
         "id": "rivm",
         "name": "RIVM",
         "color": "#ef4444",
         "enabled": true
       }
     ],
     "lastModified": "2026-05-04T12:00:00Z"
   }
   ```

2. Commit and push to GitHub
3. On the next laptop, delete the old `customer-config.json` to reset, or manually edit it to match the template

## Technical Details

### Server Endpoints

#### GET `/api/config/customers`
Returns the current customer config.

```
curl http://localhost:8000/api/config/customers
```

Response:
```json
{
  "customers": [
    { "id": "customer-123", "name": "DNB", "color": "#3b82f6", "enabled": true }
  ],
  "lastModified": "2026-05-04T11:30:00Z"
}
```

#### POST `/api/config/customers/save`
Saves updated customer config.

```
curl -X POST http://localhost:8000/api/config/customers/save \
  -H "Content-Type: application/json" \
  -d '{"customers":[...],"lastModified":"..."}'
```

### Client API (js/customer-config.js)

```javascript
// Load customers
await loadCustomerConfigs();

// Get all customers
getCustomers();

// Add a customer
await addCustomer("Customer Name", "#3b82f6");

// Update a customer
await updateCustomer(id, "New Name", "#ef4444");

// Delete a customer
await deleteCustomer(id);

// Toggle customer enabled state
await toggleCustomer(id);
```

## Security & Safety

- ✅ **No secrets in repo**: `customer-config.json` is gitignored
- ✅ **No API keys**: Customer configs contain only names and colors
- ✅ **Local only**: Each laptop has its own independent copy
- ✅ **Offline support**: Customers are cached in localStorage for offline use
- ✅ **No sync needed**: Changes don't need to be pushed anywhere

## Troubleshooting

### "Customer-config.json not found"

**Solution**: The file is created automatically on first load from `customer-config.template.json`. If it's missing:
1. Stop the server
2. Delete `customer-config.json` (if it exists)
3. Restart the server

### Changes not saving

**Solution**: Check browser console (F12) for errors. Ensure:
1. Server is running
2. Local `customer-config.json` is writable
3. No errors in PowerShell console

### Reset to defaults

To reset to the template defaults:
```powershell
# Stop the server (Ctrl+C)
Remove-Item customer-config.json -Force
# Restart the server
```

## Example: Laptop A → Laptop B

### Laptop A
1. Add customers: "DNB" (blue), "RIVM" (red), "SecuraSigna" (green)
2. Settings are saved to `customer-config.json` locally

### Laptop B
1. Open Moneybird Planner
2. Laptop B creates its own `customer-config.json` from template
3. You can add the same customers (or different ones)
4. Both laptops maintain independent lists

To sync manually between laptops:
1. Copy the `customer-config.json` from Laptop A
2. Paste into Laptop B's folder
3. Refresh the browser

---

**Note**: This system is designed for **local laptop independence**. If you need true synchronization (e.g., shared team database), consider adding a cloud backend in the future.
