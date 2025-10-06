require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const bodyParser    = require('body-parser');
const fs            = require('fs');
const path          = require('path');
const session       = require('express-session');
const bcrypt        = require('bcrypt');
const passport      = require('passport');
const GoogleStrategy= require('passport-google-oauth20').Strategy;
const nodemailer    = require('nodemailer');
const { v4: uuidv4 }= require('uuid');
const crypto        = require('crypto');
const QRCode        = require('qrcode');

// 🔐 مكتبات الأمان
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const cookieParser  = require('cookie-parser');
const csrf          = require('csurf');

// ⭐ رفع صورة الإيصال
const multer        = require('multer');

// 🆕 الثوابت الجديدة
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

// 🆕 إعداد تخزين الملفات
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('يجب أن يكون الملف صورة'), false);
    }
  }
});

// 🆕 إعدادات مزودي الدفع
const paymentConfig = {
  vodafone: { 
    name: 'Vodafone Cash', 
    number: '01012345678', 
    icon: '/icons/vodafone.png' 
  },
  orange: { 
    name: 'Orange Cash', 
    number: '01287654321', 
    icon: '/icons/orange.png' 
  },
  etisalat: { 
    name: 'Etisalat Cash', 
    number: '01155556666', 
    icon: '/icons/etisalat.png' 
  },
  instapay: { 
    name: 'InstaPay', 
    number: 'yourname@instapay', 
    icon: '/icons/instapay.png' 
  }
};

// 🆕 بيانات الملاعب الحقيقية مع العربون
const pitchesData = [
  {
    id: 1,
    name: "نادي الطيارة - الملعب الرئيسي",
    location: "المقطم - شارع التسعين",
    area: "mokatam",
    type: "artificial",
    image: "/images/tyara-1.jpg",
    price: 250,
    deposit: 75, // 30% عربون
    depositRequired: true,
    features: ["نجيلة صناعية", "كشافات ليلية", "غرف تبديل", "موقف سيارات", "كافتيريا"],
    rating: 4.7,
    totalRatings: 128,
    coordinates: { lat: 30.0130, lng: 31.2929 },
    workingHours: { start: 8, end: 24 },
    googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9"
  },
  {
    id: 2,
    name: "نادي الطيارة - الملعب الثاني",
    location: "المقطم - شارع التسعين",
    area: "mokatam",
    type: "artificial",
    image: "/images/tyara-2.jpg",
    price: 220,
    deposit: 66, // 30% عربون
    depositRequired: true,
    features: ["نجيلة صناعية", "إضاءة ليلية", "غرف تبديل", "تدفئة"],
    rating: 4.5,
    totalRatings: 95,
    coordinates: { lat: 30.0135, lng: 31.2935 },
    workingHours: { start: 8, end: 24 },
    googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9"
  },
  {
    id: 3,
    name: "الراعي الصالح",
    location: "المقطم - شارع 9",
    area: "mokatam",
    type: "natural",
    image: "/images/raei.jpg",
    price: 300,
    deposit: 90, // 30% عربون
    depositRequired: true,
    features: ["نجيلة طبيعية", "مقاعد جماهير", "كافيتريا", "تدفئة", "ملحق طبي"],
    rating: 4.8,
    totalRatings: 156,
    coordinates: { lat: 30.0150, lng: 31.2950 },
    workingHours: { start: 7, end: 23 },
    googleMaps: "https://maps.app.goo.gl/hUUReW3ZDQM9wwEj7"
  },
  {
    id: 4,
    name: "نادي الجزيرة",
    location: "الزمالك",
    area: "zamalek",
    type: "natural",
    image: "/images/gazira.jpg",
    price: 400,
    deposit: 120, // 30% عربون
    depositRequired: true,
    features: ["نجيلة طبيعية", "مقاعد جماهير", "مسبح", "كافتيريا فاخرة", "تدفئة"],
    rating: 4.9,
    totalRatings: 89,
    coordinates: { lat: 30.0600, lng: 31.2200 },
    workingHours: { start: 6, end: 22 },
    googleMaps: "https://maps.app.goo.gl/bgjs87hzfBZRnT7E6"
  },
  {
    id: 5,
    name: "نادي المقطم",
    location: "المقطم - المنطقة السياحية",
    area: "mokatam",
    type: "artificial",
    image: "/images/mokatam-club.jpg",
    price: 280,
    deposit: 84, // 30% عربون
    depositRequired: true,
    features: ["نجيلة صناعية", "إضاءة ليلية", "غرف تبديل", "كافتيريا", "تدفئة"],
    rating: 4.6,
    totalRatings: 112,
    coordinates: { lat: 30.0160, lng: 31.2970 },
    workingHours: { start: 8, end: 24 },
    googleMaps: "https://maps.app.goo.gl/d1txNjQ5BXwBkfZn7"
  },
  {
    id: 6,
    name: "نادي مصر للتأمين",
    location: "المقطم - شارع 90",
    area: "mokatam",
    type: "artificial",
    image: "/images/insurance.jpg",
    price: 270,
    deposit: 81, // 30% عربون
    depositRequired: true,
    features: ["نجيلة صناعية", "كشافات قوية", "صالة ألعاب", "كافتيريا", "تدفئة"],
    rating: 4.4,
    totalRatings: 76,
    coordinates: { lat: 30.0140, lng: 31.2940 },
    workingHours: { start: 7, end: 23 },
    googleMaps: "https://maps.app.goo.gl/QJkC5641j6RKk9W66"
  }
];

const app     = express();
const PORT    = 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

/* ========= Middlewares ========= */
app.use(helmet({
  contentSecurityPolicy: false // تعطيل مؤقت للتطوير
}));
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // تغيير لـ true في production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Rate limits
const globalLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 200
});
app.use(globalLimiter);

const loginLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 5
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10
});

// CSRF
const csrfProtection = csrf({ 
  cookie: {
    httpOnly: true,
    secure: false // تغيير لـ true في production
  }
});

