<?php
require_once 'config.php';

session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $new_password = $input['password'];
    $confirm_password = $input['confirm_password'];
    $token = $input['token'];
    
    $email = $_SESSION['reset_email'] ?? '';
    $otp_verified = $_SESSION['otp_verified'] ?? false;
    $session_token = $_SESSION['otp_token'] ?? '';
    
    // Validate inputs
    if (empty($email) || !$otp_verified || $token !== $session_token) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized request']);
        exit;
    }
    
    if (strlen($new_password) < 6) {
        echo json_encode(['success' => false, 'message' => 'Password must be at least 6 characters']);
        exit;
    }
    
    if ($new_password !== $confirm_password) {
        echo json_encode(['success' => false, 'message' => 'Passwords do not match']);
        exit;
    }
    
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        // Hash new password
        $hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
        
        // Update password
        $query = "UPDATE users SET password = :password WHERE email = :email";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':password', $hashed_password);
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        
        // Delete used OTP
        $query = "DELETE FROM password_resets WHERE email = :email";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        
        // Clear session
        unset($_SESSION['reset_email']);
        unset($_SESSION['otp_verified']);
        unset($_SESSION['otp_token']);
        
        echo json_encode(['success' => true, 'message' => 'Password reset successfully']);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Server error occurred']);
        error_log($e->getMessage());
    }
}
?>