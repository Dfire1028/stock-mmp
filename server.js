const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Email transporter for alerts
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, role || 'staff']
        );

        res.status(201).json({ 
            message: 'User created successfully',
            userId: result.insertId 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ PRODUCT ROUTES ============

// Get all products with advanced filtering
app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const { 
            category, 
            search, 
            low_stock, 
            sort_by = 'product_name', 
            order = 'ASC',
            page = 1,
            limit = 50 
        } = req.query;

        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (product_name LIKE ? OR sku LIKE ? OR supplier LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (low_stock === 'true') {
            query += ' AND current_stock <= reorder_level';
        }

        // Calculate pagination
        const offset = (page - 1) * limit;
        
        // Get total count
        const [countResult] = await pool.execute(
            query.replace('SELECT *', 'SELECT COUNT(*) as total'),
            params
        );
        const total = countResult[0].total;

        // Add sorting and pagination
        query += ` ORDER BY ${sort_by} ${order} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [products] = await pool.execute(query, params);

        // Get low stock alerts
        const [alerts] = await pool.execute(
            'SELECT product_id FROM alerts WHERE is_read = FALSE'
        );
        const alertProductIds = alerts.map(a => a.product_id);

        res.json({
            products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            alerts: alertProductIds
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new product
app.post('/api/products', authenticateToken, async (req, res) => {
    try {
        const { product_name, sku, category, unit_price, current_stock, reorder_level, description, supplier } = req.body;
        
        const [result] = await pool.execute(
            'INSERT INTO products (product_name, sku, category, unit_price, current_stock, reorder_level, description, supplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [product_name, sku, category, unit_price, current_stock, reorder_level, description, supplier]
        );

        // Log stock movement
        if (current_stock > 0) {
            await pool.execute(
                'INSERT INTO stock_movements (product_id, movement_type, quantity, notes) VALUES (?, ?, ?, ?)',
                [result.insertId, 'IN', current_stock, 'Initial stock']
            );
        }

        res.status(201).json({ 
            message: 'Product added successfully',
            productId: result.insertId 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update product
app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { product_name, sku, category, unit_price, reorder_level, description, supplier } = req.body;
        
        await pool.execute(
            'UPDATE products SET product_name = ?, sku = ?, category = ?, unit_price = ?, reorder_level = ?, description = ?, supplier = ? WHERE id = ?',
            [product_name, sku, category, unit_price, reorder_level, description, supplier, id]
        );

        res.json({ message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete product
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM products WHERE id = ?', [id]);
        
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ SALES ROUTES ============

// Record a sale
app.post('/api/sales', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { product_id, quantity_sold, selling_price, customer_name, payment_method } = req.body;
        
        // Get current stock
        const [product] = await connection.execute(
            'SELECT current_stock, reorder_level, product_name FROM products WHERE id = ?',
            [product_id]
        );

        if (product.length === 0) {
            throw new Error('Product not found');
        }

        if (product[0].current_stock < quantity_sold) {
            throw new Error('Insufficient stock');
        }

        // Record sale
        const [saleResult] = await connection.execute(
            'INSERT INTO sales (product_id, quantity_sold, selling_price, customer_name, payment_method) VALUES (?, ?, ?, ?, ?)',
            [product_id, quantity_sold, selling_price, customer_name, payment_method]
        );

        // Update stock
        const newStock = product[0].current_stock - quantity_sold;
        await connection.execute(
            'UPDATE products SET current_stock = ? WHERE id = ?',
            [newStock, product_id]
        );

        // Log stock movement
        await connection.execute(
            'INSERT INTO stock_movements (product_id, movement_type, quantity, reference_number, notes) VALUES (?, ?, ?, ?, ?)',
            [product_id, 'OUT', quantity_sold, `SALE-${saleResult.insertId}`, `Sold to ${customer_name || 'customer'}`]
        );

        // Check if low stock and create alert
        if (newStock <= product[0].reorder_level) {
            await connection.execute(
                'INSERT INTO alerts (product_id, alert_type, message) VALUES (?, ?, ?)',
                [product_id, 'LOW_STOCK', `${product[0].product_name} is low in stock (${newStock} remaining)`]
            );
        }

        await connection.commit();
        
        res.status(201).json({ 
            message: 'Sale recorded successfully',
            saleId: saleResult.insertId,
            newStockLevel: newStock
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Get sales history
app.get('/api/sales', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date, product_id } = req.query;
        
        let query = `
            SELECT s.*, p.product_name, p.sku 
            FROM sales s
            JOIN products p ON s.product_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            query += ' AND DATE(s.sale_date) >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND DATE(s.sale_date) <= ?';
            params.push(end_date);
        }

        if (product_id) {
            query += ' AND s.product_id = ?';
            params.push(product_id);
        }

        query += ' ORDER BY s.sale_date DESC LIMIT 100';

        const [sales] = await pool.execute(query, params);
        
        res.json(sales);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ STOCK MANAGEMENT ROUTES ============

// Stock in (Add stock)
app.post('/api/stock/in', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { product_id, quantity, reference_number, notes } = req.body;
        
        // Update stock
        await connection.execute(
            'UPDATE products SET current_stock = current_stock + ? WHERE id = ?',
            [quantity, product_id]
        );

        // Log movement
        await connection.execute(
            'INSERT INTO stock_movements (product_id, movement_type, quantity, reference_number, notes) VALUES (?, ?, ?, ?, ?)',
            [product_id, 'IN', quantity, reference_number, notes]
        );

        // Clear any low stock alerts
        await connection.execute(
            'UPDATE alerts SET is_read = TRUE WHERE product_id = ? AND alert_type = ? AND is_read = FALSE',
            [product_id, 'LOW_STOCK']
        );

        await connection.commit();
        
        res.json({ message: 'Stock added successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Get stock movements
app.get('/api/stock/movements', authenticateToken, async (req, res) => {
    try {
        const { product_id } = req.query;
        
        let query = `
            SELECT sm.*, p.product_name, p.sku
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id
        `;
        const params = [];

        if (product_id) {
            query += ' WHERE sm.product_id = ?';
            params.push(product_id);
        }

        query += ' ORDER BY sm.movement_date DESC LIMIT 100';

        const [movements] = await pool.execute(query, params);
        
        res.json(movements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ ALERTS & NOTIFICATIONS ============

// Get all alerts
app.get('/api/alerts', authenticateToken, async (req, res) => {
    try {
        const { unread_only } = req.query;
        
        let query = `
            SELECT a.*, p.product_name, p.sku, p.current_stock
            FROM alerts a
            JOIN products p ON a.product_id = p.id
        `;
        
        if (unread_only === 'true') {
            query += ' WHERE a.is_read = FALSE';
        }
        
        query += ' ORDER BY a.created_at DESC LIMIT 50';
        
        const [alerts] = await pool.execute(query);
        
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark alert as read
app.put('/api/alerts/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute(
            'UPDATE alerts SET is_read = TRUE WHERE id = ?',
            [id]
        );
        
        res.json({ message: 'Alert marked as read' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ ANALYTICS & REPORTS ============

// Dashboard analytics
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
    try {
        // Total products
        const [totalProducts] = await pool.execute('SELECT COUNT(*) as count FROM products');
        
        // Low stock items
        const [lowStock] = await pool.execute(
            'SELECT COUNT(*) as count FROM products WHERE current_stock <= reorder_level'
        );
        
        // Today's sales
        const [todaySales] = await pool.execute(`
            SELECT COUNT(*) as count, COALESCE(SUM(quantity_sold * selling_price), 0) as total
            FROM sales 
            WHERE DATE(sale_date) = CURDATE()
        `);
        
        // Monthly sales
        const [monthlySales] = await pool.execute(`
            SELECT DATE_FORMAT(sale_date, '%Y-%m') as month,
                   SUM(quantity_sold * selling_price) as total_revenue,
                   COUNT(*) as total_sales
            FROM sales
            WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(sale_date, '%Y-%m')
            ORDER BY month DESC
        `);
        
        // Top selling products
        const [topProducts] = await pool.execute(`
            SELECT p.product_name, p.sku, 
                   SUM(s.quantity_sold) as total_sold,
                   SUM(s.quantity_sold * s.selling_price) as total_revenue
            FROM sales s
            JOIN products p ON s.product_id = p.id
            WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY s.product_id
            ORDER BY total_sold DESC
            LIMIT 10
        `);

        // Revenue by category
        const [revenueByCategory] = await pool.execute(`
            SELECT p.category,
                   SUM(s.quantity_sold * s.selling_price) as total_revenue,
                   SUM(s.quantity_sold) as total_units_sold
            FROM sales s
            JOIN products p ON s.product_id = p.id
            WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY p.category
        `);

        res.json({
            totalProducts: totalProducts[0].count,
            lowStockItems: lowStock[0].count,
            todaySales: {
                count: todaySales[0].count,
                total: todaySales[0].total || 0
            },
            monthlySales,
            topProducts,
            revenueByCategory
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export report (CSV)
app.get('/api/export/products', authenticateToken, async (req, res) => {
    try {
        const [products] = await pool.execute('SELECT * FROM products');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=products_report.csv');
        
        // CSV headers
        const headers = ['ID', 'Product Name', 'SKU', 'Category', 'Unit Price', 'Current Stock', 'Reorder Level', 'Supplier'];
        let csv = headers.join(',') + '\n';
        
        // CSV data
        products.forEach(product => {
            csv += [
                product.id,
                `"${product.product_name}"`,
                product.sku,
                product.category,
                product.unit_price,
                product.current_stock,
                product.reorder_level,
                `"${product.supplier || ''}"`
            ].join(',') + '\n';
        });
        
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ AUTOMATED TASKS ============

// Check low stock every hour
cron.schedule('0 * * * *', async () => {
    try {
        const [lowStockProducts] = await pool.execute(`
            SELECT * FROM products 
            WHERE current_stock <= reorder_level
        `);

        for (const product of lowStockProducts) {
            // Check if alert already exists
            const [existingAlert] = await pool.execute(
                'SELECT id FROM alerts WHERE product_id = ? AND alert_type = ? AND is_read = FALSE',
                [product.id, 'LOW_STOCK']
            );

            if (existingAlert.length === 0) {
                await pool.execute(
                    'INSERT INTO alerts (product_id, alert_type, message) VALUES (?, ?, ?)',
                    [product.id, 'LOW_STOCK', `${product.product_name} needs restocking (${product.current_stock} remaining)`]
                );

                // Send email alert if configured
                if (process.env.SMTP_HOST) {
                    await transporter.sendMail({
                        from: process.env.SMTP_USER,
                        to: 'admin@business.com', // Configure admin email
                        subject: `Low Stock Alert: ${product.product_name}`,
                        html: `
                            <h2>Low Stock Alert</h2>
                            <p>Product: ${product.product_name}</p>
                            <p>SKU: ${product.sku}</p>
                            <p>Current Stock: ${product.current_stock}</p>
                            <p>Reorder Level: ${product.reorder_level}</p>
                            <p>Please restock as soon as possible.</p>
                        `
                    });
                }
            }
        }
        
        console.log('Low stock check completed');
    } catch (error) {
        console.error('Error in low stock check:', error);
    }
});

// Generate daily report
cron.schedule('0 23 * * *', async () => {
    try {
        const [dailySales] = await pool.execute(`
            SELECT COUNT(*) as total_transactions,
                   SUM(quantity_sold * selling_price) as total_revenue
            FROM sales 
            WHERE DATE(sale_date) = CURDATE()
        `);
        
        // You can send this report via email or store it
        console.log(`Daily Report - Transactions: ${dailySales[0].total_transactions}, Revenue: $${dailySales[0].total_revenue}`);
    } catch (error) {
        console.error('Error generating daily report:', error);
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});