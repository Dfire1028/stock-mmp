// js/main.js

document.addEventListener('DOMContentLoaded', function() {
    // 1. Sales Overview Chart (Line or Bar)
    const salesCtx = document.getElementById('salesChart').getContext('2d');
    new Chart(salesCtx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Monthly Sales ($)',
                data: [12000, 19000, 15000, 25000, 22000, 30000],
                backgroundColor: '#4318ff',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });

    // 2. Revenue by Category Chart (Pie)
    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    new Chart(categoryCtx, {
        type: 'pie',
        data: {
            labels: ['Electronics', 'Furniture', 'Office Supplies'],
            datasets: [{
                data: [55, 30, 15],
                backgroundColor: [
                    '#4318ff', // Blue
                    '#01B574', // Green
                    '#FF7D05'  // Orange
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
});