/* ========= Helpers ========= */
const bookingsFile = path.join(__dirname, 'data', 'bookings.json');
const usersFile    = path.join(__dirname, 'data', 'users.json');
const paymentsFile = path.join(__dirname, 'data', 'payments.json');
const discountCodesFile = path.join(__dirname, 'data', 'discount-codes.json');
const ratingsFile = path.join(__dirname, 'data', 'ratings.json');
const userProfilesFile = path.join(__dirname, 'data', 'user-profiles.json');
// 🆕 إضافة ملف المديرين
const managersFile = path.join(__dirname, 'data', 'managers.json');

// تأكد من وجود مجلد data
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${file}:`, error);
    return [];
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${file}:`, error);
    throw error;
  }
}

function ensureFileExists(file) {
  if (!fs.existsSync(file)) {
    writeJSON(file, []);
  }
}

// تأكد من وجود الملفات
ensureFileExists(usersFile);
ensureFileExists(bookingsFile);
ensureFileExists(paymentsFile);
ensureFileExists(discountCodesFile);
ensureFileExists(ratingsFile);
ensureFileExists(userProfilesFile);
ensureFileExists(managersFile); // 🆕

// إنشاء مجلد uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/* ========= Nodemailer - بديل إذا لم توجد بيانات البريد ========= */
let transporter;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: { 
      user: process.env.EMAIL_USER, 
      pass: process.env.EMAIL_PASS 
    }
  });
} else {
  console.log('⚠️  running without email service - set EMAIL_USER and EMAIL_PASS for full functionality');
  // إنشاء transporter وهمي
  transporter = {
    sendMail: (options, callback) => {
      console.log('📧 Mock Email:', options);
      if (callback) callback(null, { messageId: 'mock' });
      return Promise.resolve({ messageId: 'mock' });
    },
    verify: (callback) => {
      if (callback) callback(null, true);
      return Promise.resolve(true);
    }
  };
}

/* ========= Passport ========= */
passport.serializeUser((user, done) => done(null, user.email));
passport.deserializeUser((email, done) => {
  const users = readJSON(usersFile);
  done(null, users.find(u => u.email === email) || null);
});

/* ========= Middleware للمستخدم ========= */
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ message: 'يجب تسجيل الدخول' });
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).json({ message: 'مسموح للمدير فقط' });
}

/* ========= نظام الأكواد ========= */

// 🆕 توليد كود عشوائي
function generateDiscountCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 🆕 تحديث إحصائيات المستخدم
function updateUserStats(userId, booking, action) {
  const users = readJSON(usersFile);
  const user = users.find(u => u.id === userId);
  
  if (!user) return;

  if (!user.stats) {
    user.stats = {
      totalBookings: 0,
      successfulBookings: 0,
      cancelledBookings: 0,
      totalSpent: 0
    };
  }

  if (action === 'booking') {
    user.stats.totalBookings++;
  } else if (action === 'confirmation') {
    user.stats.successfulBookings++;
    user.stats.totalSpent += (booking.finalAmount || booking.amount);
  } else if (action === 'cancellation') {
    user.stats.cancelledBookings++;
  }

  writeJSON(usersFile, users);
}

// 🆕 دالة لحساب العربون بناءً على الوقت المتبقي
function calculateDeposit(pitchPrice, bookingDate) {
    const now = new Date();
    const bookingDateTime = new Date(bookingDate);
    const timeDiff = bookingDateTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    // إذا كان أقل من 24 ساعة، العربون صفر
    if (hoursDiff < 24) {
        return 0;
    }
    
    // إذا كان بين 24 و48 ساعة، العربون 50%
    if (hoursDiff < 48) {
        return Math.floor(pitchPrice * 0.5);
    }
    
    // إذا كان أكثر من 48 ساعة، العربون 30%
    return Math.floor(pitchPrice * 0.3);
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
    console.error('Get pitch error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب بيانات الملعب' });
  }
});

// الأوقات المتاحة - النظام المطور
app.get('/api/pitches/:id/available-slots', (req, res) => {
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

    const bookings = readJSON(bookingsFile);
    const pitchBookings = bookings.filter(booking => 
      booking.pitchId === pitchId && 
      booking.date === date && 
      (booking.status === BOOKING_STATUS.CONFIRMED || booking.status === BOOKING_STATUS.PENDING)
    );

    // تحديد الفترة الزمنية
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
    const bookedSlots = pitchBookings.map(booking => {
      const hour = parseInt(booking.time.split(':')[0]);
      return hour;
    });

    // توليد الأوقات المتاحة فقط
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
    console.error('Get available slots error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الأوقات المتاحة' });
  }
});

/* ========= نظام الملفات الشخصية ========= */

