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
  },
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`, meta);
    }
  }
};

/* ========= الثوابت ========= */
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

/* ========= إعدادات الدفع ========= */
const paymentConfig = {
  vodafone: { name: 'Vodafone Cash', number: '01012345678', icon: '/icons/vodafone.png' },
  orange: { name: 'Orange Cash', number: '01287654321', icon: '/icons/orange.png' },
  etisalat: { name: 'Etisalat Cash', number: '01155556666', icon: '/icons/etisalat.png' },
  instapay: { name: 'InstaPay', number: 'yourname@instapay', icon: '/icons/instapay.png' }
};

/* ========= بيانات الملاعب ========= */
const pitchesData = [
  {
    id: 1, name: "نادي الطيارة - الملعب الرئيسي", location: "المقطم - شارع التسعين", area: "mokatam", 
    type: "artificial", image: "/images/tyara-1.jpg", price: 250, deposit: 75, depositRequired: true,
    features: ["نجيلة صناعية", "كشافات ليلية", "غرف تبديل", "موقف سيارات", "كافتيريا"],
    rating: 4.7, totalRatings: 128, coordinates: { lat: 30.0130, lng: 31.2929 },
    workingHours: { start: 8, end: 24 }, googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9"
  },
  {
    id: 2, name: "نادي الطيارة - الملعب الثاني", location: "المقطم - شارع التسعين", area: "mokatam",
    type: "artificial", image: "/images/tyara-2.jpg", price: 220, deposit: 66, depositRequired: true,
    features: ["نجيلة صناعية", "إضاءة ليلية", "غرف تبديل", "تدفئة"],
    rating: 4.5, totalRatings: 95, coordinates: { lat: 30.0135, lng: 31.2935 },
    workingHours: { start: 8, end: 24 }, googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9"
  },
  {
    id: 3, name: "الراعي الصالح", location: "المقطم - شارع 9", area: "mokatam", type: "natural",
    image: "/images/raei.jpg", price: 300, deposit: 90, depositRequired: true,
    features: ["نجيلة طبيعية", "مقاعد جماهير", "كافيتريا", "تدفئة", "ملحق طبي"],
    rating: 4.8, totalRatings: 156, coordinates: { lat: 30.0150, lng: 31.2950 },
    workingHours: { start: 7, end: 23 }, googleMaps: "https://maps.app.goo.gl/hUUReW3ZDQM9wwEj7"
  },
  {
    id: 4, name: "نادي الجزيرة", location: "الزمالك", area: "zamalek", type: "natural",
    image: "/images/gazira.jpg", price: 400, deposit: 120, depositRequired: true,
    features: ["نجيلة طبيعية", "مقاعد جماهير", "مسبح", "كافتيريا فاخرة", "تدفئة"],
    rating: 4.9, totalRatings: 89, coordinates: { lat: 30.0600, lng: 31.2200 },
    workingHours: { start: 6, end: 22 }, googleMaps: "https://maps.app.goo.gl/bgjs87hzfBZRnT7E6"
  },
  {
    id: 5, name: "نادي المقطم", location: "المقطم - المنطقة السياحية", area: "mokatam",
    type: "artificial", image: "/images/mokatam-club.jpg", price: 280, deposit: 84, depositRequired: true,
    features: ["نجيلة صناعية", "إضاءة ليلية", "غرف تبديل", "كافتيريا", "تدفئة"],
    rating: 4.6, totalRatings: 112, coordinates: { lat: 30.0160, lng: 31.2970 },
    workingHours: { start: 8, end: 24 }, googleMaps: "https://maps.app.goo.gl/d1txNjQ5BXwBkfZn7"
  },
  {
    id: 6, name: "نادي مصر للتأمين", location: "المقطم - شارع 90", area: "mokatam",
    type: "artificial", image: "/images/insurance.jpg", price: 270, deposit: 81, depositRequired: true,
    features: ["نجيلة صناعية", "كشافات قوية", "صالة ألعاب", "كافتيريا", "تدفئة"],
    rating: 4.4, totalRatings: 76, coordinates: { lat: 30.0140, lng: 31.2940 },
    workingHours: { start: 7, end: 23 }, googleMaps: "https://maps.app.goo.gl/QJkC5641j6RKk9W66"
  }
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

/* ========= دوال مساعدة قاعدة البيانات ========= */
async function initDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    logger.info('✅ MySQL pool established successfully');
    
    // تهيئة مخزن الجلسات
    sessionStore = new MySQLStore({}, pool);
    
    return true;
  } catch (error) {
    logger.error('❌ Failed to initialize database', error);
    throw error;
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

/* ========= Middlewares الأساسية ========= */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors());
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

/* ========= إعداد الجلسات ========= */
app.use(session({
  key: 'ehgzly_session',
  secret: process.env.SESSION_SECRET || 'change-this-in-production-2024',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

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

      await execQuery(
        `INSERT INTO users (id, username, email, phone, password, role, approved, provider, 
          emailVerified, verificationToken, googleId, createdAt, lastLogin, stats)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Object.values(newUser)
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

