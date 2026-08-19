<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Database configuration
$host = 'localhost';
$dbname = 'stock_management';
$username = 'root';
$password = 'your_password';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $data = json_decode(file_get_contents('php://input'), true);
    $reportType = $data['report_type'] ?? 'products';
    
    switch ($reportType) {
        case 'products':
            $stmt = $pdo->query("SELECT * FROM products");
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Generate PDF or Excel content here
            echo json_encode([
                'success' => true,
                'data' => $results,
                'message' => 'Products report generated successfully'
            ]);
            break;
            
        case 'sales':
            $startDate = $data['start_date'] ?? date('Y-m-d', strtotime('-30 days'));
            $endDate = $data['end_date'] ?? date('Y-m-d');
            
            $stmt = $pdo->prepare("
                SELECT s.*, p.product_name, p.sku 
                FROM sales s
                JOIN products p ON s.product_id = p.id
                WHERE DATE(s.sale_date) BETWEEN ? AND ?
                ORDER BY s.sale_date DESC
            ");
            $stmt->execute([$startDate, $endDate]);
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'data' => $results,
                'message' => 'Sales report generated successfully'
            ]);
            break;
            
        case 'low_stock':
            $stmt = $pdo->query("
                SELECT * FROM products 
                WHERE current_stock <= reorder_level
                ORDER BY current_stock ASC
            ");
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'data' => $results,
                'message' => 'Low stock report generated successfully'
            ]);
            break;
            
        default:
            echo json_encode([
                'success' => false,
                'message' => 'Invalid report type'
            ]);
    }
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>