// الحصول على الملف الشخصي
app.get('/api/user/profile', requireLogin, (req, res) => {
  try {
    const userProfiles = readJSON(userProfilesFile);
    const userProfile = userProfiles.find(profile => profile.userId === req.session.user.id);
    
    if (!userProfile) {
      return res.status(404).json({ message: 'الملف الشخصي غير موجود' });
    }

    // إحصائيات المستخدم
    const bookings = readJSON(bookingsFile);
    const userBookings = bookings.filter(booking => booking.userId === req.session.user.id);
    
    const stats = {
      totalBookings: userBookings.length,
      successfulBookings: userBookings.filter(b => b.status === 'confirmed').length,
      cancelledBookings: userBookings.filter(b => b.status === 'cancelled').length,
      totalSpent: userBookings
        .filter(b => b.status === 'confirmed')
        .reduce((total, booking) => total + (booking.finalAmount || booking.amount), 0)
    };

    res.json({
      profile: userProfile,
      stats: stats
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الملف الشخصي' });
  }
});

// تحديث الملف الشخصي
app.put('/api/user/profile', requireLogin, upload.single('avatar'), csrfProtection, (req, res) => {
  try {
    const { nickname, age, bio } = req.body;
    
    const userProfiles = readJSON(userProfilesFile);
    const userProfile = userProfiles.find(profile => profile.userId === req.session.user.id);
    
    if (!userProfile) {
      return res.status(404).json({ message: 'الملف الشخصي غير موجود' });
    }

    // تحديث البيانات
    if (nickname) userProfile.nickname = nickname;
    if (age) userProfile.age = parseInt(age);
    if (bio !== undefined) userProfile.bio = bio;
    
    if (req.file) {
      userProfile.avatar = `/uploads/${req.file.filename}`;
    }
    
    userProfile.lastUpdated = new Date().toISOString();

    writeJSON(userProfilesFile, userProfiles);

    res.json({
      message: 'تم تحديث الملف الشخصي بنجاح',
      profile: userProfile
    });

  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث الملف الشخصي' });
  }
});

// 🆕 الحصول على أكواد التعويض للمستخدم
app.get('/api/user/compensation-codes', requireLogin, (req, res) => {
  try {
    const discountCodes = readJSON(discountCodesFile);
    const userCompensationCodes = discountCodes.filter(dc => 
      dc.userId === req.session.user.id && 
      dc.type === CODE_TYPES.COMPENSATION &&
      dc.status === 'active'
    );

    // إزالة الأكواد المنتهية الصلاحية
    const now = new Date();
    const validCodes = userCompensationCodes.filter(dc => {
      const expiresAt = new Date(dc.expiresAt);
      return expiresAt > now;
    });

    res.json(validCodes);

  } catch (error) {
    console.error('Get compensation codes error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب أكواد التعويض' });
  }
});

/* ========= Authentication ========= */

// Signup - المحدث
app.post('/signup', csrfProtection, async (req, res) => {
  try {
    const { username, email, phone, password, role, nickname, age, bio, pitchIds } = req.body;
    
    if (!username || !email || !phone || !password || !role) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    // إذا كان مدير، يجب اختيار ملاعب
    if (role === 'manager' && (!pitchIds || pitchIds.length === 0)) {
      return res.status(400).json({ message: 'يجب اختيار ملاعب للإدارة' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'البريد الإلكتروني غير صالح' });
    }

    const egyptPhoneRegex = /^01[0-2,5]{1}[0-9]{8}$/;
    if (!egyptPhoneRegex.test(phone)) {
      return res.status(400).json({ message: 'رقم الهاتف غير صالح' });
    }

    const users = readJSON(usersFile);
    
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل' });
    }
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ message: 'البريد الإلكتروني مستخدم بالفعل' });
    }
    if (users.find(u => u.phone === phone)) {
      return res.status(400).json({ message: 'رقم الهاتف مستخدم بالفعل' });
    }

    const hash = await bcrypt.hash(password, 12);
    const verificationToken = uuidv4();

    const newUser = {
      id: uuidv4(),
      username,
      email,
      phone,
      password: hash,
      role: role === 'admin' ? 'admin' : (role === 'manager' ? 'manager' : 'user'),
      approved: role === 'admin' ? false : (role === 'manager' ? false : true),
      provider: 'local',
      emailVerified: false,
      verificationToken,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      stats: {
        totalBookings: 0,
        successfulBookings: 0,
        cancelledBookings: 0,
        totalSpent: 0
      }
    };

    users.push(newUser);
    writeJSON(usersFile, users);

    // 🆕 إذا كان مدير، إنشاء سجل مدير
    if (role === 'manager') {
      const managers = readJSON(managersFile);
      const newManager = {
        id: uuidv4(),
        userId: newUser.id,
        pitchIds: pitchIds.map(id => parseInt(id)),
        approved: false,
        createdAt: new Date().toISOString()
      };
      managers.push(newManager);
      writeJSON(managersFile, managers);
    }

    // 🆕 إنشاء ملف شخصي للمستخدم
    const userProfiles = readJSON(userProfilesFile);
    const userProfile = {
      userId: newUser.id,
      nickname: nickname || username,
      age: age || null,
      bio: bio || '',
      avatar: null,
      joinDate: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    userProfiles.push(userProfile);
    writeJSON(userProfilesFile, userProfiles);

    // إرسال بريد التفعيل
    const verificationLink = `${APP_URL}/verify-email?token=${verificationToken}`;
    
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@ehgzly.com',
      to: email,
      subject: role === 'manager' ? 'طلب تسجيل مدير - احجزلي' : 'تفعيل حسابك - احجزلي',
      html: `
        <div style="font-family: 'Cairo', Arial, sans-serif; text-align: center; direction: rtl; padding: 20px; background: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #1a7f46; margin-bottom: 20px;">مرحباً ${username}!</h2>
            ${role === 'manager' ? `
              <p style="color: #666; margin-bottom: 20px;">شكراً لتسجيلك كمدير في احجزلي. سيتم مراجعة طلبك والموافقة عليه من قبل الإدارة.</p>
              <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p style="color: #856404; margin: 0;">سيتم إعلامك بالبريد الإلكتروني عند الموافقة على طلبك</p>
              </div>
            ` : `
              <p style="color: #666; margin-bottom: 20px;">شكراً لتسجيلك في احجزلي. يرجى تفعيل حسابك بالضغط على الرابط أدناه:</p>
              <a href="${verificationLink}" style="background: #1a7f46; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">
                تفعيل الحساب
              </a>
            `}
            <p style="color: #999; margin-top: 20px; font-size: 14px;">إذا لم تطلب هذا الرابط، يمكنك تجاهل هذه الرسالة.</p>
          </div>
        </div>
      `
    }).catch(err => {
      console.log('❌ Failed to send email:', err);
    });

    res.json({ 
      message: role === 'manager' ? 
        'تم إرسال طلب التسجيل كمدير بنجاح. سيتم مراجعته والموافقة عليه من قبل الإدارة.' :
        'تم إنشاء الحساب بنجاح. يرجى فحص بريدك الإلكتروني للتفعيل.',
      success: true 
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب' });
  }
});

// تفعيل البريد
app.get('/verify-email', (req, res) => {
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

  const users = readJSON(usersFile);
  const user = users.find(u => u.verificationToken === token);
  
  if (!user) {
    return res.status(400).send(`
      <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
        <h2 style="color: #dc3545;">رابط غير صالح أو منتهي</h2>
        <p>رابط التفعيل غير صالح أو انتهت صلاحيته.</p>
        <a href="/login" style="color: #1a7f46;">العودة لتسجيل الدخول</a>
      </div>
    `);
  }
  
  user.emailVerified = true;
  user.verificationToken = null;
  writeJSON(usersFile, users);
  
  res.send(`
    <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
      <h2 style="color: #1a7f46;">تم تفعيل حسابك بنجاح! 🎉</h2>
      <p>يمكنك الآن تسجيل الدخول إلى حسابك.</p>
      <a href="/login" style="background: #1a7f46; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
        تسجيل الدخول
      </a>
    </div>
  `);
});

