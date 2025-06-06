<?php
require_once 'config.php';

session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $otp = trim($input['otp']); // Trim whitespace
    $email = $_SESSION['reset_email'] ?? '';
    
    if (empty($email) || empty($otp)) {
        echo json_encode(['success' => false, 'message' => 'Invalid request - Missing data']);
        exit;
    }
    
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        // Simple verification query
        $query = "SELECT * FROM password_resets 
                  WHERE email = ? AND otp = ? AND expires_at > NOW()";
        $stmt = $db->prepare($query);
        $stmt->execute([$email, $otp]);
        
        if ($stmt->rowCount() > 0) {
            $_SESSION['otp_verified'] = true;
            $_SESSION['otp_token'] = bin2hex(random_bytes(32));
            echo json_encode([
                'success' => true, 
                'message' => 'OTP verified successfully',
                'token' => $_SESSION['otp_token']
            ]);
        } else {
            // Check if OTP exists but expired
            $check_query = "SELECT * FROM password_resets WHERE email = ? AND otp = ?";
            $check_stmt = $db->prepare($check_query);
            $check_stmt->execute([$email, $otp]);
            
            if ($check_stmt->rowCount() > 0) {
                echo json_encode(['success' => false, 'message' => 'OTP has expired']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Invalid OTP']);
            }
        }
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
    }
}
?>