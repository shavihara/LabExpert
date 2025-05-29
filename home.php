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
      if ($row['email'] == 'labexpert.us@gmail.com') {
        header("Location: labexpert_admin.php");
        exit();
      } else {
        header("Location: http://127.0.0.1:5000/"); // Redirect to the Flask app

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
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
    }

    .container {
      display: flex;
      min-height: 85vh;
      align-items: center;
      justify-content: center;
      padding: 10px 10px 0px 10px;
      
    }

    

        @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

    .con{
      
      display: flex;
      flex: 1;
      background: #f0f8ff;

      align-items: center;
      justify-content: center;
      padding: 40px;
      margin-left: 20vh;
      margin-right: 20vh;
      border-radius: 20px;
      margin-bottom: 0px;
      
      opacity: 0;
      transform: translateY(50px);
      animation: fadeSlideUp 1s ease-out forwards;
      animation-delay: 0.1s;
      
    }

    .login-form {
      width: 100%;
      max-width: 400px;
      margin-right: 20px;
      margin-left: 20px;
      opacity: 0;
      transform: translateY(50px);
      animation: fadeSlideUp 1s ease-out forwards;
      animation-delay: 0.3s;
    }

    .illustration img {
      max-width: 400px;
      width: 100%;
      border-radius: 20px;
      opacity: 0;
      transform: translateY(50px);
      animation: fadeSlideUp 1s ease-out forwards;
      animation-delay: 0.3s;
    }

    .login-form h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .login-form p {
      font-size: 14px;
      margin-bottom: 20px;
    }

    form label {
      display: block;
      margin: 15px 0 5px;
      font-weight: 600;
    }

    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 12px;
      border: 1px solid #ccc;
      border-radius: 6px;
    }

    .password-wrapper {
      position: relative;
    }

    .options {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      margin: 0px;
    }

    .options .forgot {
      color: #e74c3c;
      text-decoration: none;
    }

    .forgot:hover {
      color: #e74c3c;
      text-decoration: underline;
    }

    .login-btn {
      width: 100%;
      padding: 12px;
      background-color: #4c63ff;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 10px;
    }

    .signup-text {
      font-size: 13px;
      text-align: center;
      margin-top: 12px;
    }

    .signup-text a {
      color: #e74c3c;
      text-decoration: none;
    }

    .divider {
      text-align: center;
      margin: 30px 0 15px;
      position: relative;
    }

    .divider span {
      background: #fff;
      padding: 0 10px;
      color: #aaa;
      font-size: 13px;
    }

    .divider::before {
      content: '';
      height: 1px;
      width: 100%;
      background: #ddd;
      position: absolute;
      top: 50%;
      left: 0;
      z-index: -1;
    }

    .social-buttons {
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }

    .social-buttons button {
      flex: 1;
      padding: 10px;
      font-size: 16px;
      border: 1px solid #ddd;
      border-radius: 6px;
      cursor: pointer;
    }

    .facebook {
      background: #3b5998;
      color: #fff;
    }

    .google {
      background: #fff;
      border: 1px solid #ccc;
    }

    .apple {
      background: #050000;
      color: #fff;
    }

    .facebook:hover {
      background-color: #022142;
    }

    .google:hover {
      background-color: #db2736;

    }

    .apple:hover {
      background-color: #383636;

    }

    

    .divider1 {
      text-align: center;
      margin: 30px 0 20px;
      position: relative;
    }

    .divider1 span {
      background: #f0f8ff;
      padding: 0 10px;
      color: #aaa;
      font-size: 13px;
    }

    .divider1::before {
      content: '';
      height: 1px;
      width: 100%;
      background: #ddd;
      position: absolute;
      top: 50%;
      left: 0;
      z-index: -1;
    }

    /*Heder*/
    .heder1{
 /* Full background gradient animation */
  padding: 10px 10px;
  margin: 0;
  text-align: center;
  color: white;
  font-size: 2em;
  font-weight: bold;

  background: linear-gradient(135deg, #667eea, #764ba2, #6bcbef, #ff6bcb);
  background-size: 300% 300%;
  animation: gradientMove 8s ease infinite;
  border-radius: 10px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
}

/* Gradient animation keyframes */
@keyframes gradientMove {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}


    .im1 {
      width: 140px;
      height: auto;
      border-radius: 5px;
      margin: 5px;
    }

    .login {
      background-color: lightblue;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 350px;
      padding: 20px;
      border-radius: 15px;
      box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);
      margin: 10% auto;
    }

    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 10px;
      margin-top: 5px;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: inset 0px 2px 5px rgba(0, 0, 0, 0.1);
      font-size: 16px;
    }


    input[type="text"]:focus,
    input[type="password"]:focus {
      border-color: #007bff;
      outline: none;
      box-shadow: 0px 0px 5px rgba(0, 123, 255, 0.5);
    }


    input[type="submit"] {
      width: 100%;
      padding: 10px;
      margin-top: 15px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      transition: background 0.5s ease;
    }

    .login-btn:hover {
      background-color: #0056b3;
    }

    .createacc {

      color: black;
      font-size: 15px;
      font-weight: lighter;
      cursor: pointer;
      font-family: "Baskerville Old Face";
    }

    .createacc:hover {
      color: red;
      text-decoration: underline;
    }

    /* Footer */
    .footer1 {
      text-align: center;
      margin-top: 5px;
      font-size: 12px;
      color: #999;
    }
  </style>

</head>

<body>
  <!--Headding-->
  <div class="heder1">
    <div class="he1"><img src="img/labex1.jpeg" class="im1"></div>
  </div>
  <div class="container">
    <div class="con">
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
  </div>
  <div class="footer1">
    <p>&copy; 2025 Lab Expert. All rights reserved.</p>
  </div>
</body>

</html>