// Login
app.post('/login', loginLimiter, csrfProtection, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'يرجى إدخال البريد وكلمة المرور' });
    }

    const users = readJSON(usersFile);
    const user = users.find(u => u.email === email && u.provider === 'local');
    
    if (!user) {
      return res.status(401).json({ message: 'البريد أو كلمة المرور غير صحيحة' });
    }

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
    user.lastLogin = new Date().toISOString();
    writeJSON(usersFile, users);

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
    console.error('Login error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'خطأ في تسجيل الخروج' });
    }
    res.json({ message: 'تم تسجيل الخروج' });
  });
});

/* ========= Booking System - النظام المطور ========= */

// الحجز الجديد - المطور
app.post('/api/bookings', requireLogin, csrfProtection, (req, res) => {
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

    const bookings = readJSON(bookingsFile);
    
    // 🆕 التحقق من عدد الحجوزات للعميل العادي
    if (userType !== 'manager') {
      const userBookingsToday = bookings.filter(booking => 
        booking.userId === req.session.user.id &&
        booking.date === date &&
        booking.status === BOOKING_STATUS.CONFIRMED
      );
      
      if (userBookingsToday.length >= 3) {
        return res.status(400).json({ message: 'لا يمكنك الحجز أكثر من 3 ساعات في اليوم' });
      }
    }

    // التحقق من عدم وجود حجز مسبق
    const existingBooking = bookings.find(booking => 
      booking.pitchId === parseInt(pitchId) &&
      booking.date === date &&
      booking.time === time &&
      (booking.status === BOOKING_STATUS.CONFIRMED || booking.status === BOOKING_STATUS.PENDING)
    );

    if (existingBooking) {
      return res.status(400).json({ message: 'هذا الوقت محجوز بالفعل' });
    }

    // 🆕 حساب العربون تلقائياً
    const depositAmount = calculateDeposit(pitch.price, date);
    let finalAmount = depositAmount;
    let appliedDiscount = null;
    let remainingAmount = pitch.price - depositAmount;

    // تطبيق الكود الخصم إذا كان موجوداً
    if (discountCode) {
      const discountCodes = readJSON(discountCodesFile);
      const validCode = discountCodes.find(dc => 
        dc.code === discountCode.toUpperCase() && 
        dc.status === 'active'
      );

      if (validCode) {
        // تطبيق الخصم على المبلغ المتبقي فقط
        const discountOnRemaining = Math.min(validCode.value, remainingAmount);
        remainingAmount = Math.max(0, remainingAmount - discountOnRemaining);
        appliedDiscount = {
          code: validCode.code,
          value: discountOnRemaining,
          originalPrice: pitch.price,
          finalPrice: pitch.price - discountOnRemaining,
          remainingAmount: remainingAmount
        };
      }
    }

    const newBooking = {
      id: uuidv4(),
      pitchId: parseInt(pitchId),
      pitchName: pitch.name,
      pitchLocation: pitch.location,
      pitchPrice: pitch.price,
      depositAmount: depositAmount,
      date,
      time,
      customerName: name,
      customerPhone: phone,
      customerEmail: email || req.session.user.email,
      userId: req.session.user.id,
      userType: userType || 'customer',
      status: BOOKING_STATUS.PENDING,
      amount: pitch.price,
      paidAmount: 0,
      remainingAmount: pitch.price,
      finalAmount: finalAmount,
      appliedDiscount: appliedDiscount,
      discountCode: discountCode || null,
      paymentType: PAYMENT_TYPES.DEPOSIT,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentDeadline: new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000).toISOString() // 24 ساعة قبل الحجز
    };

    bookings.push(newBooking);
    writeJSON(bookingsFile, bookings);

    // تحديث إحصائيات المستخدم
    updateUserStats(req.session.user.id, newBooking, 'booking');

    // حفظ الحجز في الجلسة للدفع
    req.session.pendingBooking = newBooking;

    res.json({ 
      message: depositAmount === 0 ? 
        'تم إنشاء الحجز بنجاح. لا يوجد عربون مطلوب.' :
        'تم إنشاء الحجز بنجاح. يرجى دفع العربون لتأكيد الحجز.',
      booking: newBooking,
      paymentRequired: depositAmount > 0,
      depositAmount: depositAmount,
      remainingAmount: remainingAmount
    });

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء الحجز' });
  }
});

// 🆕 الحصول على حجوزات المستخدم
app.get('/api/user/bookings', requireLogin, (req, res) => {
  try {
    const bookings = readJSON(bookingsFile);
    const userBookings = bookings.filter(booking => booking.userId === req.session.user.id);
    res.json(userBookings);
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
  }
});

