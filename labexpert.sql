-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: May 29, 2025 at 05:02 PM
-- Server version: 9.1.0
-- PHP Version: 8.3.14

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `labexpert`
--

-- --------------------------------------------------------

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
CREATE TABLE IF NOT EXISTS `password_resets` (
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `otp` varchar(6) COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`email`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `password_resets`
--

INSERT INTO `password_resets` (`email`, `otp`, `expires_at`, `created_at`) VALUES
('labexpert.us@gmail.com', '694134', '2025-05-29 22:25:56', '2025-05-29 16:45:56');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `fname` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `lname` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `tel_number` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `google_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `login_type` enum('email','google') COLLATE utf8mb4_general_ci DEFAULT 'email',
  `profile_picture` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`fname`, `lname`, `email`, `tel_number`, `password`, `google_id`, `login_type`, `profile_picture`) VALUES
('Githma ', 'Marapana', 'githma@gmail.com', '0769326895', '$2y$10$Gg4RYA3il2ierfkVCsx1geMSL4PLjruXIaPrv67RcBYNfuTaHmyOu', NULL, 'email', NULL),
('John', 'Doe', 'jon@gmail.com', '1234567890', '$2y$10$eImiTMZG4T8YQ1j5z5Z3uO7F9b6a1k5f5d5f5d5f5d5f5d5f5d5f', NULL, 'email', NULL),
('Lab', 'Expert', 'labexpert.us@gmail.com', '0767560128', '$2y$10$CG09F7Rtl3I4ucVYu4oJi.HEeYYgKR13Ey3Dtb14Uz.PYnZfgwaSm', NULL, 'email', NULL),
('Sineth', '', 'shavihara7@gmail.com', '0767560128', '$2y$10$SzuGYZIo.LVlC6D1e/BLTu9nWXjahMkgKDEjdjg1SHDyOkDygdSzi', NULL, 'email', NULL);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
