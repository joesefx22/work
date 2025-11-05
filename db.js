/**
 * db.js - PostgreSQL Database Connection
 * إصدار محسن وجاهز للإنتاج - متوافق مع server.js و package.json و .env
 */

const { Pool } = require('pg');
require('dotenv').config();

// تكوين متقدم لـ PostgreSQL مع دعم DATABASE_URL
const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false
} : {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ehgzly_db',
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false
};

// إضافة الإعدادات المشتركة
Object.assign(poolConfig, {
  // إعدادات الأداء المتقدمة
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
  
  // إعدادات الاستعلام
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000,
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
  
  // إعدادات التطبيق
  application_name: 'ehgzly-server',
  timezone: process.env.DB_TIMEZONE || 'Africa/Cairo'
});

const pool = new Pool(poolConfig);

// مراقبة الاتصال المتقدمة
pool.on('connect', (client) => {
  console.log('✅ PostgreSQL connected successfully');
  // تعيين إعدادات الجلسة
  client.query(`SET TIME ZONE '${process.env.DB_TIMEZONE || 'Africa/Cairo'}'`).catch(console.error);
});

pool.on('error', (err, client) => {
  console.error('❌ PostgreSQL connection error:', err.message);
  // إعادة الاتصال تلقائياً في حالات الخطأ
  setTimeout(() => {
    pool.connect().catch(e => console.error('Failed to reconnect:', e.message));
  }, 5000);
});

pool.on('remove', (client) => {
  console.log('ℹ️ PostgreSQL client removed');
});

// دالة تنفيذ الاستعلامات المحسنة
async function execQuery(sql, params = []) {
  const client = await pool.connect();
  try {
    const start = Date.now();
    const result = await client.query(sql, params);
    const duration = Date.now() - start;
    
    // تسجيل الاستعلامات البطيئة
    if (duration > parseInt(process.env.SLOW_QUERY_THRESHOLD || 2000)) {
      console.warn(`⚠️ Slow Query (${duration}ms):`, sql.substring(0, 200));
    }
    
    // تسجيل أداء الاستعلامات في بيئة التطوير
    if (process.env.NODE_ENV === 'development' && duration > 100 && process.env.ENABLE_QUERY_LOGGING === 'true') {
      console.log(`📊 Query executed in ${duration}ms`);
    }
    
    return result.rows;
  } catch (err) {
    console.error('❌ Database Query Error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      query: sql.substring(0, 500),
      params: process.env.LOG_QUERY_PARAMS === 'true' ? 
        params.map(p => typeof p === 'string' ? p.substring(0, 100) : p) : ['[HIDDEN]']
    });
    
    // إعادة المحاولة تلقائياً لبعض أنواع الأخطاء
    if (err.code === '57P01' || err.code === '08006') { // connection errors
      console.log('🔄 Attempting to reconnect...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return execQuery(sql, params);
    }
    
    throw err;
  } finally {
    client.release();
  }
}