// 🆕 نظام الإلغاء المطور
app.put('/api/bookings/:id/cancel', requireLogin, csrfProtection, (req, res) => {
  try {
    const bookingId = req.params.id;
    const { cancellationReason } = req.body;
    
    const bookings = readJSON(bookingsFile);
    const booking = bookings.find(b => b.id === bookingId);
    
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
      // إلغاء قبل 48 ساعة - استرداد كامل + كود تعويض
      refundAmount = booking.paidAmount;
      compensationCode = generateCompensationCode(booking, 'full_refund');
    } else if (hoursDiff > 24) {
      // إلغاء قبل 24 ساعة - كود تعويض فقط
      compensationCode = generateCompensationCode(booking, 'partial_refund');
    } else {
      // إلغاء أقل من 24 ساعة - لا يوجد تعويض
      refundAmount = 0;
    }

    // تحديث حالة الحجز
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.updatedAt = new Date().toISOString();
    booking.cancellationTime = new Date().toISOString();
    booking.cancellationReason = cancellationReason;
    booking.refundAmount = refundAmount;
    booking.compensationCode = compensationCode ? compensationCode.code : null;
    
    writeJSON(bookingsFile, bookings);

    // تحديث إحصائيات المستخدم
    updateUserStats(req.session.user.id, booking, 'cancellation');

    // إرسال بريد بالإلغاء والتعويض
    sendCancellationEmail(booking, compensationCode, refundAmount);

    res.json({ 
      message: 'تم إلغاء الحجز بنجاح',
      booking,
      refundAmount,
      compensationCode,
      policy: hoursDiff > 48 ? 'استرداد كامل + كود تعويض' : 
              hoursDiff > 24 ? 'كود تعويض فقط' : 'لا يوجد تعويض'
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
  }
});

// 🆕 دالة إنشاء كود التعويض
function generateCompensationCode(booking, type) {
  const discountCodes = readJSON(discountCodesFile);
  
  let compensationValue = 0;
  let message = '';

  if (type === 'full_refund') {
    compensationValue = Math.floor(booking.paidAmount * 0.8); // 80% من العربون
    message = 'كود تعويض عن إلغاء الحجز مع استرداد كامل المبلغ. صالح لمدة 14 يوم.';
  } else {
    compensationValue = Math.floor(booking.paidAmount * 0.5); // 50% من العربون
    message = 'كود تعويض عن إلغاء الحجز. صالح لمدة 14 يوم.';
  }

  const compensationCode = {
    id: uuidv4(),
    code: generateDiscountCode(10),
    value: compensationValue,
    type: CODE_TYPES.COMPENSATION,
    source: CODE_SOURCES.CANCELLATION,
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    originalBookingId: booking.id,
    originalAmount: booking.paidAmount,
    cancellationType: type,
    message: message,
    userId: booking.userId
  };

  discountCodes.push(compensationCode);
  writeJSON(discountCodesFile, discountCodes);

  return compensationCode;
}

// 🆕 إرسال بريد الإلغاء
async function sendCancellationEmail(booking, compensationCode, refundAmount) {
  const user = booking.customerEmail;
  
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

  await transporter.sendMail({
    from: process.env.EMAIL_USER || 'noreply@ehgzly.com',
    to: user,
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
  }).catch(err => {
    console.log('Failed to send cancellation email:', err);
  });
}

/* ========= Payment System - النظام المطور ========= */

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
    console.error('QR generation error:', err);
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

// معالجة الدفع - المطور (العربون فقط)
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

    const userData = req.session.user;
    const payments = readJSON(paymentsFile);

    // التحقق من أن المبلغ المدفوع هو العربون فقط
    if (parseInt(amount) !== pendingBooking.depositAmount) {
      return res.status(400).json({ 
        message: `المبلغ المطلوب للعربون هو ${pendingBooking.depositAmount} جنيه فقط` 
      });
    }

    // تحديث حالة الكود إذا كان مستخدماً
    if (pendingBooking.discountCode) {
      const discountCodes = readJSON(discountCodesFile);
      const usedCode = discountCodes.find(dc => dc.code === pendingBooking.discountCode);
      
      if (usedCode && usedCode.status === 'active') {
        usedCode.status = 'used';
        usedCode.usedBy = userData.id;
        usedCode.usedAt = new Date().toISOString();
        usedCode.usedForBooking = pendingBooking.id;
        writeJSON(discountCodesFile, discountCodes);
      }
    }

    const paymentRecord = {
      id: uuidv4(),
      bookingId: pendingBooking.id,
      payerName: userData.username,
      email: userData.email,
      phone: userData.phone,
      field: pendingBooking.pitchName,
      hours: 1,
      transactionId,
      amount: parseInt(amount),
      paymentType: PAYMENT_TYPES.DEPOSIT,
      originalAmount: pendingBooking.amount,
      remainingAmount: pendingBooking.remainingAmount,
      discountApplied: pendingBooking.appliedDiscount ? pendingBooking.appliedDiscount.value : 0,
      provider: provider,
      providerName: paymentConfig[provider].name,
      receiptPath: req.file ? `/uploads/${req.file.filename}` : null,
      date: new Date().toISOString(),
      status: 'confirmed'
    };
    
    payments.push(paymentRecord);
    writeJSON(paymentsFile, payments);

    // تحديث حالة الحجز إلى confirmed
    const bookings = readJSON(bookingsFile);
    const booking = bookings.find(b => b.id === pendingBooking.id);
    if (booking) {
      booking.status = BOOKING_STATUS.CONFIRMED;
      booking.paidAmount = parseInt(amount);
      booking.remainingAmount = booking.amount - parseInt(amount);
      booking.updatedAt = new Date().toISOString();
      writeJSON(bookingsFile, bookings);
    }

    // تحديث إحصائيات المستخدم
    updateUserStats(userData.id, booking, 'confirmation');

    // مسح الحجز المعلق من الجلسة
    delete req.session.pendingBooking;

    // إرسال بريد التأكيد
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@ehgzly.com',
      to: userData.email,
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
                <p><strong>الخصم:</strong> ${pendingBooking.appliedDiscount.value} جنيه</p>
                <p><strong>كود الخصم:</strong> ${pendingBooking.appliedDiscount.code}</p>
              ` : ''}
              <p><strong>طريقة الدفع:</strong> ${paymentConfig[provider].name}</p>
              <p style="color: #e74c3c; font-weight: bold;">يرجى دفع المبلغ المتبقي قبل 48 ساعة من موعد الحجز</p>
            </div>
            <p style="text-align: center; color: #666; margin-top: 20px;">نتمنى لك وقتاً ممتعاً!</p>
          </div>
        </div>
      `
    }).catch(err => {
      console.log('Failed to send confirmation email:', err);
    });

    res.json({ 
      message: 'تم دفع العربون بنجاح وتأكيد الحجز', 
      paymentId: paymentRecord.id,
      success: true,
      booking: booking
    });

  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء معالجة الدفع' });
  }
});

/* ========= نظام التقييمات ========= */

