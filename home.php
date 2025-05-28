<?php
// Database connection settings
$servername = "localhost"; // Database host
$username = "root";        // Database username
$password = "";            // Database password (empty for localhost)
$dbname = "labexpert"; // Your database name

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Get the values from the form
    $email = $_POST['email'];
    $password = $_POST['password']; // Correct variable

    // Prevent SQL injection (optional but highly recommended)
    $stmt = $conn->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    // Check if user exists
    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();

        // Corrected password verification
        if (password_verify($password, $row['password'])) {
            // Redirect based on role or email
            if ($row['email'] == 'admin@labexpert.com') {
                header("Location: labexpert_admin.php");
                exit();
            } else {
                header("Location: http://127.0.0.1:5000/"); // Redirect to the Flask app
                // If you want to pass the user ID or other data, you can append it to the URL
                exit();
            }
        } else {
            $error = "Incorrect password!";
        }
    } else {
        $error = "Invalid email!";
    }
}


$conn->close();
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/x-icon" href="home.ico">
    <title>home page</title>
    <link rel="stylesheet" href="home.css">
</head> 

<body>
<!--Headding-->
<div class="heder1">
    <div class="he1"><img src="img/labex1.jpeg" class="im1"></div>
</div>
  <div class="container">
    <div class="login-form">
      <h1>Login</h1>
      <p>Login to access your Lab Expert account</p>

      <form action="" autocapitalize="on" autocomplete="on" method="post">
        <label>Email</label>
        <input type="email" id="email" name="email" placeholder="example@gmail.com" required>

        <label>Password</label>
        <div class="password-wrapper">
          <input type="password" id="password" name="password" placeholder="Enter your password" required>
        </div>

        <div class="options">
          <label><input type="checkbox"> Remember me</label>
          <a href="Forget_password.php" class="forgot">Forgot Password</a>
        </div>

        <button class="login-btn" type="submit" value="Login">Login</button>
        <p class="signup-text">Don’t have an account? <a class="createacc" onclick="window.open('create_acc.php','_self')">Sign up</a></p>
      </form>
      <div class="divider1"><span>Or login with</span></div>
      
      <div class="social-buttons">
        <button class="facebook">facebook</button>
        <button class="google">Google</button>
        <button class="apple">Apple</button>
      </div>
    </div>

    <div class="illustration">
      <img src="img/lab1.jpg" alt="Lab Expert Illustration">
    </div>
  </div>
  <div class="footer1">
        <p>&copy; 2025 Lab Expert. All rights reserved.</p>
    </div>
</body>

</html>