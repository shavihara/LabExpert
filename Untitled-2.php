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
  
  <!-- PWA Meta Tags -->
  <meta name="description" content="Lab Expert - Professional Laboratory Management System">
  <meta name="theme-color" content="#667eea">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Lab Expert">
  
  <!-- PWA Manifest -->
  <link rel="manifest" href="data:application/json;base64,eyJuYW1lIjoiTGFiIEV4cGVydCIsInNob3J0X25hbWUiOiJMYWJFeHBlcnQiLCJzdGFydF91cmwiOiIvIiwiZGlzcGxheSI6InN0YW5kYWxvbmUiLCJiYWNrZ3JvdW5kX2NvbG9yIjoiIzY2N2VlYSIsInRoZW1lX2NvbG9yIjoiIzY2N2VlYSIsImljb25zIjpbeyJzcmMiOiJkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBITjJaeUIzYVdSMGFEMGlNVEkwSWlCb1pXbG5hSFE5SWpFeU5DSWdlRzFzYm5NOUltaDBkSEE2THk5M2QzY3Vkek11YjNKbkx6SXdNREF2YzNabklpQjJhV1YzUW05NFBTSXdJREFnTVRJMElERXlOQ0krUEhKbFkzUWdkMmxrZEdnOUlqRXlOQ0lnYUdWcFoyaDBQU0l4TWpRaUlHWnBiR3c5SWlNMk5qZGxaV0VpTHo0OEwzTjJaejQ9Iiwic2l6ZXMiOiIxMjR4MTI0IiwidHlwZSI6ImltYWdlL3N2Zyt4bWwifV19">
  
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
      from {
        opacity: 0;
        transform: translateY(10px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .con {

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
      
      color: white;
      border: none;
      border-radius: 5px;
      margin-bottom: 10px;
      margin-top: 10px;
      font-size: 16px;
      cursor: pointer;
      transition: transform 0.2s;
      background: linear-gradient(135deg, #667eea, #764ba2, #6bcbef, #ff6bcb);
      background-size: 300% 300%;
      animation: gradientMove 50s ease infinite;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
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

    /* ============ WEB APP RESPONSIVE FEATURES ============ */
    
    /* Mobile First Responsive Design */
    @media (max-width: 768px) {
      .con {
        flex-direction: column;
        margin-left: 2vh;
        margin-right: 2vh;
        padding: 20px;
      }

      .login-form {
        margin-right: 0;
        margin-left: 0;
        margin-bottom: 20px;
        max-width: 100%;
      }

      .illustration {
    display: none;
  }

      .heder1 {
        font-size: 1.5em;
        padding: 8px;
      }

      .im1 {
        width: 100px;
      }

      .social-buttons {
        flex-direction: column;
        gap: 8px;
      }

      .login-form h1 {
        font-size: 1.5rem;
      }
    }

    @media (max-width: 480px) {
      .container {
        padding: 5px 5px 0px 5px;
        min-height: 90vh;
      }

      .con {
        margin-left: 1vh;
        margin-right: 1vh;
        padding: 15px;
        border-radius: 15px;
      }

      .login-form h1 {
        font-size: 1.3rem;
      }

      .heder1 {
        font-size: 1.2em;
        padding: 5px;
      }

      .im1 {
        width: 80px;
      }

      input[type="email"],
      input[type="password"] {
        padding: 14px;
        font-size: 16px; /* Prevents zoom on iOS */
      }

      .login-btn {
        padding: 14px;
        font-size: 16px;
      }
    }

    /* Tablet specific */
    @media (min-width: 769px) and (max-width: 1024px) {
      .con {
        margin-left: 10vh;
        margin-right: 10vh;
      }
    }

    /* Large screens */
    @media (min-width: 1200px) {
      .con {
        margin-left: 25vh;
        margin-right: 25vh;
      }
    }

    /* Touch device optimizations */
    @media (hover: none) and (pointer: coarse) {
      .login-btn,
      .social-buttons button,
      .forgot,
      .createacc {
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      input[type="email"],
      input[type="password"] {
        min-height: 44px;
      }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .con {
        background: rgba(30, 30, 30, 0.95);
        color: #fff;
      }

      .login-form h1,
      .login-form p,
      form label {
        color: #fff;
      }

      input[type="email"],
      input[type="password"] {
        background: #2d2d2d;
        border-color: #555;
        color: #fff;
      }

      .divider1 span {
        background: rgba(30, 30, 30, 0.95);
        color: #aaa;
      }

      .footer1 {
        color: rgba(255, 255, 255, 0.7);
      }
    }

    /* High contrast mode */
    @media (prefers-contrast: high) {
      .login-btn {
        border: 2px solid #fff;
      }

      input[type="email"],
      input[type="password"] {
        border: 2px solid #333;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
      }
    }

    /* Print styles */
    @media print {
      .social-buttons,
      .heder1 {
        display: none;
      }
      
      body {
        background: white;
        color: black;
      }

      .con {
        background: white;
        box-shadow: none;
        border: 1px solid #ccc;
      }
    }

    /* Landscape orientation on mobile */
    @media (max-width: 768px) and (orientation: landscape) {
      .container {
        min-height: 70vh;
      }

      .con {
        flex-direction: row;
        padding: 15px;
      }

      .login-form {
        margin-bottom: 0;
        margin-right: 15px;
      }

      .illustration {
    display: none;
  }
    }

    /* Error message styles for PHP errors */
    .php-error {
      background: #ffebee;
      color: #c62828;
      padding: 10px;
      border-radius: 5px;
      margin-bottom: 15px;
      font-size: 14px;
      border: 1px solid #ffcdd2;
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

        <?php if (isset($error)): ?>
          <div class="php-error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>

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
          <p class="signup-text">Don't have an account? <a class="createacc" onclick="window.open('create_acc.php','_self')">Sign up</a></p>
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

  <!-- Web App JavaScript -->
  <script>
    // Service Worker Registration for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('data:application/javascript;base64,' + btoa(`
          const CACHE_NAME = 'lab-expert-v1';
          const urlsToCache = [
            '/',
            '/home.css',
            '/home.ico',
            '/img/labex1.jpeg',
            '/img/lab1.jpg'
          ];

          self.addEventListener('install', event => {
            event.waitUntil(
              caches.open(CACHE_NAME)
                .then(cache => {
                  return cache.addAll(urlsToCache.filter(url => url !== '/'));
                })
            );
          });

          self.addEventListener('fetch', event => {
            event.respondWith(
              caches.match(event.request)
                .then(response => {
                  if (response) {
                    return response;
                  }
                  return fetch(event.request);
                })
            );
          });
        `)).then(function(registration) {
          console.log('Service Worker registered successfully');
        }).catch(function(error) {
          console.log('Service Worker registration failed:', error);
        });
      });
    }

    // Install prompt for PWA
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      
      // Show install notification (optional)
      setTimeout(() => {
        if (deferredPrompt && !localStorage.getItem('installPromptShown')) {
          const installBanner = document.createElement('div');
          installBanner.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; padding: 12px; text-align: center; z-index: 1000; font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          `;
          installBanner.innerHTML = `
            <span>📱 Install Lab Expert app for better experience!</span>
            <button onclick="installApp()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; margin-left: 15px; padding: 6px 12px; border-radius: 15px; cursor: pointer; font-size: 12px;">Install</button>
            <button onclick="this.parentElement.remove(); localStorage.setItem('installPromptShown', 'true')" style="background: none; border: none; color: white; margin-left: 10px; cursor: pointer; font-size: 16px;">✕</button>
          `;
          document.body.appendChild(installBanner);
        }
      }, 3000);
    });

    window.installApp = async function() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        document.querySelector('[onclick="installApp()"]').closest('div').remove();
        localStorage.setItem('installPromptShown', 'true');
      }
    };

    // Network status detection
    window.addEventListener('online', () => {
      console.log('Back online');
    });

    window.addEventListener('offline', () => {
      console.log('Gone offline');
    });

    // Touch events for better mobile experience
    document.addEventListener('touchstart', function() {}, { passive: true });

    // Prevent form resubmission on refresh
    if (window.history.replaceState) {
      window.history.replaceState(null, null, window.location.href);
    }

    // Form enhancement for better UX
    document.addEventListener('DOMContentLoaded', function() {
      const form = document.querySelector('form');
      const submitBtn = document.querySelector('.login-btn');
      
      // Add loading state to form submission
      form.addEventListener('submit', function() {
        submitBtn.style.opacity = '0.7';
        submitBtn.innerHTML = 'Logging in...';
        submitBtn.disabled = true;
      });

      // Input field enhancements
      const inputs = document.querySelectorAll('input[type="email"], input[type="password"]');
      inputs.forEach(input => {
        // Add focus enhancement
        input.addEventListener('focus', function() {
          this.style.borderColor = '#667eea';
          this.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
        });

        input.addEventListener('blur', function() {
          this.style.borderColor = '#ccc';
          this.style.boxShadow = 'none';
        });
      });

      // Improve social button interactions
      const socialButtons = document.querySelectorAll('.social-buttons button');
      socialButtons.forEach(button => {
        button.addEventListener('click', function() {
          this.style.transform = 'scale(0.95)';
          setTimeout(() => {
            this.style.transform = 'scale(1)';
          }, 150);
        });
      });
    });

    // Keyboard navigation improvements
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.target.tagName === 'BUTTON') {
        e.target.click();
      }
    });

    // Auto-resize text for small screens
    function adjustFontSize() {
      if (window.innerWidth < 480) {
        document.querySelector('.heder1').style.fontSize = '1.2em';
        document.querySelector('.login-form h1').style.fontSize = '1.3rem';
      }
    }

    window.addEventListener('resize', adjustFontSize);
    adjustFontSize();
  </script>
</body>

</html>