// إضافة تقييم جديد
app.post('/api/ratings', requireLogin, csrfProtection, (req, res) => {
  try {
    const { pitchId, rating, comment, bookingId } = req.body;
    
    if (!pitchId || !rating) {
      return res.status(400).json({ message: 'معرف الملعب والتقييم مطلوبان' });
    }

    const pitch = pitchesData.find(p => p.id === parseInt(pitchId));
    if (!pitch) {
      return res.status(404).json({ message: 'الملعب غير موجود' });
    }

    const ratings = readJSON(ratingsFile);
    
    // التحقق من عدم وجود تقييم سابق لنفس المستخدم والملعب
    const existingRating = ratings.find(r => 
      r.pitchId === parseInt(pitchId) && 
      r.userId === req.session.user.id
    );

    if (existingRating) {
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
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    ratings.push(newRating);
    writeJSON(ratingsFile, ratings);

    // تحديث متوسط التقييم في بيانات الملعب
    updatePitchRating(parseInt(pitchId));

    res.json({
      message: 'تم إضافة التقييم بنجاح',
      rating: newRating
    });

  } catch (error) {
    console.error('Add rating error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إضافة التقييم' });
  }
});

// الحصول على تقييمات ملعب
app.get('/api/pitches/:id/ratings', (req, res) => {
  try {
    const pitchId = parseInt(req.params.id);
    const ratings = readJSON(ratingsFile);
    
    const pitchRatings = ratings.filter(r => 
      r.pitchId === pitchId && 
      r.status === 'active'
    );

    res.json(pitchRatings);

  } catch (error) {
    console.error('Get ratings error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب التقييمات' });
  }
});

// تحديث متوسط تقييم الملعب
function updatePitchRating(pitchId) {
  const ratings = readJSON(ratingsFile);
  const pitchRatings = ratings.filter(r => r.pitchId === pitchId && r.status === 'active');
  
  if (pitchRatings.length > 0) {
    const totalRating = pitchRatings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = parseFloat((totalRating / pitchRatings.length).toFixed(1));
    
    const pitch = pitchesData.find(p => p.id === pitchId);
    if (pitch) {
      pitch.rating = averageRating;
      pitch.totalRatings = pitchRatings.length;
    }
  }
}

/* ========= نظام الأكواد ========= */

// إنشاء أكواد جديدة
app.post('/api/admin/discount-codes', requireAdmin, csrfProtection, (req, res) => {
  try {
    const { type, value, pitchId, source, expiresAt, quantity = 1 } = req.body;
    
    if (!type || !value || !source) {
      return res.status(400).json({ message: 'النوع والقيمة والمصدر مطلوبون' });
    }

    if (type === CODE_TYPES.PITCH && !pitchId) {
      return res.status(400).json({ message: 'معرف الملعب مطلوب للأكواد الخاصة' });
    }

    const discountCodes = readJSON(discountCodesFile);
    const newCodes = [];

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
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 يوم افتراضي
        usedBy: null,
        usedAt: null,
        message: type === CODE_TYPES.COMPENSATION ? 
          'هذا الكود التعويضي صالح لمدة 14 يوم من تاريخ الإلغاء' : null
      };

      discountCodes.push(newCode);
      newCodes.push(newCode);
    }

    writeJSON(discountCodesFile, discountCodes);

    res.json({ 
      message: `تم إنشاء ${quantity} كود بنجاح`,
      codes: newCodes
    });

  } catch (error) {
    console.error('Create discount codes error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الأكواد' });
  }
});

// الحصول على جميع الأكواد
app.get('/api/admin/discount-codes', requireAdmin, (req, res) => {
  try {
    const discountCodes = readJSON(discountCodesFile);
    res.json(discountCodes);
  } catch (error) {
    console.error('Get discount codes error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الأكواد' });
  }
});

// التحقق من صحة الكود
app.post('/api/validate-discount-code', requireLogin, csrfProtection, (req, res) => {
  try {
    const { code, pitchId } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'الكود مطلوب' });
    }

    const discountCodes = readJSON(discountCodesFile);
    const discountCode = discountCodes.find(dc => 
      dc.code === code.toUpperCase() && 
      dc.status === 'active'
    );

    if (!discountCode) {
      return res.status(404).json({ message: 'الكود غير صالح أو منتهي' });
    }

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
    console.error('Validate discount code error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء التحقق من الكود' });
  }
});

// استخدام الكود
app.post('/api/use-discount-code', requireLogin, csrfProtection, (req, res) => {
  try {
    const { code, bookingId } = req.body;
    
    if (!code || !bookingId) {
      return res.status(400).json({ message: 'الكود ومعرف الحجز مطلوبان' });
    }

    const discountCodes = readJSON(discountCodesFile);
    const discountCode = discountCodes.find(dc => dc.code === code.toUpperCase());
    
    if (!discountCode) {
      return res.status(404).json({ message: 'الكود غير موجود' });
    }

    if (discountCode.status !== 'active') {
      return res.status(400).json({ message: 'الكود مستخدم بالفعل' });
    }

    // تحديث حالة الكود
    discountCode.status = 'used';
    discountCode.usedBy = req.session.user.id;
    discountCode.usedAt = new Date().toISOString();
    discountCode.usedForBooking = bookingId;

    writeJSON(discountCodesFile, discountCodes);

    res.json({
      message: 'تم استخدام الكود بنجاح',
      discount: discountCode.value
    });

  } catch (error) {
    console.error('Use discount code error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء استخدام الكود' });
  }
});

/* ========= 🆕 APIs خاصة بالمديرين ========= */

// الحصول على الملاعب التي يديرها المستخدم
app.get('/api/manager/pitches', requireLogin, (req, res) => {
  try {
    if (req.session.user.role !== 'manager') {
      return res.status(403).json({ message: 'مسموح للمديرين فقط' });
    }

    const managers = readJSON(managersFile);
    const userManager = managers.find(m => m.userId === req.session.user.id && m.approved);
    
    if (!userManager) {
      return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
    }

    const managedPitches = pitchesData.filter(pitch => 
      userManager.pitchIds.includes(pitch.id)
    );

    res.json(managedPitches);

  } catch (error) {
    console.error('Get manager pitches error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الملاعب' });
  }
});