// دالة تنفيذ استعلام واحد
async function execQueryOne(sql, params = []) {
  const rows = await execQuery(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// دالة للحصول على العميل مباشرة
async function getClient() {
  return await pool.connect();
}

// دالة للمعاملات الآمنة مع تحسينات
async function withTransaction(callback, isolationLevel = 'READ COMMITTED') {
  const client = await pool.connect();
  try {
    // تعيين مستوى العزل
    await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    await client.query('BEGIN');
    
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// دالة لإنشاء الفهرس لتحسين الأداء
async function createIndexes() {
  try {
    // فهارس المستخدمين
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_users_approved ON users(approved) WHERE approved = true`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)`);
    
    // فهارس الملاعب
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_stadiums_location ON stadiums(location)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_stadiums_area ON stadiums(area)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_stadiums_rating ON stadiums(rating)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_stadiums_price ON stadiums(price)`);
    
    // فهارس الحجوزات
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_bookings_customer_phone ON bookings(customer_phone)`);
    
    // فهارس time_slots
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_time_slots_date ON time_slots(date)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_time_slots_status ON time_slots(status)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_time_slots_stadium_date ON time_slots(stadium_id, date)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_time_slots_stadium_status ON time_slots(stadium_id, status)`);
    
    // فهارس blocked_slots
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_blocked_slots_dates ON blocked_slots(start_date, end_date)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_blocked_slots_active ON blocked_slots(is_active) WHERE is_active = true`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_blocked_slots_stadium ON blocked_slots(stadium_id)`);
    
    // فهارس المدفوعات
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date)`);
    
    // فهارس الجداول الجديدة
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date ON activity_logs(user_id, created_at)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(user_id, status)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions(status)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)`);
    await execQuery(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`);
    
    console.log('✅ All indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  }
}

// دالة لإنشاء الجداول المحسنة
async function createTables() {
  try {
    // جدول المستخدمين (محسن)
    await execQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        last_ip VARCHAR(45),
        login_count INTEGER DEFAULT 0,
        stats JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    // جدول الملاعب (محسن)
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
        features JSONB DEFAULT '[]',
        rating DECIMAL(3,2) DEFAULT 0,
        total_ratings INTEGER DEFAULT 0,
        coordinates JSONB,
        working_hours JSONB,
        google_maps VARCHAR(500),
        availability INTEGER DEFAULT 0,
        total_slots INTEGER DEFAULT 0,
        availability_percentage INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // الجداول الحالية (نفس الهيكل مع تحسينات بسيطة)
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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS stadium_managers (
        id SERIAL PRIMARY KEY,
        stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'manager',
        permissions JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await execQuery(`
      CREATE TABLE IF NOT EXISTS new_bookings (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS voucher_codes (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS ratings (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS player_requests (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id VARCHAR(36) NOT NULL,
        time_slot_id INTEGER REFERENCES time_slots(id) ON DELETE CASCADE,
        requester_name VARCHAR(255) NOT NULL,
        requester_age INTEGER NOT NULL,
        comment TEXT,
        players_count INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await execQuery(`
      CREATE TABLE IF NOT EXISTS managers (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        pitch_ids JSONB NOT NULL DEFAULT '[]',
        approved BOOLEAN DEFAULT FALSE,
        approved_at TIMESTAMP,
        approved_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🔥 **الجداول الجديدة المطلوبة للإنتاج**

    // 1. جدول سجل الأنشطة
    await execQuery(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        description TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        resource_type VARCHAR(50),
        resource_id VARCHAR(36),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. جدول الإشعارات
    await execQuery(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        status VARCHAR(20) DEFAULT 'unread',
        related_type VARCHAR(50),
        related_id VARCHAR(36),
        action_url VARCHAR(500),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. جدول جلسات الدفع
    await execQuery(`
      CREATE TABLE IF NOT EXISTS payment_sessions (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) REFERENCES users(id),
        booking_id VARCHAR(36),
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'EGP',
        provider VARCHAR(50) NOT NULL,
        session_id VARCHAR(500),
        status VARCHAR(20) DEFAULT 'pending',
        payment_intent_id VARCHAR(500),
        client_secret VARCHAR(500),
        metadata JSONB DEFAULT '{}',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. جدول محاولات الدخول
    await execQuery(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255),
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT,
        success BOOLEAN DEFAULT FALSE,
        failure_reason VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. جدول تذاكر الدعم
    await execQuery(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) REFERENCES users(id),
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'open',
        assigned_to VARCHAR(36) REFERENCES users(id),
        last_reply_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. جدول إعدادات المستخدم
    await execQuery(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        email_notifications BOOLEAN DEFAULT TRUE,
        sms_notifications BOOLEAN DEFAULT TRUE,
        push_notifications BOOLEAN DEFAULT TRUE,
        language VARCHAR(10) DEFAULT 'ar',
        timezone VARCHAR(50) DEFAULT 'Africa/Cairo',
        currency VARCHAR(3) DEFAULT 'EGP',
        theme VARCHAR(20) DEFAULT 'light',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. جدول البانرز الرئيسية
    await execQuery(`
      CREATE TABLE IF NOT EXISTS homepage_banners (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(500) NOT NULL,
        button_text VARCHAR(50),
        button_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. جدول التقارير الإدارية
    await execQuery(`
      CREATE TABLE IF NOT EXISTS admin_reports (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(100) NOT NULL,
        report_name VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        generated_by VARCHAR(36) REFERENCES users(id),
        period_start DATE,
        period_end DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 9. جدول إحصائيات النظام
    await execQuery(`
      CREATE TABLE IF NOT EXISTS system_metrics (
        id SERIAL PRIMARY KEY,
        metric_date DATE NOT NULL,
        total_users INTEGER DEFAULT 0,
        total_bookings INTEGER DEFAULT 0,
        total_revenue DECIMAL(15,2) DEFAULT 0,
        active_stadiums INTEGER DEFAULT 0,
        successful_payments INTEGER DEFAULT 0,
        failed_payments INTEGER DEFAULT 0,
        user_registrations INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(metric_date)
      )
    `);

    console.log('✅ All PostgreSQL tables created successfully');
    
    // إنشاء الفهرس بعد إنشاء الجداول
    if (process.env.AUTO_CREATE_INDEXES === 'true') {
      await createIndexes();
    }
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  }
}

// دالة لإنشاء الجداول المحسنة
async function createEnhancedTables() {
  try {
    console.log('✅ Enhanced tables are already included in createTables()');
    return true;
  } catch (error) {
    console.error('❌ Error in enhanced tables:', error);
    throw error;
  }
}

// دالة لفحص صحة الاتصال
async function healthCheck() {
  try {
    const result = await execQueryOne('SELECT NOW() as current_time, version() as version');
    return {
      status: 'healthy',
      database: 'connected',
      timestamp: result.current_time,
      version: result.version
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    };
  }
}

// دالة لإغلاق الاتصال بشكل آمن
async function closePool() {
  try {
    await pool.end();
    console.log('✅ Database connection pool closed');
  } catch (error) {
    console.error('❌ Error closing connection pool:', error);
  }
}

// تصدير الدوال
module.exports = {
  pool,
  execQuery,
  execQueryOne,
  getClient,
  withTransaction,
  createTables,
  createEnhancedTables,
  createIndexes,
  healthCheck,
  closePool
};
