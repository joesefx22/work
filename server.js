/**
 * server.js - النسخة النهائية الكاملة مع PostgreSQL
 * نظام حجز الملاعب - احجزلي  
 * الإصدار: 5.0 - شامل كل الميزات + PostgreSQL + كل الإصلاحات
 * الكود الأصلي: 4700+ سطر + كل الإضافات الجديدة
 */

require('dotenv').config();

/* ========= المكتبات الأساسية ========= */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');

/* ========= PostgreSQL Database ========= */
const { execQuery, withTransaction, createTables, pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';

/* ========= فحص اتصال PostgreSQL عند بداية التشغيل ========= */
pool.query('SELECT NOW()').then(res => {
  console.log('🟢 PostgreSQL Ready:', res.rows[0].now);
}).catch(err => {
  console.error('🔴 PostgreSQL Connection Failed:', err);
});

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

/* ========= بيانات الملاعب المحسنة ========= */
const pitchesData = [
  {
    id: 1, name: "نادي الطيارة - الملعب الرئيسي", location: "المقطم - شارع التسعين", area: "mokatam", 
    type: "artificial", image: "/images/tyara-1.jpg", price: 250, deposit: 75, depositRequired: true,
    features: ["نجيلة صناعية", "كشافات ليلية", "غرف تبديل", "موقف سيارات", "كافتيريا"],
    rating: 4.7, totalRatings: 128, coordinates: { lat: 30.0130, lng: 31.2929 },
    workingHours: { start: 8, end: 24 }, googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9",
    availability: 8, totalSlots: 12, availabilityPercentage: 67,
    depositPolicy: {
      lessThan24Hours: 0,
      between24_48Hours: 30,
      moreThan48Hours: 50
    },
    managers: [],
    blockedSlots: []
  },
  {
    id: 2, name: "نادي الطيارة - الملعب الثاني", location: "المقطم - شارع التسعين", area: "mokatam", 
    type: "artificial", image: "/images/tyara-2.jpg", price: 200, deposit: 60, depositRequired: true,
    features: ["نجيلة صناعية", "كشافات ليلية", "غرف تبديل", "موقف سيارات"],
    rating: 4.5, totalRatings: 89, coordinates: { lat: 30.0135, lng: 31.2935 },
    workingHours: { start: 8, end: 24 }, googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9",
    availability: 6, totalSlots: 10, availabilityPercentage: 60
  }
];

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
    const users = await execQuery('SELECT id, username, email, phone, role FROM users WHERE email = $1', [email]);
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
        'SELECT * FROM users WHERE email = $1 OR google_id = $2', 
        [profile.emails[0].value, profile.id]
      );

      if (existingUsers.length > 0) {
        // تحديث المستخدم الموجود
        const user = existingUsers[0];
        await execQuery(
          'UPDATE users SET google_id = $1, last_login = $2 WHERE id = $3',
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
        approved: true,
        provider: 'google',
        email_verified: true,
        verification_token: null,
        google_id: profile.id,
        created_at: new Date(),
        last_login: new Date(),
        stats: JSON.stringify({
          totalBookings: 0,
          successfulBookings: 0,
          cancelledBookings: 0,
          totalSpent: 0
        })
      };

      await execQuery(
        `INSERT INTO users (id, username, email, phone, password, role, approved, provider, 
         email_verified, verification_token, google_id, created_at, last_login, stats)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          newUser.id, newUser.username, newUser.email, newUser.phone, newUser.password, 
          newUser.role, newUser.approved, newUser.provider, newUser.email_verified, 
          newUser.verification_token, newUser.google_id, newUser.created_at, newUser.last_login, 
          newUser.stats
        ]
      );

      // إنشاء ملف شخصي
      await execQuery(
        `INSERT INTO user_profiles (user_id, nickname, join_date, last_updated)
         VALUES ($1, $2, $3, $4)`,
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

// تحقق صلاحيات المدير أو المالك
async function requireManagerOrOwner(req, res, next) {
  const userId = req.session.user.id;
  const { stadiumId } = req.body;
  
  const result = await execQuery(
    'SELECT * FROM stadium_managers WHERE user_id = $1 AND stadium_id = $2 AND is_active = true',
    [userId, stadiumId]
  );
  
  if (result.length === 0) {
    return res.status(403).json({ message: 'غير مصرح لك' });
  }
  next();
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

function generateVoucherCode(prefix = 'VC') {
  return prefix + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
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
    const users = await execQuery('SELECT stats FROM users WHERE id = $1', [userId]);
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
      stats.totalSpent = (stats.totalSpent || 0) + (booking.final_amount || booking.amount || 0);
    } else if (action === 'cancellation') {
      stats.cancelledBookings = (stats.cancelledBookings || 0) + 1;
    }

    await execQuery('UPDATE users SET stats = $1 WHERE id = $2', [JSON.stringify(stats), userId]);
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

// حساب العربون الديناميكي حسب سياسة الملعب
async function calculateDynamicDeposit(stadiumId, pitchPrice, bookingDateTime) {
  try {
    // الحصول على سياسة العربون للملعب
    const depositRules = await execQuery(
      'SELECT * FROM deposit_rules WHERE stadium_id = $1',
      [stadiumId]
    );

    let depositRule;
    if (depositRules.length > 0) {
      depositRule = depositRules[0];
    } else {
      // استخدام السياسة الافتراضية إذا لم توجد سياسة مخصصة
      depositRule = {
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
      depositPercentage = depositRule.less_than_24_hours;
    } else if (hoursDiff < 48) {
      depositPercentage = depositRule.between_24_48_hours;
    } else {
      depositPercentage = depositRule.more_than_48_hours;
    }
    
    return Math.floor(pitchPrice * (depositPercentage / 100));
  } catch (error) {
    logger.error('Calculate dynamic deposit error', error);
    // العودة للحساب القديم في حالة الخطأ
    return calculateDeposit(pitchPrice, bookingDateTime);
  }
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
    compensationValue = Math.floor(booking.paid_amount * 0.8);
    message = 'كود تعويض عن إلغاء الحجز مع استرداد كامل المبلغ. صالح لمدة 14 يوم.';
  } else {
    compensationValue = Math.floor(booking.paid_amount * 0.5);
    message = 'كود تعويض عن إلغاء الحجز. صالح لمدة 14 يوم.';
  }

  const compensationCode = {
    id: uuidv4(),
    code: generateDiscountCode(10),
    value: compensationValue,
    type: CODE_TYPES.COMPENSATION,
    source: CODE_SOURCES.CANCELLATION,
    status: 'active',
    created_at: new Date(),
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    original_booking_id: booking.id,
    original_amount: booking.paid_amount,
    cancellation_type: type,
    message: message,
    user_id: booking.user_id
  };

  await execQuery(
    `INSERT INTO discount_codes (id, code, value, type, source, status, created_at, expires_at, 
     original_booking_id, original_amount, cancellation_type, message, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      compensationCode.id, compensationCode.code, compensationCode.value, compensationCode.type,
      compensationCode.source, compensationCode.status, compensationCode.created_at, compensationCode.expires_at,
      compensationCode.original_booking_id, compensationCode.original_amount, compensationCode.cancellation_type,
      compensationCode.message, compensationCode.user_id
    ]
  );

  return compensationCode;
}

