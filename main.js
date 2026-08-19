// API Configuration
const API_URL = 'http://localhost:3000/api';
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

// ============ AUTHENTICATION ============

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            throw new Error('Invalid credentials');
        }
        
        const data = await response.json();
        
        authToken = data.token;
        currentUser = data.user;
        
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        window.location.href = 'dashboard.html';
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

// Check authentication on dashboard
if (window.location.pathname.includes('dashboard.html')) {
    if (!authToken) {
        window.location.href = 'index.html';
    } else {
        document.getElementById('userName').textContent = currentUser?.username || 'User';
        initializeDashboard();
    }
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
});

// ============ DASHBOARD INITIALIZATION ============

async function initializeDashboard() {
    await Promise.all([
        loadDashboardStats(),
        loadTopProducts(),
        loadAlerts()
    ]);
    
    // Initialize charts
    initializeSalesChart();
    initializeCategoryChart();
    
    // Setup navigation
    setupNavigation();
    
    // Setup event listeners
    setupEventListeners();
}

// ============ DASHBOARD STATS ============

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_URL}/analytics/dashboard`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load stats');
        
        const data = await response.json();
        
        document.getElementById('totalProducts').textContent = data.totalProducts;
        document.getElementById('todaySales').textContent = `$${data.todaySales.total.toFixed(2)}`;
        document.getElementById('lowStockItems').textContent = data.lowStockItems;
        document.getElementById('monthlyRevenue').textContent = 
            `$${data.monthlySales[0]?.total_revenue.toFixed(2) || '0'}`;
        
        // Update sales chart
        updateSalesChart(data.monthlySales);
        updateCategoryChart(data.revenueByCategory);
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============ PRODUCTS MANAGEMENT ============

async function loadProducts(page = 1, filters = {}) {
    try {
        const queryParams = new URLSearchParams({
            page,
            limit: 10,
            ...filters
        });
        
        const response = await fetch(`${API_URL}/products?${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load products');
        
        const data = await response.json();
        
        renderProductsTable(data.products, data.alerts);
        renderPagination(data.pagination);
        
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

function renderProductsTable(products, alertIds) {
    const tbody = document.getElementById('productsTableBody');
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td>
                <strong>${product.product_name}</strong>
                ${product.description ? `<br><small class="text-muted">${product.description}</small>` : ''}
            </td>
            <td>${product.sku}</td>
            <td><span class="badge-category">${product.category}</span></td>
            <td>$${product.unit_price.toFixed(2)}</td>
            <td>
                <span class="stock-count">${product.current_stock}</span>
            </td>
            <td>
                ${getStockStatusBadge(product.current_stock, product.reorder_level, alertIds.includes(product.id))}
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="editProduct(${product.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn sale" onclick="recordSale(${product.id})" title="Record Sale">
                        <i class="fas fa-shopping-cart"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteProduct(${product.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getStockStatusBadge(stock, reorderLevel, hasAlert) {
    if (stock === 0) {
        return '<span class="stock-badge out-of-stock">Out of Stock</span>';
    } else if (stock <= reorderLevel || hasAlert) {
        return '<span class="stock-badge low-stock">Low Stock</span>';
    } else {
        return '<span class="stock-badge in-stock">In Stock</span>';
    }
}

// Add Product
document.getElementById('addProductBtn')?.addEventListener('click', () => {
    document.getElementById('addProductModal').classList.add('active');
});

document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const productData = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch(`${API_URL}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(productData)
        });
        
        if (!response.ok) throw new Error('Failed to add product');
        
        document.getElementById('addProductModal').classList.remove('active');
        loadProducts();
        alert('Product added successfully!');
        
    } catch (error) {
        alert('Error adding product: ' + error.message);
    }
});

// ============ CHARTS ============

let salesChart, categoryChart;

function initializeSalesChart() {
    const ctx = document.getElementById('salesChart').getContext('2d');
    
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Revenue',
                data: [],
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '$' + value
                    }
                }
            }
        }
    });
}

function updateSalesChart(monthlySales) {
    const labels = monthlySales.map(sale => sale.month).reverse();
    const data = monthlySales.map(sale => sale.total_revenue).reverse();
    
    salesChart.data.labels = labels;
    salesChart.data.datasets[0].data = data;
    salesChart.update();
}

function initializeCategoryChart() {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#4F46E5',
                    '#10B981',
                    '#F59E0B',
                    '#EF4444',
                    '#8B5CF6'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function updateCategoryChart(revenueByCategory) {
    const labels = revenueByCategory.map(item => item.category);
    const data = revenueByCategory.map(item => item.total_revenue);
    
    categoryChart.data.labels = labels;
    categoryChart.data.datasets[0].data = data;
    categoryChart.update();
}

// ============ NAVIGATION ============

function setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all nav items and pages
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
            
            // Add active class to clicked nav item
            item.classList.add('active');
            
            // Show corresponding page
            const pageName = item.dataset.page;
            const page = document.getElementById(`${pageName}-page`);
            if (page) {
                page.classList.add('active');
            }
            
            // Load page-specific data
            switch(pageName) {
                case 'products':
                    loadProducts();
                    break;
                case 'alerts':
                    loadAlerts();
                    break;
                // Add other cases as needed
            }
        });
    });
}

// ============ EVENT LISTENERS ============

function setupEventListeners() {
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
        });
    });
    
    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });
    
    // Global search
    document.getElementById('globalSearch')?.addEventListener('input', debounce((e) => {
        const searchTerm = e.target.value;
        const currentPage = document.querySelector('.page.active');
        
        if (currentPage?.id === 'products-page') {
            loadProducts(1, { search: searchTerm });
        }
    }, 300));
    
    // Export products
    document.getElementById('exportProducts')?.addEventListener('click', async () => {
        try {
            const response = await fetch(`${API_URL}/export/products`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) throw new Error('Export failed');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'products_report.csv';
            a.click();
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            alert('Export failed: ' + error.message);
        }
    });
}

// ============ UTILITY FUNCTIONS ============

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function renderPagination(pagination) {
    const container = document.getElementById('productsPagination');
    if (!container) return;
    
    let html = '';
    for (let i = 1; i <= pagination.pages; i++) {
        html += `
            <button 
                class="${i === pagination.page ? 'active' : ''}" 
                onclick="loadProducts(${i})"
            >
                ${i}
            </button>
        `;
    }
    container.innerHTML = html;
}

async function loadTopProducts() {
    try {
        const response = await fetch(`${API_URL}/analytics/dashboard`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load data');
        
        const data = await response.json();
        
        const container = document.getElementById('topProducts');
        if (!container) return;
        
        container.innerHTML = data.topProducts.map((product, index) => `
            <div class="activity-item">
                <span class="rank">#${index + 1}</span>
                <div class="activity-info">
                    <strong>${product.product_name}</strong>
                    <small>${product.total_sold} units sold</small>
                </div>
                <span class="activity-value">$${product.total_revenue.toFixed(2)}</span>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading top products:', error);
    }
}

async function loadAlerts() {
    try {
        const response = await fetch(`${API_URL}/alerts?unread_only=true`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load alerts');
        
        const alerts = await response.json();
        
        const badge = document.getElementById('alertBadge');
        if (badge) {
            badge.textContent = alerts.length || '';
            badge.style.display = alerts.length ? 'block' : 'none';
        }
        
        const notificationCount = document.getElementById('notificationCount');
        if (notificationCount) {
            notificationCount.textContent = alerts.length || '';
            notificationCount.style.display = alerts.length ? 'flex' : 'none';
        }
        
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}