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
    <link rel="icon" type="image/x-icon" href="home.ico">
    <title>home page</title>
    <link rel="stylesheet" href="style.css">
</head> 

<body>

    <div class="login">
        <h2 id="form_head">Login</h2>
        <form action="" autocapitalize="on" autocomplete="on" method="post">
            <label for="username">User Name</label>
            <input type="text" id="username" name="username" placeholder="Enter your username">

            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Enter your password">

            <input type="submit" value="Login">
        </form><br>
        <a href=foget.php class="forgetpassword">Forget Password?</a>
        <div class="divider">
            <span>or</span>
        </div>
        <button class="createacc" onclick="window.open('create_acc.php','_blank')">Create Account</button>
    </div>
   

</body>

</html>











==================================


body{
    background-color: #f0f8ff;
}
.header1 {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
}




.header{
    width: 100%;
    height: 20%;
}


.h_text {
    background-color:#007bff;
    margin: 1%;
    padding: 0.5%;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius:10px;
    width: 5%;
    height: 10%;
    font-size: 100%;
    font-weight: lighter;
    font-family: Algerian;
    box-shadow:  0px 2px 5px #000090;
    border: 2px solid white;
    color: white;
    flex-direction: row;
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


#form_head {
    color: #333;
    font-size: 24px;
    margin-bottom: 15px;
    font-weight: bold;
}


label {
    font-size: 16px;
    font-weight: bold;
    color: #444;
    display: block;
    margin-top: 10px;
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


input[type="submit"]:hover {
    background-color: #0056b3;
}
.divider {
    display: flex;
    align-items: center;
    text-align: center;
    width: 100%;
    margin: 20px 0;
}

.divider::before,
.divider::after {
    content: "";
    flex: 1;
    border-bottom: 2px solid #ccc;
}

.divider span {
    padding: 0 10px;
    font-weight: bold;
    font-size: 16px;
    color: #555;
}

a:link {
    color: blue;
}


a:visited {
    color: royalblue;
}


a:hover {
    color: darkblue;
    background-color: #00afff;
    border-radius: 4px;
    padding: 2px;
    transition: background 0.5s ease;
}


a:active {
    color:blueviolet;
}
.createacc{
    width: 50%;
    padding: 5px;
    margin-top: 5px;
    background-color: white;
    color: black;
    border: 1px solid #007bff;
    border-radius: 8px;
    font-size: 15px;
    font-weight: lighter;
    cursor: pointer;
    transition: background 0.5s ease;
    font-family: "Baskerville Old Face";
}
.createacc:hover{
    background-color: #007bff;
    color: white;
}
