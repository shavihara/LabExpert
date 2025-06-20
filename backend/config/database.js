const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/lab_expert.db'), { 
  verbose: console.log,
  timeout: 5000,
  // Add WAL mode for better concurrency
  fileMustExist: false
});

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000000');
db.pragma('temp_store = memory');
db.pragma('mmap_size = 268435456'); // 256MB

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    is_email_verified INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    profile_picture TEXT,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    expires_at DATETIME NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_activity DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS otps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    otp_type TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    is_used INTEGER DEFAULT 0,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_type TEXT NOT NULL,
    original_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mimetype TEXT,
    size INTEGER,
    metadata TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = {
  db,
  prepare: (sql) => db.prepare(sql),
};