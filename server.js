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

// 🆕 بيانات الملاعب الحقيقية
const pitchesData = [
  {
    id: 1,
    name: "نادي الطيارة - الملعب الرئيسي",
    location: "المقطم - شارع التسعين",
    area: "mokatam",
    type: "artificial",
    image: "/images/tyara-1.jpg",
    price: 250,
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

// 🆕 أنواع الأكواد
const CODE_TYPES = {
  PITCH: 'pitch',        // كود خاص بملعب
  PREMIUM: 'premium',     // كود عام من المالك
  COMPENSATION: 'compensation' // كود تعويض عن إلغاء
};

// 🆕 مصادر الأكواد
const CODE_SOURCES = {
  PITCH: 'pitch',         // من الملعب
  OWNER: 'owner',         // من المالك
  CANCELLATION: 'cancellation' // من إلغاء حجز
};

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

// الأوقات المتاحة
app.get('/api/pitches/:id/available-slots', (req, res) => {
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
    booking.status === 'confirmed'
  );

  // تحديد الفترة الزمنية بناءً على الاختيار
  let startHour, endHour;
  if (period === 'morning') {
    startHour = 8;
    endHour = 16;
  } else if (period === 'evening') {
    startHour = 17;
    endHour = 24;
  } else {
    // استخدام ساعات العمل الافتراضية للملعب
    startHour = pitch.workingHours.start;
    endHour = pitch.workingHours.end;
  }

  const availableSlots = [];
  const bookedSlots = pitchBookings.map(booking => {
    const hour = parseInt(booking.time.split(':')[0]);
    return hour;
  });

  // توليد الأوقات المتاحة
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
    bookedSlots
  });
});

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

// إنشاء كود تعويض تلقائي عند الإلغاء
app.post('/api/generate-compensation-code', requireLogin, csrfProtection, (req, res) => {
  try {
    const { bookingId, cancellationReason } = req.body;
    
    if (!bookingId) {
      return res.status(400).json({ message: 'معرف الحجز مطلوب' });
    }

    const bookings = readJSON(bookingsFile);
    const booking = bookings.find(b => b.id === bookingId);
    
    if (!booking) {
      return res.status(404).json({ message: 'الحجز غير موجود' });
    }

    // التحقق من أن المستخدم هو صاحب الحجز
    if (booking.userId !== req.session.user.id) {
      return res.status(403).json({ message: 'غير مسموح لك بإنشاء كود تعويض لهذا الحجز' });
    }

    const discountCodes = readJSON(discountCodesFile);
    const compensationValue = Math.floor(booking.amount * 0.5); // 50% من قيمة الحجز

    const compensationCode = {
      id: uuidv4(),
      code: generateDiscountCode(8),
      value: compensationValue,
      type: CODE_TYPES.COMPENSATION,
      source: CODE_SOURCES.CANCELLATION,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 يوم
      originalBookingId: bookingId,
      originalAmount: booking.amount,
      cancellationReason: cancellationReason,
      message: 'هذا الكود التعويضي صالح لمدة 14 يوم من تاريخ الإلغاء. يمكن استخدامه لأي حجز جديد.'
    };

    discountCodes.push(compensationCode);
    writeJSON(discountCodesFile, discountCodes);

    // إرسال بريد بالكود التعويضي
    const user = req.session.user;
    transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@ehgzly.com',
      to: user.email,
      subject: 'كود تعويض عن إلغاء الحجز - احجزلي',
      html: `
        <div style="font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 20px; background: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #e74c3c; text-align: center; margin-bottom: 20px;">كود تعويض عن إلغاء الحجز</h2>
            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #ffc107;">
              <h3 style="color: #856404; margin-bottom: 15px;">كود التعويض الخاص بك:</h3>
              <div style="background: white; padding: 15px; border-radius: 5px; text-align: center; border: 2px dashed #e74c3c;">
                <span style="font-size: 24px; font-weight: bold; color: #e74c3c; letter-spacing: 2px;">${compensationCode.code}</span>
              </div>
              <p style="color: #856404; margin-top: 15px;"><strong>قيمة الكود:</strong> ${compensationValue} جنيه</p>
              <p style="color: #856404;"><strong>صالح حتى:</strong> ${new Date(compensationCode.expiresAt).toLocaleDateString('ar-EG')}</p>
            </div>
            <p style="color: #666; text-align: center; margin-top: 20px;">
              يمكنك استخدام هذا الكود في أي حجز جديد خلال 14 يوم من الآن.
            </p>
            <p style="color: #999; text-align: center; font-size: 14px; margin-top: 20px;">
              نأسف لإلغاء حجزك ونتطلع لرؤيتك قريباً!
            </p>
          </div>
        </div>
      `
    }).catch(err => {
      console.log('Failed to send compensation code email:', err);
    });

    res.json({
      message: 'تم إنشاء كود تعويض بنجاح',
      code: compensationCode.code,
      value: compensationValue,
      expiresAt: compensationCode.expiresAt
    });

  } catch (error) {
    console.error('Generate compensation code error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء كود التعويض' });
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

