/**
 * db.js - PostgreSQL Database Connection
 * دعم كامل لـ PostgreSQL مع كل الخاصيات
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'ehgzly_db',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// حدث الأخطاء والاتصال
pool.on('connect', () => {
  console.log('✅ PostgreSQL connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// دالة تنفيذ الاستعلامات
async function execQuery(sql, params = []) {
  const client = await pool.connect();
  try {
    const start = Date.now();
    const result = await client.query(sql, params);
    const duration = Date.now() - start;
    
    // تحذير للاستعلامات البطيئة
    if (duration > 2000) {
      console.warn(`⚠️ Slow Query (${duration}ms):`, sql);
    }
    
    return result.rows;
  } catch (err) {
    console.error('❌ Database Query Error:', err.message);
    console.error('Query:', sql);
    console.error('Params:', params);
    throw err;
  } finally {
    client.release();
  }
}

// دالة للمعاملات الآمنة
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// دالة لإنشاء الجداول
async function createTables() {
  try {
    // جدول المستخدمين
    await execQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255),
        role VARCHAR(20) DEFAULT 'user',
        approved BOOLEAN DEFAULT FALSE,
        provider VARCHAR(20) DEFAULT 'local',
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        google_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        stats JSONB
      )
    `);

    // جدول الملاعب
    await execQuery(`
      CREATE TABLE IF NOT EXISTS stadiums (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        location VARCHAR(255),
        area VARCHAR(100),
        type VARCHAR(50),
        image VARCHAR(500),
        price DECIMAL(10,2),
        deposit DECIMAL(10,2),
        deposit_required BOOLEAN DEFAULT TRUE,
        features JSONB,
        rating DECIMAL(3,2) DEFAULT 0,
        total_ratings INTEGER DEFAULT 0,
        coordinates JSONB,
        working_hours JSONB,
        google_maps VARCHAR(500),
        availability INTEGER DEFAULT 0,
        total_slots INTEGER DEFAULT 0,
        availability_percentage INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول سياسات العربون
    await execQuery(`
      CREATE TABLE IF NOT EXISTS deposit_rules (
        id SERIAL PRIMARY KEY,
        stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
        less_than_24_hours DECIMAL(5,2) DEFAULT 0,
        between_24_48_hours DECIMAL(5,2) DEFAULT 30,
        more_than_48_hours DECIMAL(5,2) DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول المدراء المتعددين
    await execQuery(`
      CREATE TABLE IF NOT EXISTS stadium_managers (
        id SERIAL PRIMARY KEY,
        stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'manager',
        permissions JSONB,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول المواعيد المحجوزة ثابتاً
    await execQuery(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id SERIAL PRIMARY KEY,
        stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        reason TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        is_emergency BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(36) REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول الساعات
    await execQuery(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id SERIAL PRIMARY KEY,
        stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'available',
        is_golden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول الحجوزات الجديد
    await execQuery(`
      CREATE TABLE IF NOT EXISTS new_bookings (
        id VARCHAR(36) PRIMARY KEY,
        time_slot_id INTEGER REFERENCES time_slots(id) ON DELETE CASCADE,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        deposit_amount DECIMAL(10,2) NOT NULL,
        deposit_paid BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'pending',
        players_needed INTEGER DEFAULT 0,
        countdown_end TIMESTAMP,
        remaining_amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول الحجوزات القديم
    await execQuery(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(36) PRIMARY KEY,
        pitch_id INTEGER NOT NULL,
        pitch_name VARCHAR(255) NOT NULL,
        pitch_location VARCHAR(255) NOT NULL,
        pitch_price DECIMAL(10,2) NOT NULL,
        deposit_amount DECIMAL(10,2) NOT NULL,
        date DATE NOT NULL,
        time VARCHAR(10) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        customer_email VARCHAR(255),
        user_id VARCHAR(36) REFERENCES users(id),
        user_type VARCHAR(20) DEFAULT 'customer',
        status VARCHAR(20) DEFAULT 'pending',
        amount DECIMAL(10,2) NOT NULL,
        paid_amount DECIMAL(10,2) DEFAULT 0,
        remaining_amount DECIMAL(10,2) DEFAULT 0,
        final_amount DECIMAL(10,2) NOT NULL,
        applied_discount TEXT,
        discount_code VARCHAR(50),
        payment_type VARCHAR(20) DEFAULT 'deposit',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        payment_deadline TIMESTAMP,
        cancellation_time TIMESTAMP,
        cancellation_reason TEXT,
        refund_amount DECIMAL(10,2) DEFAULT 0,
        compensation_code VARCHAR(50),
        cancelled_by VARCHAR(36)
      )
    `);

    // أكواد الخصم
    await execQuery(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        type VARCHAR(50) NOT NULL,
        pitch_id INTEGER,
        pitch_name VARCHAR(255),
        source VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        used_by VARCHAR(36),
        used_at TIMESTAMP,
        used_for_booking VARCHAR(36),
        original_booking_id VARCHAR(36),
        original_amount DECIMAL(10,2),
        cancellation_type VARCHAR(50),
        message TEXT,
        user_id VARCHAR(36) REFERENCES users(id)
      )
    `);

    // أكواد الفوشر
    await execQuery(`
      CREATE TABLE IF NOT EXISTS voucher_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP,
        used_for_booking VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        type VARCHAR(50) DEFAULT 'VOUCHER'
      )
    `);

    // المدفوعات
    await execQuery(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(36) PRIMARY KEY,
        booking_id VARCHAR(36) NOT NULL,
        payer_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        field VARCHAR(255) NOT NULL,
        hours INTEGER NOT NULL,
        transaction_id VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(20) NOT NULL,
        original_amount DECIMAL(10,2) NOT NULL,
        remaining_amount DECIMAL(10,2) NOT NULL,
        discount_applied DECIMAL(10,2) DEFAULT 0,
        provider VARCHAR(50) NOT NULL,
        provider_name VARCHAR(255) NOT NULL,
        receipt_path VARCHAR(500),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        confirmed_at TIMESTAMP,
        confirmed_by VARCHAR(255)
      )
    `);

    // التقييمات
    await execQuery(`
      CREATE TABLE IF NOT EXISTS ratings (
        id VARCHAR(36) PRIMARY KEY,
        pitch_id INTEGER NOT NULL,
        user_id VARCHAR(36) REFERENCES users(id),
        username VARCHAR(255) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        booking_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active'
      )
    `);

    // طلبات اللاعبين
    await execQuery(`
      CREATE TABLE IF NOT EXISTS player_requests (
        id VARCHAR(36) PRIMARY KEY,
        booking_id VARCHAR(36) NOT NULL,
        time_slot_id INTEGER REFERENCES time_slots(id) ON DELETE CASCADE,
        requester_name VARCHAR(255) NOT NULL,
        requester_age INTEGER NOT NULL,
        comment TEXT,
        players_count INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // الملفات الشخصية
    await execQuery(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        nickname VARCHAR(255),
        age INTEGER,
        bio TEXT,
        avatar VARCHAR(500),
        join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // المديرين
    await execQuery(`
      CREATE TABLE IF NOT EXISTS managers (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        pitch_ids JSONB NOT NULL,
        approved BOOLEAN DEFAULT FALSE,
        approved_at TIMESTAMP,
        approved_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ All PostgreSQL tables created successfully');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  }
}

// تصدير الدوال
module.exports = {
  pool,
  execQuery,
  withTransaction,
  createTables
};