app.use(passport.initialize());
app.use(passport.session());

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

app.use(globalLimiter);

/* ========= CSRF Protection ========= */
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: isProduction
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
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('يجب أن يكون الملف صورة'), false);
    }
  }
});

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
  const egyptPhoneRegex = /^01[0-25][0-9]{8}$/;
  return egyptPhoneRegex.test(phone);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
}

/* ========= Routes الأساسية ========= */

// CSRF Token
app.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// المستخدم الحالي
app.get('/api/current-user', (req, res) => {
  res.json(req.session.user || null);
});

// الملاعب
app.get('/api/pitches', (req, res) => {
  res.json(pitchesData);
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

// الأوقات المتاحة
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

    const bookings = await execQuery(
      'SELECT time, status FROM bookings WHERE pitchId = ? AND date = ? AND status IN (?, ?)',
      [pitchId, date, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.PENDING]
    );

    let startHour, endHour;
    if (period === 'morning') {
      startHour = 8;
      endHour = 16;
    } else if (period === 'evening') {
      startHour = 17;
      endHour = 24;
    } else {
      startHour = pitch.workingHours.start;
      endHour = pitch.workingHours.end;
    }

    const availableSlots = [];
    const bookedSlots = bookings.map(booking => parseInt(booking.time.split(':')[0]));

    for (let hour = startHour; hour < endHour; hour++) {
      if (!bookedSlots.includes(hour)) {
        availableSlots.push(hour);
      }
    }

    res.json({
      pitch: pitch.name,
      date,
      period,
      availableSlots,
      bookedSlots,
      totalSlots: (endHour - startHour),
      availableCount: availableSlots.length
    });

  } catch (error) {
    logger.error('Get available slots error', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الأوقات المتاحة' });
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

/* ========= نظام المصادقة ========= */

// التسجيل
app.post('/signup', csrfProtection, async (req, res) => {
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

    await execQuery(
      `INSERT INTO users (id, username, email, phone, password, role, approved, provider, emailVerified, verificationToken, createdAt, stats)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Object.values(newUser)
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
app.post('/login', loginLimiter, csrfProtection, async (req, res) => {
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

/* ========= نظام الحجوزات ========= */

// إنشاء حجز جديد
app.post('/api/bookings', requireLogin, csrfProtection, async (req, res) => {
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

    await execQuery(
      `INSERT INTO bookings (id, pitchId, pitchName, pitchLocation, pitchPrice, depositAmount, date, time, 
        customerName, customerPhone, customerEmail, userId, userType, status, amount, paidAmount, 
        remainingAmount, finalAmount, appliedDiscount, discountCode, paymentType, createdAt, updatedAt, paymentDeadline)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Object.values(newBooking)
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

// الحصول على حجوزات المستخدم
app.get('/api/user/bookings', requireLogin, async (req, res) => {
  try {
    const bookings = await execQuery(
      'SELECT * FROM bookings WHERE userId = ? ORDER BY createdAt DESC',
      [req.session.user.id]
    );
    res.json(bookings);
  } catch (error) {
    logger.error('Get user bookings error', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
  }
});

// إلغاء الحجز
app.put('/api/bookings/:id/cancel', requireLogin, csrfProtection, async (req, res) => {
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

  await execQuery(
    `INSERT INTO discount_codes (id, code, value, type, source, status, createdAt, expiresAt, 
    originalBookingId, originalAmount, cancellationType, message, userId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Object.values(compensationCode)
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
    const url = await QRCode.toDataURL(req.params.wallet);
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
    field: pendingBooking.pitchName,
    date: pendingBooking.date,
    time: pendingBooking.time,
    hours: 1,
    amount: pendingBooking.finalAmount,
    originalAmount: pendingBooking.amount,
    discount: pendingBooking.appliedDiscount
  });
});

// معالجة الدفع
app.post('/api/payment', requireLogin, paymentLimiter, upload.single('receipt'), csrfProtection, async (req, res) => {
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

    // التحقق من أن المبلغ المدفوع هو العربون فقط
    if (parseInt(amount) !== pendingBooking.depositAmount) {
      return res.status(400).json({ 
        message: `المبلغ المطلوب للعربون هو ${pendingBooking.depositAmount} جنيه فقط` 
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
        amount: parseInt(amount),
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

      await connection.execute(
        `INSERT INTO payments (id, bookingId, payerName, email, phone, field, hours, transactionId, amount, 
        paymentType, originalAmount, remainingAmount, discountApplied, provider, providerName, receiptPath, date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Object.values(paymentRecord)
      );

      // تحديث حالة الحجز
      await connection.execute(
        'UPDATE bookings SET status = ?, paidAmount = ?, remainingAmount = ?, updatedAt = ? WHERE id = ?',
        [BOOKING_STATUS.CONFIRMED, parseInt(amount), pendingBooking.amount - parseInt(amount), new Date(), pendingBooking.id]
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

/* ========= نظام التقييمات ========= */

// إضافة تقييم جديد
app.post('/api/ratings', requireLogin, csrfProtection, async (req, res) => {
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

    await execQuery(
      `INSERT INTO ratings (id, pitchId, userId, username, rating, comment, bookingId, createdAt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Object.values(newRating)
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

/* ========= نظام الأكواد ========= */

// إنشاء أكواد جديدة
app.post('/api/admin/discount-codes', requireAdmin, csrfProtection, async (req, res) => {
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

        await connection.execute(
          `INSERT INTO discount_codes (id, code, value, type, pitchId, pitchName, source, status, createdAt, expiresAt, message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          Object.values(newCode)
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
app.post('/api/validate-discount-code', requireLogin, csrfProtection, async (req, res) => {
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
app.post('/api/use-discount-code', requireLogin, csrfProtection, async (req, res) => {
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
app.put('/api/user/profile', requireLogin, upload.single('avatar'), csrfProtection, async (req, res) => {
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
app.put('/api/admin/payments/:id/confirm', requireAdmin, csrfProtection, async (req, res) => {
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
app.put('/api/admin/users/:id/approve', requireAdmin, csrfProtection, async (req, res) => {
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
app.put('/api/manager/bookings/:id/cancel', requireManager, csrfProtection, async (req, res) => {
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
app.put('/api/admin/managers/:id/approve', requireAdmin, csrfProtection, async (req, res) => {
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
app.put('/api/admin/managers/:id/reject', requireAdmin, csrfProtection, async (req, res) => {
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

/* ========= الصفحات ========= */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', csrfProtection, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', csrfProtection, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/payment', requireLogin, csrfProtection, (req, res) => {
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

/* ========= بدء الخادم ========= */
async function startServer() {
  try {
    await initDatabase();
    initEmailService();
    
    app.listen(PORT, () => {
      logger.info(`✅ Server running on ${APP_URL}`);
      logger.info(`🔌 MySQL connected: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
      logger.info(`📧 Email service: ${process.env.EMAIL_HOST ? 'Configured' : 'Mock'}`);
      logger.info(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
      logger.info(`🏟️  Loaded ${pitchesData.length} pitches`);
      logger.info(`🔐 Admin access: /admin`);
      logger.info(`👨‍💼 Manager system: Active`);
      logger.info(`🎫 Discount codes system: Active`);
      logger.info(`⭐ Ratings system: Active`);
      logger.info(`🔐 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'Active' : 'Disabled'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