// الحصول على حجوزات الملاعب التي يديرها
app.get('/api/manager/bookings', requireLogin, (req, res) => {
  try {
    if (req.session.user.role !== 'manager') {
      return res.status(403).json({ message: 'مسموح للمديرين فقط' });
    }

    const managers = readJSON(managersFile);
    const userManager = managers.find(m => m.userId === req.session.user.id && m.approved);
    
    if (!userManager) {
      return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
    }

    const bookings = readJSON(bookingsFile);
    const managerBookings = bookings.filter(booking => 
      userManager.pitchIds.includes(booking.pitchId)
    );

    res.json(managerBookings);

  } catch (error) {
    console.error('Get manager bookings error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
  }
});

// 🆕 إلغاء حجز بواسطة المدير
app.put('/api/manager/bookings/:id/cancel', requireLogin, csrfProtection, (req, res) => {
  try {
    if (req.session.user.role !== 'manager') {
      return res.status(403).json({ message: 'مسموح للمديرين فقط' });
    }

    const managers = readJSON(managersFile);
    const userManager = managers.find(m => m.userId === req.session.user.id && m.approved);
    
    if (!userManager) {
      return res.status(403).json({ message: 'لم يتم الموافقة على حسابك كمدير بعد' });
    }

    const bookingId = req.params.id;
    const { cancellationReason } = req.body;
    
    const bookings = readJSON(bookingsFile);
    const booking = bookings.find(b => b.id === bookingId);
    
    if (!booking) {
      return res.status(404).json({ message: 'الحجز غير موجود' });
    }

    // التحقق من أن المدير يملك صلاحية إلغاء هذا الحجز
    if (!userManager.pitchIds.includes(booking.pitchId)) {
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
      compensationCode = generateCompensationCode(booking, 'full_refund');
    } else if (hoursDiff > 24) {
      compensationCode = generateCompensationCode(booking, 'partial_refund');
    }

    // تحديث حالة الحجز
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.updatedAt = new Date().toISOString();
    booking.cancellationTime = new Date().toISOString();
    booking.cancellationReason = cancellationReason || 'إلغاء من المدير';
    booking.refundAmount = refundAmount;
    booking.compensationCode = compensationCode ? compensationCode.code : null;
    booking.cancelledBy = req.session.user.id;
    
    writeJSON(bookingsFile, bookings);

    // إرسال بريد بالإلغاء
    sendCancellationEmail(booking, compensationCode, refundAmount);

    res.json({ 
      message: 'تم إلغاء الحجز بنجاح',
      booking,
      refundAmount,
      compensationCode
    });

  } catch (error) {
    console.error('Manager cancel booking error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
  }
});

// 🆕 APIs للموافقة على المديرين (للمسؤول)
app.get('/api/admin/pending-managers', requireAdmin, (req, res) => {
  try {
    const managers = readJSON(managersFile);
    const users = readJSON(usersFile);
    
    const pendingManagers = managers
      .filter(m => !m.approved)
      .map(manager => {
        const user = users.find(u => u.id === manager.userId);
        const managedPitches = pitchesData.filter(p => manager.pitchIds.includes(p.id));
        return {
          ...manager,
          userInfo: user ? {
            username: user.username,
            email: user.email,
            phone: user.phone
          } : null,
          managedPitches: managedPitches.map(p => p.name)
        };
      });

    res.json(pendingManagers);

  } catch (error) {
    console.error('Get pending managers error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب طلبات المديرين' });
  }
});

app.put('/api/admin/managers/:id/approve', requireAdmin, csrfProtection, (req, res) => {
  try {
    const managerId = req.params.id;
    const managers = readJSON(managersFile);
    const users = readJSON(usersFile);
    
    const manager = managers.find(m => m.id === managerId);
    if (!manager) {
      return res.status(404).json({ message: 'طلب المدير غير موجود' });
    }

    manager.approved = true;
    manager.approvedAt = new Date().toISOString();
    manager.approvedBy = req.session.user.id;
    
    writeJSON(managersFile, managers);

    // تحديث حالة المستخدم
    const user = users.find(u => u.id === manager.userId);
    if (user) {
      user.approved = true;
      writeJSON(usersFile, users);
    }

    // إرسال بريد الموافقة
    if (user) {
      transporter.sendMail({
        from: process.env.EMAIL_USER || 'noreply@ehgzly.com',
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
      }).catch(err => {
        console.log('Failed to send approval email:', err);
      });
    }

    res.json({ message: 'تمت الموافقة على المدير بنجاح' });

  } catch (error) {
    console.error('Approve manager error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء الموافقة على المدير' });
  }
});

// 🆕 رفض طلب مدير
app.put('/api/admin/managers/:id/reject', requireAdmin, csrfProtection, (req, res) => {
  try {
    const managerId = req.params.id;
    const { rejectionReason } = req.body;
    
    const managers = readJSON(managersFile);
    const users = readJSON(usersFile);
    
    const manager = managers.find(m => m.id === managerId);
    if (!manager) {
      return res.status(404).json({ message: 'طلب المدير غير موجود' });
    }

    // حذف طلب المدير
    const updatedManagers = managers.filter(m => m.id !== managerId);
    writeJSON(managersFile, updatedManagers);

    // تحديث حالة المستخدم
    const user = users.find(u => u.id === manager.userId);
    if (user) {
      user.role = 'user'; // تحويله لمستخدم عادي
      writeJSON(usersFile, users);
    }

    // إرسال بريد الرفض
    if (user) {
      transporter.sendMail({
        from: process.env.EMAIL_USER || 'noreply@ehgzly.com',
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
      }).catch(err => {
        console.log('Failed to send rejection email:', err);
      });
    }

    res.json({ message: 'تم رفض طلب المدير بنجاح' });

  } catch (error) {
    console.error('Reject manager error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء رفض طلب المدير' });
  }
});

/* ========= Admin APIs ========= */