/* ========= Authentication ========= */

// Signup
app.post('/signup', csrfProtection, async (req, res) => {
  try {
    const { username, email, phone, password, role } = req.body;
    
    if (!username || !email || !phone || !password || !role) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
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
      role: role === 'admin' ? 'admin' : 'user',
      approved: role === 'admin' ? false : true,
      provider: 'local',
      emailVerified: false,
      verificationToken,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    users.push(newUser);
    writeJSON(usersFile, users);

    // إرسال بريد التفعيل
    const verificationLink = `${APP_URL}/verify-email?token=${verificationToken}`;
    
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@ehgzly.com',
      to: email,
      subject: 'تفعيل حسابك - احجزلي',
      html: `
        <div style="font-family: 'Cairo', Arial, sans-serif; text-align: center; direction: rtl; padding: 20px; background: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #1a7f46; margin-bottom: 20px;">مرحباً ${username}!</h2>
            <p style="color: #666; margin-bottom: 20px;">شكراً لتسجيلك في احجزلي. يرجى تفعيل حسابك بالضغط على الرابط أدناه:</p>
            <a href="${verificationLink}" style="background: #1a7f46; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">
              تفعيل الحساب
            </a>
            <p style="color: #999; margin-top: 20px; font-size: 14px;">إذا لم تطلب هذا الرابط، يمكنك تجاهل هذه الرسالة.</p>
          </div>
        </div>
      `
    }).catch(err => {
      console.log('❌ Failed to send email:', err);
    });

    res.json({ 
      message: 'تم إنشاء الحساب بنجاح. يرجى فحص بريدك الإلكتروني للتفعيل.',
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

/* ========= Booking System ========= */

// الحجز الجديد
app.post('/api/bookings', requireLogin, csrfProtection, (req, res) => {
  try {
    const { pitchId, date, time, name, phone, email, discountCode } = req.body;
    
    if (!pitchId || !date || !time || !name || !phone) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    const pitch = pitchesData.find(p => p.id === parseInt(pitchId));
    if (!pitch) {
      return res.status(404).json({ message: 'الملعب غير موجود' });
    }

    // التحقق من الوقت
    const hour = parseInt(time.split(':')[0]);
    if (hour < pitch.workingHours.start || hour >= pitch.workingHours.end) {
      return res.status(400).json({ message: 'الوقت المحدد خارج ساعات العمل' });
    }

    const bookings = readJSON(bookingsFile);
    
    // التحقق من عدم وجود حجز مسبق
    const existingBooking = bookings.find(booking => 
      booking.pitchId === parseInt(pitchId) &&
      booking.date === date &&
      booking.time === time &&
      booking.status === 'confirmed'
    );

    if (existingBooking) {
      return res.status(400).json({ message: 'هذا الوقت محجوز بالفعل' });
    }

    let finalAmount = pitch.price;
    let appliedDiscount = null;

    // تطبيق الكود الخصم إذا كان موجوداً
    if (discountCode) {
      const discountCodes = readJSON(discountCodesFile);
      const validCode = discountCodes.find(dc => 
        dc.code === discountCode.toUpperCase() && 
        dc.status === 'active'
      );

      if (validCode) {
        finalAmount = Math.max(0, pitch.price - validCode.value);
        appliedDiscount = {
          code: validCode.code,
          value: validCode.value,
          originalPrice: pitch.price,
          finalPrice: finalAmount
        };
      }
    }

    const newBooking = {
      id: uuidv4(),
      pitchId: parseInt(pitchId),
      pitchName: pitch.name,
      pitchLocation: pitch.location,
      date,
      time,
      customerName: name,
      customerPhone: phone,
      customerEmail: email || req.session.user.email,
      userId: req.session.user.id,
      status: 'pending',
      amount: pitch.price,
      finalAmount: finalAmount,
      appliedDiscount: appliedDiscount,
      discountCode: discountCode || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    bookings.push(newBooking);
    writeJSON(bookingsFile, bookings);

    // حفظ الحجز في الجلسة للدفع
    req.session.pendingBooking = newBooking;

    res.json({ 
      message: appliedDiscount ? 
        `تم الحجز بنجاح. تم تطبيق خصم ${appliedDiscount.value} جنيه. يرجى إتمام الدفع.` :
        'تم الحجز بنجاح. يرجى إتمام الدفع.',
      booking: newBooking,
      paymentRequired: true,
      appliedDiscount: appliedDiscount
    });

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء الحجز' });
  }
});

// إلغاء الحجز
app.put('/api/bookings/:id/cancel', requireLogin, csrfProtection, (req, res) => {
  try {
    const bookingId = req.params.id;
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

    // تحديد ما إذا كان يستحق كود تعويض
    const bookingDate = new Date(booking.date);
    const now = new Date();
    const timeDiff = bookingDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    let compensationEligible = false;
    if (hoursDiff < 24) {
      compensationEligible = true;
    }

    booking.status = 'cancelled';
    booking.updatedAt = new Date().toISOString();
    booking.cancellationTime = new Date().toISOString();
    booking.compensationEligible = compensationEligible;
    
    writeJSON(bookingsFile, bookings);
    
    res.json({ 
      message: 'تم إلغاء الحجز بنجاح',
      booking,
      compensationEligible
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
  }
});

/* ========= Payment System ========= */

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

    const userData = req.session.user;
    const payments = readJSON(paymentsFile);

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
      originalAmount: pendingBooking.amount,
      discountApplied: pendingBooking.appliedDiscount ? pendingBooking.appliedDiscount.value : 0,
      provider: provider,
      providerName: paymentConfig[provider].name,
      receiptPath: req.file ? `/uploads/${req.file.filename}` : null,
      date: new Date().toISOString(),
      status: 'pending'
    };
    
    payments.push(paymentRecord);
    writeJSON(paymentsFile, payments);

    // تحديث حالة الحجز إلى confirmed
    const bookings = readJSON(bookingsFile);
    const booking = bookings.find(b => b.id === pendingBooking.id);
    if (booking) {
      booking.status = 'confirmed';
      booking.updatedAt = new Date().toISOString();
      writeJSON(bookingsFile, bookings);
    }

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
              <p><strong>المبلغ الأصلي:</strong> ${pendingBooking.amount} جنيه</p>
              ${pendingBooking.appliedDiscount ? `
                <p><strong>الخصم:</strong> ${pendingBooking.appliedDiscount.value} جنيه</p>
                <p><strong>المبلغ النهائي:</strong> ${amount} جنيه</p>
                <p><strong>كود الخصم:</strong> ${pendingBooking.appliedDiscount.code}</p>
              ` : `
                <p><strong>المبلغ:</strong> ${amount} جنيه</p>
              `}
              <p><strong>طريقة الدفع:</strong> ${paymentConfig[provider].name}</p>
            </div>
            <p style="text-align: center; color: #666; margin-top: 20px;">نتمنى لك وقتاً ممتعاً!</p>
          </div>
        </div>
      `
    }).catch(err => {
      console.log('Failed to send confirmation email:', err);
    });

    res.json({ 
      message: 'تم تسجيل عملية الدفع بنجاح', 
      paymentId: paymentRecord.id,
      success: true
    });

  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء معالجة الدفع' });
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

app.get('/verify.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
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
  console.log(`🎫 Discount codes system: Active`);
  console.log(`⭐ Ratings system: Active`);
});