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
  <style>
    * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  
  body {
   font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      
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
      margin-bottom: 0px;;
      border-radius: 20px;

      opacity: 0;
      transform: translateY(50px);
      animation: fadeSlideUp 1s ease-out forwards;
      animation-delay: 0.1s;
      
    }
  
    @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
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
  
  
  .image-section img {
   max-width: 400px;
    width: 100%;
    border-radius: 20px;
    opacity: 0;
    transform: translateY(50px);
    animation: fadeSlideUp 1s ease-out forwards;
    animation-delay: 0.3s;
  }
  
  .form-section {
    max-width: 500px;
    width: 100%;
    margin-right: 22px;
    margin-left: 20px;
    opacity: 0;
    transform: translateY(50px);
    animation: fadeSlideUp 1s ease-out forwards;
    animation-delay: 0.3s;
  } 
  
  .form-section h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 10px;
  }
  
  .form-section p {
    font-size: 14px;
    margin-bottom: 25px;
    color: #666;
  }
  
  form {
    width: 100%;
  }
  
  .form-row {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
  }
  
  .form-row.single {
    flex-direction: column;
  }
  
  input[type="text"],
  input[type="email"],
  input[type="tel"],
  input[type="password"] {
    flex: 1;
    padding: 12px;
    border: 1px solid #ccc;
    border-radius: 7px;
    font-size: 14px;
  }
  
  .password-wrapper {
    position: relative;
  }

  
  .checkbox-container {
    display: flex;
    align-items: center;
    font-size: 13px;
    margin: 15px 0;
    gap: 10px;
  }
  
  .checkbox-container a {
    color: #e74c3c;
    text-decoration: none;
  }
  
  .signup-btn {
    width: 100%;
    padding: 12px;
    background-color: #3866fd;
    color: lch(99.31% 0.01 296.81);
    border: none;
    border-radius: 6px;
    font-weight: 600;
    margin-top: 10px;
    cursor: pointer;
  }
  
  .login-text {
    font-size: 13px;
    text-align: center;
    margin-top: 10px;
  }
  
  .login-text a {
    color: #e74c3c;
    text-decoration: none;
  }
  
  .divider {
    text-align: center;
    margin: 30px 0 20px;
    position: relative;
  }
  
  .divider span {
    background: #f0f8ff;
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
    background: #000;
    color: #fff;
  }
  
/* Form Header */
.form-head {
    font-size: 24px;
    margin-bottom: 10px;
    color: #007bff;
}

/* Form Instructions */
.form-instruct {
    font-size: 14px;
    margin-bottom: 20px;
    color: #666;
}

/* Form Labels */
form label {
    display: block;
    text-align: left;
    margin-bottom: 5px;
    font-weight: bold;
}

/* Form Inputs */
form input[type="text"],
form input[type="tel"],
form input[type="password"],
form input[type="email"],
form select {
    width: 100%;
    padding: 10px;
    margin-bottom: 15px;
    border: 1px solid #cccc;
    font-size: 14px;
}

/* Submit Button */
form input[type="submit"] {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    font-size: 16px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.signup-btn:hover {
    background-color: #022142;
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

/* Links */
a {
    color: #007bff;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

/* Footer */
.footer {
    text-align: center;
    margin-top: 5px;
    font-size: 12px;
    color: #999;
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

.im1{
    width:140px;
    height:auto;
    border-radius: 5px;
    margin:5px;
}

    </style>
</head>

<body>
  <!--header-->
  <div class="heder1">
    <div class="he1"><img src="img/labex1.jpeg" class="im1"></div>
  </div>

  <div class="container">

  <div class="con">
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
  </div>
  <div class="footer">
    <p>&copy; 2025 Lab Expert. All rights reserved.</p>
  </div>
</body>

</html>