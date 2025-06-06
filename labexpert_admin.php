
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Lab Expert Admin Panel</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #eef1f5;
            padding: 40px;
        }
        h1 {
            text-align: center;
        }
        table {
            width: 90%;
            margin: 30px auto;
            border-collapse: collapse;
            background-color: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        th, td {
            padding: 12px 18px;
            border: 1px solid #ddd;
            text-align: left;
        }
        th {
            background-color: #004080;
            color: white;
        }
        .actions a {
            margin-right: 10px;
            text-decoration: none;
            padding: 6px 12px;
            background-color: #007bff;
            color: white;
            border-radius: 4px;
        }
        .actions a.delete {
            background-color: #dc3545;
        }
        .add-button {
            display: block;
            width: 200px;
            margin: 20px auto;
            padding: 10px;
            background-color: #28a745;
            color: white;
            text-align: center;
            text-decoration: none;
            border-radius: 5px;
        }
    </style>
</head>
<body>

<h1>Lab Expert Admin Panel</h1>

<a href="add_lab_expert.php" class="add-button">+ Add New Expert</a>

<table>
    <thead>
        <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody>
        <?php foreach ($labExperts as $expert): ?>
        <tr>
            <td><?php echo $expert['id']; ?></td>
            <td><?php echo $expert['name']; ?></td>
            <td><?php echo $expert['email']; ?></td>
            <td><?php echo $expert['department']; ?></td>
            <td class="actions">
                <a href="edit_lab_expert.php?id=<?php echo $expert['id']; ?>">Edit</a>
                <a href="delete_lab_expert.php?id=<?php echo $expert['id']; ?>" class="delete">Delete</a>
            </td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>

</body>
</html>
