<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forget Password</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 400px;
            position: relative;
            overflow: hidden;
        }

        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2);
        }

        h2 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
            font-weight: 600;
        }

        .step {
            display: none;
        }

        .step.active {
            display: block;
            animation: fadeIn 0.5s ease-in-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
        }

        input[type="email"],
        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 16px;
            transition: all 0.3s ease;
            background: #f8f9fa;
        }

        input:focus {
            outline: none;
            border-color: #667eea;
            background: white;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

         /* MOBILE-OPTIMIZED OTP INPUTS */
        .otp-inputs {
            display: flex;
            gap: 8px;
            justify-content: center;
            margin: 20px 0;
            flex-wrap: nowrap;
        }

        .otp-input {
            width: 45px;
            height: 50px;
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            background: white;
            color: #333;
            /* Mobile-specific fixes */
            -webkit-appearance: none;
            -moz-appearance: textfield;
            appearance: none;
            /* Prevent zoom on iOS */
            font-size: 16px;
            /* Better touch target */
            min-height: 44px;
            /* Prevent text selection issues */
            user-select: none;
            -webkit-user-select: none;
            /* Force numeric keyboard on mobile */
            inputmode: numeric;
            pattern: "[0-9]*";
        }

        .otp-input:focus {
            border-color: #667eea;
            background: white;
            outline: none;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
            /* Prevent zoom on focus */
            transform: none;
        }

        /* Mobile responsive adjustments */
        @media (max-width: 480px) {
            .container {
                padding: 20px;
                margin: 10px;
            }
            
            .otp-inputs {
                gap: 6px;
                margin: 15px 0;
            }
            
            .otp-input {
                width: 40px;
                height: 45px;
                font-size: 16px;
                min-height: 44px;
            }
        }

        @media (max-width: 360px) {
            .otp-inputs {
                gap: 4px;
            }
            
            .otp-input {
                width: 35px;
                height: 42px;
                font-size: 16px;
            }
        }

        button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }

        button:active {
            transform: translateY(0);
        }

        button:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #ffffff;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s ease-in-out infinite;
            margin-right: 10px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .message {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
            font-weight: 500;
        }

        .success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .back-link {
            text-align: center;
            margin-top: 20px;
        }

        .back-link a {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
        }

        .back-link a:hover {
            text-decoration: underline;
        }

        .timer {
            text-align: center;
            margin-top: 15px;
            color: #666;
            font-size: 14px;
        }

        .resend-link {
            color: #667eea;
            cursor: pointer;
            text-decoration: underline;
        }

        .password-strength {
            height: 4px;
            border-radius: 2px;
            margin-top: 5px;
            background: #e1e5e9;
            overflow: hidden;
        }

        .strength-bar {
            height: 100%;
            transition: all 0.3s ease;
            border-radius: 2px;
        }

        .strength-weak { background: #dc3545; width: 33%; }
        .strength-medium { background: #ffc107; width: 66%; }
        .strength-strong { background: #28a745; width: 100%; }

        @media (max-width: 480px) {
            .container {
                padding: 20px;
                margin: 10px;
            }
            
            h2 {
                font-size: 24px;
            }
            
            button {
                padding: 12px;
                font-size: 14px;
            }
            
            .form-group label {
                font-size: 14px;
            }
            
            input[type="email"],
            input[type="text"],
            input[type="password"] {
                font-size: 14px;
            }
    </style>
</head>
<body>
    <div class="container">
        <!-- Step 1: Enter Email -->
        <div class="step active" id="step1">
            <h2>Forget Password</h2>
            <p style="text-align: center; color: #666; margin-bottom: 30px;">
                Enter your email address and we'll send you an OTP to reset your password. <br><p style="text-align: center; color: black; margin-bottom: 30px;">(if didnt get email check spam section)
            </p></p>
            
            <div id="message1"></div>
            
            <form id="emailForm">
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input type="email" id="email" name="email" required placeholder="Enter your email">
                </div>
                
                <button type="submit" id="sendOtpBtn">
                    <span class="btn-text">Send OTP</span>
                </button>
            </form>
            
            <div class="back-link">
                <a href="index.php">← Back to Login</a>
            </div>
        </div>

        <!-- Step 2: Enter OTP -->
        <div class="step" id="step2">
            <h2>Enter OTP</h2>
            <p style="text-align: center; color: #666; margin-bottom: 30px;">
                We've sent a 6-digit code to <span id="emailDisplay"></span>
            </p>
            
            <div id="message2"></div>
            
            <form id="otpForm">
                <div class="otp-inputs">
                    <input type="text" inputmode="numeric" class="otp-input" maxlength="1" pattern="[0-9]">
                    <input type="text" inputmode="numeric" class="otp-input" maxlength="1" pattern="[0-9]">
                    <input type="text" inputmode="numeric" class="otp-input" maxlength="1" pattern="[0-9]">
                    <input type="text" inputmode="numeric" class="otp-input" maxlength="1" pattern="[0-9]">
                    <input type="text" inputmode="numeric" class="otp-input" maxlength="1" pattern="[0-9]">
                    <input type="text" inputmode="numeric" class="otp-input" maxlength="1" pattern="[0-9]">
                </div>
                
                <button type="submit" id="verifyOtpBtn">
                    <span class="btn-text">Verify OTP</span>
                </button>
            </form>
            
            <div class="timer" id="timer">
                Resend OTP in <span id="countdown">600</span> seconds
            </div>
            
            <div class="back-link">
                <a href="#" onclick="goToStep(1)">← Change Email</a>
            </div>
        </div>

        <!-- Step 3: Reset Password -->
        <div class="step" id="step3">
            <h2>Reset Password</h2>
            <p style="text-align: center; color: #666; margin-bottom: 30px;">
                Enter your new password below.
            </p>
            
            <div id="message3"></div>
            
            <form id="resetForm">
                <div class="form-group">
                    <label for="newPassword">New Password</label>
                    <input type="password" id="newPassword" name="password" required 
                           placeholder="Enter new password" minlength="6">
                    <div class="password-strength">
                        <div class="strength-bar" id="strengthBar"></div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="confirmPassword">Confirm Password</label>
                    <input type="password" id="confirmPassword" name="confirm_password" required 
                           placeholder="Confirm new password">
                </div>
                
                <button type="submit" id="resetPasswordBtn">
                    <span class="btn-text">Reset Password</span>
                </button>
            </form>
        </div>

        <!-- Step 4: Success -->
        <div class="step" id="step4">
            <div style="text-align: center;">
                <div style="color: #28a745; font-size: 60px; margin-bottom: 20px;">✓</div>
                <h2 style="color: #28a745;">Password Reset Successfully!</h2>
                <p style="color: #666; margin: 20px 0;">
                    Your password has been reset successfully. You can now login with your new password.
                </p>
                <button onclick="window.location.href='index.php'" style="margin-top: 20px;">
                    Go to Login
                </button>
            </div>
        </div>
    </div>

    <script>
        let currentStep = 1;
        let resetToken = '';
        let countdownTimer;

        // Step navigation
        function goToStep(step) {
            document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
            document.getElementById(`step${step}`).classList.add('active');
            currentStep = step;
        }

        // Show message
        function showMessage(stepId, message, type = 'error') {
            const messageDiv = document.getElementById(`message${stepId}`);
            messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;
            setTimeout(() => {
                messageDiv.innerHTML = '';
            }, 5000);
        }

        // Step 1: Send OTP
        document.getElementById('emailForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const btn = document.getElementById('sendOtpBtn');
            const btnText = btn.querySelector('.btn-text');
            
            btn.disabled = true;
            btnText.innerHTML = '<span class="loading"></span>Sending...';
            
            try {
                const response = await fetch('forgot_password.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('emailDisplay').textContent = email;
                    showMessage(1, data.message, 'success');
                    setTimeout(() => {
                        goToStep(2);
                        startCountdown();
                    }, 1500);
                } else {
                    showMessage(1, data.message);
                }
            } catch (error) {
                showMessage(1, 'Network error. Please try again.');
            }
            
            btn.disabled = false;
            btnText.textContent = 'Send OTP';
        });

        // OTP input handling
        document.querySelectorAll('.otp-input').forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1) {
                    if (index < 5) {
                        document.querySelectorAll('.otp-input')[index + 1].focus();
                    }
                }
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
                    document.querySelectorAll('.otp-input')[index - 1].focus();
                }
            });
        });

        // Step 2: Verify OTP
        document.getElementById('otpForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const otpInputs = document.querySelectorAll('.otp-input');
            const otp = Array.from(otpInputs).map(input => input.value).join('');
            
            if (otp.length !== 6) {
                showMessage(2, 'Please enter all 6 digits');
                return;
            }
            
            const btn = document.getElementById('verifyOtpBtn');
            const btnText = btn.querySelector('.btn-text');
            
            btn.disabled = true;
            btnText.innerHTML = '<span class="loading"></span>Verifying...';
            
            try {
                const response = await fetch('verify_otp.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ otp })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    resetToken = data.token;
                    showMessage(2, data.message, 'success');
                    setTimeout(() => goToStep(3), 1500);
                } else {
                    showMessage(2, data.message);
                    otpInputs.forEach(input => input.value = '');
                    otpInputs[0].focus();
                }
            } catch (error) {
                showMessage(2, 'Network error. Please try again.');
            }
            
            btn.disabled = false;
            btnText.textContent = 'Verify OTP';
        });

        // Password strength checker
        document.getElementById('newPassword').addEventListener('input', (e) => {
            const password = e.target.value;
            const strengthBar = document.getElementById('strengthBar');
            
            let strength = 0;
            if (password.length >= 6) strength++;
            if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
            if (password.match(/[0-9]/)) strength++;
            if (password.match(/[^a-zA-Z0-9]/)) strength++;
            
            strengthBar.className = 'strength-bar';
            if (strength >= 1) strengthBar.classList.add('strength-weak');
            if (strength >= 2) strengthBar.classList.add('strength-medium');
            if (strength >= 3) strengthBar.classList.add('strength-strong');
        });

        // Step 3: Reset Password
        document.getElementById('resetForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const password = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                showMessage(3, 'Passwords do not match');
                return;
            }
            
            if (password.length < 6) {
                showMessage(3, 'Password must be at least 6 characters long');
                return;
            }
            
            const btn = document.getElementById('resetPasswordBtn');
            const btnText = btn.querySelector('.btn-text');
            
            btn.disabled = true;
            btnText.innerHTML = '<span class="loading"></span>Resetting...';
            
            try {
                const response = await fetch('reset_password.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        password, 
                        confirm_password: confirmPassword,
                        token: resetToken
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    goToStep(4);
                } else {
                    showMessage(3, data.message);
                }
            } catch (error) {
                showMessage(3, 'Network error. Please try again.');
            }
            
            btn.disabled = false;
            btnText.textContent = 'Reset Password';
        });

        // Countdown timer
        function startCountdown() {
            let seconds = 600; // 10 minutes
            const countdownEl = document.getElementById('countdown');
            const timerEl = document.getElementById('timer');
            
            countdownTimer = setInterval(() => {
                seconds--;
                countdownEl.textContent = seconds;
                
                if (seconds <= 0) {
                    clearInterval(countdownTimer);
                    timerEl.innerHTML = '<span class="resend-link" onclick="resendOTP()">Resend OTP</span>';
                }
            }, 1000);
        }

        // Resend OTP
        async function resendOTP() {
            const email = document.getElementById('email').value;
            
            try {
                const response = await fetch('forgot_password.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage(2, 'New OTP sent successfully', 'success');
                    document.querySelectorAll('.otp-input').forEach(input => input.value = '');
                    document.querySelectorAll('.otp-input')[0].focus();
                    startCountdown();
                } else {
                    showMessage(2, data.message);
                }
            } catch (error) {
                showMessage(2, 'Failed to resend OTP. Please try again.');
            }
        }
    </script>
</body>
</html