// إرسال بريد الإلغاء
async function sendCancellationEmail(booking, compensationCode, refundAmount) {
  const userEmail = booking.customer_email;
  
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
              <p><strong>الملعب:</strong> ${booking.pitch_name}</p>
              <p><strong>التاريخ:</strong> ${booking.date}</p>
              <p><strong>الوقت:</strong> ${booking.time}</p>
              <p><strong>سبب الإلغاء:</strong> ${booking.cancellation_reason || 'غير محدد'}</p>
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
      for (const slot of timeSlots) {
        await execQuery(
          `INSERT INTO time_slots (stadium_id, date, start_time, end_time, price, status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          slot
        );
      }
    }
  } catch (error) {
    logger.error('Create default time slots error', error);
  }
}

// التحقق من الساعات المحجوبة
async function checkBlockedSlots(stadiumId, date, startTime, endTime) {
  try {
    const blockedSlots = await execQuery(
      `SELECT * FROM blocked_slots 
       WHERE stadium_id = $1 
       AND is_active = TRUE 
       AND start_date <= $2 
       AND end_date >= $2
       AND (
         (start_time <= $3 AND end_time >= $3) OR
         (start_time <= $4 AND end_time >= $4) OR
         (start_time >= $3 AND end_time <= $4)
       )`,
      [stadiumId, date, startTime, endTime]
    );

    return blockedSlots.length > 0;
  } catch (error) {
    logger.error('Check blocked slots error', error);
    return false;
  }
}

// التحقق من صلاحيات المدير على الملعب
async function checkManagerPermissions(stadiumId, userId) {
  try {
    const managers = await execQuery(
      `SELECT sm.*, u.role as user_role 
       FROM stadium_managers sm 
       JOIN users u ON sm.user_id = u.id 
       WHERE sm.stadium_id = $1 AND sm.user_id = $2 AND sm.is_active = TRUE`,
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
      'SELECT role FROM users WHERE id = $1',
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

// تحديث متوسط تقييم الملعب
async function updatePitchRating(pitchId) {
  try {
    const ratings = await execQuery(
      'SELECT AVG(rating) as average, COUNT(*) as count FROM ratings WHERE pitch_id = $1 AND status = $2',
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

// توليد كود تعويض محسن
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

    const compensationValue = Math.floor(booking.paid_amount * (compensationPercentage / 100));
    
    const compensationCode = {
      id: uuidv4(),
      code: generateDiscountCode(12),
      value: compensationValue,
      type: CODE_TYPES.COMPENSATION,
      source: CODE_SOURCES.CANCELLATION,
      status: 'active',
      created_at: new Date(),
      expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      original_booking_id: booking.id,
      original_amount: booking.paid_amount,
      cancellation_type: cancellationType,
      hours_before_booking: hoursBeforeBooking,
      compensation_percentage: compensationPercentage,
      user_id: booking.user_id
    };

    await execQuery(
      `INSERT INTO discount_codes 
       (id, code, value, type, source, status, created_at, expires_at, 
        original_booking_id, original_amount, cancellation_type, hours_before_booking, 
        compensation_percentage, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        compensationCode.id, compensationCode.code, compensationCode.value, compensationCode.type,
        compensationCode.source, compensationCode.status, compensationCode.created_at, compensationCode.expires_at,
        compensationCode.original_booking_id, compensationCode.original_amount, compensationCode.cancellation_type,
        compensationCode.hours_before_booking, compensationCode.compensation_percentage, compensationCode.user_id
      ]
    );

    return compensationCode;
  } catch (error) {
    logger.error('Generate enhanced compensation code error', error);
    return null;
  }
}

// حساب المبلغ المتبقي مع الأكواد
function calculateRemainingWithVouchers(totalAmount, depositAmount, voucherValues = []) {
  const totalVoucherValue = voucherValues.reduce((sum, value) => sum + value, 0);
  
  // إذا كانت قيمة الأكواد أكبر من العربون
  if (totalVoucherValue > depositAmount) {
    return Math.max(0, totalAmount - totalVoucherValue);
  } else {
    return Math.max(0, totalAmount - depositAmount);
  }
}

// تحديث حالة الساعة بعد الإلغاء
async function restoreTimeSlotAfterCancellation(timeSlotId) {
  try {
    await execQuery(
      'UPDATE time_slots SET status = $1, is_golden = $2 WHERE id = $3',
      ['available', false, timeSlotId]
    );
    logger.info('Time slot restored after cancellation', { timeSlotId });
  } catch (error) {
    logger.error('Restore time slot error', error);
  }
}

// إنشاء الجداول المحسنة
async function createEnhancedTables() {
  try {
    // جدول سياسات العربون للملاعب
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

    // جدول المدراء المتعددين للملعب
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

    logger.info('✅ Enhanced tables created successfully');
  } catch (error) {
    logger.error('❌ Error creating enhanced tables', error);
  }
}

