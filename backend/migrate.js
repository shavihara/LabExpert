const { db } = require('./config/database');

function migrateOTPTable() {
  try {
    console.log('🔄 Starting OTP table migration...');
    
    // Check if is_verified column exists
    const tableInfo = db.prepare("PRAGMA table_info(otps)").all();
    const hasVerifiedColumn = tableInfo.some(col => col.name === 'is_verified');
    
    if (!hasVerifiedColumn) {
      console.log('➕ Adding is_verified column to otps table...');
      db.prepare('ALTER TABLE otps ADD COLUMN is_verified INTEGER DEFAULT 0').run();
      console.log('✅ Migration completed: is_verified column added successfully');
      
      // Show table structure after migration
      console.log('📋 Updated table structure:');
      const updatedTableInfo = db.prepare("PRAGMA table_info(otps)").all();
      updatedTableInfo.forEach(col => {
        console.log(`   - ${col.name}: ${col.type} ${col.dflt_value ? `(default: ${col.dflt_value})` : ''}`);
      });
    } else {
      console.log('✅ is_verified column already exists - no migration needed');
    }
    
    console.log('🎉 Migration process completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run migration immediately
console.log('🚀 Lab Expert Database Migration');
console.log('================================');
migrateOTPTable();

module.exports = { migrateOTPTable };