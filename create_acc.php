<?php
// Database connection settings
$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "labexpert";

// Create connection
$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = $_POST['username'];
    $password = password_hash($_POST['password'], PASSWORD_DEFAULT); // Hash the password
    $email = $_POST['email'];
    $job = $_POST['job'];

    // Prepare and bind
    $stmt = $conn->prepare("INSERT INTO users (username, password, tel_number, job) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssss", $username, $password, $email, $job);

    if ($stmt->execute()) {
        echo "<p style='color: white; font-weight: bold; background-color: green; width:100%;
        text-align: center; padding: 10px; border-radius: 5px;'>Account created successfully! Redirecting to home page in 2 seconds...</p>";
        // Redirect to home page after 2 seconds
        header("refresh:2;url=home.php");
        exit();
    } else {
        echo "Error: " . $stmt->error;
    }

    $stmt->close();
}

$conn->close();
?>
<html>

<head>
    <title>create account</title>
    <link rel="stylesheet" href="create_acc.css">
    <link rel="icon" href="cre.png">
</head>

<body>
<!--header-->
<div class="heder1">
    <div class="he1"><img src="labex1.jpeg" class="im1"></div>
</div>

  <div class="signup-container">
    <div class="image-section">
      <img src="lab1.jpg" alt="Sign up illustration" />
    </div>
    
    <div class="form-section">
      <img src="" class="logo">
      <h1>Sign up</h1>
      <p>Let’s get you all set up so you can access your Lab Expert account.</p>

      <form action="" autocapitalize="on" autocomplete="on" method="post">
        <div class="form-row">
          <input type="text" id="username" name="username" placeholder="First Name *" required>
          <input type="text" placeholder="Last Name">
        </div>

        <div class="form-row">
          <input type="email" id="email" name="email" placeholder="Email *" required>
          <input type="tel" placeholder="Phone Number *" required>
        </div>

        <div class="form-row single">
          <div class="password-wrapper">
            <input type="password" placeholder="Password *" required>
            
          </div>
        </div>

        <div class="form-row single">
          <div class="password-wrapper">
            <input type="password" placeholder="Confirm Password *" required>
            
          </div>
        </div>

        <label class="checkbox-container">
          <input type="checkbox" required>
          I agree to all the <a href="#">Terms</a> and <a href="#">Privacy Policies</a>
        </label>

        <button type="submit" class="signup-btn">Create account</button>
        </form>
        <p class="login-text">Already have an account? <a href="home.php">Login</a></p>

        <div class="divider"><span>Or Sign up with</span></div>
        <form>
        <div class="social-buttons">
        <button class="facebook">facebook</button>
        <button class="google">Google</button>
        <button class="apple">Apple</button>
        </div>
    </div>
      </form>
    </div>
  </div>
  <div class="footer">
        <p>&copy; 2025 Lab Expert. All rights reserved.</p>
    </div>
</body>

</html>