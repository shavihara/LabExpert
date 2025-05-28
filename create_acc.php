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
  $fname = $_POST['fname'];
  $lname = $_POST['lname'];
  $email = $_POST['email'];
  $tel_number = $_POST['tel_number'];
  $password = password_hash($_POST['password'], PASSWORD_DEFAULT); // Hash the password

  // Check if email already exists
  $sql = "SELECT email FROM users WHERE email = ?";
  $stmt = $conn->prepare($sql);
  $stmt->bind_param("s", $email);
  $stmt->execute();
  $stmt->store_result();

  if ($stmt->num_rows > 0) {
    // Email already exists, redirect to login page with message
    echo "<p style='color: white; font-weight: bold; background-color: green;height:30px; width:100%;
        text-align: center; padding: 10px; border-radius: 5px;'>This Email already registered.  Please Login...!</p>";
    // Redirect to home page after 2 seconds
    header("refresh:3;url=home.php");
    exit();
  }

  // Prepare and bind
  $stmt = $conn->prepare("INSERT INTO users (fname, lname, email, tel_number, password) VALUES (?, ?, ?, ?, ?)");

  $stmt->bind_param("sssss", $fname, $lname, $email,  $tel_number, $password);


  if ($stmt->execute()) {
    echo "<p style='color: white; font-weight: bold; background-color: green; width:100%;
        text-align: center; padding: 10px; border-radius: 5px;'>Account created successfully! Redirecting to home page in 3 seconds...</p>";
    // Redirect to home page after 2 seconds
    header("refresh:3;url=home.php");
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
  <link rel="icon" href="img/cre.png">
</head>

<body>
  <!--header-->
  <div class="heder1">
    <div class="he1"><img src="img/labex1.jpeg" class="im1"></div>
  </div>

  <div class="signup-container">
    <div class="image-section">
      <img src="img/lab1.jpg" alt="Sign up illustration" />
    </div>

    <div class="form-section">
      <img src="" class="logo">
      <h1>Sign up</h1>
      <p>Let’s get you all set up so you can access your Lab Expert account.</p>

      <form action="" autocapitalize="on" autocomplete="on" method="post">
        <div class="form-row">
          <input type="text" id="fname" name="fname" placeholder="First Name *" required>
          <input type="text" id="lname" name="lname" placeholder="Last Name">
        </div>

        <div class="form-row">
          <input type="email" id="email" name="email" placeholder="Email *" required>
          <input type="text" name="tel_number" placeholder="Phone Number *" required>
        </div>

        <div class="form-row single">
          <div class="password-wrapper">
            <input type="password" name="password" placeholder="Password *" required>

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