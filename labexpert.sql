-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 21, 2025 at 06:20 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

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

CREATE DATABASE IF NOT EXISTS `labexpert` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `labexpert`;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `username` varchar(50) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `tel_number` varchar(15) DEFAULT NULL,
  `job` enum('admin','cashier','inventory_boy') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`username`, `password`, `tel_number`, `job`) VALUES
('aa', '$2y$10$KinD2kPUjRCRBF2xKgXOPOwUSCAgE//cV8g7EmsuiBQPCNlDkfk0K', '0711936547', 'cashier'),
('dfgh', '$2y$10$JMzVqCHhnEqlTJuQ8VQn3uzrMN.IUC2CtJ8eHFr5ydReT.6kwaHpu', '23456', 'inventory_boy'),
('DMT', '$2y$10$Ey2GMYhzUGXiRYK/H9GNxurmicfeS646LKMe4DCwkagBF3JMQiYPW', '0711926547', 'cashier'),
('DT', '$2y$10$bv9BY09D0CwtNCNcMxCU5uHEvSUM3MjVxfmXAte3KQfpTS3Wd7a6y', '0711936547', 'admin'),
('erty', '$2y$10$a1ZSBob/Kk0INY4HbO/u8.loRsrjX/pGfI6s8hdf4/D8pOG44bzpS', '23456', 'admin'),
('hula', '$2y$10$3gURbBiEIlSRo9WTpXd6we/vi2AllimWZQ5WYwRlk4UFfuAT8599G', '0711936547', 'inventory_boy'),
('kamal', '$2y$10$YngMoc/33lQLk/ARfYi.ies6GLSQUuMGIAnarHmTRJlfoO5p4pWEy', '0711936547', 'inventory_boy'),
('namal', '$2y$10$u2Xr/0HGQ52ZCyG6D9Ojcu4KEzVDcaMAE9fZzVCfl/QVoX.qP5rAa', '0711936547', 'inventory_boy'),
('nimal', '$2y$10$jx8CJXG1yB1pnwC6Zteb.us77B1nRxuP1qh3T9Hb5P5F/1fzbO4eS', '0711936547', 'cashier'),
('sdf', '$2y$10$lgTyrjjhnWJggvChMNzX7uyOWPv2KEQqbJm.jRLEg7ikHbiVv82xu', '123456', 'admin'),
('sdfg', '$2y$10$pa0YA8tvTeNIjrjDETga1e.J4TvhK1bJO0BAbPzLFMhhYAwIuVove', '123456', 'admin');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`username`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