/* ========= بدء الخادم مع الترتيب الصحيح ========= */
async function startServer() {
  try {
    // 1. إنشاء الجداول في PostgreSQL
    await createTables();
    await createEnhancedTables();
    
    // 2. تهيئة خدمة البريد
    initEmailService();

    // 3. middleware الجلسات
    app.use(session({
      secret: process.env.SESSION_SECRET || 'change-this-in-production-' + Date.now(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: isProduction ? 'none' : 'lax'
      }
    }));

    // 4. تهيئة passport (بعد الجلسات)
    app.use(passport.initialize());
    app.use(passport.session());

    // 5. CSRF Protection (بعد الجلسات)
    app.use(csrf({
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax'
      }
    }));

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
          'SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC',
          [req.session.user.id]
        );
        
        // في النظام الجديد، ندمج مع new_bookings
        const newBookings = await execQuery(
          'SELECT * FROM new_bookings WHERE customer_phone = $1 ORDER BY created_at DESC',
          [req.session.user.phone]
        );

        const allBookings = [...bookings, ...newBookings.map(b => ({
          id: b.id,
          pitch_name: 'ملعب - نظام جديد',
          date: b.created_at.split(' ')[0],
          time: '--',
          status: b.status,
          amount: b.total_amount,
          paid_amount: b.deposit_paid ? b.deposit_amount : 0,
          remaining_amount: b.remaining_amount
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
           WHERE ts.is_golden = TRUE AND b.status = 'pending'
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
          'SELECT * FROM voucher_codes WHERE code = $1 AND is_used = FALSE',
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
        const result = await withTransaction(async (client) => {
          const { timeSlotId, customerName, customerPhone, playersNeeded = 0 } = req.body;
          
          if (!timeSlotId || !customerName || !customerPhone) {
            throw { status: 400, message: 'جميع الحقول مطلوبة' };
          }

          if (!validatePhone(customerPhone)) {
            throw { status: 400, message: 'رقم الهاتف غير صالح' };
          }

          // التحقق من أن الساعة متاحة
          const timeSlots = await client.query(
            'SELECT * FROM time_slots WHERE id = $1 AND status = $2',
            [timeSlotId, 'available']
          );

          if (timeSlots.rows.length === 0) {
            throw { status: 400, message: 'هذه الساعة غير متاحة للحجز' };
          }

          const timeSlot = timeSlots.rows[0];

          // التحقق من الحد الأقصى اليومي
          const dailyBookings = await client.query(
            `SELECT COUNT(*) as count FROM new_bookings b 
             JOIN time_slots ts ON b.time_slot_id = ts.id 
             WHERE ts.stadium_id = $1 AND ts.date = $2 
             AND b.status IN ('pending', 'confirmed')`,
            [timeSlot.stadium_id, timeSlot.date]
          );

          if (parseInt(dailyBookings.rows[0].count) >= 3) {
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

          await client.query(
            `INSERT INTO new_bookings (id, time_slot_id, customer_name, customer_phone, total_amount, 
             deposit_amount, players_needed, countdown_end, remaining_amount) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              newBooking.id, newBooking.time_slot_id, newBooking.customer_name, 
              newBooking.customer_phone, newBooking.total_amount, newBooking.deposit_amount,
              newBooking.players_needed, newBooking.countdown_end, newBooking.remaining_amount
            ]
          );

          // تحديث حالة الساعة
          await client.query(
            'UPDATE time_slots SET status = $1 WHERE id = $2',
            [playersNeeded > 0 ? 'golden' : 'pending', timeSlotId]
          );

          // إذا طلب لاعبين، جعل الساعة ذهبية
          if (playersNeeded > 0) {
            await client.query(
              'UPDATE time_slots SET is_golden = TRUE WHERE id = $1',
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
          'SELECT countdown_end, remaining_amount FROM new_bookings WHERE id = $1 AND status = $2',
          [bookingId, 'pending']
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
        await withTransaction(async (client) => {
          const { bookingId } = req.params;
          
          // الحصول على معلومات الحجز
          const bookings = await client.query(
            'SELECT * FROM new_bookings WHERE id = $1',
            [bookingId]
          );

          if (bookings.rows.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings.rows[0];

          // تحديث حالة الحجز
          await client.query(
            'UPDATE new_bookings SET status = $1 WHERE id = $2',
            ['cancelled', bookingId]
          );

          // إعادة الساعة للمتاحة
          await client.query(
            'UPDATE time_slots SET status = $1, is_golden = $2 WHERE id = $3',
            ['available', false, booking.time_slot_id]
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
        const timeSlots = await execQuery(
          'SELECT * FROM time_slots WHERE id = $1 AND is_golden = TRUE',
          [timeSlotId]
        );

        if (timeSlots.length === 0) {
          return res.status(400).json({ message: 'هذه الساعة لا تحتاج لاعبين إضافيين' });
        }

        // إيجاد الحجز المرتبط بالساعة
        const bookings = await execQuery(
          'SELECT id FROM new_bookings WHERE time_slot_id = $1 AND status = $2',
          [timeSlotId, 'pending']
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

        await execQuery(
          `INSERT INTO player_requests (id, booking_id, time_slot_id, requester_name, requester_age, comment, players_count) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
          'SELECT * FROM player_requests WHERE booking_id = $1 AND status = $2 ORDER BY created_at DESC',
          [bookingId, 'pending']
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
          'UPDATE player_requests SET status = $1 WHERE id = $2',
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
          'SELECT id FROM users WHERE username = $1 OR email = $2 OR phone = $3 LIMIT 1',
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
          approved: role === 'user' ? true : false,
          provider: 'local',
          email_verified: false,
          verification_token: verificationToken,
          created_at: new Date(),
          stats: JSON.stringify({
            totalBookings: 0,
            successfulBookings: 0,
            cancelledBookings: 0,
            totalSpent: 0
          })
        };

        await execQuery(
          `INSERT INTO users (id, username, email, phone, password, role, approved, provider, email_verified, verification_token, created_at, stats)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            newUser.id, newUser.username, newUser.email, newUser.phone, newUser.password,
            newUser.role, newUser.approved, newUser.provider, newUser.email_verified,
            newUser.verification_token, newUser.created_at, newUser.stats
          ]
        );

        // إنشاء الملف الشخصي
        await execQuery(
          `INSERT INTO user_profiles (user_id, nickname, age, bio, join_date, last_updated)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, nickname || username, age || null, bio || '', new Date(), new Date()]
        );

        // إذا كان مدير، إنشاء سجل مدير
        if (role === 'manager') {
          await execQuery(
            `INSERT INTO managers (id, user_id, pitch_ids, approved, created_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), userId, JSON.stringify(pitchIds || []), false, new Date()]
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
        const users = await execQuery('SELECT id FROM users WHERE verification_token = $1', [token]);
        
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
          'UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE verification_token = $1',
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
          'SELECT * FROM users WHERE email = $1 AND provider = $2',
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

        if (!user.email_verified) {
          return res.status(403).json({ message: 'لم يتم تفعيل البريد الإلكتروني بعد' });
        }

        if (!user.approved) {
          return res.status(403).json({ message: 'حسابك ينتظر الموافقة من الإدارة' });
        }

        // تحديث آخر دخول
        await execQuery(
          'UPDATE users SET last_login = $1 WHERE id = $2',
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
          'SELECT id FROM bookings WHERE pitch_id = $1 AND date = $2 AND time = $3 AND status IN ($4, $5)',
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
            'SELECT * FROM discount_codes WHERE code = $1 AND status = $2',
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
          pitch_id: parseInt(pitchId),
          pitch_name: pitch.name,
          pitch_location: pitch.location,
          pitch_price: pitch.price,
          deposit_amount: depositAmount,
          date,
          time,
          customer_name: sanitizeInput(name),
          customer_phone: sanitizeInput(phone),
          customer_email: sanitizeInput(email || req.session.user.email),
          user_id: req.session.user.id,
          user_type: userType || 'customer',
          status: BOOKING_STATUS.PENDING,
          amount: amount,
          paid_amount: 0,
          remaining_amount: remainingAmount,
          final_amount: finalAmount,
          applied_discount: appliedDiscount ? JSON.stringify(appliedDiscount) : null,
          discount_code: discountCode || null,
          payment_type: PAYMENT_TYPES.DEPOSIT,
          created_at: new Date(),
          updated_at: new Date(),
          payment_deadline: new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
        };

        await execQuery(
          `INSERT INTO bookings (id, pitch_id, pitch_name, pitch_location, pitch_price, deposit_amount, date, time, 
           customer_name, customer_phone, customer_email, user_id, user_type, status, amount, paid_amount, 
           remaining_amount, final_amount, applied_discount, discount_code, payment_type, created_at, updated_at, payment_deadline)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
          [
            newBooking.id, newBooking.pitch_id, newBooking.pitch_name, newBooking.pitch_location,
            newBooking.pitch_price, newBooking.deposit_amount, newBooking.date, newBooking.time,
            newBooking.customer_name, newBooking.customer_phone, newBooking.customer_email,
            newBooking.user_id, newBooking.user_type, newBooking.status, newBooking.amount,
            newBooking.paid_amount, newBooking.remaining_amount, newBooking.final_amount,
            newBooking.applied_discount, newBooking.discount_code, newBooking.payment_type,
            newBooking.created_at, newBooking.updated_at, newBooking.payment_deadline
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
        
        const bookings = await execQuery('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        const booking = bookings[0];
        
        if (!booking) {
          return res.status(404).json({ message: 'الحجز غير موجود' });
        }

        const isOwner = booking.user_id === req.session.user.id;
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
          refundAmount = booking.paid_amount;
          compensationCode = await generateCompensationCode(booking, 'full_refund');
        } else if (hoursDiff > 24) {
          compensationCode = await generateCompensationCode(booking, 'partial_refund');
        }

        // تحديث حالة الحجز
        await execQuery(
          `UPDATE bookings SET status = $1, updated_at = $2, cancellation_time = $3, 
           cancellation_reason = $4, refund_amount = $5, compensation_code = $6 WHERE id = $7`,
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
        pitchId: pendingBooking.pitch_id,
        field: pendingBooking.pitch_name,
        date: pendingBooking.date,
        time: pendingBooking.time,
        hours: 1,
        amount: pendingBooking.final_amount,
        originalAmount: pendingBooking.amount,
        discount: pendingBooking.applied_discount
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
        const expectedAmount = parseFloat(pendingBooking.deposit_amount);
        
        if (isNaN(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.001) {
          return res.status(400).json({ 
            message: `المبلغ المطلوب للعربون هو ${expectedAmount} جنيه فقط` 
          });
        }

        const result = await withTransaction(async (client) => {
          // تحديث حالة الكود إذا كان مستخدماً
          if (pendingBooking.discount_code) {
            await client.query(
              'UPDATE discount_codes SET status = $1, used_by = $2, used_at = $3, used_for_booking = $4 WHERE code = $5',
              ['used', req.session.user.id, new Date(), pendingBooking.id, pendingBooking.discount_code]
            );
          }

          // تسجيل الدفعة
          const paymentRecord = {
            id: uuidv4(),
            booking_id: pendingBooking.id,
            payer_name: req.session.user.username,
            email: req.session.user.email,
            phone: req.session.user.phone,
            field: pendingBooking.pitch_name,
            hours: 1,
            transaction_id: transactionId,
            amount: paidAmount,
            payment_type: PAYMENT_TYPES.DEPOSIT,
            original_amount: pendingBooking.amount,
            remaining_amount: pendingBooking.remaining_amount,
            discount_applied: pendingBooking.applied_discount ? JSON.parse(pendingBooking.applied_discount).value : 0,
            provider: provider,
            provider_name: paymentConfig[provider].name,
            receipt_path: req.file ? `/uploads/${req.file.filename}` : null,
            date: new Date(),
            status: 'confirmed'
          };

          await client.query(
            `INSERT INTO payments (id, booking_id, payer_name, email, phone, field, hours, transaction_id, amount, 
             payment_type, original_amount, remaining_amount, discount_applied, provider, provider_name, receipt_path, date, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              paymentRecord.id, paymentRecord.booking_id, paymentRecord.payer_name, paymentRecord.email,
              paymentRecord.phone, paymentRecord.field, paymentRecord.hours, paymentRecord.transaction_id,
              paymentRecord.amount, paymentRecord.payment_type, paymentRecord.original_amount,
              paymentRecord.remaining_amount, paymentRecord.discount_applied, paymentRecord.provider,
              paymentRecord.provider_name, paymentRecord.receipt_path, paymentRecord.date, paymentRecord.status
            ]
          );

          // تحديث حالة الحجز
          await client.query(
            'UPDATE bookings SET status = $1, paid_amount = $2, remaining_amount = $3, updated_at = $4 WHERE id = $5',
            [BOOKING_STATUS.CONFIRMED, paidAmount, pendingBooking.amount - paidAmount, new Date(), pendingBooking.id]
          );

          return paymentRecord;
        });

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
                    <p><strong>الملعب:</strong> ${pendingBooking.pitch_name}</p>
                    <p><strong>الموقع:</strong> ${pendingBooking.pitch_location}</p>
                    <p><strong>التاريخ:</strong> ${pendingBooking.date}</p>
                    <p><strong>الوقت:</strong> ${pendingBooking.time}</p>
                    <p><strong>السعر الكامل:</strong> ${pendingBooking.amount} جنيه</p>
                    <p><strong>العربون المدفوع:</strong> ${amount} جنيه</p>
                    <p><strong>المبلغ المتبقي:</strong> ${pendingBooking.remaining_amount} جنيه</p>
                    ${pendingBooking.applied_discount ? `
                      <p><strong>الخصم:</strong> ${JSON.parse(pendingBooking.applied_discount).value} جنيه</p>
                      <p><strong>كود الخصم:</strong> ${JSON.parse(pendingBooking.applied_discount).code}</p>
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
          paymentId: result.id,
          success: true
        });

      } catch (error) {
        logger.error('Payment error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء معالجة الدفع' });
      }
    });

    // معالجة الدفع بالأكواد
    app.post('/api/process-voucher-payment', paymentLimiter, async (req, res) => {
      try {
        await withTransaction(async (client) => {
          const { bookingId, voucherCodes = [] } = req.body;
          
          if (!bookingId) {
            throw { status: 400, message: 'معرف الحجز مطلوب' };
          }

          // الحصول على معلومات الحجز
          const bookings = await client.query(
            'SELECT * FROM new_bookings WHERE id = $1',
            [bookingId]
          );

          if (bookings.rows.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings.rows[0];

          let totalVoucherValue = 0;
          const usedCodes = new Set();
          const validVouchers = [];

          // التحقق من جميع الأكواد
          for (const voucherCode of voucherCodes) {
            if (usedCodes.has(voucherCode)) {
              throw { status: 400, message: `الكود ${voucherCode} مكرر` };
            }

            const vouchers = await client.query(
              'SELECT * FROM voucher_codes WHERE code = $1 AND is_used = FALSE',
              [voucherCode.toUpperCase()]
            );

            if (vouchers.rows.length === 0) {
              throw { status: 400, message: `الكود ${voucherCode} غير صالح` };
            }

            const voucher = vouchers.rows[0];
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
            await client.query(
              'UPDATE voucher_codes SET is_used = TRUE, used_at = NOW(), used_for_booking = $1 WHERE id = $2',
              [bookingId, voucher.id]
            );
          }

          // تحديث حالة الحجز
          await client.query(
            'UPDATE new_bookings SET deposit_paid = TRUE, status = $1, remaining_amount = $2 WHERE id = $3',
            ['confirmed', parseFloat(booking.total_amount) - parseFloat(booking.deposit_amount), bookingId]
          );

          // تحديث حالة الساعة
          await client.query(
            'UPDATE time_slots SET status = $1 WHERE id = $2',
            ['booked', booking.time_slot_id]
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
        const { value, quantity = 1, type = 'VOUCHER' } = req.body;
        
        if (!value || value <= 0) {
          return res.status(400).json({ message: 'قيمة الكود مطلوبة ويجب أن تكون أكبر من الصفر' });
        }

        const vouchers = [];

        for (let i = 0; i < quantity; i++) {
          const voucher = {
            id: uuidv4(),
            code: generateVoucherCode(),
            value: parseFloat(value),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 يوم
            type: type
          };

          await execQuery(
            'INSERT INTO voucher_codes (id, code, value, expires_at, type) VALUES ($1, $2, $3, $4, $5)',
            [voucher.id, voucher.code, voucher.value, voucher.expires_at, voucher.type]
          );

          vouchers.push(voucher);
        }

        res.json({ 
          message: `تم إنشاء ${quantity} كود بنجاح`,
          vouchers: vouchers
        });

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

        for (let i = 0; i < quantity; i++) {
          const code = generateDiscountCode(8);
          const pitch = pitchId ? pitchesData.find(p => p.id === parseInt(pitchId)) : null;
          
          const newCode = {
            id: uuidv4(),
            code: code,
            value: parseInt(value),
            type: type,
            pitch_id: pitchId ? parseInt(pitchId) : null,
            pitch_name: pitch ? pitch.name : null,
            source: source,
            status: 'active',
            created_at: new Date(),
            expires_at: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            message: type === CODE_TYPES.COMPENSATION ? 
              'هذا الكود التعويضي صالح لمدة 14 يوم من تاريخ الإلغاء' : null
          };

          await execQuery(
            `INSERT INTO discount_codes (id, code, value, type, pitch_id, pitch_name, source, status, created_at, expires_at, message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              newCode.id, newCode.code, newCode.value, newCode.type, newCode.pitch_id,
              newCode.pitch_name, newCode.source, newCode.status, newCode.created_at,
              newCode.expires_at, newCode.message
            ]
          );

          newCodes.push(newCode);
        }

        res.json({ 
          message: `تم إنشاء ${quantity} كود بنجاح`,
          codes: newCodes
        });

      } catch (error) {
        logger.error('Create discount codes error', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الأكواد' });
      }
    });

    // الحصول على جميع الأكواد
    app.get('/api/admin/discount-codes', requireAdmin, async (req, res) => {
      try {
        const discountCodes = await execQuery('SELECT * FROM discount_codes ORDER BY created_at DESC');
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
          'SELECT * FROM discount_codes WHERE code = $1 AND status = $2',
          [code.toUpperCase(), 'active']
        );

        if (discountCodes.length === 0) {
          return res.status(404).json({ message: 'الكود غير صالح أو منتهي' });
        }

        const discountCode = discountCodes[0];

        // التحقق من تاريخ الصلاحية
        const now = new Date();
        const expiresAt = new Date(discountCode.expires_at);
        if (now > expiresAt) {
          return res.status(400).json({ message: 'الكود منتهي الصلاحية' });
        }

        // التحقق من أن الكود خاص بملعب معين
        if (discountCode.type === CODE_TYPES.PITCH && discountCode.pitch_id !== parseInt(pitchId)) {
          return res.status(400).json({ 
            message: `هذا الكود خاص بملعب: ${discountCode.pitch_name}` 
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

        await withTransaction(async (client) => {
          const discountCodes = await client.query(
            'SELECT * FROM discount_codes WHERE code = $1',
            [code.toUpperCase()]
          );
          
          const discountCode = discountCodes.rows[0];
          if (!discountCode) {
            throw { status: 404, message: 'الكود غير موجود' };
          }

          if (discountCode.status !== 'active') {
            throw { status: 400, message: 'الكود مستخدم بالفعل' };
          }

          // تحديث حالة الكود
          await client.query(
            'UPDATE discount_codes SET status = $1, used_by = $2, used_at = $3, used_for_booking = $4 WHERE code = $5',
            ['used', req.session.user.id, new Date(), bookingId, code.toUpperCase()]
          );

          return discountCode.value;
        });
        
        res.json({
          message: 'تم استخدام الكود بنجاح',
          discount: discountCode.value
        });

      } catch (error) {
        logger.error('Use discount code error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء استخدام الكود' });
        }
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
          'SELECT id FROM ratings WHERE pitch_id = $1 AND user_id = $2',
          [pitchId, req.session.user.id]
        );

        if (existingRatings.length > 0) {
          return res.status(400).json({ message: 'لقد قمت بتقييم هذا الملعب من قبل' });
        }

        const newRating = {
          id: uuidv4(),
          pitch_id: parseInt(pitchId),
          user_id: req.session.user.id,
          username: req.session.user.username,
          rating: parseInt(rating),
          comment: comment || '',
          booking_id: bookingId || null,
          created_at: new Date(),
          status: 'active'
        };

        await execQuery(
          `INSERT INTO ratings (id, pitch_id, user_id, username, rating, comment, booking_id, created_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            newRating.id, newRating.pitch_id, newRating.user_id, newRating.username,
            newRating.rating, newRating.comment, newRating.booking_id, newRating.created_at,
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
          'SELECT * FROM ratings WHERE pitch_id = $1 AND status = $2 ORDER BY created_at DESC',
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
          'SELECT * FROM user_profiles WHERE user_id = $1',
          [req.session.user.id]
        );
        
        if (userProfiles.length === 0) {
          return res.status(404).json({ message: 'الملف الشخصي غير موجود' });
        }

        const userProfile = userProfiles[0];

        // إحصائيات المستخدم
        const bookings = await execQuery(
          'SELECT * FROM bookings WHERE user_id = $1',
          [req.session.user.id]
        );
        
        const stats = {
          totalBookings: bookings.length,
          successfulBookings: bookings.filter(b => b.status === 'confirmed').length,
          cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
          totalSpent: bookings
            .filter(b => b.status === 'confirmed')
            .reduce((total, booking) => total + (booking.final_amount || booking.amount), 0)
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
          last_updated: new Date()
        };

        if (req.file) {
          updateData.avatar = `/uploads/${req.file.filename}`;
        }

        await execQuery(
          'UPDATE user_profiles SET nickname = $1, age = $2, bio = $3, avatar = $4, last_updated = $5 WHERE user_id = $6',
          [updateData.nickname, updateData.age, updateData.bio, updateData.avatar, updateData.last_updated, req.session.user.id]
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
          'SELECT * FROM discount_codes WHERE user_id = $1 AND type = $2 AND status = $3',
          [req.session.user.id, CODE_TYPES.COMPENSATION, 'active']
        );

        // إزالة الأكواد المنتهية الصلاحية
        const now = new Date();
        const validCodes = discountCodes.filter(dc => {
          const expiresAt = new Date(dc.expires_at);
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
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [name, description, JSON.stringify(images || []), max_daily_hours, max_weekly_hours]
        );

        // إنشاء الساعات الافتراضية للملعب الجديد
        await createDefaultTimeSlots(result[0].id);

        res.json({ 
          message: 'تم إضافة الملعب بنجاح',
          stadiumId: result[0].id,
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
           WHERE ts.stadium_id = $1 AND ts.date = $2 
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
           VALUES ($1, $2, $3, $4, $5, 'available') RETURNING id`,
          [stadiumId, date, startTime, endTime, price]
        );

        res.json({ 
          message: 'تم إضافة الساعة بنجاح',
          timeSlotId: result[0].id,
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
        const bookings = await execQuery('SELECT * FROM bookings');
        const payments = await execQuery('SELECT * FROM payments');
        const users = await execQuery('SELECT * FROM users');
        const discountCodes = await execQuery('SELECT * FROM discount_codes');
        const managers = await execQuery('SELECT * FROM managers');
        
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // الحجوزات الناجحة هذا الشهر
        const currentMonthBookings = bookings.filter(booking => {
          const bookingDate = new Date(booking.created_at);
          return bookingDate.getMonth() === currentMonth && 
                 bookingDate.getFullYear() === currentYear &&
                 booking.status === 'confirmed';
        });
        
        // إحصائيات مالية
        const currentMonthRevenue = currentMonthBookings.reduce((total, booking) => total + (booking.final_amount || booking.amount), 0);
        
        // المستخدمين النشطين
        const activeUsers = users.filter(u => {
          if (!u.last_login) return false;
          const lastLogin = new Date(u.last_login);
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
              const userDate = new Date(u.created_at);
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
        const bookings = await execQuery('SELECT * FROM bookings ORDER BY created_at DESC');
        res.json(bookings);
      } catch (error) {
        logger.error('Admin bookings error', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
      }
    });

    // المستخدمين
    app.get('/api/admin/users', requireAdmin, async (req, res) => {
      try {
        const users = await execQuery('SELECT id, username, email, phone, role, approved, created_at, last_login FROM users');
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
          'UPDATE payments SET status = $1, confirmed_at = $2, confirmed_by = $3 WHERE id = $4',
          ['confirmed', new Date(), req.session.user.email, paymentId]
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
          'UPDATE users SET approved = $1, updated_at = $2 WHERE id = $3',
          [true, new Date(), userId]
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
          'SELECT * FROM managers WHERE user_id = $1 AND approved = $2',
          [req.session.user.id, true]
        );
        
        if (managers.length === 0) {
          return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
        }

        const userManager = managers[0];
        let pitchIds = [];
        
        try {
          pitchIds = JSON.parse(userManager.pitch_ids);
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
          'SELECT * FROM managers WHERE user_id = $1 AND approved = $2',
          [req.session.user.id, true]
        );
        
        if (managers.length === 0) {
          return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
        }

        const userManager = managers[0];
        let pitchIds = [];
        
        try {
          pitchIds = JSON.parse(userManager.pitch_ids);
        } catch {
          pitchIds = [];
        }

        const managerBookings = await execQuery(
          'SELECT * FROM bookings WHERE pitch_id = ANY($1) ORDER BY created_at DESC',
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
          'SELECT * FROM managers WHERE user_id = $1 AND approved = $2',
          [req.session.user.id, true]
        );
        
        if (managers.length === 0) {
          return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
        }

        const userManager = managers[0];
        let pitchIds = [];
        
        try {
          pitchIds = JSON.parse(userManager.pitch_ids);
        } catch {
          pitchIds = [];
        }

        const bookings = await execQuery('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        const booking = bookings[0];
        
        if (!booking) {
          return res.status(404).json({ message: 'الحجز غير موجود' });
        }

        // التحقق من أن المدير يملك صلاحية إلغاء هذا الحجز
        if (!pitchIds.includes(booking.pitch_id)) {
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
          refundAmount = booking.paid_amount;
          compensationCode = await generateCompensationCode(booking, 'full_refund');
        } else if (hoursDiff > 24) {
          compensationCode = await generateCompensationCode(booking, 'partial_refund');
        }

        // تحديث حالة الحجز
        await execQuery(
          `UPDATE bookings SET status = $1, updated_at = $2, cancellation_time = $3, 
           cancellation_reason = $4, refund_amount = $5, compensation_code = $6, cancelled_by = $7 WHERE id = $8`,
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
           LEFT JOIN users u ON m.user_id = u.id
           WHERE m.approved = $1`,
          [false]
        );
        
        const pendingManagers = managers.map(manager => {
          let pitchIds = [];
          try {
            pitchIds = JSON.parse(manager.pitch_ids);
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
        
        await withTransaction(async (client) => {
          const managers = await client.query(
            'SELECT * FROM managers WHERE id = $1',
            [managerId]
          );
          
          const manager = managers.rows[0];
          if (!manager) {
            throw { status: 404, message: 'طلب المدير غير موجود' };
          }

          await client.query(
            'UPDATE managers SET approved = $1, approved_at = $2, approved_by = $3 WHERE id = $4',
            [true, new Date(), req.session.user.id, managerId]
          );
          
          await client.query(
            'UPDATE users SET approved = $1 WHERE id = $2',
            [true, manager.user_id]
          );

          // إرسال بريد الإعلام
          const users = await client.query(
            'SELECT email, username FROM users WHERE id = $1',
            [manager.user_id]
          );
          
          const user = users.rows[0];
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
        });

        res.json({ message: 'تمت الموافقة على المدير بنجاح' });

      } catch (error) {
        logger.error('Approve manager error', error);
        if (error.status) {
          res.status(error.status).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'حدث خطأ أثناء الموافقة على المدير' });
        }
      }
    });

    // رفض طلب مدير
    app.put('/api/admin/managers/:id/reject', requireAdmin, async (req, res) => {
      try {
        const managerId = req.params.id;
        const { rejectionReason } = req.body;
        
        await withTransaction(async (client) => {
          const managers = await client.query(
            'SELECT * FROM managers WHERE id = $1',
            [managerId]
          );
          
          const manager = managers.rows[0];
          if (!manager) {
            throw { status: 404, message: 'طلب المدير غير موجود' };
          }

          // حذف طلب المدير
          await client.query('DELETE FROM managers WHERE id = $1', [managerId]);
          
          // تحديث حالة المستخدم
          await client.query(
            'UPDATE users SET role = $1, approved = $2 WHERE id = $3',
            ['user', false, manager.user_id]
          );

          // إرسال بريد الرفض
          const users = await client.query(
            'SELECT email, username FROM users WHERE id = $1',
            [manager.user_id]
          );
          
          const user = users.rows[0];
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
        });

        res.json({ message: 'تم رفض طلب المدير بنجاح' });

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
          'SELECT * FROM deposit_rules WHERE stadium_id = $1',
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
          'SELECT id FROM deposit_rules WHERE stadium_id = $1',
          [id]
        );

        if (existingPolicies.length > 0) {
          await execQuery(
            `UPDATE deposit_rules 
             SET less_than_24_hours = $1, between_24_48_hours = $2, more_than_48_hours = $3, updated_at = $4
             WHERE stadium_id = $5`,
            [less_than_24_hours, between_24_48_hours, more_than_48_hours, new Date(), id]
          );
        } else {
          await execQuery(
            `INSERT INTO deposit_rules 
             (stadium_id, less_than_24_hours, between_24_48_hours, more_than_48_hours) 
             VALUES ($1, $2, $3, $4)`,
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
           WHERE sm.stadium_id = $1 AND sm.is_active = TRUE 
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
        const users = await execQuery('SELECT id FROM users WHERE id = $1', [user_id]);
        if (users.length === 0) {
          return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // التحقق من عدم تكرار المدير
        const existingManagers = await execQuery(
          'SELECT id FROM stadium_managers WHERE stadium_id = $1 AND user_id = $2',
          [id, user_id]
        );

        if (existingManagers.length > 0) {
          return res.status(400).json({ message: 'المستخدم مدير بالفعل على هذا الملعب' });
        }

        await execQuery(
          `INSERT INTO stadium_managers (stadium_id, user_id, role, permissions) 
           VALUES ($1, $2, $3, $4)`,
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
          'UPDATE stadium_managers SET is_active = FALSE WHERE stadium_id = $1 AND id = $2',
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
           WHERE bs.stadium_id = $1 AND bs.is_active = TRUE 
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
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
          'SELECT stadium_id FROM blocked_slots WHERE id = $1',
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
          'UPDATE blocked_slots SET is_active = $1, updated_at = $2 WHERE id = $3',
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
        const result = await withTransaction(async (client) => {
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
          const timeSlots = await client.query(
            `SELECT ts.*, s.name as stadium_name, s.price as stadium_price 
             FROM time_slots ts 
             JOIN stadiums s ON ts.stadium_id = s.id 
             WHERE ts.stadium_id = $1 AND ts.date = $2 AND ts.start_time = $3 AND ts.end_time = $4 AND ts.status = $5`,
            [stadiumId, date, startTime, endTime, 'available']
          );

          if (timeSlots.rows.length === 0) {
            throw { status: 400, message: 'هذه الساعة غير متاحة للحجز' };
          }

          const timeSlot = timeSlots.rows[0];

          // حساب العربون الديناميكي
          const bookingDateTime = `${date}T${startTime}`;
          const depositAmount = await calculateDynamicDeposit(stadiumId, timeSlot.stadium_price, bookingDateTime);
          
          // التحقق من الأكواد المستخدمة
          let totalVoucherValue = 0;
          const usedVouchers = [];

          for (const voucherCode of voucherCodes) {
            const vouchers = await client.query(
              'SELECT * FROM voucher_codes WHERE code = $1 AND is_used = FALSE',
              [voucherCode.toUpperCase()]
            );

            if (vouchers.rows.length === 0) {
              throw { status: 400, message: `الكود ${voucherCode} غير صالح` };
            }

            const voucher = vouchers.rows[0];
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
          await client.query(
            `INSERT INTO new_bookings (id, time_slot_id, customer_name, customer_phone, total_amount, 
             deposit_amount, players_needed, countdown_end, remaining_amount) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              newBooking.id, newBooking.time_slot_id, newBooking.customer_name, 
              newBooking.customer_phone, newBooking.total_amount, newBooking.deposit_amount,
              newBooking.players_needed, newBooking.countdown_end, newBooking.remaining_amount
            ]
          );

          // تحديث حالة الساعة
          const newStatus = playersNeeded > 0 ? 'golden' : 'pending';
          await client.query(
            'UPDATE time_slots SET status = $1, is_golden = $2 WHERE id = $3',
            [newStatus, playersNeeded > 0, timeSlot.id]
          );

          // تحديث حالة الأكواد المستخدمة
          for (const voucher of usedVouchers) {
            await client.query(
              'UPDATE voucher_codes SET is_used = TRUE, used_at = NOW(), used_for_booking = $1 WHERE id = $2',
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

        const result = await withTransaction(async (client) => {
          // الحصول على معلومات الحجز
          const bookings = await client.query(
            `SELECT b.*, ts.stadium_id, ts.date, ts.start_time 
             FROM new_bookings b 
             JOIN time_slots ts ON b.time_slot_id = ts.id 
             WHERE b.id = $1`,
            [bookingId]
          );

          if (bookings.rows.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings.rows[0];

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
          await client.query(
            'UPDATE new_bookings SET status = $1 WHERE id = $2',
            ['cancelled', bookingId]
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
           WHERE ts.stadium_id = $1 AND ts.date = $2 
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
              'SELECT COUNT(*) as count FROM stadium_managers WHERE stadium_id = $1 AND is_active = TRUE',
              [stadium.id]
            );

            // سياسة العربون
            const [policies] = await execQuery(
              'SELECT * FROM deposit_rules WHERE stadium_id = $1',
              [stadium.id]
            );

            // عدد المواعيد المحجوزة ثابتاً
            const [blockedSlots] = await execQuery(
              'SELECT COUNT(*) as count FROM blocked_slots WHERE stadium_id = $1 AND is_active = TRUE',
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
        await withTransaction(async (client) => {
          const { bookingId, voucherCodes = [], paymentMethod } = req.body;
          
          if (!bookingId) {
            throw { status: 400, message: 'معرف الحجز مطلوب' };
          }

          // الحصول على معلومات الحجز
          const bookings = await client.query(
            'SELECT * FROM new_bookings WHERE id = $1',
            [bookingId]
          );

          if (bookings.rows.length === 0) {
            throw { status: 404, message: 'الحجز غير موجود' };
          }

          const booking = bookings.rows[0];

          let totalVoucherValue = 0;
          const usedVouchers = [];

          // معالجة الأكواد
          for (const voucherCode of voucherCodes) {
            const vouchers = await client.query(
              'SELECT * FROM voucher_codes WHERE code = $1 AND is_used = FALSE',
              [voucherCode.toUpperCase()]
            );

            if (vouchers.rows.length === 0) {
              throw { status: 400, message: `الكود ${voucherCode} غير صالح` };
            }

            const voucher = vouchers.rows[0];
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
            await client.query(
              'UPDATE voucher_codes SET is_used = TRUE, used_at = NOW(), used_for_booking = $1 WHERE id = $2',
              [bookingId, voucher.id]
            );
          }

          // تحديث حالة الحجز
          await client.query(
            'UPDATE new_bookings SET deposit_paid = TRUE, status = $1, remaining_amount = $2 WHERE id = $3',
            ['confirmed', remainingAmount, bookingId]
          );

          // تحديث حالة الساعة
          await client.query(
            'UPDATE time_slots SET status = $1 WHERE id = $2',
            ['booked', booking.time_slot_id]
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
      logger.info(`🔌 PostgreSQL connected successfully`);
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
      logger.info(`   🗄️  Full PostgreSQL Support`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
