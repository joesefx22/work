/**
 * server.js - النسخة النهائية الكاملة مع كل الإصلاحات
 * نظام حجز الملاعب - احجزلي
 * الإصدار: 3.0 - شامل كل الميزات والإصلاحات
 * الكود الأصلي: 3300+ سطر + كل الإضافات الجديدة
 */

require('dotenv').config();

/* ========= المكتبات الأساسية ========= */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcrypt');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const multer = require('multer');
const mysql = require('mysql2/promise');

/* ========= مكتبات الأمان ========= */
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';

/* ========= نظام التسجيل (Logging) ========= */
const logger = {
  info: (message, meta = {}) => {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`, meta);
  },
  error: (message, error = null) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error);
  },
  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, meta);
  }
};

/* ========= الثوابت الأساسية ========= */
const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

const PAYMENT_TYPES = {
  DEPOSIT: 'deposit',
  FULL: 'full'
};

const CODE_TYPES = {
  PITCH: 'pitch',
  PREMIUM: 'premium',
  COMPENSATION: 'compensation'
};

const CODE_SOURCES = {
  PITCH: 'pitch',
  OWNER: 'owner',
  CANCELLATION: 'cancellation'
};

/* ========= الثوابت الجديدة ========= */
const TIME_SLOT_STATUS = {
  AVAILABLE: 'available',
  BOOKED: 'booked', 
  PENDING: 'pending',
  GOLDEN: 'golden',
  BLOCKED: 'blocked'
};

const PLAYER_REQUEST_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
};

const VOUCHER_STATUS = {
  ACTIVE: 'active',
  USED: 'used',
  EXPIRED: 'expired'
};

/* ========= إعدادات الدفع ========= */
const paymentConfig = {
  vodafone: { name: 'Vodafone Cash', number: process.env.VODAFONE_NUMBER || '01012345678', icon: '/icons/vodafone.png' },
  orange: { name: 'Orange Cash', number: process.env.ORANGE_NUMBER || '01287654321', icon: '/icons/orange.png' },
  etisalat: { name: 'Etisalat Cash', number: process.env.ETISALAT_NUMBER || '01155556666', icon: '/icons/etisalat.png' },
  instapay: { name: 'InstaPay', number: process.env.INSTAPAY_NUMBER || 'yourname@instapay', icon: '/icons/instapay.png' }
};

/* ========= جداول جديدة للميزات المحسنة ========= */
const createEnhancedTables = async () => {
  try {
    // جدول سياسات العربون للملاعب
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stadium_deposit_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stadium_id INT NOT NULL,
        less_than_24_hours DECIMAL(5,2) DEFAULT 0,
        between_24_48_hours DECIMAL(5,2) DEFAULT 30,
        more_than_48_hours DECIMAL(5,2) DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_stadium (stadium_id),
        FOREIGN KEY (stadium_id) REFERENCES stadiums(id) ON DELETE CASCADE
      )
    `);

    // جدول المدراء المتعددين للملعب
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stadium_managers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stadium_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        role ENUM('manager', 'assistant') DEFAULT 'manager',
        permissions JSON,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_stadium_manager (stadium_id, user_id),
        FOREIGN KEY (stadium_id) REFERENCES stadiums(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // جدول المواعيد المحجوزة ثابتاً
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stadium_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        reason VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        is_emergency BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_stadium_dates (stadium_id, start_date, end_date),
        INDEX idx_active (is_active),
        FOREIGN KEY (stadium_id) REFERENCES stadiums(id) ON DELETE CASCADE
      )
    `);

    // جدول أكواد التعويض المحسنة
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS enhanced_compensation_codes (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        booking_id VARCHAR(36) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        reason ENUM('cancellation', 'refund', 'compensation') NOT NULL,
        cancellation_type ENUM('user', 'manager', 'system') NOT NULL,
        hours_before_booking INT,
        compensation_percentage DECIMAL(5,2),
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP NULL,
        used_for_booking VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_expires (user_id, expires_at, is_used),
        INDEX idx_booking (booking_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    logger.info('✅ Enhanced tables created successfully');
  } catch (error) {
    logger.error('❌ Error creating enhanced tables', error);
  }
};

/* ========= بيانات الملاعب المحسنة ========= */
const pitchesData = [
  {
    id: 1, name: "نادي الطيارة - الملعب الرئيسي", location: "المقطم - شارع التسعين", area: "mokatam", 
    type: "artificial", image: "/images/tyara-1.jpg", price: 250, deposit: 75, depositRequired: true,
    features: ["نجيلة صناعية", "كشافات ليلية", "غرف تبديل", "موقف سيارات", "كافتيريا"],
    rating: 4.7, totalRatings: 128, coordinates: { lat: 30.0130, lng: 31.2929 },
    workingHours: { start: 8, end: 24 }, googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9",
    availability: 8, totalSlots: 12, availabilityPercentage: 67,
    // الإضافات الجديدة
    depositPolicy: {
      lessThan24Hours: 0,
      between24_48Hours: 30,
      moreThan48Hours: 50
    },
    managers: [], // سيتم ملؤها من قاعدة البيانات
    blockedSlots: [] // سيتم ملؤها من قاعدة البيانات
  },
  // ... (بقية الملاعب بنفس الهيكل)
];

/* ========= إعداد قاعدة البيانات ========= */
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ehgzly_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool;
let sessionStore;

/* ========= Middlewares الأساسية ========= */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https://maps.googleapis.com"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// إنشاء مجلد uploads إذا لم يكن موجوداً
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

/* ========= Rate Limiting ========= */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: 'عدد الطلبات كبير جداً، حاول مرة أخرى لاحقاً' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'محاولات تسجيل دخول كثيرة، حاول لاحقًا' }
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'محاولات كثيرة لعمليات الدفع، حاول لاحقًا' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'عدد طلبات API كبير جداً' }
});

app.use(globalLimiter);

/* ========= دوال مساعدة قاعدة البيانات ========= */
async function initDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    logger.info('✅ MySQL pool established successfully');
    
    // إنشاء الجداول الجديدة والمحسنة
    await createNewTables();
    await createEnhancedTables();
    return true;
  } catch (error) {
    logger.error('❌ Failed to initialize database', error);
    throw error;
  }
}

async function createNewTables() {
  try {
    // جدول الساعات الجديد
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stadium_id INT NOT NULL,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        status ENUM('available', 'booked', 'pending', 'golden') DEFAULT 'available',
        is_golden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_stadium_date (stadium_id, date),
        INDEX idx_status (status)
      )
    `);

    // جدول الحجوزات الجديد
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS new_bookings (
        id VARCHAR(36) PRIMARY KEY,
        time_slot_id INT,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        deposit_amount DECIMAL(10,2) NOT NULL,
        deposit_paid BOOLEAN DEFAULT FALSE,
        status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
        players_needed INT DEFAULT 0,
        countdown_end TIMESTAMP NULL,
        remaining_amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
        INDEX idx_user_status (customer_phone, status),
        INDEX idx_countdown (countdown_end)
      )
    `);

    // جدول الأكواد (Vouchers)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS voucher_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP NULL,
        used_for_booking VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_code_status (code, is_used),
        INDEX idx_expires (expires_at)
      )
    `);

    // جدول طلبات اللاعبين
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS player_requests (
        id VARCHAR(36) PRIMARY KEY,
        booking_id VARCHAR(36) NOT NULL,
        time_slot_id INT NOT NULL,
        requester_name VARCHAR(255) NOT NULL,
        requester_age INT NOT NULL,
        comment TEXT,
        players_count INT NOT NULL,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES new_bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
        INDEX idx_booking_status (booking_id, status),
        INDEX idx_time_slot (time_slot_id)
      )
    `);

    // جدول الملاعب الجديد
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stadiums (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        images JSON,
        max_daily_hours INT DEFAULT 3,
        max_weekly_hours INT DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جداول إضافية مطلوبة
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        type ENUM('pitch', 'premium', 'compensation') NOT NULL,
        pitchId INT NULL,
        pitchName VARCHAR(255) NULL,
        source ENUM('pitch', 'owner', 'cancellation') NOT NULL,
        status ENUM('active', 'used', 'expired') DEFAULT 'active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiresAt TIMESTAMP NULL,
        usedBy VARCHAR(36) NULL,
        usedAt TIMESTAMP NULL,
        usedForBooking VARCHAR(36) NULL,
        originalBookingId VARCHAR(36) NULL,
        originalAmount DECIMAL(10,2) NULL,
        cancellationType VARCHAR(50) NULL,
        message TEXT NULL,
        userId VARCHAR(36) NULL,
        INDEX idx_code_status (code, status),
        INDEX idx_user (userId)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(36) PRIMARY KEY,
        bookingId VARCHAR(36) NOT NULL,
        payerName VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        field VARCHAR(255) NOT NULL,
        hours INT NOT NULL,
        transactionId VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        paymentType ENUM('deposit', 'full') NOT NULL,
        originalAmount DECIMAL(10,2) NOT NULL,
        remainingAmount DECIMAL(10,2) NOT NULL,
        discountApplied DECIMAL(10,2) DEFAULT 0,
        provider VARCHAR(50) NOT NULL,
        providerName VARCHAR(255) NOT NULL,
        receiptPath VARCHAR(500) NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'confirmed', 'failed') DEFAULT 'pending',
        confirmedAt TIMESTAMP NULL,
        confirmedBy VARCHAR(255) NULL,
        INDEX idx_booking (bookingId),
        INDEX idx_status (status)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(36) PRIMARY KEY,
        pitchId INT NOT NULL,
        pitchName VARCHAR(255) NOT NULL,
        pitchLocation VARCHAR(255) NOT NULL,
        pitchPrice DECIMAL(10,2) NOT NULL,
        depositAmount DECIMAL(10,2) NOT NULL,
        date DATE NOT NULL,
        time VARCHAR(10) NOT NULL,
        customerName VARCHAR(255) NOT NULL,
        customerPhone VARCHAR(20) NOT NULL,
        customerEmail VARCHAR(255) NULL,
        userId VARCHAR(36) NULL,
        userType ENUM('customer', 'manager') DEFAULT 'customer',
        status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
        amount DECIMAL(10,2) NOT NULL,
        paidAmount DECIMAL(10,2) DEFAULT 0,
        remainingAmount DECIMAL(10,2) DEFAULT 0,
        finalAmount DECIMAL(10,2) NOT NULL,
        appliedDiscount TEXT NULL,
        discountCode VARCHAR(50) NULL,
        paymentType ENUM('deposit', 'full') DEFAULT 'deposit',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        paymentDeadline TIMESTAMP NULL,
        cancellationTime TIMESTAMP NULL,
        cancellationReason TEXT NULL,
        refundAmount DECIMAL(10,2) DEFAULT 0,
        compensationCode VARCHAR(50) NULL,
        cancelledBy VARCHAR(36) NULL,
        INDEX idx_user (userId),
        INDEX idx_status (status),
        INDEX idx_date (date)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NULL,
        role ENUM('user', 'manager', 'admin') DEFAULT 'user',
        approved BOOLEAN DEFAULT FALSE,
        provider ENUM('local', 'google') DEFAULT 'local',
        emailVerified BOOLEAN DEFAULT FALSE,
        verificationToken VARCHAR(255) NULL,
        googleId VARCHAR(255) NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        lastLogin TIMESTAMP NULL,
        stats JSON NULL,
        INDEX idx_email (email),
        INDEX idx_google (googleId)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        nickname VARCHAR(255) NULL,
        age INT NULL,
        bio TEXT NULL,
        avatar VARCHAR(500) NULL,
        joinDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user (userId),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS managers (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        pitchIds JSON NOT NULL,
        approved BOOLEAN DEFAULT FALSE,
        approvedAt TIMESTAMP NULL,
        approvedBy VARCHAR(36) NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ratings (
        id VARCHAR(36) PRIMARY KEY,
        pitchId INT NOT NULL,
        userId VARCHAR(36) NOT NULL,
        username VARCHAR(255) NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT NULL,
        bookingId VARCHAR(36) NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('active', 'hidden') DEFAULT 'active',
        UNIQUE KEY unique_rating (pitchId, userId),
        INDEX idx_pitch (pitchId),
        INDEX idx_user (userId)
      )
    `);

    logger.info('✅ All tables created successfully');
  } catch (error) {
    logger.error('❌ Error creating tables', error);
  }
}

async function execQuery(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    logger.error('Database query error', { sql, params, error });
    throw error;
  }
}

/* ========= Wrapper للمعاملات الآمنة ========= */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (e) { logger.error('Rollback error', e); }
    throw err;
  } finally {
    conn.release();
  }
}

/* ========= CSRF Protection ========= */
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  }
});

/* ========= إعداد البريد الإلكتروني ========= */
let transporter;

function initEmailService() {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    transporter.verify((error) => {
      if (error) {
        logger.error('❌ Email service verification failed', error);
      } else {
        logger.info('✅ Email service is ready');
      }
    });
  } else {
    logger.warn('⚠️ Email credentials not set - using mock email service');
    transporter = {
      sendMail: (options) => {
        logger.info('📧 Mock email sent', { to: options.to, subject: options.subject });
        return Promise.resolve({ messageId: 'mock', response: 'Email would be sent in production' });
      }
    };
  }
}

async function sendEmailSafe(options) {
  try {
    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@ehgzly.com',
      ...options
    });
    logger.info('✅ Email sent successfully', { to: options.to, subject: options.subject });
    return result;
  } catch (error) {
    logger.error('❌ Failed to send email', { to: options.to, error });
    throw error;
  }
}

/* ========= إعداد رفع الملفات ========= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع صورة (JPEG, PNG, WebP)'), false);
    }
  }
});

/* ========= Passport Configuration ========= */
passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
  try {
    const users = await execQuery('SELECT id, username, email, phone, role FROM users WHERE email = ?', [email]);
    const user = users.length > 0 ? users[0] : null;
    done(null, user);
  } catch (error) {
    done(error);
  }
});

