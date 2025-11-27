# Admin Users Schema

- Table `admin_users`
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `email` TEXT UNIQUE NOT NULL
  - `password_hash` TEXT NOT NULL
  - `role` TEXT DEFAULT 'superadmin'
  - `is_active` INTEGER DEFAULT 1
  - `must_change_password` INTEGER DEFAULT 1
  - `token_version` INTEGER DEFAULT 0
  - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
  - `updated_at` DATETIME
  - `last_login` DATETIME

- Table `admin_sessions`
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `admin_user_id` INTEGER NOT NULL (FK admin_users.id)
  - `session_id` TEXT UNIQUE NOT NULL
  - `is_active` INTEGER DEFAULT 1
  - `last_activity_at` DATETIME
  - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

- Table `admin_password_history`
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `admin_user_id` INTEGER NOT NULL (FK admin_users.id)
  - `password_hash` TEXT NOT NULL
  - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

- Table `admin_login_attempts`
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `email` TEXT
  - `ip` TEXT
  - `user_agent` TEXT
  - `success` INTEGER
  - `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP

- Table `admin_password_reset_tokens`
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `admin_user_id` INTEGER NOT NULL (FK admin_users.id)
  - `token` TEXT UNIQUE NOT NULL
  - `expires_at` DATETIME NOT NULL
  - `used` INTEGER DEFAULT 0
  - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP