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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
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

    .con {
      display: flex;
      flex: 1;
      background: #f0f8ff;
      align-items: center;
      justify-content: center;
      padding-top: 15px;

      margin-left: 20vh;
      margin-right: 20vh;
      margin-bottom: 0px;
      ;
      border-radius: 20px;

      opacity: 0;
      transform: translateY(50px);
      animation: fadeSlideUp 1s ease-out forwards;
      animation-delay: 0.1s;

    }

    @keyframes fadeSlideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .container {
      display: flex;
      min-height: 85vh;
      align-items: center;
      justify-content: center;
      padding: 10px 10px 0px 10px;

    }



    @keyframes fadeSlideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
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
      width:100%;
    }

    input[type="text"],
    input[type="email"],
    input[type="tel"],
    input[type="password"] {
      flex: 1;
      padding: 12px;
      border: 1px solid #ccc;
      border-radius: 7px;
      font-size: 16px;
      /* Increased from 14px to prevent zoom on iOS */
      -webkit-appearance: none;
      /* Remove iOS styling */
      appearance: none;
    }

    .password-wrapper {
      position: relative;
    }

    /* Password Strength Styling - Enhanced */
    .password-strength {
      margin-top: 0px;
      font-size: 13px;
    }

    .strength-text {
      color: #666;
      font-weight: 500;
      margin-bottom: 5px;
      min-height: 18px;
    }

    .strength-meter {
      height: 6px;
      background-color: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
      position: relative;
    }

    .strength-fill {
      height: 100%;
      transition: all 0.4s ease;
      border-radius: 3px;
      position: absolute;
      left: 0;
      top: 0;
    }

    .strength-weak .strength-fill {
      width: 25%;
      background: linear-gradient(90deg, #ff4444, #ff6666);
    }

    .strength-fair .strength-fill {
      width: 50%;
      background: linear-gradient(90deg, #ffaa00, #ffcc44);
    }

    .strength-good .strength-fill {
      width: 75%;
      background: linear-gradient(90deg, #88cc00, #aadd44);
    }

    .strength-strong .strength-fill {
      width: 100%;
      background: linear-gradient(90deg, #00cc44, #44dd88);
    }

    .error-message {
      color: #ff4444;
      font-size: 12px;
      margin-top: 5px;
      display: none;
    }

    .success-message {
      color: #00cc44;
      font-size: 12px;
      margin-top: 5px;
      display: none;
    }

    

    .checkbox-container {
      display: flex;
      align-items: center;
      font-size: 16px;
      /* Increased from 13px */
      margin: 15px 0;
      gap: 10px;
    }

    .checkbox-container input[type="checkbox"] {
      width: 18px;
      /* Larger checkbox */
      height: 18px;
      margin-right: 8px;
    }

    .checkbox-container a {
      color: #e74c3c;
      text-decoration: none;
    }

    .signup-btn {
      width: 100%;
      padding: 16px;
      /* Increased padding */
      background-color: #3866fd;
      color: lch(99.31% 0.01 296.81);
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 18px;
      /* Larger font size */
      margin-top: 10px;
      cursor: pointer;
      min-height: 50px;
      /* Ensure minimum touch target */
    }

    .login-text {
      font-size: 16px;
      /* Increased from 13px */
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
      font-size: 16px;
      /* Increased from 13px */
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
      padding: 12px;
      /* Increased padding */
      font-size: 16px;
      border: 1px solid #ddd;
      border-radius: 6px;
      cursor: pointer;
      min-height: 48px;
      /* Better touch target */
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
      font-size: 16px;
      /* Increased */
      margin-bottom: 20px;
      color: #666;
    }

    /* Form Labels */
    form label {
      display: block;
      text-align: left;
      margin-bottom: 5px;
      font-weight: bold;
      font-size: 16px;
      /* Added font size */
    }

    /* Form Inputs */
    form input[type="text"],
    form input[type="tel"],
    form input[type="password"],
    form input[type="email"],
    form select {
      width: 100%;
      padding: 12px;
      /* Increased */
      margin-bottom: 5px;
      border: 1px solid #cccc;
      font-size: 16px;
      /* Increased from 14px */
      min-height: 48px;
      /* Better touch target */
      -webkit-appearance: none;
      appearance: none;
    }

    /* Submit Button */
    form input[type="submit"] {
      background-color: #007bff;
      color: white;
      border: none;
      padding: 16px 20px;
      /* Increased */
      font-size: 18px;
      /* Increased */
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.3s ease;
      min-height: 50px;
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
      font-size: 16px;
      /* Ensure links are readable */
    }

    a:hover {
      text-decoration: underline;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 5px;
      font-size: 14px;
      /* Increased */
      color: #999;
    }

    /*Header*/
    .heder1 {
      /* Full background gradient animation */
      padding: 10px 10px;
      margin: 0;
      text-align: center;
      color: white;
      font-size: 2em;
      font-weight: bold;

      background: linear-gradient(135deg, #667eea, #764ba2, #6bcbef, #ff6bcb);
      background-size: 300% 300%;
      animation: gradientMove 30s ease infinite;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
    }

    /* Gradient animation keyframes */
    @keyframes gradientMove {
      0% {
        background-position: 0% 50%;
      }

      50% {
        background-position: 100% 50%;
      }

      100% {
        background-position: 0% 50%;
      }
    }

    .im1 {
      width: 140px;
      height: auto;
      border-radius: 5px;
      margin: 5px;
    }

    /* Mobile Responsive Styles */
    @media screen and (max-width: 768px) {
      .container {
        padding: 5px;
        min-height: auto;
      }

      .con {
        flex-direction: column;
        margin-left: 10px;
        margin-right: 10px;
        padding: 20px;
        margin-bottom: 20px;
      }

      /* Hide image section on mobile */
      .image-section {
        display: none;
      }

      .form-section {
        margin: 0;
        order: 1;
        /* Form appears first on mobile */
      }

      .form-section h1 {
        font-size: 1.8rem;
        text-align: center;
      }

      .form-section p {
        font-size: 16px;
        text-align: center;
      }

      .form-row {
        flex-direction: column;
        gap: 15px;
      }

      .form-row:not(.single) {
        flex-direction: column;
      }

      input[type="text"],
      input[type="email"],
      input[type="tel"],
      input[type="password"] {
        width: 100%;
        padding: 16px;
        font-size: 18px;
        /* Larger font for mobile */
        min-height: 52px;
        border-radius: 8px;
      }

      .signup-btn {
        padding: 18px;
        font-size: 20px;
        min-height: 56px;
      }

      .social-buttons {
        flex-direction: column;
        gap: 15px;
      }

      .social-buttons button {
        width: 100%;
        padding: 16px;
        font-size: 18px;
        min-height: 52px;
      }

      .checkbox-container {
        font-size: 16px;
        line-height: 1.4;
      }

      .heder1 {
        font-size: 1.5em;
        padding: 5px 5px;
      }

      .im1 {
        width: 120px;
      }
    }

    @media screen and (max-width: 480px) {
      .con {
        margin-left: 5px;
        margin-right: 5px;
        padding: 15px;
      }

      /* Ensure image is still hidden on very small screens */
      .image-section {
        display: none;
      }

      input[type="text"],
      input[type="email"],
      input[type="tel"],
      input[type="password"] {
        font-size: 20px;
        /* Even larger for small screens */
        padding: 18px;
        min-height: 56px;
      }

      .signup-btn {
        font-size: 22px;
        padding: 20px;
        min-height: 60px;
      }

      .social-buttons button {
        font-size: 20px;
        padding: 18px;
        min-height: 56px;
      }





            .form-section h1 {
            color: #333;
            margin-bottom: 0.5rem;
        }

        .form-section p {
            color: #666;
            margin-bottom: 2rem;
        }

        .form-row {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .form-row.single {
            display: block;
        }

        .form-row input {
            flex: 1;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }

        .form-row.single input {
            width: 100%;
        }

        .password-wrapper {
            position: relative;
            width: 100%;
        }

        .password-strength {
            margin-top: 5px;
            font-size: 12px;
        }

        .strength-meter {
            height: 4px;
            background-color: #e0e0e0;
            border-radius: 2px;
            margin-top: 5px;
            overflow: hidden;
        }

        .strength-fill {
            height: 100%;
            transition: all 0.3s ease;
            border-radius: 2px;
        }

        .strength-weak .strength-fill {
            width: 25%;
            background-color: #ff4444;
        }

        .strength-fair .strength-fill {
            width: 50%;
            background-color: #ffaa00;
        }

        .strength-good .strength-fill {
            width: 75%;
            background-color: #88cc00;
        }

        .strength-strong .strength-fill {
            width: 100%;
            background-color: #00cc44;
        }

        .error-message {
            color: #ff4444;
            font-size: 12px;
            margin-top: 5px;
            display: none;
        }

        .success-message {
            color: #00cc44;
            font-size: 12px;
            margin-top: 5px;
            display: none;
        }

        .checkbox-container {
            display: flex;
            align-items: center;
            margin: 1.5rem 0;
            font-size: 14px;
            color: #666;
        }

        .checkbox-container input {
            margin-right: 8px;
        }

        .checkbox-container a {
            color: #667eea;
            text-decoration: none;
        }

        .signup-btn {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .signup-btn:hover {
            transform: translateY(-2px);
        }

        .signup-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
    }
  </style>
  
</head>


<body>
    <!--header-->
    <div class="heder1">
        <div class="he1"><img src="img/labex1.jpeg" class="im1" alt="Lab Expert Logo"></div>
    </div>

    <div class="container">
        <div class="con">
            <div class="image-section">
                <img src="img/lab1.jpg" alt="Sign up illustration" />
            </div>

            <div class="form-section">
                <img src="" class="logo">
                <h1>Sign up</h1>
                <p>Let's get you all set up so you can access your Lab Expert account.</p>

                <form id="signupForm" action="" autocapitalize="on" autocomplete="on" method="post">
                    <div class="form-row">
                        <input type="text" id="fname" name="fname" placeholder="First Name *" required>
                        <input type="text" id="lname" name="lname" placeholder="Last Name">
                    </div>

                    <div class="form-row">
                        <input type="email" id="email" name="email" placeholder="Email *" required>
                        <input type="tel" name="tel_number" placeholder="Phone Number *" required>
                    </div>

                    <div class="form-row single">
                        <div class="password-wrapper">
                            <input type="password" id="password" name="password" placeholder="Password *" required>
                            <div class="password-strength">
                                <div class="strength-text"></div>
                                <div class="strength-meter">
                                    <div class="strength-fill"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="form-row single">
                        <div class="password-wrapper">
                            <input type="password" id="confirmPassword" placeholder="Confirm Password *" required>
                            <div class="error-message" id="passwordError">Passwords do not match</div>
                            <div class="success-message" id="passwordSuccess">Passwords match ✓</div>
                        </div>
                    </div>

                    <label class="checkbox-container">
                        <input type="checkbox" required>
                        I agree to all the <a href="#">Terms</a> and <a href="#">Privacy Policies</a>
                    </label>

                    <button type="submit" class="signup-btn" id="submitBtn">Create account</button>
                </form>

                <p class="login-text">Already have an account? <a href="home.php">Login</a></p>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>&copy; 2025 Lab Expert. All rights reserved.</p>
    </div>

    <script>
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const passwordError = document.getElementById('passwordError');
        const passwordSuccess = document.getElementById('passwordSuccess');
        const submitBtn = document.getElementById('submitBtn');
        const form = document.getElementById('signupForm');
        const strengthText = document.querySelector('.strength-text');
        const strengthMeter = document.querySelector('.strength-meter');

        // Password strength checker
        function checkPasswordStrength(password) {
            let score = 0;
            let feedback = [];

            // Length check
            if (password.length >= 8) {
                score += 1;
            } else {
                feedback.push('At least 8 characters');
            }

            // Uppercase check
            if (/[A-Z]/.test(password)) {
                score += 1;
            } else {
                feedback.push('One uppercase letter');
            }

            // Lowercase check
            if (/[a-z]/.test(password)) {
                score += 1;
            } else {
                feedback.push('One lowercase letter');
            }

            // Number check
            if (/\d/.test(password)) {
                score += 1;
            } else {
                feedback.push('One number');
            }

            // Special character check
            if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                score += 1;
            } else {
                feedback.push('One special character (!@#$%^&*)');
            }

            return { score, feedback };
        }

        // Update password strength display
        function updatePasswordStrength() {
            const password = passwordInput.value;
            const { score, feedback } = checkPasswordStrength(password);

            if (password === '') {
                strengthText.textContent = '';
                strengthMeter.className = 'strength-meter';
                return;
            }

            let strengthLevel = '';
            let strengthClass = '';

            if (score <= 2) {
                strengthLevel = 'Weak';
                strengthClass = 'strength-weak';
            } else if (score === 3) {
                strengthLevel = 'Fair';
                strengthClass = 'strength-fair';
            } else if (score === 4) {
                strengthLevel = 'Good';
                strengthClass = 'strength-good';
            } else {
                strengthLevel = 'Strong';
                strengthClass = 'strength-strong';
            }

            strengthText.textContent = `Password strength: ${strengthLevel}`;
            if (feedback.length > 0 && score < 4) {
                strengthText.textContent += ` (Need: ${feedback.join(', ')})`;
            }

            strengthMeter.className = `strength-meter ${strengthClass}`;
        }

        // Check if passwords match
        function checkPasswordsMatch() {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (confirmPassword === '') {
                passwordError.style.display = 'none';
                passwordSuccess.style.display = 'none';
                return true;
            }

            if (password === confirmPassword) {
                passwordError.style.display = 'none';
                passwordSuccess.style.display = 'block';
                return true;
            } else {
                passwordError.style.display = 'block';
                passwordSuccess.style.display = 'none';
                return false;
            }
        }

        // Validate form
        function validateForm() {
            const password = passwordInput.value;
            const { score } = checkPasswordStrength(password);
            const passwordsMatch = checkPasswordsMatch();
            
            // Enable submit button only if password is at least "Fair" and passwords match
            if (score >= 3 && passwordsMatch && password !== '') {
                submitBtn.disabled = false;
            } else {
                submitBtn.disabled = true;
            }
        }

        // Event listeners
        passwordInput.addEventListener('input', () => {
            updatePasswordStrength();
            validateForm();
        });

        confirmPasswordInput.addEventListener('input', () => {
            checkPasswordsMatch();
            validateForm();
        });

        // Form submission
        form.addEventListener('submit', (e) => {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            const { score } = checkPasswordStrength(password);

            if (password !== confirmPassword) {
                e.preventDefault();
                alert('Passwords do not match. Please check your passwords.');
                return;
            }

            if (score < 3) {
                e.preventDefault();
                alert('Password is too weak. Please choose a stronger password.');
                return;
            }

            // If validation passes, form will submit normally
            console.log('Form is valid and ready to submit');
        });

        // Initial validation
        validateForm();
    </script>
</body>
</html>
