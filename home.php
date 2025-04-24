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
    $user = $_POST['username'];
    $pass = $_POST['password'];

    // SQL query to check if the username and password match
    $sql = "SELECT * FROM users WHERE username = '$user'";
    $result = $conn->query($sql);

    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();

        // Verify the password
        if (password_verify($pass, $row['password'])) {
            // Redirect based on the job
            if ($row['job'] == 'admin') {
                header("Location: admin.php");
                exit();
            } elseif ($row['job'] == 'cashier') {
                header("Location: cashier.php");
                exit();
            } elseif ($row['job'] == 'inventory_boy') {
                header("Location: inventory_boy.php");
                exit();
            }
        } else {
            $error = "Invalid username or password!";
        }
    } else {
        $error = "Invalid username or password!";
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
    <div class="he1"><img src="labex1.jpeg" class="im1"></div>
</div>
  <div class="container">
    <div class="login-form">
      <h1>Login</h1>
      <p>Login to access your Lab Expert account</p>

      <form action="" autocapitalize="on" autocomplete="on" method="post">
        <label>Email</label>
        <input type="email" id="username" name="username" placeholder="example@gmail.com" required>

        <label>Password</label>
        <div class="password-wrapper">
          <input type="password" id="password" name="password" placeholder="Enter your password" required>
        </div>

        <div class="options">
          <label><input type="checkbox"> Remember me</label>
          <a href="#" class="forgot">Forgot Password</a>
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
      <img src="lab1.jpg" alt="Lab Expert Illustration">
    </div>
  </div>
  <div class="footer1">
        <p>&copy; 2025 Lab Expert. All rights reserved.</p>
    </div>
</body>

</html>