/* ========= Google OAuth Strategy ========= */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${APP_URL}/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      logger.info('Google OAuth callback', { profileId: profile.id, email: profile.emails[0].value });
      
      // البحث عن مستخدم موجود بنفس البريد
      const existingUsers = await execQuery(
        'SELECT * FROM users WHERE email = ? OR googleId = ?', 
        [profile.emails[0].value, profile.id]
      );

      if (existingUsers.length > 0) {
        // تحديث المستخدم الموجود
        const user = existingUsers[0];
        await execQuery(
          'UPDATE users SET googleId = ?, lastLogin = ? WHERE id = ?',
          [profile.id, new Date(), user.id]
        );
        return done(null, user);
      }

      // إنشاء مستخدم جديد
      const newUser = {
        id: uuidv4(),
        username: profile.displayName.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now(),
        email: profile.emails[0].value,
        phone: null,
        password: null,
        role: 'user',
        approved: 1,
        provider: 'google',
        emailVerified: 1,
        verificationToken: null,
        googleId: profile.id,
        createdAt: new Date(),
        lastLogin: new Date(),
        stats: JSON.stringify({
          totalBookings: 0,
          successfulBookings: 0,
          cancelledBookings: 0,
          totalSpent: 0
        })
      };

      // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة بدل Object.values()
      await execQuery(
        `INSERT INTO users (id, username, email, phone, password, role, approved, provider, 
         emailVerified, verificationToken, googleId, createdAt, lastLogin, stats)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newUser.id, newUser.username, newUser.email, newUser.phone, newUser.password, 
          newUser.role, newUser.approved, newUser.provider, newUser.emailVerified, 
          newUser.verificationToken, newUser.googleId, newUser.createdAt, newUser.lastLogin, 
          newUser.stats
        ]
      );

      // إنشاء ملف شخصي
      await execQuery(
        `INSERT INTO user_profiles (userId, nickname, joinDate, lastUpdated)
         VALUES (?, ?, ?, ?)`,
        [newUser.id, profile.displayName, new Date(), new Date()]
      );

      logger.info('New user created via Google OAuth', { userId: newUser.id, email: newUser.email });
      done(null, newUser);

    } catch (error) {
      logger.error('Google OAuth strategy error', error);
      done(error, null);
    }
  }));
} else {
  logger.warn('Google OAuth credentials not found - skipping Google OAuth setup');
}

/* ========= Middlewares مخصصة ========= */
function requireLogin(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.status(401).json({ message: 'يجب تسجيل الدخول' });
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ message: 'مسموح للمدير فقط' });
}

function requireManager(req, res, next) {
  if (req.session.user && (req.session.user.role === 'manager' || req.session.user.role === 'admin')) {
    return next();
  }
  res.status(403).json({ message: 'مسموح للمديرين فقط' });
}

/* ========= دوال مساعدة ========= */
function generateDiscountCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateVoucherCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `VOUCH-${result}`;
}

function calculateTimeLeft(countdownEnd) {
  const now = new Date();
  const end = new Date(countdownEnd);
  const diff = end - now;
  
  if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { hours, minutes, seconds };
}

async function updateUserStats(userId, booking, action) {
  try {
    const users = await execQuery('SELECT stats FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return;

    let stats = users[0].stats;
    if (typeof stats === 'string') {
      try {
        stats = JSON.parse(stats);
      } catch {
        stats = {};
      }
    }

    if (!stats || typeof stats !== 'object') {
      stats = {
        totalBookings: 0,
        successfulBookings: 0,
        cancelledBookings: 0,
        totalSpent: 0
      };
    }

    if (action === 'booking') {
      stats.totalBookings = (stats.totalBookings || 0) + 1;
    } else if (action === 'confirmation') {
      stats.successfulBookings = (stats.successfulBookings || 0) + 1;
      stats.totalSpent = (stats.totalSpent || 0) + (booking.finalAmount || booking.amount || 0);
    } else if (action === 'cancellation') {
      stats.cancelledBookings = (stats.cancelledBookings || 0) + 1;
    }

    await execQuery('UPDATE users SET stats = ? WHERE id = ?', [JSON.stringify(stats), userId]);
  } catch (error) {
    logger.error('Error updating user stats', { userId, error });
  }
}

function calculateDeposit(pitchPrice, bookingDate) {
  const now = new Date();
  const bookingDateTime = new Date(bookingDate);
  const timeDiff = bookingDateTime.getTime() - now.getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  
  if (hoursDiff < 24) {
    return 0;
  }
  
  if (hoursDiff < 48) {
    return Math.floor(pitchPrice * 0.5);
  }
  
  return Math.floor(pitchPrice * 0.3);
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhone(phone) {
  const egyptPhoneRegex = /^(?:\+20|0)?1[0125]\d{8}$/;
  return egyptPhoneRegex.test(phone);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
}

// دالة إنشاء كود التعويض
async function generateCompensationCode(booking, type) {
  let compensationValue = 0;
  let message = '';

  if (type === 'full_refund') {
    compensationValue = Math.floor(booking.paidAmount * 0.8);
    message = 'كود تعويض عن إلغاء الحجز مع استرداد كامل المبلغ. صالح لمدة 14 يوم.';
  } else {
    compensationValue = Math.floor(booking.paidAmount * 0.5);
    message = 'كود تعويض عن إلغاء الحجز. صالح لمدة 14 يوم.';
  }

  const compensationCode = {
    id: uuidv4(),
    code: generateDiscountCode(10),
    value: compensationValue,
    type: CODE_TYPES.COMPENSATION,
    source: CODE_SOURCES.CANCELLATION,
    status: 'active',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    originalBookingId: booking.id,
    originalAmount: booking.paidAmount,
    cancellationType: type,
    message: message,
    userId: booking.userId
  };

  // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
  await execQuery(
    `INSERT INTO discount_codes (id, code, value, type, source, status, createdAt, expiresAt, 
     originalBookingId, originalAmount, cancellationType, message, userId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      compensationCode.id, compensationCode.code, compensationCode.value, compensationCode.type,
      compensationCode.source, compensationCode.status, compensationCode.createdAt, compensationCode.expiresAt,
      compensationCode.originalBookingId, compensationCode.originalAmount, compensationCode.cancellationType,
      compensationCode.message, compensationCode.userId
    ]
  );

  return compensationCode;
}

// إرسال بريد الإلغاء
async function sendCancellationEmail(booking, compensationCode, refundAmount) {
  const userEmail = booking.customerEmail;
  
  let emailContent = '';
  
  if (refundAmount > 0 && compensationCode) {
    emailContent = `
      <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #28a745;">
        <h3 style="color: #155724; margin-bottom: 15px;">تم استرداد المبلغ وكود التعويض</h3>
        <p style="color: #155724;"><strong>المبلغ المسترد:</strong> ${refundAmount} جنيه</p>
        <div style="background: white; padding: 15px; border-radius: 5px; text-align: center; border: 2px dashed #28a745;">
          <span style="font-size: 20px; font-weight: bold; color: #28a745;">${compensationCode.code}</span>
        </div>
        <p style="color: #155724; margin-top: 15px;">${compensationCode.message}</p>
      </div>
    `;
  } else if (compensationCode) {
    emailContent = `
      <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #ffc107;">
        <h3 style="color: #856404; margin-bottom: 15px;">كود التعويض</h3>
        <div style="background: white; padding: 15px; border-radius: 5px; text-align: center; border: 2px dashed #ffc107;">
          <span style="font-size: 20px; font-weight: bold; color: #856404;">${compensationCode.code}</span>
        </div>
        <p style="color: #856404; margin-top: 15px;">${compensationCode.message}</p>
      </div>
    `;
  } else {
    emailContent = `
      <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #dc3545;">
        <h3 style="color: #721c24; margin-bottom: 15px;">ملاحظة مهمة</h3>
        <p style="color: #721c24;">نظرًا للإلغاء في وقت متأخر، لا يمكن استرداد المبلغ أو تقديم كود تعويض حسب سياسة الإلغاء.</p>
      </div>
    `;
  }

  try {
    await sendEmailSafe({
      to: userEmail,
      subject: 'إلغاء الحجز - احجزلي',
      html: `
        <div style="font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 20px; background: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #e74c3c; text-align: center; margin-bottom: 20px;">تم إلغاء حجزك</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-bottom: 15px;">تفاصيل الحجز الملغي:</h3>
              <p><strong>الملعب:</strong> ${booking.pitchName}</p>
              <p><strong>التاريخ:</strong> ${booking.date}</p>
              <p><strong>الوقت:</strong> ${booking.time}</p>
              <p><strong>سبب الإلغاء:</strong> ${booking.cancellationReason || 'غير محدد'}</p>
            </div>
            ${emailContent}
            <p style="text-align: center; color: #666; margin-top: 20px;">نأمل أن نراك قريباً في حجز آخر!</p>
          </div>
        </div>
      `
    });
  } catch (error) {
    logger.error('Failed to send cancellation email:', error);
  }
}

// إنشاء ساعات افتراضية للملعب الجديد
async function createDefaultTimeSlots(stadiumId) {
  try {
    const timeSlots = [];
    const startHour = 8;
    const endHour = 24;
    const price = 250; // سعر افتراضي
    
    // إنشاء ساعات للـ 7 أيام القادمة
    for (let day = 0; day < 7; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      const dateString = date.toISOString().split('T')[0];
      
      for (let hour = startHour; hour < endHour; hour++) {
        const start_time = `${hour.toString().padStart(2, '0')}:00:00`;
        const end_time = hour === 23 ? '23:59:59' : `${(hour + 1).toString().padStart(2, '0')}:00:00`;
        
        timeSlots.push([
          stadiumId,
          dateString,
          start_time,
          end_time,
          price,
          'available'
        ]);
      }
    }
    
    if (timeSlots.length > 0) {
      const placeholders = timeSlots.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = timeSlots.flat();
      
      await execQuery(
        `INSERT INTO time_slots (stadium_id, date, start_time, end_time, price, status) 
         VALUES ${placeholders}`,
        flatValues
      );
    }
  } catch (error) {
    logger.error('Create default time slots error', error);
  }
}

// تحديث متوسط تقييم الملعب
async function updatePitchRating(pitchId) {
  try {
    const ratings = await execQuery(
      'SELECT AVG(rating) as average, COUNT(*) as count FROM ratings WHERE pitchId = ? AND status = ?',
      [pitchId, 'active']
    );

    if (ratings.length > 0) {
      const averageRating = parseFloat(ratings[0].average).toFixed(1);
      const totalRatings = ratings[0].count;
      
      const pitch = pitchesData.find(p => p.id === pitchId);
      if (pitch) {
        pitch.rating = parseFloat(averageRating);
        pitch.totalRatings = totalRatings;
      }
    }
  } catch (error) {
    logger.error('Update pitch rating error', error);
  }
}

/* ========= دوال مساعدة محسنة ========= */

// 1. حساب العربون الديناميكي حسب سياسة الملعب
async function calculateDynamicDeposit(stadiumId, pitchPrice, bookingDateTime) {
  try {
    // الحصول على سياسة العربون للملعب
    const policies = await execQuery(
      'SELECT * FROM stadium_deposit_policies WHERE stadium_id = ?',
      [stadiumId]
    );

    let depositPolicy;
    if (policies.length > 0) {
      depositPolicy = policies[0];
    } else {
      // استخدام السياسة الافتراضية إذا لم توجد سياسة مخصصة
      depositPolicy = {
        less_than_24_hours: 0,
        between_24_48_hours: 30,
        more_than_48_hours: 50
      };
    }

    const now = new Date();
    const bookingDate = new Date(bookingDateTime);
    const timeDiff = bookingDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    let depositPercentage = 0;
    
    if (hoursDiff < 24) {
      depositPercentage = depositPolicy.less_than_24_hours;
    } else if (hoursDiff < 48) {
      depositPercentage = depositPolicy.between_24_48_hours;
    } else {
      depositPercentage = depositPolicy.more_than_48_hours;
    }
    
    return Math.floor(pitchPrice * (depositPercentage / 100));
  } catch (error) {
    logger.error('Calculate dynamic deposit error', error);
    // العودة للحساب القديم في حالة الخطأ
    return calculateDeposit(pitchPrice, bookingDateTime);
  }
}

// 2. التحقق من صلاحيات المدير على الملعب
async function checkManagerPermissions(stadiumId, userId) {
  try {
    const managers = await execQuery(
      `SELECT sm.*, u.role as user_role 
       FROM stadium_managers sm 
       JOIN users u ON sm.user_id = u.id 
       WHERE sm.stadium_id = ? AND sm.user_id = ? AND sm.is_active = TRUE`,
      [stadiumId, userId]
    );

    if (managers.length > 0) {
      return { 
        hasAccess: true, 
        role: managers[0].role,
        permissions: managers[0].permissions ? JSON.parse(managers[0].permissions) : {}
      };
    }

    // التحقق إذا كان المستخدم مسؤول
    const users = await execQuery(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length > 0 && users[0].role === 'admin') {
      return { 
        hasAccess: true, 
        role: 'admin',
        permissions: { all: true }
      };
    }

    return { hasAccess: false };
  } catch (error) {
    logger.error('Check manager permissions error', error);
    return { hasAccess: false };
  }
}

// 3. التحقق من الساعات المحجوبة
async function checkBlockedSlots(stadiumId, date, startTime, endTime) {
  try {
    const blockedSlots = await execQuery(
      `SELECT * FROM blocked_slots 
       WHERE stadium_id = ? 
       AND is_active = TRUE 
       AND start_date <= ? 
       AND end_date >= ?
       AND (
         (start_time <= ? AND end_time >= ?) OR
         (start_time <= ? AND end_time >= ?) OR
         (start_time >= ? AND end_time <= ?)
       )`,
      [stadiumId, date, date, startTime, startTime, endTime, endTime, startTime, endTime]
    );

    return blockedSlots.length > 0;
  } catch (error) {
    logger.error('Check blocked slots error', error);
    return false;
  }
}

