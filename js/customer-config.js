// Customer Configuration Manager
// Handles loading/saving shared customer profiles (names, colors only)

const CUSTOMER_CONFIG = {
    ENDPOINT_LOAD: '/api/config/customers',
    ENDPOINT_SAVE: '/api/config/customers/save',
    STORAGE_KEY: 'mb_customers_cache'
};

let customersData = [];
let customersLastModified = null;

/**
 * Load customer configs from server and pull latest shared config from git.
 */
async function loadCustomerConfigs() {
    try {
        const response = await fetch(CUSTOMER_CONFIG.ENDPOINT_LOAD);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        customersData = data.customers || [];
        customersLastModified = data.lastModified || null;
        // Cache for offline fallback
        localStorage.setItem(CUSTOMER_CONFIG.STORAGE_KEY, JSON.stringify({
            customers: customersData,
            lastModified: customersLastModified
        }));
        console.log(`[CUSTOMER_CONFIG] Loaded ${customersData.length} customers`);
        return customersData;
    } catch (err) {
        console.warn(`[CUSTOMER_CONFIG] Load failed, using cache:`, err.message);
        // Fallback to cached data
        const cached = localStorage.getItem(CUSTOMER_CONFIG.STORAGE_KEY);
        const parsedCache = cached ? JSON.parse(cached) : { customers: [], lastModified: null };
        customersData = parsedCache.customers || [];
        customersLastModified = parsedCache.lastModified || null;
        return customersData;
    }
}

/**
 * Save updated customer configs to server and push shared config through git.
 */
async function saveCustomerConfigs(customers) {
    try {
        const response = await fetch(CUSTOMER_CONFIG.ENDPOINT_SAVE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customers: customers,
                lastModified: new Date().toISOString(),
                baseModified: customersLastModified
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        customersData = customers;
        customersLastModified = new Date().toISOString();
        localStorage.setItem(CUSTOMER_CONFIG.STORAGE_KEY, JSON.stringify({
            customers: customersData,
            lastModified: customersLastModified
        }));
        console.log(`[CUSTOMER_CONFIG] Saved ${customers.length} customers`);
        return result;
    } catch (err) {
        console.error(`[CUSTOMER_CONFIG] Save failed:`, err.message);
        throw err;
    }
}

/**
 * Get all customers
 */
function getCustomers() {
    return customersData || [];
}

/**
 * Add a new customer
 */
async function addCustomer(name, color) {
    const newCustomer = {
        id: `customer-${Date.now()}`,
        name: name.trim(),
        color: color,
        enabled: true
    };
    customersData.push(newCustomer);
    await saveCustomerConfigs(customersData);
    return newCustomer;
}

/**
 * Update a customer
 */
async function updateCustomer(id, name, color) {
    const customer = customersData.find(c => c.id === id);
    if (!customer) throw new Error(`Customer ${id} not found`);
    customer.name = name.trim();
    customer.color = color;
    await saveCustomerConfigs(customersData);
    return customer;
}

/**
 * Delete a customer
 */
async function deleteCustomer(id) {
    const idx = customersData.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Customer ${id} not found`);
    const deleted = customersData.splice(idx, 1);
    await saveCustomerConfigs(customersData);
    return deleted[0];
}

/**
 * Toggle customer enabled state
 */
async function toggleCustomer(id) {
    const customer = customersData.find(c => c.id === id);
    if (!customer) throw new Error(`Customer ${id} not found`);
    customer.enabled = !customer.enabled;
    await saveCustomerConfigs(customersData);
    return customer;
}

// --- UI HELPERS ---

/**
 * Initialize customer list on settings open
 */
async function initializeCustomerUI() {
    const customers = await loadCustomerConfigs();
    renderCustomersList(customers);
}

/**
 * Render customers list in the UI
 */
function renderCustomersList(customers) {
    const container = document.getElementById('customersList');
    if (!container) return;

    if (customers.length === 0) {
        container.innerHTML = '<p style="padding:20px; text-align:center; color:var(--muted);">No customers yet. Add one above.</p>';
        return;
    }

    container.innerHTML = customers.map(c => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-bottom:1px solid var(--border); gap:8px;">
            <div style="display:flex; align-items:center; gap:10px; flex:1;">
                <input type="color" value="${c.color}" onchange="updateCustomerUI('${c.id}', document.querySelector('input[value=&quot;${c.color}&quot;]').previousSibling.innerText, this.value)" style="width:40px; height:40px; cursor:pointer; border:none; border-radius:4px;">
                <span style="flex:1; font-weight:500;">${c.name}</span>
            </div>
            <div style="display:flex; gap:4px;">
                <button class="btn btn-sm btn-danger" onclick="deleteCustomerUI('${c.id}')" style="padding:4px 8px;">Delete</button>
            </div>
        </div>
    `).join('');
}

/**
 * Add customer from UI
 */
async function addCustomerUI() {
    const nameInput = document.getElementById('newCustomerName');
    const colorInput = document.getElementById('newCustomerColor');
    const name = nameInput.value.trim();
    const color = colorInput.value;

    if (!name) {
        alert('Please enter a customer name');
        return;
    }

    try {
        await addCustomer(name, color);
        nameInput.value = '';
        colorInput.value = '#1D4ED8';
        await initializeCustomerUI();
    } catch (err) {
        alert(`Error adding customer: ${err.message}`);
    }
}

/**
 * Update customer from UI
 */
async function updateCustomerUI(id, name, color) {
    try {
        await updateCustomer(id, name, color);
        await initializeCustomerUI();
    } catch (err) {
        alert(`Error updating customer: ${err.message}`);
    }
}

/**
 * Delete customer from UI
 */
async function deleteCustomerUI(id) {
    if (!confirm('Delete this customer?')) return;
    try {
        await deleteCustomer(id);
        await initializeCustomerUI();
    } catch (err) {
        alert(`Error deleting customer: ${err.message}`);
    }
}
