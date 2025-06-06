<?php
// Add this to config.php
date_default_timezone_set('Asia/Colombo'); // Or your timezone

// Database configuration
class Database {
    private $host = "localhost";
    private $db_name = "labexpert";
    private $username = "root";
    private $password = "";
    public $conn;

    public function getConnection() {
        $this->conn = null;
        try {
            $this->conn = new PDO("mysql:host=" . $this->host . ";dbname=" . $this->db_name, $this->username, $this->password);
            $this->conn->exec("set names utf8");
        } catch(PDOException $exception) {
            echo "Connection error: " . $exception->getMessage();
        }
        return $this->conn;
    }
}

// Gmail SMTP configuration
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

require_once 'vendor/autoload.php'; // Install PHPMailer via Composer

class EmailService {
    private $mail;
    
    public function __construct() {
        $this->mail = new PHPMailer(true);
        $this->setupSMTP();
    }
    
    private function setupSMTP() {
        $this->mail->isSMTP();
        $this->mail->Host = 'smtp.gmail.com';
        $this->mail->SMTPAuth = true;
        $this->mail->Username = 'labexpert.us@gmail.com'; // Your Gmail
        $this->mail->Password = 'wqodqzvgdtvpfmru'; // Your Gmail App Password
        $this->mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $this->mail->Port = 587;
        $this->mail->setFrom('labexpert.us@gmail.com', 'Lab Expert');
    }
    
    public function sendOTP($email, $otp) {
        try {
            $this->mail->addAddress($email);
            $this->mail->isHTML(true);
            $this->mail->Subject = 'Password Reset OTP';
            $this->mail->Body = $this->getOTPTemplate($otp);
            
            $this->mail->send();
            return true;
        } catch (Exception $e) {
            error_log("Email error: " . $e->getMessage());
            return false;
        }
    }
    
    private function getOTPTemplate($otp) {
        return "
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
            <h2 style='color: #333;'>Password Reset Request</h2>
            <p>You have requested to reset your password. Please use the following OTP to proceed:</p>
            <div style='background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;'>
                <h1 style='color: #2c3e50; font-size: 32px; margin: 0;'>{$otp}</h1>
            </div>
            <p><strong>This OTP will expire in 10 minutes.</strong></p>
            <p>If you didn't request this, please ignore this email.</p>
        </div>";
    }
}
?>