// الإحصائيات
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const bookings = readJSON(bookingsFile);
    const payments = readJSON(paymentsFile);
    const users = readJSON(usersFile);
    const discountCodes = readJSON(discountCodesFile);
    const managers = readJSON(managersFile);
    
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
    
    // الحجوزات الشهر الماضي
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    const lastMonthBookings = bookings.filter(booking => {
      const bookingDate = new Date(booking.createdAt);
      return bookingDate.getMonth() === lastMonth && 
             bookingDate.getFullYear() === lastMonthYear &&
             booking.status === 'confirmed';
    });
    
    // الحجوزات الملغاة
    const cancelledBookings = bookings.filter(booking => {
      const bookingDate = new Date(booking.createdAt);
      return bookingDate.getMonth() === currentMonth && 
             bookingDate.getFullYear() === currentYear &&
             booking.status === 'cancelled';
    });
    
    // الإحصائيات المالية
    const currentMonthRevenue = currentMonthBookings.reduce((total, booking) => total + booking.finalAmount, 0);
    const lastMonthRevenue = lastMonthBookings.reduce((total, booking) => total + booking.finalAmount, 0);
    
    // المستخدمين النشطين
    const activeUsers = users.filter(u => {
      if (!u.lastLogin) return false;
      const lastLogin = new Date(u.lastLogin);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return lastLogin > thirtyDaysAgo;
    }).length;

    // إحصائيات الأكواد
    const activeCodes = discountCodes.filter(dc => dc.status === 'active').length;
    const usedCodes = discountCodes.filter(dc => dc.status === 'used').length;
    const totalDiscount = discountCodes
      .filter(dc => dc.status === 'used')
      .reduce((total, dc) => total + dc.value, 0);

    // 🆕 إحصائيات المديرين
    const totalManagers = managers.length;
    const approvedManagers = managers.filter(m => m.approved).length;
    const pendingManagers = managers.filter(m => !m.approved).length;

    const stats = {
      currentMonth: {
        successfulBookings: currentMonthBookings.length,
        totalHours: currentMonthBookings.length,
        revenue: currentMonthRevenue,
        cancelledBookings: cancelledBookings.length
      },
      lastMonth: {
        successfulBookings: lastMonthBookings.length,
        totalHours: lastMonthBookings.length,
        revenue: lastMonthRevenue
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
        active: activeCodes,
        used: usedCodes,
        totalDiscount: totalDiscount
      },
      // 🆕 إحصائيات المديرين
      managers: {
        total: totalManagers,
        approved: approvedManagers,
        pending: pendingManagers
      }
    };
    
    res.json(stats);

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الإحصائيات' });
  }
});

// الحجوزات للمدير
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  try {
    const bookings = readJSON(bookingsFile);
    res.json(bookings);
  } catch (error) {
    console.error('Admin bookings error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب الحجوزات' });
  }
});

// المستخدمين
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const users = readJSON(usersFile);
    // إخفاء كلمات المرور
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب المستخدمين' });
  }
});

// المدفوعات
app.get('/api/payments', requireAdmin, (req, res) => {
  try {
    const payments = readJSON(paymentsFile);
    res.json(payments);
  } catch (error) {
    console.error('Payments error:', error);
    res.status(500).json({ message: 'حدث خطأ في جلب المدفوعات' });
  }
});

// تأكيد دفعة
app.put('/api/admin/payments/:id/confirm', requireAdmin, csrfProtection, (req, res) => {
  try {
    const paymentId = req.params.id;
    const payments = readJSON(paymentsFile);
    const payment = payments.find(p => p.id === paymentId);
    
    if (!payment) {
      return res.status(404).json({ message: 'الدفعة غير موجودة' });
    }
    
    payment.status = 'confirmed';
    payment.confirmedAt = new Date().toISOString();
    payment.confirmedBy = req.session.user.email;
    
    writeJSON(paymentsFile, payments);
    
    res.json({ message: 'تم تأكيد الدفعة بنجاح' });

  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تأكيد الدفعة' });
  }
});

// تفعيل مستخدم
app.put('/api/admin/users/:id/approve', requireAdmin, csrfProtection, (req, res) => {
  try {
    const userId = req.params.id;
    const users = readJSON(usersFile);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }
    
    user.approved = true;
    user.updatedAt = new Date().toISOString();
    
    writeJSON(usersFile, users);
    
    res.json({ message: 'تم تفعيل المستخدم بنجاح' });

  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تفعيل المستخدم' });
  }
});

// 🆕 تحديث بيانات ملعب
app.put('/api/admin/pitches/:id', requireAdmin, csrfProtection, (req, res) => {
  try {
    const pitchId = parseInt(req.params.id);
    const updates = req.body;
    
    const pitch = pitchesData.find(p => p.id === pitchId);
    if (!pitch) {
      return res.status(404).json({ message: 'الملعب غير موجود' });
    }

    // تحديث البيانات المسموح بها
    const allowedUpdates = ['price', 'deposit', 'workingHours', 'features'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        pitch[field] = updates[field];
      }
    });

    // إعادة حساب العربون إذا تغير السعر
    if (updates.price) {
      pitch.deposit = Math.floor(updates.price * 0.3);
    }

    res.json({ 
      message: 'تم تحديث بيانات الملعب بنجاح',
      pitch 
    });

  } catch (error) {
    console.error('Update pitch error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث بيانات الملعب' });
  }
});

/* ========= Pages ========= */
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

app.get('/verify.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

// 🆕 صفحة مدير الملعب
app.get('/manager', requireLogin, (req, res) => {
  if (req.session.user.role !== 'manager') {
    return res.status(403).send('مسموح للمديرين فقط');
  }
  res.sendFile(path.join(__dirname, 'public', 'manager.html'));
});

// 🆕 صفحة مدير النظام
app.get('/admin-dashboard', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

/* ========= Error Handling ========= */
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ message: 'رمز CSRF غير صالح' });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'حجم الملف يتجاوز 5 ميجابايت' });
    }
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'حدث خطأ غير متوقع' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'الصفحة غير موجودة' });
});

/* ========= Server ========= */
app.listen(PORT, () => {
  console.log(`✅ Server running on ${APP_URL}`);
  console.log(`📁 Data directory: ${dataDir}`);
  console.log(`🏟️  Loaded ${pitchesData.length} pitches`);
  console.log(`🔐 Admin access: /admin`);
  console.log(`👨‍💼 Manager system: Active`);
  console.log(`🎫 Discount codes system: Active`);
  console.log(`⭐ Ratings system: Active`);
  console.log(`👤 User profiles system: Active`);
  console.log(`💰 Smart deposit system: Active`);
  console.log(`📊 Statistics system: Active`);
  
  // 🆕 معلومات المديرين
  const managers = readJSON(managersFile);
  console.log(`👨‍💼 Managers: ${managers.filter(m => m.approved).length} approved, ${managers.filter(m => !m.approved).length} pending`);
});