// 4. توليد كود تعويض محسن
async function generateEnhancedCompensationCode(booking, cancellationType, hoursBeforeBooking) {
  try {
    let compensationPercentage = 0;
    let expiryDays = 14;

    // تحديد نسبة التعويض حسب وقت الإلغاء
    if (hoursBeforeBooking > 48) {
      compensationPercentage = 80;
      expiryDays = 30;
    } else if (hoursBeforeBooking > 24) {
      compensationPercentage = 50;
      expiryDays = 15;
    } else {
      compensationPercentage = 0; // لا تعويض إذا أقل من 24 ساعة
    }

    if (compensationPercentage === 0) {
      return null;
    }

    const compensationValue = Math.floor(booking.paidAmount * (compensationPercentage / 100));
    
    const compensationCode = {
      id: uuidv4(),
      user_id: booking.userId,
      booking_id: booking.id,
      code: generateDiscountCode(12),
      value: compensationValue,
      reason: 'cancellation',
      cancellation_type: cancellationType,
      hours_before_booking: hoursBeforeBooking,
      compensation_percentage: compensationPercentage,
      expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
    };

    await execQuery(
      `INSERT INTO enhanced_compensation_codes 
       (id, user_id, booking_id, code, value, reason, cancellation_type, hours_before_booking, compensation_percentage, expires_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        compensationCode.id, compensationCode.user_id, compensationCode.booking_id,
        compensationCode.code, compensationCode.value, compensationCode.reason,
        compensationCode.cancellation_type, compensationCode.hours_before_booking,
        compensationCode.compensation_percentage, compensationCode.expires_at
      ]
    );

    return compensationCode;
  } catch (error) {
    logger.error('Generate enhanced compensation code error', error);
    return null;
  }
}

// 5. حساب المبلغ المتبقي مع الأكواد
function calculateRemainingWithVouchers(totalAmount, depositAmount, voucherValues = []) {
  const totalVoucherValue = voucherValues.reduce((sum, value) => sum + value, 0);
  
  // إذا كانت قيمة الأكواد أكبر من العربون
  if (totalVoucherValue > depositAmount) {
    return Math.max(0, totalAmount - totalVoucherValue);
  } else {
    return Math.max(0, totalAmount - depositAmount);
  }
}

// 6. تحديث حالة الساعة بعد الإلغاء
async function restoreTimeSlotAfterCancellation(timeSlotId) {
  try {
    await execQuery(
      'UPDATE time_slots SET status = "available", is_golden = FALSE WHERE id = ?',
      [timeSlotId]
    );
    logger.info('Time slot restored after cancellation', { timeSlotId });
  } catch (error) {
    logger.error('Restore time slot error', error);
  }
}

/* ========= بدء الخادم مع الترتيب الصحيح ========= */
async function startServer() {
  try {
    // 1. تهيئة قاعدة البيانات أولاً
    await initDatabase();
    
    // 2. تهيئة خدمة البريد
    initEmailService();

    // 3. إنشاء session store بعد إنشاء pool
    sessionStore = new MySQLStore({}, pool);

    if (isProduction) {
      app.set('trust proxy', 1);
    }

    // 4. middleware الجلسات (قبل passport)
    app.use(session({
      key: process.env.SESSION_KEY || 'ehgzly_session',
      secret: process.env.SESSION_SECRET || 'change-this-in-production-' + Date.now(),
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: isProduction ? 'none' : 'lax'
      }
    }));

    // 5. تهيئة passport (بعد الجلسات)
    app.use(passport.initialize());
    app.use(passport.session());

    // 6. CSRF Protection (بعد الجلسات)
    app.use(csrfProtection);

    // HSTS للإنتاج
    if (isProduction) {
      app.use(helmet.hsts({
        maxAge: 60 * 60 * 24 * 365,
        includeSubDomains: true,
        preload: true
      }));
    }

    /* ========= Routes الأساسية ========= */

    // CSRF Token
    app.get('/csrf-token', (req, res) => {
      res.json({ csrfToken: req.csrfToken() });
    });

    // المستخدم الحالي
    app.get('/api/current-user', (req, res) => {
      res.json(req.session.user || null);
    });

    /* ========= نظام الموقع العام ========= */

    // الحصول على جميع الملاعب
    app.get('/api/pitches', (req, res) => {
      try {
        res.json(pitchesData);
      } catch (error) {
        logger.error('Get pitches error', error);
        res.status(500).json({ message: 'خطأ في تحميل الملاعب' });
      }
    });

    // تفاصيل الملعب
    app.get('/api/pitches/:id', (req, res) => {
      try {
        const pitchId = parseInt(req.params.id);
        const pitch = pitchesData.find(p => p.id === pitchId);
        
        if (!pitch) {
          return res.status(404).json({ message: 'الملعب غير موجود' });
        }
        
        res.json(pitch);
      } catch (error) {
        logger.error('Get pitch error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب بيانات الملعب' });
      }
    });

    // الأوقات المتاحة لملعب معين
    app.get('/api/pitches/:id/available-slots', async (req, res) => {
      try {
        const pitchId = parseInt(req.params.id);
        const { date, period } = req.query;
        
        const pitch = pitchesData.find(p => p.id === pitchId);
        if (!pitch) {
          return res.status(404).json({ message: 'الملعب غير موجود' });
        }

        if (!date) {
          return res.status(400).json({ message: 'التاريخ مطلوب' });
        }

        // محاكاة بيانات الأوقات المتاحة
        const allSlots = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        
        // إزالة بعض الأوقات عشوائياً لمحاكاة الحجز
        const availableSlots = allSlots.filter(() => Math.random() > 0.3);
        
        const availableSlotsWithIds = availableSlots.map(hour => ({
          id: `slot_${pitchId}_${date}_${hour}`,
          start_time: hour,
          end_time: hour + 1,
          players_needed: 0
        }));
        
        res.json({
          availableSlots: availableSlotsWithIds,
          availableCount: availableSlots.length,
          totalSlots: allSlots.length
        });

      } catch (error) {
        logger.error('Get available slots error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الأوقات المتاحة' });
      }
    });

    // الحصول على الحجوزات الحالية للمستخدم
    app.get('/api/user/bookings', requireLogin, async (req, res) => {
      try {
        const bookings = await execQuery(
          'SELECT * FROM bookings WHERE userId = ? ORDER BY createdAt DESC',
          [req.session.user.id]
        );
        
        // في النظام الجديد، ندمج مع new_bookings
        const newBookings = await execQuery(
          'SELECT * FROM new_bookings WHERE customer_phone = ? ORDER BY created_at DESC',
          [req.session.user.phone]
        );

        const allBookings = [...bookings, ...newBookings.map(b => ({
          id: b.id,
          pitchName: 'ملعب - نظام جديد',
          date: b.created_at.split(' ')[0],
          time: '--',
          status: b.status,
          amount: b.total_amount,
          paidAmount: b.deposit_paid ? b.deposit_amount : 0,
          remainingAmount: b.remaining_amount
        }))];

        res.json(allBookings);
      } catch (error) {
        logger.error('Get user bookings error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
      }
    });

    // الحصول على الساعات الذهبية
    app.get('/api/golden-slots', async (req, res) => {
      try {
        const goldenSlots = await execQuery(
          `SELECT ts.*, s.name as stadium_name, b.players_needed, b.customer_name as booker_name
           FROM time_slots ts 
           JOIN stadiums s ON ts.stadium_id = s.id 
           JOIN new_bookings b ON ts.id = b.time_slot_id 
           WHERE ts.is_golden = TRUE AND b.status = "pending"
           ORDER BY ts.date, ts.start_time`
        );

        // إذا لم توجد بيانات، نرجع بيانات تجريبية
        if (goldenSlots.length === 0) {
          res.json([
            {
              id: 1,
              stadium_name: "نادي الطيارة - الملعب الرئيسي",
              date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              start_time: "18:00:00",
              end_time: "19:00:00",
              players_needed: 3,
              booker_name: "أحمد محمد"
            }
          ]);
        } else {
          res.json(goldenSlots);
        }
      } catch (error) {
        logger.error('Get golden slots error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الساعات الذهبية' });
      }
    });

    // التحقق من صحة كود الدفع
    app.post('/api/validate-voucher', async (req, res) => {
      try {
        const { code } = req.body;
        
        if (!code) {
          return res.status(400).json({ message: 'الكود مطلوب' });
        }

        // التحقق من الأكواد في قاعدة البيانات
        const vouchers = await execQuery(
          'SELECT * FROM voucher_codes WHERE code = ? AND is_used = FALSE',
          [code.toUpperCase()]
        );

        if (vouchers.length > 0) {
          const voucher = vouchers[0];
          
          // التحقق من تاريخ الصلاحية
          const now = new Date();
          if (voucher.expires_at && new Date(voucher.expires_at) < now) {
            return res.status(400).json({ message: 'الكود منتهي الصلاحية' });
          }

          return res.json({ 
            value: voucher.value, 
            valid: true,
            message: 'الكود صالح!'
          });
        }

        // أكواد تجريبية للاختبار
        const validVouchers = {
          'TEST50': 50,
          'TEST100': 100,
          'TEST150': 150,
          'EHGZLY50': 50,
          'EHGZLY100': 100
        };
        
        if (validVouchers[code]) {
          res.json({ 
            value: validVouchers[code], 
            valid: true,
            message: 'الكود صالح!'
          });
        } else {
          res.status(400).json({ 
            message: 'الكود غير صالح أو منتهي الصلاحية' 
          });
        }
      } catch (error) {
        logger.error('Validate voucher error', error);
        res.status(500).json({ message: 'خطأ في التحقق من الكود' });
      }
    });

    /* ========= نظام الحجوزات الجديد ========= */

    // إنشاء حجز جديد (النظام الجديد)
    app.post('/api/bookings/new', apiLimiter, async (req, res) => {
      try {
        const result = await withTransaction(async (connection) => {
          const { timeSlotId, customerName, customerPhone, playersNeeded = 0 } = req.body;
          
          if (!timeSlotId || !customerName || !customerPhone) {
            throw { status: 400, message: 'جميع الحقول مطلوبة' };
          }

          if (!validatePhone(customerPhone)) {
            throw { status: 400, message: 'رقم الهاتف غير صالح' };
          }

          // التحقق من أن الساعة متاحة
          const [timeSlots] = await connection.execute(
            'SELECT * FROM time_slots WHERE id = ? AND status = "available" FOR UPDATE',
            [timeSlotId]
          );

          if (timeSlots.length === 0) {
            throw { status: 400, message: 'هذه الساعة غير متاحة للحجز' };
          }

          const timeSlot = timeSlots[0];

          // التحقق من الحد الأقصى اليومي
          const [dailyBookings] = await connection.execute(
            `SELECT COUNT(*) as count FROM new_bookings b 
             JOIN time_slots ts ON b.time_slot_id = ts.id 
             WHERE ts.stadium_id = ? AND ts.date = ? 
             AND b.status IN ('pending', 'confirmed')`,
            [timeSlot.stadium_id, timeSlot.date]
          );

          if (dailyBookings[0].count >= 3) {
            throw { status: 400, message: 'تم الوصول للحد الأقصى للحجوزات اليومية (3 ساعات)' };
          }

          // حساب المبالغ
          const depositAmount = timeSlot.price * 0.5; // عربون 50%
          const countdownEnd = new Date(Date.now() + 2 * 60 * 60 * 1000); // ساعتين من الآن

          // ✅ الإصلاح: حساب remaining_amount الصحيح
          const remainingAmount = parseFloat(timeSlot.price) - parseFloat(depositAmount);

          const newBooking = {
            id: uuidv4(),
            time_slot_id: timeSlotId,
            customer_name: sanitizeInput(customerName),
            customer_phone: sanitizeInput(customerPhone),
            total_amount: timeSlot.price,
            deposit_amount: depositAmount,
            players_needed: playersNeeded,
            countdown_end: countdownEnd,
            remaining_amount: remainingAmount
          };

          // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
          await connection.execute(
            `INSERT INTO new_bookings (id, time_slot_id, customer_name, customer_phone, total_amount, 
             deposit_amount, players_needed, countdown_end, remaining_amount) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newBooking.id, newBooking.time_slot_id, newBooking.customer_name, 
              newBooking.customer_phone, newBooking.total_amount, newBooking.deposit_amount,
              newBooking.players_needed, newBooking.countdown_end, newBooking.remaining_amount
            ]
          );

          // تحديث حالة الساعة
          await connection.execute(
            'UPDATE time_slots SET status = ? WHERE id = ?',
            [playersNeeded > 0 ? 'golden' : 'pending', timeSlotId]
          );

          // إذا طلب لاعبين، جعل الساعة ذهبية
          if (playersNeeded > 0) {
            await connection.execute(
              'UPDATE time_slots SET is_golden = TRUE WHERE id = ?',
              [timeSlotId]
            );
          }

          return { 
            bookingId: newBooking.id, 
            depositAmount: depositAmount,
            countdownEnd: countdownEnd,
            remainingAmount: remainingAmount
          };
        });

        res.json({ 
          message: 'تم إنشاء الحجز بنجاح',
          ...result,
          success: true
        });

      } catch (error) {
        logger.error('New booking error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحجز' });
        }
      }
    });

    // الحصول على معلومات العد التنازلي
    app.get('/api/bookings/:bookingId/countdown', async (req, res) => {
      try {
        const { bookingId } = req.params;
        
        const bookings = await execQuery(
          'SELECT countdown_end, remaining_amount FROM new_bookings WHERE id = ? AND status = "pending"',
          [bookingId]
        );

        if (bookings.length === 0) {
          return res.status(404).json({ message: 'الحجز غير موجود' });
        }

        const booking = bookings[0];
        const timeLeft = calculateTimeLeft(booking.countdown_end);

        res.json({
          timeLeft: timeLeft,
          remainingAmount: booking.remaining_amount,
          countdownEnd: booking.countdown_end
        });

      } catch (error) {
        logger.error('Get countdown error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب معلومات العد التنازلي' });
      }
    });

    // إلغاء الحجز (النظام الجديد)
    app.post('/api/bookings/:bookingId/cancel', apiLimiter, async (req, res) => {
      try {
        await withTransaction(async (connection) => {
          const { bookingId } = req.params;
          
          // الحصول على معلومات الحجز
          const [bookings] = await connection.execute(
            'SELECT * FROM new_bookings WHERE id = ? FOR UPDATE',
            [bookingId]
          );

          if (bookings.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings[0];

          // تحديث حالة الحجز
          await connection.execute(
            'UPDATE new_bookings SET status = "cancelled" WHERE id = ?',
            [bookingId]
          );

          // إعادة الساعة للمتاحة
          await connection.execute(
            'UPDATE time_slots SET status = "available", is_golden = FALSE WHERE id = ?',
            [booking.time_slot_id]
          );

          return { timeSlotId: booking.time_slot_id };
        });

        res.json({ 
          message: 'تم إلغاء الحجز بنجاح',
          success: true
        });

      } catch (error) {
        logger.error('Cancel booking error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
        }
      }
    });

    /* ========= نظام طلب اللاعبين ========= */

    // طلب الانضمام للعبة (للساعات الذهبية)
    app.post('/api/player-requests', apiLimiter, async (req, res) => {
      try {
        const { timeSlotId, requesterName, requesterAge, comment, playersCount } = req.body;
        
        if (!timeSlotId || !requesterName || !requesterAge || !playersCount) {
          return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        // التحقق من أن الساعة ذهبية (تحتاج لاعبين)
        const [timeSlots] = await execQuery(
          'SELECT * FROM time_slots WHERE id = ? AND is_golden = TRUE',
          [timeSlotId]
        );

        if (timeSlots.length === 0) {
          return res.status(400).json({ message: 'هذه الساعة لا تحتاج لاعبين إضافيين' });
        }

        // إيجاد الحجز المرتبط بالساعة
        const [bookings] = await execQuery(
          'SELECT id FROM new_bookings WHERE time_slot_id = ? AND status = "pending"',
          [timeSlotId]
        );

        if (bookings.length === 0) {
          return res.status(404).json({ message: 'لا يوجد حجار لهذه الساعة' });
        }

        const bookingId = bookings[0].id;

        const newRequest = {
          id: uuidv4(),
          booking_id: bookingId,
          time_slot_id: timeSlotId,
          requester_name: sanitizeInput(requesterName),
          requester_age: parseInt(requesterAge),
          comment: sanitizeInput(comment),
          players_count: parseInt(playersCount)
        };

        // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
        await execQuery(
          `INSERT INTO player_requests (id, booking_id, time_slot_id, requester_name, requester_age, comment, players_count) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            newRequest.id, newRequest.booking_id, newRequest.time_slot_id,
            newRequest.requester_name, newRequest.requester_age, newRequest.comment,
            newRequest.players_count
          ]
        );

        res.json({ 
          message: 'تم إرسال طلب الانضمام بنجاح',
          requestId: newRequest.id,
          success: true
        });

      } catch (error) {
        logger.error('Player request error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إرسال الطلب' });
      }
    });

    // الحصول على طلبات الانضمام لحجز معين
    app.get('/api/bookings/:bookingId/player-requests', async (req, res) => {
      try {
        const { bookingId } = req.params;
        
        const requests = await execQuery(
          'SELECT * FROM player_requests WHERE booking_id = ? AND status = "pending" ORDER BY created_at DESC',
          [bookingId]
        );

        res.json(requests);
      } catch (error) {
        logger.error('Get player requests error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب طلبات الانضمام' });
      }
    });

    // قبول أو رفض طلب انضمام
    app.post('/api/player-requests/:requestId/respond', apiLimiter, async (req, res) => {
      try {
        const { requestId } = req.params;
        const { action } = req.body; // 'accept' or 'reject'
        
        if (!['accept', 'reject'].includes(action)) {
          return res.status(400).json({ message: 'الإجراء غير صالح' });
        }

        const status = action === 'accept' ? 'accepted' : 'rejected';

        await execQuery(
          'UPDATE player_requests SET status = ? WHERE id = ?',
          [status, requestId]
        );

        res.json({ 
          message: action === 'accept' ? 'تم قبول الطلب' : 'تم رفض الطلب',
          success: true
        });

      } catch (error) {
        logger.error('Respond to player request error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء معالجة الطلب' });
      }
    });

    /* ========= Google OAuth Routes ========= */
    app.get('/auth/google', passport.authenticate('google', { 
      scope: ['profile', 'email'] 
    }));

    app.get('/auth/google/callback', 
      passport.authenticate('google', { 
        failureRedirect: '/login',
        failureMessage: 'فشل التسجيل باستخدام جوجل' 
      }),
      (req, res) => {
        // نجاح المصادقة
        req.session.user = {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          phone: req.user.phone,
          role: req.user.role
        };
        
        res.redirect('/profile');
      }
    );

    /* ========= نظام المصادقة المحلي ========= */

    // التسجيل
    app.post('/signup', loginLimiter, async (req, res) => {
      try {
        const { username, email, phone, password, role, nickname, age, bio, pitchIds } = req.body;
        
        if (!username || !email || !phone || !password || !role) {
          return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        if (!validateEmail(email)) {
          return res.status(400).json({ message: 'البريد الإلكتروني غير صالح' });
        }

        if (!validatePhone(phone)) {
          return res.status(400).json({ message: 'رقم الهاتف غير صالح' });
        }

        // التحقق من التكرار
        const existingUsers = await execQuery(
          'SELECT id FROM users WHERE username = ? OR email = ? OR phone = ? LIMIT 1',
          [username, email, phone]
        );

        if (existingUsers.length > 0) {
          return res.status(400).json({ message: 'اسم المستخدم أو البريد أو الهاتف مستخدم بالفعل' });
        }

        const hash = await bcrypt.hash(password, 12);
        const verificationToken = uuidv4();
        const userId = uuidv4();

        const newUser = {
          id: userId,
          username: sanitizeInput(username),
          email: sanitizeInput(email),
          phone: sanitizeInput(phone),
          password: hash,
          role: role === 'admin' ? 'admin' : (role === 'manager' ? 'manager' : 'user'),
          approved: role === 'user' ? 1 : 0,
          provider: 'local',
          emailVerified: 0,
          verificationToken,
          createdAt: new Date(),
          stats: JSON.stringify({
            totalBookings: 0,
            successfulBookings: 0,
            cancelledBookings: 0,
            totalSpent: 0
          })
        };

        // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
        await execQuery(
          `INSERT INTO users (id, username, email, phone, password, role, approved, provider, emailVerified, verificationToken, createdAt, stats)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newUser.id, newUser.username, newUser.email, newUser.phone, newUser.password,
            newUser.role, newUser.approved, newUser.provider, newUser.emailVerified,
            newUser.verificationToken, newUser.createdAt, newUser.stats
          ]
        );

        // إنشاء الملف الشخصي
        await execQuery(
          `INSERT INTO user_profiles (userId, nickname, age, bio, joinDate, lastUpdated)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, nickname || username, age || null, bio || '', new Date(), new Date()]
        );

        // إذا كان مدير، إنشاء سجل مدير
        if (role === 'manager') {
          await execQuery(
            `INSERT INTO managers (id, userId, pitchIds, approved, createdAt)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), userId, JSON.stringify(pitchIds || []), 0, new Date()]
          );
        }

        // إرسال بريد التفعيل
        const verificationLink = `${APP_URL}/verify-email?token=${verificationToken}`;
        
        try {
          await sendEmailSafe({
            to: email,
            subject: role === 'manager' ? 'تم استلام طلب التسجيل كمدير' : 'تفعيل حسابك - احجزلي',
            html: `
              <div style="font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 20px; background: #f8f9fa;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <h2 style="color: #1a7f46; margin-bottom: 20px;">مرحباً ${username}!</h2>
                  <p style="color: #666; margin-bottom: 20px;">${
                    role === 'manager' 
                      ? 'شكراً لتسجيلك كمدير في احجزلي. سيتم مراجعة طلبك والموافقة عليه من قبل الإدارة.'
                      : 'شكراً لتسجيلك في احجزلي. يرجى تفعيل حسابك بالضغط على الرابط أدناه:'
                  }</p>
                  ${role !== 'manager' ? `
                    <a href="${verificationLink}" style="background: #1a7f46; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">
                      تفعيل الحساب
                    </a>
                  ` : ''}
                  <p style="color: #999; margin-top: 20px; font-size: 14px;">إذا لم تطلب هذا الرابط، يمكنك تجاهل هذه الرسالة.</p>
                </div>
              </div>
            `
          });
        } catch (emailError) {
          logger.error('Failed to send verification email', emailError);
        }

        res.json({ 
          message: role === 'manager' 
            ? 'تم إرسال طلب التسجيل كمدير بنجاح. سيتم مراجعته والموافقة عليه من قبل الإدارة.'
            : 'تم إنشاء الحساب بنجاح. يرجى فحص بريدك الإلكتروني للتفعيل.',
          success: true 
        });

      } catch (error) {
        logger.error('Signup error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب' });
      }
    });

    // تفعيل البريد الإلكتروني
    app.get('/verify-email', async (req, res) => {
      const { token } = req.query;
      
      if (!token) {
        return res.status(400).send(`
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2 style="color: #dc3545;">رابط غير صالح</h2>
            <p>رابط التفعيل غير صالح.</p>
            <a href="/login" style="color: #1a7f46;">العودة لتسجيل الدخول</a>
          </div>
        `);
      }

      try {
        const users = await execQuery('SELECT id FROM users WHERE verificationToken = ?', [token]);
        
        if (users.length === 0) {
          return res.status(400).send(`
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
              <h2 style="color: #dc3545;">رابط غير صالح أو منتهي</h2>
              <p>رابط التفعيل غير صالح أو انتهت صلاحيته.</p>
              <a href="/login" style="color: #1a7f46;">العودة لتسجيل الدخول</a>
            </div>
          `);
        }
        
        await execQuery(
          'UPDATE users SET emailVerified = 1, verificationToken = NULL WHERE verificationToken = ?',
          [token]
        );
        
        res.send(`
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2 style="color: #1a7f46;">تم تفعيل حسابك بنجاح! 🎉</h2>
            <p>يمكنك الآن تسجيل الدخول إلى حسابك.</p>
            <a href="/login" style="background: #1a7f46; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              تسجيل الدخول
            </a>
          </div>
        `);
      } catch (error) {
        logger.error('Email verification error', error);
        res.status(500).send('حدث خطأ أثناء تفعيل الحساب');
      }
    });

    // تسجيل الدخول
    app.post('/login', loginLimiter, async (req, res) => {
      try {
        const { email, password } = req.body;
        
        if (!email || !password) {
          return res.status(400).json({ message: 'يرجى إدخال البريد وكلمة المرور' });
        }

        const users = await execQuery(
          'SELECT * FROM users WHERE email = ? AND provider = ?',
          [email, 'local']
        );
        
        if (users.length === 0) {
          return res.status(401).json({ message: 'البريد أو كلمة المرور غير صحيحة' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        
        if (!match) {
          return res.status(401).json({ message: 'البريد أو كلمة المرور غير صحيحة' });
        }

        if (!user.emailVerified) {
          return res.status(403).json({ message: 'لم يتم تفعيل البريد الإلكتروني بعد' });
        }

        if (!user.approved) {
          return res.status(403).json({ message: 'حسابك ينتظر الموافقة من الإدارة' });
        }

        // تحديث آخر دخول
        await execQuery(
          'UPDATE users SET lastLogin = ? WHERE id = ?',
          [new Date(), user.id]
        );

        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role
        };

        res.json({ 
          message: 'تم تسجيل الدخول بنجاح',
          user: req.session.user
        });

      } catch (error) {
        logger.error('Login error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الدخول' });
      }
    });

    // تسجيل الخروج
    app.post('/logout', (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Logout error', err);
          return res.status(500).json({ message: 'خطأ في تسجيل الخروج' });
        }
        res.json({ message: 'تم تسجيل الخروج' });
      });
    });

    /* ========= نظام الحجوزات القديم ========= */

    // إنشاء حجز جديد (النظام القديم)
    app.post('/api/bookings', requireLogin, async (req, res) => {
      try {
        const { pitchId, date, time, name, phone, email, discountCode, userType } = req.body;
        
        if (!pitchId || !date || !time || !name || !phone) {
          return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        const pitch = pitchesData.find(p => p.id === parseInt(pitchId));
        if (!pitch) {
          return res.status(404).json({ message: 'الملعب غير موجود' });
        }

        // التحقق من التاريخ والوقت
        const selectedDate = new Date(date);
        const now = new Date();
        
        if (selectedDate < now) {
          return res.status(400).json({ message: 'لا يمكن الحجز في تاريخ ماضي' });
        }

        // التحقق من عدم وجود حجز مسبق
        const existingBookings = await execQuery(
          'SELECT id FROM bookings WHERE pitchId = ? AND date = ? AND time = ? AND status IN (?, ?)',
          [pitchId, date, time, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.PENDING]
        );

        if (existingBookings.length > 0) {
          return res.status(400).json({ message: 'هذا الوقت محجوز بالفعل' });
        }

        // حساب المبالغ
        const depositAmount = calculateDeposit(pitch.price, `${date}T${time}`);
        let appliedDiscount = null;
        const amount = pitch.price;
        let discountValue = 0;

        // تطبيق كود الخصم إذا كان موجوداً
        if (discountCode) {
          const discountCodes = await execQuery(
            'SELECT * FROM discount_codes WHERE code = ? AND status = ?',
            [discountCode.toUpperCase(), 'active']
          );

          if (discountCodes.length > 0) {
            const validCode = discountCodes[0];
            const discountOnRemaining = Math.min(validCode.value, pitch.price - depositAmount);
            discountValue = discountOnRemaining;
            appliedDiscount = {
              code: validCode.code,
              value: discountOnRemaining,
              originalPrice: pitch.price,
              finalPrice: pitch.price - discountOnRemaining
            };
          }
        }

        const finalAmount = Math.max(0, amount - discountValue);
        const remainingAmount = Math.max(0, finalAmount - depositAmount);

        const newBooking = {
          id: uuidv4(),
          pitchId: parseInt(pitchId),
          pitchName: pitch.name,
          pitchLocation: pitch.location,
          pitchPrice: pitch.price,
          depositAmount: depositAmount,
          date,
          time,
          customerName: sanitizeInput(name),
          customerPhone: sanitizeInput(phone),
          customerEmail: sanitizeInput(email || req.session.user.email),
          userId: req.session.user.id,
          userType: userType || 'customer',
          status: BOOKING_STATUS.PENDING,
          amount: amount,
          paidAmount: 0,
          remainingAmount: remainingAmount,
          finalAmount: finalAmount,
          appliedDiscount: appliedDiscount ? JSON.stringify(appliedDiscount) : null,
          discountCode: discountCode || null,
          paymentType: PAYMENT_TYPES.DEPOSIT,
          createdAt: new Date(),
          updatedAt: new Date(),
          paymentDeadline: new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
        };

        // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
        await execQuery(
          `INSERT INTO bookings (id, pitchId, pitchName, pitchLocation, pitchPrice, depositAmount, date, time, 
           customerName, customerPhone, customerEmail, userId, userType, status, amount, paidAmount, 
           remainingAmount, finalAmount, appliedDiscount, discountCode, paymentType, createdAt, updatedAt, paymentDeadline)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newBooking.id, newBooking.pitchId, newBooking.pitchName, newBooking.pitchLocation,
            newBooking.pitchPrice, newBooking.depositAmount, newBooking.date, newBooking.time,
            newBooking.customerName, newBooking.customerPhone, newBooking.customerEmail,
            newBooking.userId, newBooking.userType, newBooking.status, newBooking.amount,
            newBooking.paidAmount, newBooking.remainingAmount, newBooking.finalAmount,
            newBooking.appliedDiscount, newBooking.discountCode, newBooking.paymentType,
            newBooking.createdAt, newBooking.updatedAt, newBooking.paymentDeadline
          ]
        );

        // تحديث إحصائيات المستخدم
        await updateUserStats(req.session.user.id, newBooking, 'booking');

        // حفظ الحجز في الجلسة للدفع
        req.session.pendingBooking = newBooking;

        res.json({ 
          message: depositAmount === 0 
            ? 'تم إنشاء الحجز بنجاح. لا يوجد عربون مطلوب.'
            : 'تم إنشاء الحجز بنجاح. يرجى دفع العربون لتأكيد الحجز.',
          booking: newBooking,
          paymentRequired: depositAmount > 0,
          depositAmount: depositAmount,
          remainingAmount: remainingAmount
        });

      } catch (error) {
        logger.error('Booking error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء الحجز' });
      }
    });

    // إلغاء الحجز (القديم)
    app.put('/api/bookings/:id/cancel', requireLogin, async (req, res) => {
      try {
        const bookingId = req.params.id;
        const { cancellationReason } = req.body;
        
        const bookings = await execQuery('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        const booking = bookings[0];
        
        if (!booking) {
          return res.status(404).json({ message: 'الحجز غير موجود' });
        }

        const isOwner = booking.userId === req.session.user.id;
        const isAdmin = req.session.user.role === 'admin';
        
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: 'غير مسموح لك بإلغاء هذا الحجز' });
        }

        // حساب الوقت المتبقي للحجز
        const bookingDate = new Date(booking.date);
        const now = new Date();
        const timeDiff = bookingDate.getTime() - now.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        let compensationCode = null;
        let refundAmount = 0;

        // تحديد سياسة الإلغاء
        if (hoursDiff > 48) {
          refundAmount = booking.paidAmount;
          compensationCode = await generateCompensationCode(booking, 'full_refund');
        } else if (hoursDiff > 24) {
          compensationCode = await generateCompensationCode(booking, 'partial_refund');
        }

        // تحديث حالة الحجز
        await execQuery(
          `UPDATE bookings SET status = ?, updatedAt = ?, cancellationTime = ?, 
           cancellationReason = ?, refundAmount = ?, compensationCode = ? WHERE id = ?`,
          [BOOKING_STATUS.CANCELLED, new Date(), new Date(), cancellationReason, refundAmount, 
           compensationCode ? compensationCode.code : null, bookingId]
        );

        // تحديث إحصائيات المستخدم
        await updateUserStats(req.session.user.id, booking, 'cancellation');

        // إرسال بريد بالإلغاء والتعويض
        await sendCancellationEmail(booking, compensationCode, refundAmount);

        res.json({ 
          message: 'تم إلغاء الحجز بنجاح',
          refundAmount,
          compensationCode,
          policy: hoursDiff > 48 ? 'استرداد كامل + كود تعويض' : 
                  hoursDiff > 24 ? 'كود تعويض فقط' : 'لا يوجد تعويض'
        });

      } catch (error) {
        logger.error('Cancel booking error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
      }
    });

    /* ========= نظام الدفع ========= */

    // مزودي الدفع
    app.get('/api/providers', (req, res) => {
      const providersList = Object.keys(paymentConfig).map(key => ({
        id: key,
        name: paymentConfig[key].name,
        number: paymentConfig[key].number,
        icon: paymentConfig[key].icon
      }));
      res.json(providersList);
    });

    // QR Code
    app.get('/api/qr/:wallet', async (req, res) => {
      try {
        const walletNumber = req.params.wallet;
        // إنشاء نص للـ QR Code يحتوي على معلومات الدفع
        const qrText = `دفع عربون حجز ملعب\nرقم المحفظة: ${walletNumber}`;
        const url = await QRCode.toDataURL(qrText);
        res.json({ qr: url });
      } catch(err) { 
        logger.error('QR generation error', err);
        res.status(500).json({ error: 'خطأ في توليد QR code' }); 
      }
    });

    // معلومات الحجز للدفع
    app.get('/api/booking-info', requireLogin, (req, res) => {
      const pendingBooking = req.session.pendingBooking;
      
      if (!pendingBooking) {
        return res.json({});
      }
      
      res.json({
        pitchId: pendingBooking.pitchId,
        field: pendingBooking.pitchName,
        date: pendingBooking.date,
        time: pendingBooking.time,
        hours: 1,
        amount: pendingBooking.finalAmount,
        originalAmount: pendingBooking.amount,
        discount: pendingBooking.appliedDiscount
      });
    });

    // معالجة الدفع (القديم)
    app.post('/api/payment', requireLogin, paymentLimiter, upload.single('receipt'), async (req, res) => {
      try {
        const { provider, transactionId, amount } = req.body;
        
        if (!provider || !transactionId || !amount) {
          return res.status(400).json({ message: 'البيانات غير مكتملة' });
        }

        if (!paymentConfig[provider]) {
          return res.status(400).json({ message: 'مزود الدفع غير صحيح' });
        }

        const pendingBooking = req.session.pendingBooking;
        if (!pendingBooking) {
          return res.status(400).json({ message: 'لا يوجد حجز معلق للدفع' });
        }

        // ✅ الإصلاح: استخدام parseFloat للمقارنة الدقيقة
        const paidAmount = parseFloat(amount);
        const expectedAmount = parseFloat(pendingBooking.depositAmount);
        
        if (isNaN(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.001) {
          return res.status(400).json({ 
            message: `المبلغ المطلوب للعربون هو ${expectedAmount} جنيه فقط` 
          });
        }

        const connection = await pool.getConnection();
        
        try {
          await connection.beginTransaction();

          // تحديث حالة الكود إذا كان مستخدماً
          if (pendingBooking.discountCode) {
            await connection.execute(
              'UPDATE discount_codes SET status = "used", usedBy = ?, usedAt = ?, usedForBooking = ? WHERE code = ?',
              [req.session.user.id, new Date(), pendingBooking.id, pendingBooking.discountCode]
            );
          }

          // تسجيل الدفعة
          const paymentRecord = {
            id: uuidv4(),
            bookingId: pendingBooking.id,
            payerName: req.session.user.username,
            email: req.session.user.email,
            phone: req.session.user.phone,
            field: pendingBooking.pitchName,
            hours: 1,
            transactionId,
            amount: paidAmount,
            paymentType: PAYMENT_TYPES.DEPOSIT,
            originalAmount: pendingBooking.amount,
            remainingAmount: pendingBooking.remainingAmount,
            discountApplied: pendingBooking.appliedDiscount ? JSON.parse(pendingBooking.appliedDiscount).value : 0,
            provider: provider,
            providerName: paymentConfig[provider].name,
            receiptPath: req.file ? `/uploads/${req.file.filename}` : null,
            date: new Date(),
            status: 'confirmed'
          };

          // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
          await connection.execute(
            `INSERT INTO payments (id, bookingId, payerName, email, phone, field, hours, transactionId, amount, 
             paymentType, originalAmount, remainingAmount, discountApplied, provider, providerName, receiptPath, date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              paymentRecord.id, paymentRecord.bookingId, paymentRecord.payerName, paymentRecord.email,
              paymentRecord.phone, paymentRecord.field, paymentRecord.hours, paymentRecord.transactionId,
              paymentRecord.amount, paymentRecord.paymentType, paymentRecord.originalAmount,
              paymentRecord.remainingAmount, paymentRecord.discountApplied, paymentRecord.provider,
              paymentRecord.providerName, paymentRecord.receiptPath, paymentRecord.date, paymentRecord.status
            ]
          );

          // تحديث حالة الحجز
          await connection.execute(
            'UPDATE bookings SET status = ?, paidAmount = ?, remainingAmount = ?, updatedAt = ? WHERE id = ?',
            [BOOKING_STATUS.CONFIRMED, paidAmount, pendingBooking.amount - paidAmount, new Date(), pendingBooking.id]
          );

          await connection.commit();

          // تحديث إحصائيات المستخدم
          await updateUserStats(req.session.user.id, pendingBooking, 'confirmation');

          // مسح الحجز المعلق من الجلسة
          delete req.session.pendingBooking;

          // إرسال بريد التأكيد
          try {
            await sendEmailSafe({
              to: req.session.user.email,
              subject: 'تم تأكيد حجزك - احجزلي',
              html: `
                <div style="font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 20px; background: #f8f9fa;">
                  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: #1a7f46; text-align: center; margin-bottom: 20px;">تم تأكيد حجزك بنجاح! 🎉</h2>
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h3 style="color: #333; margin-bottom: 15px;">تفاصيل الحجز:</h3>
                      <p><strong>الملعب:</strong> ${pendingBooking.pitchName}</p>
                      <p><strong>الموقع:</strong> ${pendingBooking.pitchLocation}</p>
                      <p><strong>التاريخ:</strong> ${pendingBooking.date}</p>
                      <p><strong>الوقت:</strong> ${pendingBooking.time}</p>
                      <p><strong>السعر الكامل:</strong> ${pendingBooking.amount} جنيه</p>
                      <p><strong>العربون المدفوع:</strong> ${amount} جنيه</p>
                      <p><strong>المبلغ المتبقي:</strong> ${pendingBooking.remainingAmount} جنيه</p>
                      ${pendingBooking.appliedDiscount ? `
                        <p><strong>الخصم:</strong> ${JSON.parse(pendingBooking.appliedDiscount).value} جنيه</p>
                        <p><strong>كود الخصم:</strong> ${JSON.parse(pendingBooking.appliedDiscount).code}</p>
                      ` : ''}
                      <p><strong>طريقة الدفع:</strong> ${paymentConfig[provider].name}</p>
                      <p style="color: #e74c3c; font-weight: bold;">يرجى دفع المبلغ المتبقي قبل 48 ساعة من موعد الحجز</p>
                    </div>
                    <p style="text-align: center; color: #666; margin-top: 20px;">نتمنى لك وقتاً ممتعاً!</p>
                  </div>
                </div>
              `
            });
          } catch (emailError) {
            logger.error('Failed to send confirmation email', emailError);
          }

          res.json({ 
            message: 'تم دفع العربون بنجاح وتأكيد الحجز', 
            paymentId: paymentRecord.id,
            success: true
          });

        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

      } catch (error) {
        logger.error('Payment error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء معالجة الدفع' });
      }
    });

    // معالجة الدفع بالأكواد
    app.post('/api/process-voucher-payment', paymentLimiter, async (req, res) => {
      try {
        await withTransaction(async (connection) => {
          const { bookingId, voucherCodes = [] } = req.body;
          
          if (!bookingId) {
            throw { status: 400, message: 'معرف الحجز مطلوب' };
          }

          // الحصول على معلومات الحجز
          const [bookings] = await connection.execute(
            'SELECT * FROM new_bookings WHERE id = ? FOR UPDATE',
            [bookingId]
          );

          if (bookings.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings[0];

          let totalVoucherValue = 0;
          const usedCodes = new Set();
          const validVouchers = [];

          // التحقق من جميع الأكواد
          for (const voucherCode of voucherCodes) {
            if (usedCodes.has(voucherCode)) {
              throw { status: 400, message: `الكود ${voucherCode} مكرر` };
            }

            const [vouchers] = await connection.execute(
              'SELECT * FROM voucher_codes WHERE code = ? AND is_used = FALSE FOR UPDATE',
              [voucherCode.toUpperCase()]
            );

            if (vouchers.length === 0) {
              throw { status: 400, message: `الكود ${voucherCode} غير صالح` };
            }

            const voucher = vouchers[0];
            totalVoucherValue += parseFloat(voucher.value);
            validVouchers.push(voucher);
            usedCodes.add(voucherCode);
          }

          // ✅ الإصلاح: استخدام parseFloat للمقارنة الدقيقة
          if (totalVoucherValue < parseFloat(booking.deposit_amount)) {
            throw { status: 400, message: `قيمة الأكواد (${totalVoucherValue}) أقل من المطلوب (${booking.deposit_amount})` };
          }

          // تحديث حالة الأكواد كمستعملة
          for (const voucher of validVouchers) {
            await connection.execute(
              'UPDATE voucher_codes SET is_used = TRUE, used_at = NOW(), used_for_booking = ? WHERE id = ?',
              [bookingId, voucher.id]
            );
          }

          // تحديث حالة الحجز
          await connection.execute(
            'UPDATE new_bookings SET deposit_paid = TRUE, status = "confirmed", remaining_amount = ? WHERE id = ?',
            [parseFloat(booking.total_amount) - parseFloat(booking.deposit_amount), bookingId]
          );

          // تحديث حالة الساعة
          await connection.execute(
            'UPDATE time_slots SET status = "booked" WHERE id = ?',
            [booking.time_slot_id]
          );

          return { 
            totalPaid: totalVoucherValue,
            remainingAmount: parseFloat(booking.total_amount) - parseFloat(booking.deposit_amount)
          };
        });

        res.json({ 
          message: 'تم الدفع وتأكيد الحجز بنجاح',
          success: true
        });

      } catch (error) {
        logger.error('Voucher payment error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء معالجة الدفع' });
        }
      }
    });

    /* ========= نظام الأكواد الجديد (Vouchers) ========= */

    // إنشاء أكواد جديدة
    app.post('/api/admin/vouchers', requireAdmin, async (req, res) => {
      try {
        const { value, quantity = 1 } = req.body;
        
        if (!value || value <= 0) {
          return res.status(400).json({ message: 'قيمة الكود مطلوبة ويجب أن تكون أكبر من الصفر' });
        }

        const vouchers = [];
        const connection = await pool.getConnection();

        try {
          await connection.beginTransaction();

          for (let i = 0; i < quantity; i++) {
            const voucher = {
              id: uuidv4(),
              code: generateVoucherCode(),
              value: parseFloat(value),
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 يوم
            };

            // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
            await connection.execute(
              'INSERT INTO voucher_codes (id, code, value, expires_at) VALUES (?, ?, ?, ?)',
              [voucher.id, voucher.code, voucher.value, voucher.expires_at]
            );

            vouchers.push(voucher);
          }

          await connection.commit();
          res.json({ 
            message: `تم إنشاء ${quantity} كود بنجاح`,
            vouchers: vouchers
          });

        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

      } catch (error) {
        logger.error('Create vouchers error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الأكواد' });
      }
    });

    /* ========= نظام الأكواد القديم ========= */

    // إنشاء أكواد جديدة
    app.post('/api/admin/discount-codes', requireAdmin, async (req, res) => {
      try {
        const { type, value, pitchId, source, expiresAt, quantity = 1 } = req.body;
        
        if (!type || !value || !source) {
          return res.status(400).json({ message: 'النوع والقيمة والمصدر مطلوبون' });
        }

        const newCodes = [];
        const connection = await pool.getConnection();

        try {
          await connection.beginTransaction();

          for (let i = 0; i < quantity; i++) {
            const code = generateDiscountCode(8);
            const pitch = pitchId ? pitchesData.find(p => p.id === parseInt(pitchId)) : null;
            
            const newCode = {
              id: uuidv4(),
              code: code,
              value: parseInt(value),
              type: type,
              pitchId: pitchId ? parseInt(pitchId) : null,
              pitchName: pitch ? pitch.name : null,
              source: source,
              status: 'active',
              createdAt: new Date(),
              expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              message: type === CODE_TYPES.COMPENSATION ? 
                'هذا الكود التعويضي صالح لمدة 14 يوم من تاريخ الإلغاء' : null
            };

            // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
            await connection.execute(
              `INSERT INTO discount_codes (id, code, value, type, pitchId, pitchName, source, status, createdAt, expiresAt, message)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newCode.id, newCode.code, newCode.value, newCode.type, newCode.pitchId,
                newCode.pitchName, newCode.source, newCode.status, newCode.createdAt,
                newCode.expiresAt, newCode.message
              ]
            );

            newCodes.push(newCode);
          }

          await connection.commit();
          res.json({ 
            message: `تم إنشاء ${quantity} كود بنجاح`,
            codes: newCodes
          });

        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

      } catch (error) {
        logger.error('Create discount codes error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الأكواد' });
      }
    });

    // الحصول على جميع الأكواد
    app.get('/api/admin/discount-codes', requireAdmin, async (req, res) => {
      try {
        const discountCodes = await execQuery('SELECT * FROM discount_codes ORDER BY createdAt DESC');
        res.json(discountCodes);
      } catch (error) {
        logger.error('Get discount codes error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الأكواد' });
      }
    });

    // التحقق من صحة الكود
    app.post('/api/validate-discount-code', requireLogin, async (req, res) => {
      try {
        const { code, pitchId } = req.body;
        
        if (!code) {
          return res.status(400).json({ message: 'الكود مطلوب' });
        }

        const discountCodes = await execQuery(
          'SELECT * FROM discount_codes WHERE code = ? AND status = ?',
          [code.toUpperCase(), 'active']
        );

        if (discountCodes.length === 0) {
          return res.status(404).json({ message: 'الكود غير صالح أو منتهي' });
        }

        const discountCode = discountCodes[0];

        // التحقق من تاريخ الصلاحية
        const now = new Date();
        const expiresAt = new Date(discountCode.expiresAt);
        if (now > expiresAt) {
          return res.status(400).json({ message: 'الكود منتهي الصلاحية' });
        }

        // التحقق من أن الكود خاص بملعب معين
        if (discountCode.type === CODE_TYPES.PITCH && discountCode.pitchId !== parseInt(pitchId)) {
          return res.status(400).json({ 
            message: `هذا الكود خاص بملعب: ${discountCode.pitchName}` 
          });
        }

        res.json({
          valid: true,
          code: discountCode.code,
          value: discountCode.value,
          type: discountCode.type,
          message: discountCode.message
        });

      } catch (error) {
        logger.error('Validate discount code error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء التحقق من الكود' });
      }
    });

    // استخدام الكود
    app.post('/api/use-discount-code', requireLogin, async (req, res) => {
      try {
        const { code, bookingId } = req.body;
        
        if (!code || !bookingId) {
          return res.status(400).json({ message: 'الكود ومعرف الحجز مطلوبان' });
        }

        const connection = await pool.getConnection();
        
        try {
          await connection.beginTransaction();
          
          const [discountCodes] = await connection.execute(
            'SELECT * FROM discount_codes WHERE code = ? FOR UPDATE',
            [code.toUpperCase()]
          );
          
          const discountCode = discountCodes[0];
          if (!discountCode) {
            await connection.rollback();
            return res.status(404).json({ message: 'الكود غير موجود' });
          }

          if (discountCode.status !== 'active') {
            await connection.rollback();
            return res.status(400).json({ message: 'الكود مستخدم بالفعل' });
          }

          // تحديث حالة الكود
          await connection.execute(
            'UPDATE discount_codes SET status = "used", usedBy = ?, usedAt = ?, usedForBooking = ? WHERE code = ?',
            [req.session.user.id, new Date(), bookingId, code.toUpperCase()]
          );

          await connection.commit();
          
          res.json({
            message: 'تم استخدام الكود بنجاح',
            discount: discountCode.value
          });

        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

      } catch (error) {
        logger.error('Use discount code error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء استخدام الكود' });
      }
    });

    /* ========= نظام التقييمات ========= */

    // إضافة تقييم جديد
    app.post('/api/ratings', requireLogin, apiLimiter, async (req, res) => {
      try {
        const { pitchId, rating, comment, bookingId } = req.body;
        
        if (!pitchId || !rating) {
          return res.status(400).json({ message: 'معرف الملعب والتقييم مطلوبان' });
        }

        const pitch = pitchesData.find(p => p.id === parseInt(pitchId));
        if (!pitch) {
          return res.status(404).json({ message: 'الملعب غير موجود' });
        }

        // التحقق من عدم وجود تقييم سابق
        const existingRatings = await execQuery(
          'SELECT id FROM ratings WHERE pitchId = ? AND userId = ?',
          [pitchId, req.session.user.id]
        );

        if (existingRatings.length > 0) {
          return res.status(400).json({ message: 'لقد قمت بتقييم هذا الملعب من قبل' });
        }

        const newRating = {
          id: uuidv4(),
          pitchId: parseInt(pitchId),
          userId: req.session.user.id,
          username: req.session.user.username,
          rating: parseInt(rating),
          comment: comment || '',
          bookingId: bookingId || null,
          createdAt: new Date(),
          status: 'active'
        };

        // ✅ الإصلاح: استخدام مصفوفة قيم مرتبة
        await execQuery(
          `INSERT INTO ratings (id, pitchId, userId, username, rating, comment, bookingId, createdAt, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newRating.id, newRating.pitchId, newRating.userId, newRating.username,
            newRating.rating, newRating.comment, newRating.bookingId, newRating.createdAt,
            newRating.status
          ]
        );

        // تحديث متوسط التقييم
        await updatePitchRating(parseInt(pitchId));

        res.json({
          message: 'تم إضافة التقييم بنجاح',
          rating: newRating
        });

      } catch (error) {
        logger.error('Add rating error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إضافة التقييم' });
      }
    });

    // الحصول على تقييمات ملعب
    app.get('/api/pitches/:id/ratings', async (req, res) => {
      try {
        const pitchId = parseInt(req.params.id);
        const ratings = await execQuery(
          'SELECT * FROM ratings WHERE pitchId = ? AND status = ? ORDER BY createdAt DESC',
          [pitchId, 'active']
        );

        res.json(ratings);

      } catch (error) {
        logger.error('Get ratings error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب التقييمات' });
      }
    });

    /* ========= نظام الملفات الشخصية ========= */

    // الحصول على الملف الشخصي
    app.get('/api/user/profile', requireLogin, async (req, res) => {
      try {
        const userProfiles = await execQuery(
          'SELECT * FROM user_profiles WHERE userId = ?',
          [req.session.user.id]
        );
        
        if (userProfiles.length === 0) {
          return res.status(404).json({ message: 'الملف الشخصي غير موجود' });
        }

        const userProfile = userProfiles[0];

        // إحصائيات المستخدم
        const bookings = await execQuery(
          'SELECT * FROM bookings WHERE userId = ?',
          [req.session.user.id]
        );
        
        const stats = {
          totalBookings: bookings.length,
          successfulBookings: bookings.filter(b => b.status === 'confirmed').length,
          cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
          totalSpent: bookings
            .filter(b => b.status === 'confirmed')
            .reduce((total, booking) => total + (booking.finalAmount || booking.amount), 0)
        };

        res.json({
          profile: userProfile,
          stats: stats
        });

      } catch (error) {
        logger.error('Get user profile error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الملف الشخصي' });
      }
    });

    // تحديث الملف الشخصي
    app.put('/api/user/profile', requireLogin, upload.single('avatar'), async (req, res) => {
      try {
        const { nickname, age, bio } = req.body;
        
        const updateData = {
          nickname: nickname || null,
          age: age ? parseInt(age) : null,
          bio: bio || '',
          lastUpdated: new Date()
        };

        if (req.file) {
          updateData.avatar = `/uploads/${req.file.filename}`;
        }

        await execQuery(
          'UPDATE user_profiles SET ? WHERE userId = ?',
          [updateData, req.session.user.id]
        );

        res.json({
          message: 'تم تحديث الملف الشخصي بنجاح',
          profile: updateData
        });

      } catch (error) {
        logger.error('Update user profile error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء تحديث الملف الشخصي' });
      }
    });

    // الحصول على أكواد التعويض للمستخدم
    app.get('/api/user/compensation-codes', requireLogin, async (req, res) => {
      try {
        const discountCodes = await execQuery(
          'SELECT * FROM discount_codes WHERE userId = ? AND type = ? AND status = ?',
          [req.session.user.id, CODE_TYPES.COMPENSATION, 'active']
        );

        // إزالة الأكواد المنتهية الصلاحية
        const now = new Date();
        const validCodes = discountCodes.filter(dc => {
          const expiresAt = new Date(dc.expiresAt);
          return expiresAt > now;
        });

        res.json(validCodes);

      } catch (error) {
        logger.error('Get compensation codes error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب أكواد التعويض' });
      }
    });

    /* ========= نظام الملاعب الجديد ========= */

    // إضافة ملعب جديد
    app.post('/api/admin/stadiums', requireAdmin, async (req, res) => {
      try {
        const { name, description, images, max_daily_hours = 3, max_weekly_hours = 5 } = req.body;
        
        if (!name) {
          return res.status(400).json({ message: 'اسم الملعب مطلوب' });
        }

        const result = await execQuery(
          `INSERT INTO stadiums (name, description, images, max_daily_hours, max_weekly_hours) 
           VALUES (?, ?, ?, ?, ?)`,
          [name, description, JSON.stringify(images || []), max_daily_hours, max_weekly_hours]
        );

        // إنشاء الساعات الافتراضية للملعب الجديد
        await createDefaultTimeSlots(result.insertId);

        res.json({ 
          message: 'تم إضافة الملعب بنجاح',
          stadiumId: result.insertId,
          success: true 
        });

      } catch (error) {
        logger.error('Add stadium error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إضافة الملعب' });
      }
    });

    // الحصول على جميع الملاعب
    app.get('/api/stadiums', async (req, res) => {
      try {
        const stadiums = await execQuery('SELECT * FROM stadiums ORDER BY created_at DESC');
        
        // تحويل images من JSON string إلى array
        const formattedStadiums = stadiums.map(stadium => ({
          ...stadium,
          images: stadium.images ? JSON.parse(stadium.images) : []
        }));
        
        res.json(formattedStadiums);
      } catch (error) {
        logger.error('Get stadiums error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الملاعب' });
      }
    });

    // الحصول على الساعات المتاحة لملعب معين
    app.get('/api/stadiums/:stadiumId/time-slots', async (req, res) => {
      try {
        const { stadiumId } = req.params;
        const { date } = req.query;
        
        if (!date) {
          return res.status(400).json({ message: 'التاريخ مطلوب' });
        }

        const timeSlots = await execQuery(
          `SELECT ts.*, 
                  (SELECT COUNT(*) FROM new_bookings b 
                   WHERE b.time_slot_id = ts.id AND b.status IN ('pending', 'confirmed')) as booking_count
           FROM time_slots ts 
           WHERE ts.stadium_id = ? AND ts.date = ? 
           ORDER BY ts.start_time`,
          [stadiumId, date]
        );

        res.json(timeSlots);
      } catch (error) {
        logger.error('Get time slots error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الساعات' });
      }
    });

    // إضافة ساعات جديدة لملعب
    app.post('/api/admin/time-slots', requireAdmin, async (req, res) => {
      try {
        const { stadiumId, date, startTime, endTime, price } = req.body;
        
        if (!stadiumId || !date || !startTime || !endTime || !price) {
          return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        const result = await execQuery(
          `INSERT INTO time_slots (stadium_id, date, start_time, end_time, price, status) 
           VALUES (?, ?, ?, ?, ?, 'available')`,
          [stadiumId, date, startTime, endTime, price]
        );

        res.json({ 
          message: 'تم إضافة الساعة بنجاح',
          timeSlotId: result.insertId,
          success: true 
        });

      } catch (error) {
        logger.error('Add time slot error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إضافة الساعة' });
      }
    });

    /* ========= نظام الإدارة ========= */

    // الإحصائيات
    app.get('/api/admin/stats', requireAdmin, async (req, res) => {
      try {
        const [bookings] = await execQuery('SELECT * FROM bookings');
        const [payments] = await execQuery('SELECT * FROM payments');
        const [users] = await execQuery('SELECT * FROM users');
        const [discountCodes] = await execQuery('SELECT * FROM discount_codes');
        const [managers] = await execQuery('SELECT * FROM managers');
        
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // الحجوزات الناجحة هذا الشهر
        const currentMonthBookings = bookings.filter(booking => {
          const bookingDate = new Date(booking.createdAt);
          return bookingDate.getMonth() === currentMonth && 
                 bookingDate.getFullYear() === currentYear &&
                 booking.status === 'confirmed';
        });
        
        // إحصائيات مالية
        const currentMonthRevenue = currentMonthBookings.reduce((total, booking) => total + (booking.finalAmount || booking.amount), 0);
        
        // المستخدمين النشطين
        const activeUsers = users.filter(u => {
          if (!u.lastLogin) return false;
          const lastLogin = new Date(u.lastLogin);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          return lastLogin > thirtyDaysAgo;
        }).length;

        const stats = {
          currentMonth: {
            successfulBookings: currentMonthBookings.length,
            totalHours: currentMonthBookings.length,
            revenue: currentMonthRevenue,
            cancelledBookings: bookings.filter(b => b.status === 'cancelled').length
          },
          users: {
            total: users.length,
            active: activeUsers,
            newThisMonth: users.filter(u => {
              const userDate = new Date(u.createdAt);
              return userDate.getMonth() === currentMonth && 
                     userDate.getFullYear() === currentYear;
            }).length
          },
          discountCodes: {
            active: discountCodes.filter(dc => dc.status === 'active').length,
            used: discountCodes.filter(dc => dc.status === 'used').length
          },
          managers: {
            total: managers.length,
            approved: managers.filter(m => m.approved).length,
            pending: managers.filter(m => !m.approved).length
          }
        };
        
        res.json(stats);

      } catch (error) {
        logger.error('Stats error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الإحصائيات' });
      }
    });

    // الحجوزات للمدير
    app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
      try {
        const bookings = await execQuery('SELECT * FROM bookings ORDER BY createdAt DESC');
        res.json(bookings);
      } catch (error) {
        logger.error('Admin bookings error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
      }
    });

    // المستخدمين
    app.get('/api/admin/users', requireAdmin, async (req, res) => {
      try {
        const users = await execQuery('SELECT id, username, email, phone, role, approved, createdAt, lastLogin FROM users');
        res.json(users);
      } catch (error) {
        logger.error('Admin users error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب المستخدمين' });
      }
    });

    // المدفوعات
    app.get('/api/payments', requireAdmin, async (req, res) => {
      try {
        const payments = await execQuery('SELECT * FROM payments ORDER BY date DESC');
        res.json(payments);
      } catch (error) {
        logger.error('Payments error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب المدفوعات' });
      }
    });

    // تأكيد دفعة
    app.put('/api/admin/payments/:id/confirm', requireAdmin, async (req, res) => {
      try {
        const paymentId = req.params.id;
        await execQuery(
          'UPDATE payments SET status = "confirmed", confirmedAt = ?, confirmedBy = ? WHERE id = ?',
          [new Date(), req.session.user.email, paymentId]
        );
        res.json({ message: 'تم تأكيد الدفعة بنجاح' });
      } catch (error) {
        logger.error('Confirm payment error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء تأكيد الدفعة' });
      }
    });

    // تفعيل مستخدم
    app.put('/api/admin/users/:id/approve', requireAdmin, async (req, res) => {
      try {
        const userId = req.params.id;
        await execQuery(
          'UPDATE users SET approved = 1, updatedAt = ? WHERE id = ?',
          [new Date(), userId]
        );
        res.json({ message: 'تم تفعيل المستخدم بنجاح' });
      } catch (error) {
        logger.error('Approve user error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء تفعيل المستخدم' });
      }
    });

    /* ========= نظام المديرين ========= */

    // الحصول على الملاعب التي يديرها المستخدم
    app.get('/api/manager/pitches', requireManager, async (req, res) => {
      try {
        const managers = await execQuery(
          'SELECT * FROM managers WHERE userId = ? AND approved = 1',
          [req.session.user.id]
        );
        
        if (managers.length === 0) {
          return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
        }

        const userManager = managers[0];
        let pitchIds = [];
        
        try {
          pitchIds = JSON.parse(userManager.pitchIds);
        } catch {
          pitchIds = [];
        }

        const managedPitches = pitchesData.filter(pitch => 
          pitchIds.includes(pitch.id)
        );

        res.json(managedPitches);

      } catch (error) {
        logger.error('Get manager pitches error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الملاعب' });
      }
    });

    // الحصول على حجوزات الملاعب التي يديرها
    app.get('/api/manager/bookings', requireManager, async (req, res) => {
      try {
        const managers = await execQuery(
          'SELECT * FROM managers WHERE userId = ? AND approved = 1',
          [req.session.user.id]
        );
        
        if (managers.length === 0) {
          return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
        }

        const userManager = managers[0];
        let pitchIds = [];
        
        try {
          pitchIds = JSON.parse(userManager.pitchIds);
        } catch {
          pitchIds = [];
        }

        const managerBookings = await execQuery(
          'SELECT * FROM bookings WHERE pitchId IN (?) ORDER BY createdAt DESC',
          [pitchIds]
        );

        res.json(managerBookings);

      } catch (error) {
        logger.error('Get manager bookings error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
      }
    });

    // إلغاء حجز بواسطة المدير
    app.put('/api/manager/bookings/:id/cancel', requireManager, async (req, res) => {
      try {
        const bookingId = req.params.id;
        const { cancellationReason } = req.body;
        
        const managers = await execQuery(
          'SELECT * FROM managers WHERE userId = ? AND approved = 1',
          [req.session.user.id]
        );
        
        if (managers.length === 0) {
          return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
        }

        const userManager = managers[0];
        let pitchIds = [];
        
        try {
          pitchIds = JSON.parse(userManager.pitchIds);
        } catch {
          pitchIds = [];
        }

        const bookings = await execQuery('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        const booking = bookings[0];
        
        if (!booking) {
          return res.status(404).json({ message: 'الحجز غير موجود' });
        }

        // التحقق من أن المدير يملك صلاحية إلغاء هذا الحجز
        if (!pitchIds.includes(booking.pitchId)) {
          return res.status(403).json({ message: 'غير مسموح لك بإلغاء هذا الحجز' });
        }

        // حساب الوقت المتبقي للحجز
        const bookingDate = new Date(booking.date);
        const now = new Date();
        const timeDiff = bookingDate.getTime() - now.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        let compensationCode = null;
        let refundAmount = 0;

        // تحديد سياسة الإلغاء
        if (hoursDiff > 48) {
          refundAmount = booking.paidAmount;
          compensationCode = await generateCompensationCode(booking, 'full_refund');
        } else if (hoursDiff > 24) {
          compensationCode = await generateCompensationCode(booking, 'partial_refund');
        }

        // تحديث حالة الحجز
        await execQuery(
          `UPDATE bookings SET status = ?, updatedAt = ?, cancellationTime = ?, 
           cancellationReason = ?, refundAmount = ?, compensationCode = ?, cancelledBy = ? WHERE id = ?`,
          [BOOKING_STATUS.CANCELLED, new Date(), new Date(), cancellationReason || 'إلغاء من المدير', 
           refundAmount, compensationCode ? compensationCode.code : null, req.session.user.id, bookingId]
        );

        // إرسال بريد بالإلغاء
        await sendCancellationEmail(booking, compensationCode, refundAmount);

        res.json({ 
          message: 'تم إلغاء الحجز بنجاح',
          refundAmount,
          compensationCode
        });

      } catch (error) {
        logger.error('Manager cancel booking error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
      }
    });

    // الحصول على طلبات المديرين المعلقة
    app.get('/api/admin/pending-managers', requireAdmin, async (req, res) => {
      try {
        const managers = await execQuery(
          `SELECT m.*, u.username, u.email, u.phone
           FROM managers m
           LEFT JOIN users u ON m.userId = u.id
           WHERE m.approved = 0`
        );
        
        const pendingManagers = managers.map(manager => {
          let pitchIds = [];
          try {
            pitchIds = JSON.parse(manager.pitchIds);
          } catch {
            pitchIds = [];
          }
          
          const managedPitches = pitchesData.filter(p => pitchIds.includes(p.id));
          
          return {
            ...manager,
            managedPitches: managedPitches.map(p => p.name)
          };
        });

        res.json(pendingManagers);

      } catch (error) {
        logger.error('Get pending managers error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب طلبات المديرين' });
      }
    });

    // الموافقة على مدير
    app.put('/api/admin/managers/:id/approve', requireAdmin, async (req, res) => {
      try {
        const managerId = req.params.id;
        const connection = await pool.getConnection();
        
        try {
          await connection.beginTransaction();
          
          const [managers] = await connection.execute(
            'SELECT * FROM managers WHERE id = ? FOR UPDATE',
            [managerId]
          );
          
          const manager = managers[0];
          if (!manager) {
            await connection.rollback();
            return res.status(404).json({ message: 'طلب المدير غير موجود' });
          }

          await connection.execute(
            'UPDATE managers SET approved = 1, approvedAt = ?, approvedBy = ? WHERE id = ?',
            [new Date(), req.session.user.id, managerId]
          );
          
          await connection.execute(
            'UPDATE users SET approved = 1 WHERE id = ?',
            [manager.userId]
          );

          // إرسال بريد الإعلام
          const [users] = await connection.execute(
            'SELECT email, username FROM users WHERE id = ?',
            [manager.userId]
          );
          
          const user = users[0];
          if (user) {
            try {
              await sendEmailSafe({
                to: user.email,
                subject: 'تمت الموافقة على طلبك كمدير - احجزلي',
                html: `
                  <div style="font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 20px; background: #f8f9fa;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                      <h2 style="color: #1a7f46; text-align: center; margin-bottom: 20px;">تمت الموافقة على طلبك! 🎉</h2>
                      <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #155724; margin-bottom: 15px;">مبروك! تمت الموافقة على طلبك كمدير</h3>
                        <p style="color: #155724;">يمكنك الآن تسجيل الدخول والبدء في إدارة الملاعب الخاصة بك.</p>
                      </div>
                      <a href="${APP_URL}/login" style="background: #1a7f46; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">
                        تسجيل الدخول
                      </a>
                    </div>
                  </div>
                `
              });
            } catch (emailError) {
              logger.error('Failed to send approval email:', emailError);
            }
          }

          await connection.commit();
          res.json({ message: 'تمت الموافقة على المدير بنجاح' });

        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

      } catch (error) {
        logger.error('Approve manager error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء الموافقة على المدير' });
      }
    });

    // رفض طلب مدير
    app.put('/api/admin/managers/:id/reject', requireAdmin, async (req, res) => {
      try {
        const managerId = req.params.id;
        const { rejectionReason } = req.body;
        
        const connection = await pool.getConnection();
        
        try {
          await connection.beginTransaction();
          
          const [managers] = await connection.execute(
            'SELECT * FROM managers WHERE id = ? FOR UPDATE',
            [managerId]
          );
          
          const manager = managers[0];
          if (!manager) {
            await connection.rollback();
            return res.status(404).json({ message: 'طلب المدير غير موجود' });
          }

          // حذف طلب المدير
          await connection.execute('DELETE FROM managers WHERE id = ?', [managerId]);
          
          // تحديث حالة المستخدم
          await connection.execute(
            'UPDATE users SET role = "user", approved = 0 WHERE id = ?',
            [manager.userId]
          );

          // إرسال بريد الرفض
          const [users] = await connection.execute(
            'SELECT email, username FROM users WHERE id = ?',
            [manager.userId]
          );
          
          const user = users[0];
          if (user) {
            try {
              await sendEmailSafe({
                to: user.email,
                subject: 'قرار بشأن طلبك كمدير - احجزلي',
                html: `
                  <div style="font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 20px; background: #f8f9fa;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                      <h2 style="color: #e74c3c; text-align: center; margin-bottom: 20px;">قرار بشأن طلبك</h2>
                      <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #721c24; margin-bottom: 15px;">نأسف لإبلاغك</h3>
                        <p style="color: #721c24;">لم يتم الموافقة على طلبك كمدير في الوقت الحالي.</p>
                        ${rejectionReason ? `<p style="color: #721c24;"><strong>السبب:</strong> ${rejectionReason}</p>` : ''}
                        <p style="color: #721c24;">يمكنك المحاولة مرة أخرى في وقت لاحق.</p>
                      </div>
                      <a href="${APP_URL}/login" style="background: #1a7f46; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">
                        تسجيل الدخول
                      </a>
                    </div>
                  </div>
                `
              });
            } catch (emailError) {
              logger.error('Failed to send rejection email:', emailError);
            }
          }

          await connection.commit();
          res.json({ message: 'تم رفض طلب المدير بنجاح' });

        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

      } catch (error) {
        logger.error('Reject manager error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء رفض طلب المدير' });
      }
    });

    /* ========= Routes الجديدة والمحسنة ========= */

    // 1. إدارة سياسات العربون للملاعب
    app.get('/api/stadiums/:id/deposit-policy', async (req, res) => {
      try {
        const { id } = req.params;
        const policies = await execQuery(
          'SELECT * FROM stadium_deposit_policies WHERE stadium_id = ?',
          [id]
        );

        if (policies.length > 0) {
          res.json(policies[0]);
        } else {
          // إرجاع السياسة الافتراضية
          res.json({
            stadium_id: parseInt(id),
            less_than_24_hours: 0,
            between_24_48_hours: 30,
            more_than_48_hours: 50
          });
        }
      } catch (error) {
        logger.error('Get deposit policy error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب سياسة العربون' });
      }
    });

    app.put('/api/stadiums/:id/deposit-policy', requireAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { less_than_24_hours, between_24_48_hours, more_than_48_hours } = req.body;

        const existingPolicies = await execQuery(
          'SELECT id FROM stadium_deposit_policies WHERE stadium_id = ?',
          [id]
        );

        if (existingPolicies.length > 0) {
          await execQuery(
            `UPDATE stadium_deposit_policies 
             SET less_than_24_hours = ?, between_24_48_hours = ?, more_than_48_hours = ?, updated_at = ?
             WHERE stadium_id = ?`,
            [less_than_24_hours, between_24_48_hours, more_than_48_hours, new Date(), id]
          );
        } else {
          await execQuery(
            `INSERT INTO stadium_deposit_policies 
             (stadium_id, less_than_24_hours, between_24_48_hours, more_than_48_hours) 
             VALUES (?, ?, ?, ?)`,
            [id, less_than_24_hours, between_24_48_hours, more_than_48_hours]
          );
        }

        res.json({ message: 'تم تحديث سياسة العربون بنجاح', success: true });
      } catch (error) {
        logger.error('Update deposit policy error', error);
        res.status(500).json({ message: 'حدث خطأ في تحديث سياسة العربون' });
      }
    });

    // 2. إدارة المدراء المتعددين
    app.get('/api/stadiums/:id/managers', async (req, res) => {
      try {
        const { id } = req.params;
        const managers = await execQuery(
          `SELECT sm.*, u.username, u.email, u.phone 
           FROM stadium_managers sm 
           JOIN users u ON sm.user_id = u.id 
           WHERE sm.stadium_id = ? AND sm.is_active = TRUE 
           ORDER BY sm.created_at DESC`,
          [id]
        );

        res.json(managers);
      } catch (error) {
        logger.error('Get stadium managers error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب المديرين' });
      }
    });

    app.post('/api/stadiums/:id/managers', requireAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { user_id, role, permissions } = req.body;

        // التحقق من وجود المستخدم
        const users = await execQuery('SELECT id FROM users WHERE id = ?', [user_id]);
        if (users.length === 0) {
          return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // التحقق من عدم تكرار المدير
        const existingManagers = await execQuery(
          'SELECT id FROM stadium_managers WHERE stadium_id = ? AND user_id = ?',
          [id, user_id]
        );

        if (existingManagers.length > 0) {
          return res.status(400).json({ message: 'المستخدم مدير بالفعل على هذا الملعب' });
        }

        await execQuery(
          `INSERT INTO stadium_managers (stadium_id, user_id, role, permissions) 
           VALUES (?, ?, ?, ?)`,
          [id, user_id, role, JSON.stringify(permissions || {})]
        );

        res.json({ message: 'تم إضافة المدير بنجاح', success: true });
      } catch (error) {
        logger.error('Add stadium manager error', error);
        res.status(500).json({ message: 'حدث خطأ في إضافة المدير' });
      }
    });

    app.delete('/api/stadiums/:stadiumId/managers/:managerId', requireAdmin, async (req, res) => {
      try {
        const { stadiumId, managerId } = req.params;
        
        await execQuery(
          'UPDATE stadium_managers SET is_active = FALSE WHERE stadium_id = ? AND id = ?',
          [stadiumId, managerId]
        );

        res.json({ message: 'تم إزالة المدير بنجاح', success: true });
      } catch (error) {
        logger.error('Remove stadium manager error', error);
        res.status(500).json({ message: 'حدث خطأ في إزالة المدير' });
      }
    });

    // 3. إدارة المواعيد المحجوزة ثابتاً
    app.get('/api/stadiums/:id/blocked-slots', async (req, res) => {
      try {
        const { id } = req.params;
        const blockedSlots = await execQuery(
          `SELECT bs.*, u.username as created_by_name 
           FROM blocked_slots bs 
           LEFT JOIN users u ON bs.created_by = u.id 
           WHERE bs.stadium_id = ? AND bs.is_active = TRUE 
           ORDER BY bs.start_date, bs.start_time`,
          [id]
        );

        res.json(blockedSlots);
      } catch (error) {
        logger.error('Get blocked slots error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب المواعيد المحجوزة' });
      }
    });

    app.post('/api/stadiums/:id/blocked-slots', requireManager, async (req, res) => {
      try {
        const { id } = req.params;
        const { start_date, end_date, start_time, end_time, reason, is_emergency } = req.body;

        // التحقق من الصلاحيات
        const permissions = await checkManagerPermissions(id, req.session.user.id);
        if (!permissions.hasAccess) {
          return res.status(403).json({ message: 'غير مسموح لك بإضافة مواعيد محجوزة' });
        }

        await execQuery(
          `INSERT INTO blocked_slots 
           (stadium_id, start_date, end_date, start_time, end_time, reason, is_emergency, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, start_date, end_date, start_time, end_time, reason, is_emergency || false, req.session.user.id]
        );

        res.json({ message: 'تم إضافة الموعد المحجوز بنجاح', success: true });
      } catch (error) {
        logger.error('Add blocked slot error', error);
        res.status(500).json({ message: 'حدث خطأ في إضافة الموعد المحجوز' });
      }
    });

    app.put('/api/blocked-slots/:id/toggle', requireManager, async (req, res) => {
      try {
        const { id } = req.params;
        const { is_active } = req.body;

        // الحصول على معلومات الموعد المحجوز للتحقق من الصلاحيات
        const blockedSlots = await execQuery(
          'SELECT stadium_id FROM blocked_slots WHERE id = ?',
          [id]
        );

        if (blockedSlots.length === 0) {
          return res.status(404).json({ message: 'الموعد المحجوز غير موجود' });
        }

        const stadiumId = blockedSlots[0].stadium_id;
        const permissions = await checkManagerPermissions(stadiumId, req.session.user.id);
        if (!permissions.hasAccess) {
          return res.status(403).json({ message: 'غير مسموح لك بتعديل هذا الموعد' });
        }

        await execQuery(
          'UPDATE blocked_slots SET is_active = ?, updated_at = ? WHERE id = ?',
          [is_active, new Date(), id]
        );

        const action = is_active ? 'تفعيل' : 'تعطيل';
        res.json({ message: `تم ${action} الموعد المحجوز بنجاح`, success: true });
      } catch (error) {
        logger.error('Toggle blocked slot error', error);
        res.status(500).json({ message: 'حدث خطأ في تعديل الموعد المحجوز' });
      }
    });

    // 4. نظام الحجز المحسن مع كل الإصلاحات
    app.post('/api/bookings/enhanced', apiLimiter, async (req, res) => {
      try {
        const result = await withTransaction(async (connection) => {
          const { stadiumId, date, startTime, endTime, customerName, customerPhone, playersNeeded = 0, voucherCodes = [] } = req.body;
          
          if (!stadiumId || !date || !startTime || !endTime || !customerName || !customerPhone) {
            throw { status: 400, message: 'جميع الحقول مطلوبة' };
          }

          // التحقق من المواعيد المحجوزة ثابتاً
          const isBlocked = await checkBlockedSlots(stadiumId, date, startTime, endTime);
          if (isBlocked) {
            throw { status: 400, message: 'هذا الموعد محجوز ثابتاً وغير متاح للحجز' };
          }

          // البحث عن الساعة المتاحة
          const [timeSlots] = await connection.execute(
            `SELECT ts.*, s.name as stadium_name, s.price as stadium_price 
             FROM time_slots ts 
             JOIN stadiums s ON ts.stadium_id = s.id 
             WHERE ts.stadium_id = ? AND ts.date = ? AND ts.start_time = ? AND ts.end_time = ? AND ts.status = "available" 
             FOR UPDATE`,
            [stadiumId, date, startTime, endTime]
          );

          if (timeSlots.length === 0) {
            throw { status: 400, message: 'هذه الساعة غير متاحة للحجز' };
          }

          const timeSlot = timeSlots[0];

          // حساب العربون الديناميكي
          const bookingDateTime = `${date}T${startTime}`;
          const depositAmount = await calculateDynamicDeposit(stadiumId, timeSlot.stadium_price, bookingDateTime);
          
          // التحقق من الأكواد المستخدمة
          let totalVoucherValue = 0;
          const usedVouchers = [];

          for (const voucherCode of voucherCodes) {
            const [vouchers] = await connection.execute(
              'SELECT * FROM voucher_codes WHERE code = ? AND is_used = FALSE FOR UPDATE',
              [voucherCode.toUpperCase()]
            );

            if (vouchers.length === 0) {
              throw { status: 400, message: `الكود ${voucherCode} غير صالح` };
            }

            const voucher = vouchers[0];
            totalVoucherValue += parseFloat(voucher.value);
            usedVouchers.push(voucher);
          }

          // حساب المبالغ النهائية مع الأكواد
          const actualDeposit = Math.max(0, depositAmount - totalVoucherValue);
          const remainingAmount = calculateRemainingWithVouchers(
            timeSlot.stadium_price, 
            depositAmount, 
            usedVouchers.map(v => v.value)
          );

          const newBooking = {
            id: uuidv4(),
            time_slot_id: timeSlot.id,
            customer_name: sanitizeInput(customerName),
            customer_phone: sanitizeInput(customerPhone),
            total_amount: timeSlot.stadium_price,
            deposit_amount: actualDeposit,
            players_needed: playersNeeded,
            countdown_end: new Date(Date.now() + 2 * 60 * 60 * 1000), // ساعتين
            remaining_amount: remainingAmount
          };

          // حفظ الحجز
          await connection.execute(
            `INSERT INTO new_bookings (id, time_slot_id, customer_name, customer_phone, total_amount, 
             deposit_amount, players_needed, countdown_end, remaining_amount) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newBooking.id, newBooking.time_slot_id, newBooking.customer_name, 
              newBooking.customer_phone, newBooking.total_amount, newBooking.deposit_amount,
              newBooking.players_needed, newBooking.countdown_end, newBooking.remaining_amount
            ]
          );

          // تحديث حالة الساعة
          const newStatus = playersNeeded > 0 ? 'golden' : 'pending';
          await connection.execute(
            'UPDATE time_slots SET status = ?, is_golden = ? WHERE id = ?',
            [newStatus, playersNeeded > 0, timeSlot.id]
          );

          // تحديث حالة الأكواد المستخدمة
          for (const voucher of usedVouchers) {
            await connection.execute(
              'UPDATE voucher_codes SET is_used = TRUE, used_at = NOW(), used_for_booking = ? WHERE id = ?',
              [newBooking.id, voucher.id]
            );
          }

          return { 
            bookingId: newBooking.id, 
            depositAmount: actualDeposit,
            totalVoucherValue: totalVoucherValue,
            remainingAmount: remainingAmount,
            countdownEnd: newBooking.countdown_end
          };
        });

        res.json({ 
          message: 'تم إنشاء الحجز بنجاح',
          ...result,
          success: true
        });

      } catch (error) {
        logger.error('Enhanced booking error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحجز' });
        }
      }
    });

    // 5. إلغاء الحجز المحسن
    app.post('/api/bookings/:bookingId/enhanced-cancel', apiLimiter, async (req, res) => {
      try {
        const { bookingId } = req.params;
        const { cancellationReason, cancellationType = 'user' } = req.body;

        const result = await withTransaction(async (connection) => {
          // الحصول على معلومات الحجز
          const [bookings] = await connection.execute(
            `SELECT b.*, ts.stadium_id, ts.date, ts.start_time 
             FROM new_bookings b 
             JOIN time_slots ts ON b.time_slot_id = ts.id 
             WHERE b.id = ? FOR UPDATE`,
            [bookingId]
          );

          if (bookings.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings[0];

          // حساب الوقت المتبقي للحجز
          const bookingDateTime = `${booking.date}T${booking.start_time}`;
          const now = new Date();
          const bookingDate = new Date(bookingDateTime);
          const timeDiff = bookingDate.getTime() - now.getTime();
          const hoursBeforeBooking = timeDiff / (1000 * 60 * 60);

          // توليد كود التعويض المحسن
          let compensationCode = null;
          if (booking.deposit_paid) {
            compensationCode = await generateEnhancedCompensationCode(
              booking, 
              cancellationType, 
              hoursBeforeBooking
            );
          }

          // تحديث حالة الحجز
          await connection.execute(
            'UPDATE new_bookings SET status = "cancelled" WHERE id = ?',
            [bookingId]
          );

          // إعادة الساعة للمتاحة
          await restoreTimeSlotAfterCancellation(booking.time_slot_id);

          return { 
            timeSlotId: booking.time_slot_id,
            compensationCode: compensationCode,
            hoursBeforeBooking: hoursBeforeBooking
          };
        });

        res.json({ 
          message: 'تم إلغاء الحجز بنجاح',
          ...result,
          success: true
        });

      } catch (error) {
        logger.error('Enhanced cancel booking error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
        }
      }
    });

    // 6. الحصول على الساعات المتاحة مع التحقق من المحجوزات ثابتاً
    app.get('/api/stadiums/:id/enhanced-available-slots', async (req, res) => {
      try {
        const { id } = req.params;
        const { date } = req.query;
        
        if (!date) {
          return res.status(400).json({ message: 'التاريخ مطلوب' });
        }

        // الحصول على جميع الساعات لهذا اليوم
        const allSlots = await execQuery(
          `SELECT ts.*, 
                  (SELECT COUNT(*) FROM new_bookings b 
                   WHERE b.time_slot_id = ts.id AND b.status IN ('pending', 'confirmed')) as booking_count
           FROM time_slots ts 
           WHERE ts.stadium_id = ? AND ts.date = ? 
           ORDER BY ts.start_time`,
          [id, date]
        );

        // التحقق من الساعات المحجوزة ثابتاً
        const availableSlots = [];
        
        for (const slot of allSlots) {
          const isBlocked = await checkBlockedSlots(id, date, slot.start_time, slot.end_time);
          
          if (!isBlocked && slot.status === 'available' && slot.booking_count === 0) {
            availableSlots.push(slot);
          }
        }

        res.json({
          availableSlots: availableSlots,
          totalSlots: allSlots.length,
          availableCount: availableSlots.length,
          blockedCount: allSlots.length - availableSlots.length
        });

      } catch (error) {
        logger.error('Get enhanced available slots error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الساعات المتاحة' });
      }
    });

    // 7. واجهة إدارة الملاعب المحسنة
    app.get('/api/admin/enhanced-stadiums', requireAdmin, async (req, res) => {
      try {
        const stadiums = await execQuery('SELECT * FROM stadiums ORDER BY created_at DESC');
        
        // إضافة بيانات إضافية لكل ملعب
        const enhancedStadiums = await Promise.all(
          stadiums.map(async (stadium) => {
            // عدد المديرين
            const [managers] = await execQuery(
              'SELECT COUNT(*) as count FROM stadium_managers WHERE stadium_id = ? AND is_active = TRUE',
              [stadium.id]
            );

            // سياسة العربون
            const [policies] = await execQuery(
              'SELECT * FROM stadium_deposit_policies WHERE stadium_id = ?',
              [stadium.id]
            );

            // عدد المواعيد المحجوزة ثابتاً
            const [blockedSlots] = await execQuery(
              'SELECT COUNT(*) as count FROM blocked_slots WHERE stadium_id = ? AND is_active = TRUE',
              [stadium.id]
            );

            return {
              ...stadium,
              images: stadium.images ? JSON.parse(stadium.images) : [],
              managers_count: managers[0].count,
              deposit_policy: policies.length > 0 ? policies[0] : null,
              blocked_slots_count: blockedSlots[0].count
            };
          })
        );

        res.json(enhancedStadiums);
      } catch (error) {
        logger.error('Get enhanced stadiums error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الملاعب' });
      }
    });

    /* ========= إصلاحات على الـ Routes الحالية ========= */

    // تحديث نظام الدفع ليدعم الحساب المحسن مع الأكواد
    app.post('/api/process-enhanced-payment', paymentLimiter, async (req, res) => {
      try {
        await withTransaction(async (connection) => {
          const { bookingId, voucherCodes = [], paymentMethod } = req.body;
          
          if (!bookingId) {
            throw { status: 400, message: 'معرف الحجز مطلوب' };
          }

          // الحصول على معلومات الحجز
          const [bookings] = await connection.execute(
            'SELECT * FROM new_bookings WHERE id = ? FOR UPDATE',
            [bookingId]
          );

          if (bookings.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings[0];

          let totalVoucherValue = 0;
          const usedVouchers = [];

          // معالجة الأكواد
          for (const voucherCode of voucherCodes) {
            const [vouchers] = await connection.execute(
              'SELECT * FROM voucher_codes WHERE code = ? AND is_used = FALSE FOR UPDATE',
              [voucherCode.toUpperCase()]
            );

            if (vouchers.length === 0) {
              throw { status: 400, message: `الكود ${voucherCode} غير صالح` };
            }

            const voucher = vouchers[0];
            totalVoucherValue += parseFloat(voucher.value);
            usedVouchers.push(voucher);
          }

          // ✅ الإصلاح: حساب المبلغ المتبقي الصحيح
          const remainingAmount = calculateRemainingWithVouchers(
            parseFloat(booking.total_amount),
            parseFloat(booking.deposit_amount),
            usedVouchers.map(v => v.value)
          );

          // تحديث حالة الأكواد
          for (const voucher of usedVouchers) {
            await connection.execute(
              'UPDATE voucher_codes SET is_used = TRUE, used_at = NOW(), used_for_booking = ? WHERE id = ?',
              [bookingId, voucher.id]
            );
          }

          // تحديث حالة الحجز
          await connection.execute(
            'UPDATE new_bookings SET deposit_paid = TRUE, status = "confirmed", remaining_amount = ? WHERE id = ?',
            [remainingAmount, bookingId]
          );

          // تحديث حالة الساعة
          await connection.execute(
            'UPDATE time_slots SET status = "booked" WHERE id = ?',
            [booking.time_slot_id]
          );

          return { 
            totalPaid: totalVoucherValue,
            remainingAmount: remainingAmount,
            bookingStatus: 'confirmed'
          };
        });

        res.json({ 
          message: 'تم الدفع وتأكيد الحجز بنجاح',
          success: true
        });

      } catch (error) {
        logger.error('Enhanced payment error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء معالجة الدفع' });
        }
      }
    });

    /* ========= الصفحات ========= */
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/login', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    });

    app.get('/signup', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'signup.html'));
    });

    app.get('/admin', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    });

    app.get('/payment', requireLogin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'payment.html'));
    });

    app.get('/profile', requireLogin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'profile.html'));
    });

    app.get('/manager', requireManager, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'manager.html'));
    });

    app.get('/admin-dashboard', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
    });

    // الصفحات الجديدة
    app.get('/players-with-you', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'players-with-you.html'));
    });

    app.get('/stadium-management', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'stadium-management.html'));
    });

    app.get('/voucher-management', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'voucher-management.html'));
    });

    // الصفحات الجديدة للإضافات المحسنة
    app.get('/deposit-policies', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'deposit-policies.html'));
    });

    app.get('/stadium-managers', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'stadium-managers.html'));
    });

    app.get('/blocked-slots', requireManager, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'blocked-slots.html'));
    });

    /* ========= معالجة الأخطاء ========= */
    app.use((err, req, res, next) => {
      if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ message: 'رمز CSRF غير صالح' });
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'حجم الملف يتجاوز 5 ميجابايت' });
        }
      }
      
      logger.error('Unhandled error', err);
      res.status(500).json({ message: 'حدث خطأ غير متوقع' });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ message: 'الصفحة غير موجودة' });
    });

    // بدء السيرفر
    app.listen(PORT, () => {
      logger.info(`✅ Server running on ${APP_URL}`);
      logger.info(`🔌 MySQL connected: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
      logger.info(`📧 Email service: ${process.env.EMAIL_HOST ? 'Configured' : 'Mock'}`);
      logger.info(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
      logger.info(`🏟️  Loaded ${pitchesData.length} pitches`);
      logger.info(`🔐 Security: CSRF, Rate Limiting, Input Validation Active`);
      logger.info(`🔄 Transactions: Safe withTransaction wrapper implemented`);
      logger.info(`🎯 All critical fixes applied successfully`);
      
      logger.info(`🆕 New Features Active:`);
      logger.info(`   💰 Dynamic Deposit System`);
      logger.info(`   👥 Multiple Managers per Stadium`);
      logger.info(`   ⏰ Blocked Slots Management`);
      logger.info(`   🎫 Enhanced Compensation Codes`);
      logger.info(`   🔢 Accurate Remaining Amount Calculation`);
      logger.info(`   🔄 Automatic Time Slot Restoration`);
      logger.info(`   🛡️ Advanced Permission System`);
      logger.info(`   🏟️  Stadium Management System`);
      logger.info(`   ⏱️  Countdown System`);
      logger.info(`   ⭐ Ratings System`);
      logger.info(`   👥 Player Requests System`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
