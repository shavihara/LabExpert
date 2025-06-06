<?php
require_once 'config.php';

session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $email = filter_var($input['email'], FILTER_SANITIZE_EMAIL);
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'message' => 'Invalid email format']);
        exit;
    }
    
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        // Check if email exists
        $query = "SELECT email FROM users WHERE email = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$email]);
        
        if ($stmt->rowCount() == 0) {
            echo json_encode(['success' => false, 'message' => 'Email not found']);
            exit;
        }
        
        // Generate 6-digit OTP (ensure it's always 6 digits)
        $otp = str_pad(mt_rand(1, 999999), 6, '0', STR_PAD_LEFT);
        $expires_at = date('Y-m-d H:i:s', strtotime('+10 minutes'));
        
        // Delete existing OTP
        $delete_query = "DELETE FROM password_resets WHERE email = ?";
        $delete_stmt = $db->prepare($delete_query);
        $delete_stmt->execute([$email]);
        
        // Insert new OTP
        $insert_query = "INSERT INTO password_resets (email, otp, expires_at, created_at) 
                         VALUES (?, ?, ?, NOW())";
        $insert_stmt = $db->prepare($insert_query);
        $insert_stmt->execute([$email, $otp, $expires_at]);
        
        // Send OTP email
        $emailService = new EmailService();
        if ($emailService->sendOTP($email, $otp)) {
            $_SESSION['reset_email'] = $email;
            echo json_encode(['success' => true, 'message' => 'OTP sent to your email']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Failed to send email']);
        }
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
    }
}
?>