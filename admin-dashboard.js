// 🚀 النظام الإداري الموحد للأدمن الرئيسي
class AdminManagementSystem {
    constructor() {
        this.currentUser = null;
        this.userRole = 'admin';
        this.allBookings = [];
        this.allPitches = [];
        this.allUsers = [];
        this.allPayments = [];
        this.pendingManagers = [];
        this.timeSlots = [];
        this.systemMetrics = {};
        this.charts = {};
        this.currentBookingToCancel = null;
        this.currentDeleteAction = null;
        this.currentManagerToApprove = null;
        this.notifications = [];
        this.activityLogs = [];
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة نظام الأدمن...');
        await this.checkAuth();
        this.setupEventListeners();
        await this.loadInitialData();
        this.initializeCharts();
        this.startAutoRefresh();
        console.log('✅ تم تهيئة نظام الأدمن بنجاح');
    }

    // 🔐 نظام المصادقة
    async checkAuth() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch('/api/current-user', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Auth failed');
            
            const result = await response.json();
            if (result.success && result.user.role === 'admin') {
                this.currentUser = result.user;
                this.updateUserInfo();
            } else {
                this.handleAuthError();
            }
        } catch (error) {
            this.handleAuthError();
        }
    }

    // 📊 تحميل البيانات الأولية
    async loadInitialData() {
        console.log('📊 بدء تحميل بيانات الأدمن...');
        await this.loadPitches();
        await this.loadBookings();
        await this.loadUsers();
        await this.loadPayments();
        await this.loadManagers();
        await this.loadSystemMetrics();
        await this.loadNotifications();
        await this.loadActivityLogs();
        console.log('✅ تم تحميل بيانات الأدمن بنجاح');
    }

    // 🏟️ تحميل الملاعب
    async loadPitches() {
        try {
            this.showLoading('pitchesContainer', 'جاري تحميل الملاعب...');
            const response = await fetch('/api/stadiums', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.allPitches = result.stadiums || [];
                this.displayPitches();
                this.updatePitchesFilter();
                this.populateStadiumSelect();
            } else {
                throw new Error('Failed to load pitches');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الملاعب:', error);
            this.showAlert('حدث خطأ في تحميل الملاعب', 'danger');
        }
    }

    // 📅 تحميل الحجوزات
    async loadBookings() {
        try {
            this.showLoading('bookingsTable', 'جاري تحميل الحجوزات...');
            const response = await fetch('/api/bookings', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.allBookings = result.bookings || [];
                this.updateBookingsTable(this.allBookings);
                this.updateRecentBookings(this.allBookings.slice(0, 5));
            } else {
                throw new Error('Failed to load bookings');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الحجوزات:', error);
            this.showAlert('حدث خطأ في تحميل الحجوزات', 'danger');
        }
    }

    // 👥 تحميل المستخدمين
    async loadUsers() {
        try {
            this.showLoading('usersTable', 'جاري تحميل المستخدمين...');
            const response = await fetch('/api/users', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.allUsers = result.users || [];
                this.updateUsersTable(this.allUsers);
                this.populateNotificationUsers();
            } else {
                throw new Error('Failed to load users');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل المستخدمين:', error);
            this.showAlert('حدث خطأ في تحميل المستخدمين', 'danger');
        }
    }

    // 💰 تحميل المدفوعات
    async loadPayments() {
        try {
            this.showLoading('paymentsTable', 'جاري تحميل المدفوعات...');
            const response = await fetch('/api/payments', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.allPayments = result.payments || [];
                this.updatePaymentsTable(this.allPayments);
            } else {
                throw new Error('Failed to load payments');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل المدفوعات:', error);
            this.showAlert('حدث خطأ في تحميل المدفوعات', 'danger');
        }
    }

    // 👑 تحميل طلبات المديرين
    async loadManagers() {
        try {
            this.showLoading('pendingManagersTable', 'جاري تحميل طلبات المديرين...');
            const response = await fetch('/api/managers/pending', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.pendingManagers = result.managers || [];
                this.updatePendingManagersTable(this.pendingManagers);
            } else {
                throw new Error('Failed to load managers');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل المديرين:', error);
            this.showAlert('حدث خطأ في تحميل طلبات المديرين', 'danger');
        }
    }

    // 📈 تحميل إحصائيات النظام
    async loadSystemMetrics() {
        try {
            const response = await fetch('/api/system-metrics', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.systemMetrics = result.metrics || {};
                this.updateSystemMetrics(this.systemMetrics);
                this.updateAdminStats(this.systemMetrics);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل إحصائيات النظام:', error);
        }
    }

    // 🔔 تحميل الإشعارات
    async loadNotifications() {
        try {
            const response = await fetch('/api/notifications', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.notifications = result.notifications || [];
                this.updateNotificationsHistory();
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الإشعارات:', error);
        }
    }

    // 📋 تحميل سجل الأنشطة
    async loadActivityLogs() {
        try {
            this.showLoading('activityLogsTable', 'جاري تحميل سجل الأنشطة...');
            const response = await fetch('/api/activity-logs', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.activityLogs = result.logs || [];
                this.updateActivityLogsTable(this.activityLogs);
            } else {
                throw new Error('Failed to load activity logs');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل سجل الأنشطة:', error);
            this.showAlert('حدث خطأ في تحميل سجل الأنشطة', 'danger');
        }
    }

    // 🎛️ تحديث واجهة المستخدم
    updateUserInfo() {
        document.getElementById('userInfo').textContent = `مرحبًا ${this.currentUser.username}`;
        document.getElementById('userInfoSidebar').textContent = `مرحبًا ${this.currentUser.username}`;
        document.getElementById('userRoleDisplay').textContent = 'الأدمن الرئيسي';
    }

    // 🏟️ عرض الملاعب
    displayPitches() {
        const container = document.getElementById('pitchesContainer');
        
        if (this.allPitches.length === 0) {
            container.innerHTML = this.getEmptyState('map', 'لا توجد ملاعب', 'يمكنك إضافة ملاعب جديدة للنظام');
            return;
        }

        container.innerHTML = this.allPitches.map(stadium => `
            <div class="col-lg-6 col-xl-4 mb-4 fade-in">
                <div class="stadium-card card-hover">
                    <div class="stadium-image img-hover-zoom" style="background-image: url('${stadium.image || '/api/placeholder/400/300'}')">
                        <span class="stadium-badge">${stadium.type === 'natural' ? 'نجيلة طبيعية' : 'نجيلة صناعية'}</span>
                        <span class="stadium-price">${stadium.price} ج.م/ساعة</span>
                    </div>
                    <div class="p-3">
                        <h5 class="mb-2">${stadium.name}</h5>
                        <p class="text-muted mb-2">
                            <i class="bi bi-geo-alt me-1"></i>${stadium.location}
                        </p>
                        <p class="text-muted mb-2">
                            <i class="bi bi-calendar me-1"></i>${stadium.availability || 'متاح'}
                        </p>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" onclick="adminSystem.editStadium(${stadium.id})">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-danger" onclick="adminSystem.confirmDelete('stadium', ${stadium.id}, '${stadium.name}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                                <button class="btn btn-outline-info" onclick="adminSystem.viewStadiumDetails(${stadium.id})">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 📊 تحديث جدول الحجوزات
    updateBookingsTable(bookings) {
        const table = document.getElementById('bookingsTable');
        if (bookings.length === 0) {
            table.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">لا توجد حجوزات</td></tr>';
            return;
        }

        table.innerHTML = bookings.map((booking, index) => `
            <tr class="fade-in">
                <td>${index + 1}</td>
                <td>${booking.customer_name || 'غير معروف'}</td>
                <td>${booking.pitch_name || 'غير معروف'}</td>
                <td>${booking.date}</td>
                <td>${booking.time}</td>
                <td>${booking.amount} ج.م</td>
                <td>${booking.deposit_amount || 0} ج.م</td>
                <td>
                    <span class="badge ${this.getStatusBadgeClass(booking.status)}">
                        ${this.getStatusText(booking.status)}
                    </span>
                </td>
                <td>${new Date(booking.created_at).toLocaleDateString('ar-EG')}</td>
                <td class="action-buttons">
                    ${booking.status === 'confirmed' ? `
                        <button class="btn btn-warning btn-sm" onclick="adminSystem.cancelBooking('${booking.id}')">
                            <i class="bi bi-x-circle"></i> إلغاء
                        </button>
                    ` : ''}
                    <button class="btn btn-info btn-sm" onclick="adminSystem.showBookingDetails('${booking.id}')">
                        <i class="bi bi-eye"></i> تفاصيل
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 🔄 تحديث الحجوزات الحديثة
    updateRecentBookings(bookings) {
        const table = document.getElementById('recentBookingsTable');
        if (bookings.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">لا توجد حجوزات حديثة</td></tr>';
            return;
        }

        table.innerHTML = bookings.map(booking => `
            <tr class="fade-in">
                <td>${booking.customer_name || 'غير معروف'}</td>
                <td>${booking.pitch_name || 'غير معروف'}</td>
                <td>${booking.date}</td>
                <td>${booking.time}</td>
                <td>${booking.amount} ج.م</td>
                <td>
                    <span class="badge ${this.getStatusBadgeClass(booking.status)}">
                        ${this.getStatusText(booking.status)}
                    </span>
                </td>
                <td>
                    <button class="btn btn-info btn-sm" onclick="adminSystem.showBookingDetails('${booking.id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 👥 تحديث جدول المستخدمين
    updateUsersTable(users) {
        const table = document.getElementById('usersTable');
        if (users.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">لا توجد مستخدمين</td></tr>';
            return;
        }

        table.innerHTML = users.map((user, index) => `
            <tr class="fade-in">
                <td>${index + 1}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>
                    <span class="badge ${this.getRoleBadgeClass(user.role)}">
                        ${this.getRoleText(user.role)}
                    </span>
                </td>
                <td>
                    <span class="badge ${this.getStatusBadgeClass(user.approved ? 'approved' : 'pending')}">
                        ${user.approved ? 'مفعل' : 'قيد الانتظار'}
                    </span>
                </td>
                <td>
                    <span class="badge ${user.is_active ? 'bg-success' : 'bg-danger'}">
                        ${user.is_active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td class="action-buttons">
                    ${!user.approved ? `
                        <button class="btn btn-success btn-sm" onclick="adminSystem.approveUser('${user.id}')">
                            <i class="bi bi-check-lg"></i> قبول
                        </button>
                    ` : ''}
                    ${user.is_active ? `
                        <button class="btn btn-warning btn-sm" onclick="adminSystem.toggleUserStatus('${user.id}', false)">
                            <i class="bi bi-pause"></i> إيقاف
                        </button>
                    ` : `
                        <button class="btn btn-success btn-sm" onclick="adminSystem.toggleUserStatus('${user.id}', true)">
                            <i class="bi bi-play"></i> تفعيل
                        </button>
                    `}
                    <button class="btn btn-info btn-sm" onclick="adminSystem.sendNotificationToUser('${user.id}', '${user.username}')">
                        <i class="bi bi-bell"></i> إشعار
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="adminSystem.confirmDelete('user', '${user.id}', '${user.username}')">
                        <i class="bi bi-trash"></i> حذف
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 💰 تحديث جدول المدفوعات
    updatePaymentsTable(payments) {
        const table = document.getElementById('paymentsTable');
        if (payments.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">لا توجد مدفوعات</td></tr>';
            return;
        }

        table.innerHTML = payments.map((payment, index) => `
            <tr class="fade-in">
                <td>${index + 1}</td>
                <td>${payment.payer_name || 'غير معروف'}</td>
                <td>${payment.amount} ج.م</td>
                <td>
                    <span class="badge ${this.getPaymentStatusBadgeClass(payment.status)}">
                        ${this.getPaymentStatusText(payment.status)}
                    </span>
                </td>
                <td>${this.getPaymentMethodText(payment.provider)}</td>
                <td>${new Date(payment.date).toLocaleDateString('ar-EG')}</td>
                <td class="action-buttons">
                    <button class="btn btn-info btn-sm" onclick="adminSystem.showPaymentDetails('${payment.id}')">
                        <i class="bi bi-eye"></i> تفاصيل
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 📋 تحديث جدول طلبات المديرين
    updatePendingManagersTable(managers) {
        const table = document.getElementById('pendingManagersTable');
        const countBadge = document.getElementById('pendingManagersCount');
        
        countBadge.textContent = `${managers.length} طلب`;
        
        if (managers.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">لا توجد طلبات معلقة</td></tr>';
            return;
        }

        table.innerHTML = managers.map((manager, index) => `
            <tr class="fade-in">
                <td>${index + 1}</td>
                <td>${manager.username}</td>
                <td>${manager.email}</td>
                <td>
                    ${(manager.requested_pitch_ids || []).map(pitchId => 
                        `<span class="badge bg-secondary me-1">ملعب ${pitchId}</span>`
                    ).join('')}
                </td>
                <td>
                    <span class="badge bg-warning">قيد الانتظار</span>
                </td>
                <td>${new Date(manager.created_at).toLocaleDateString('ar-EG')}</td>
                <td>
                    <button class="btn btn-success btn-sm" onclick="adminSystem.approveManagerRequest('${manager.id}')">
                        <i class="bi bi-check-lg me-1"></i>موافقة
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="adminSystem.rejectManagerRequest('${manager.id}')">
                        <i class="bi bi-x-lg me-1"></i>رفض
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 📊 تحديث إحصائيات النظام
    updateSystemMetrics(metrics) {
        document.getElementById('totalUsersCount').textContent = metrics.total_users || 0;
        document.getElementById('totalBookingsCount').textContent = metrics.total_bookings || 0;
        document.getElementById('totalRevenueAmount').textContent = metrics.total_revenue || 0;
        document.getElementById('activePitchesCount').textContent = metrics.active_stadiums || 0;
        document.getElementById('successfulPaymentsCount').textContent = metrics.successful_payments || 0;
    }

    // 🏆 تحديث إحصائيات الأدمن
    updateAdminStats(metrics) {
        const statsContainer = document.getElementById('statsContainer');
        statsContainer.innerHTML = `
            <div class="col-lg-3 col-md-6">
                <div class="stat-card card-hover">
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-primary text-white me-3">
                            <i class="bi bi-people"></i>
                        </div>
                        <div>
                            <div class="stat-number">${metrics.total_users || 0}</div>
                            <div class="stat-label">إجمالي المستخدمين</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6">
                <div class="stat-card card-hover">
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-success text-white me-3">
                            <i class="bi bi-building"></i>
                        </div>
                        <div>
                            <div class="stat-number">${metrics.total_stadiums || 0}</div>
                            <div class="stat-label">إجمالي الملاعب</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6">
                <div class="stat-card card-hover">
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-info text-white me-3">
                            <i class="bi bi-calendar-check"></i>
                        </div>
                        <div>
                            <div class="stat-number">${metrics.total_bookings || 0}</div>
                            <div class="stat-label">إجمالي الحجوزات</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6">
                <div class="stat-card card-hover">
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-warning text-white me-3">
                            <i class="bi bi-currency-dollar"></i>
                        </div>
                        <div>
                            <div class="stat-number">${metrics.total_revenue || 0}</div>
                            <div class="stat-label">إجمالي الإيرادات</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 🔔 تحديث سجل الإشعارات
    updateNotificationsHistory() {
        const container = document.getElementById('notificationsHistory');
        if (this.notifications.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-4">لا توجد إشعارات مرسلة</div>';
            return;
        }

        container.innerHTML = this.notifications.map(notification => `
            <div class="notification-item p-3 bg-light rounded mb-2 fade-in">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">${notification.title}</h6>
                        <p class="mb-1">${notification.message}</p>
                        <small class="text-muted">
                            ${notification.user_id === 'all' ? 'لجميع المستخدمين' : `لمستخدم: ${notification.user?.username || 'محدد'}`}
                        </small>
                    </div>
                    <div class="text-end">
                        <span class="badge ${this.getNotificationTypeBadge(notification.type)}">
                            ${this.getNotificationTypeText(notification.type)}
                        </span>
                        <br>
                        <small class="text-muted">${new Date(notification.created_at).toLocaleDateString('ar-EG')}</small>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 📋 تحديث جدول سجل الأنشطة
    updateActivityLogsTable(logs) {
        const table = document.getElementById('activityLogsTable');
        if (logs.length === 0) {
            table.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">لا توجد أنشطة مسجلة</td></tr>';
            return;
        }

        table.innerHTML = logs.map((log, index) => `
            <tr class="fade-in">
                <td>${index + 1}</td>
                <td>${log.user_id ? (log.user?.username || `مستخدم ${log.user_id}`) : 'النظام'}</td>
                <td>${log.action}</td>
                <td>${log.description}</td>
                <td>${log.ip_address || 'غير متوفر'}</td>
                <td>${new Date(log.created_at).toLocaleString('ar-EG')}</td>
            </tr>
        `).join('');
    }

    // 🎛️ إعداد الرسوم البيانية
    initializeCharts() {
        // رسم بياني للحجوزات
        const bookingsCtx = document.getElementById('bookingsChart')?.getContext('2d');
        if (bookingsCtx) {
            this.charts.bookings = new Chart(bookingsCtx, {
                type: 'line',
                data: {
                    labels: Array.from({length: 30}, (_, i) => i + 1),
                    datasets: [{
                        label: 'عدد الحجوزات',
                        data: Array(30).fill(0).map(() => Math.floor(Math.random() * 20) + 5),
                        borderColor: '#1a7f46',
                        backgroundColor: 'rgba(26, 127, 70, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // رسم بياني للملاعب
        const pitchesCtx = document.getElementById('pitchesChart')?.getContext('2d');
        if (pitchesCtx) {
            this.charts.pitches = new Chart(pitchesCtx, {
                type: 'doughnut',
                data: {
                    labels: ['المقطم', 'الهضبة الوسطي', 'السبعين فدان'],
                    datasets: [{
                        data: [40, 35, 25],
                        backgroundColor: ['#1a7f46', '#2ecc71', '#3498db']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        // رسم بياني للإيرادات الشهرية
        const monthlyRevenueCtx = document.getElementById('monthlyRevenueChart')?.getContext('2d');
        if (monthlyRevenueCtx) {
            this.charts.monthlyRevenue = new Chart(monthlyRevenueCtx, {
                type: 'line',
                data: {
                    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
                    datasets: [{
                        label: 'الإيرادات (ألف جنيه)',
                        data: [120, 150, 180, 200, 170, 220],
                        borderColor: '#1a7f46',
                        backgroundColor: 'rgba(26, 127, 70, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'top' } }
                }
            });
        }

        // رسم بياني للمدفوعات
        const paymentsCtx = document.getElementById('paymentsChart')?.getContext('2d');
        if (paymentsCtx) {
            this.charts.payments = new Chart(paymentsCtx, {
                type: 'doughnut',
                data: {
                    labels: ['ناجحة', 'فاشلة', 'قيد الانتظار'],
                    datasets: [{
                        data: [70, 15, 15],
                        backgroundColor: ['#1a7f46', '#e74c3c', '#f39c12']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    }

    // 🛠️ دوال المساعدة
    getAuthHeaders() {
        const token = localStorage.getItem('authToken');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    getStatusBadgeClass(status) {
        const classes = {
            'confirmed': 'bg-success',
            'pending': 'bg-warning',
            'cancelled': 'bg-danger',
            'approved': 'bg-success',
            'suspended': 'bg-danger'
        };
        return classes[status] || 'bg-secondary';
    }

    getStatusText(status) {
        const texts = {
            'confirmed': 'مؤكد',
            'pending': 'قيد الانتظار',
            'cancelled': 'ملغي',
            'approved': 'مفعل',
            'suspended': 'موقوف'
        };
        return texts[status] || status;
    }

    getRoleBadgeClass(role) {
        const classes = {
            'admin': 'bg-danger',
            'stadium_owner': 'bg-primary',
            'manager': 'bg-primary',
            'player': 'bg-secondary'
        };
        return classes[role] || 'bg-secondary';
    }

    getRoleText(role) {
        const texts = {
            'admin': 'مسؤول',
            'stadium_owner': 'مدير',
            'manager': 'مدير',
            'player': 'مستخدم'
        };
        return texts[role] || role;
    }

    getPaymentStatusBadgeClass(status) {
        const classes = {
            'paid': 'bg-success',
            'pending': 'bg-warning',
            'failed': 'bg-danger'
        };
        return classes[status] || 'bg-secondary';
    }

    getPaymentStatusText(status) {
        const texts = {
            'paid': 'مدفوع',
            'pending': 'قيد الانتظار',
            'failed': 'فاشل'
        };
        return texts[status] || status;
    }

    getPaymentMethodText(method) {
        const methods = {
            'cash': 'نقدي',
            'vodafone_cash': 'فودافون كاش',
            'instapay': 'انستاباي'
        };
        return methods[method] || method;
    }

    getNotificationTypeBadge(type) {
        const classes = {
            'info': 'bg-info',
            'success': 'bg-success',
            'warning': 'bg-warning',
            'error': 'bg-danger'
        };
        return classes[type] || 'bg-secondary';
    }

    getNotificationTypeText(type) {
        const texts = {
            'info': 'معلومات',
            'success': 'نجاح',
            'warning': 'تحذير',
            'error': 'خطأ'
        };
        return texts[type] || type;
    }

    getEmptyState(icon, title, message) {
        return `
            <div class="col-12">
                <div class="empty-state">
                    <i class="bi bi-${icon}"></i>
                    <h5>${title}</h5>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

    showAlert(message, type) {
        const alertsContainer = document.getElementById('alertsContainer');
        const alertId = 'alert-' + Date.now();
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        alertsContainer.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    showLoading(containerId, message = 'جاري التحميل...') {
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <div class="text-center py-4">
                <div class="loading-spinner mb-2"></div>
                <p class="text-muted">${message}</p>
            </div>
        `;
    }

    // 🎯 دوال الإجراءات
    async editStadium(stadiumId) {
        const stadium = this.allPitches.find(s => s.id === stadiumId);
        if (!stadium) return;

        const modalContent = document.getElementById('editStadiumContent');
        modalContent.innerHTML = `
            <form id="editStadiumForm">
                <input type="hidden" name="id" value="${stadium.id}">
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">اسم الملعب</label>
                        <input type="text" class="form-control" name="name" value="${stadium.name}" required>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">السعر للساعة (جنيه)</label>
                        <input type="number" class="form-control" name="price" value="${stadium.price}" required>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">الموقع</label>
                    <input type="text" class="form-control" name="location" value="${stadium.location}" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">المميزات</label>
                    <input type="text" class="form-control" name="features" value="${stadium.features ? stadium.features.join(', ') : ''}">
                </div>
                <button type="submit" class="btn btn-primary w-100">حفظ التغييرات</button>
            </form>
        `;

        document.getElementById('editStadiumForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateStadium(new FormData(e.target));
        });

        new bootstrap.Modal(document.getElementById('editStadiumModal')).show();
    }

    async updateStadium(formData) {
        const data = Object.fromEntries(formData);
        
        try {
            const response = await fetch(`/api/stadiums/${data.id}`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(data)
            });

            if (response.ok) {
                this.showAlert('✅ تم تحديث بيانات الملعب بنجاح', 'success');
                bootstrap.Modal.getInstance(document.getElementById('editStadiumModal')).hide();
                this.loadPitches();
            } else {
                this.showAlert('❌ حدث خطأ أثناء تحديث الملعب', 'danger');
            }
        } catch (error) {
            console.error('Error updating stadium:', error);
            this.showAlert('❌ حدث خطأ أثناء تحديث الملعب', 'danger');
        }
    }

    async addPitch(formData) {
        try {
            const response = await fetch('/api/stadiums', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                this.showAlert('✅ تم إضافة الملعب بنجاح', 'success');
                bootstrap.Modal.getInstance(document.getElementById('addPitchModal')).hide();
                document.getElementById('addPitchForm').reset();
                this.loadPitches();
            } else {
                this.showAlert('❌ حدث خطأ أثناء إضافة الملعب', 'danger');
            }
        } catch (error) {
            console.error('Error adding pitch:', error);
            this.showAlert('❌ حدث خطأ أثناء إضافة الملعب', 'danger');
        }
    }

    confirmDelete(type, id, name) {
        this.currentDeleteAction = { type, id };
        const message = type === 'stadium' 
            ? `هل أنت متأكد من حذف الملعب "${name}"؟ سيتم حذف جميع الساعات والحجوزات المرتبطة به.`
            : `هل أنت متأكد من حذف المستخدم "${name}"؟`;

        document.getElementById('deleteMessage').textContent = message;
        document.getElementById('confirmDeleteBtn').onclick = () => this.executeDelete();
        
        new bootstrap.Modal(document.getElementById('confirmDeleteModal')).show();
    }

    async executeDelete() {
        const { type, id } = this.currentDeleteAction;
        
        try {
            const response = await fetch(`/api/${type}s/${id}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                this.showAlert('✅ تم الحذف بنجاح', 'success');
                bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide();
                
                if (type === 'stadium') {
                    this.loadPitches();
                } else if (type === 'user') {
                    this.loadUsers();
                }
            } else {
                this.showAlert('❌ حدث خطأ أثناء الحذف', 'danger');
            }
        } catch (error) {
            console.error('Error deleting:', error);
            this.showAlert('❌ حدث خطأ أثناء الحذف', 'danger');
        }
    }

    cancelBooking(bookingId) {
        const booking = this.allBookings.find(b => b.id === bookingId);
        if (!booking) return;

        this.currentBookingToCancel = bookingId;

        document.getElementById('cancelBookingDetails').innerHTML = `
            <div class="alert alert-warning">
                <p><strong>العميل:</strong> ${booking.customer_name || 'غير معروف'}</p>
                <p><strong>الملعب:</strong> ${booking.pitch_name || 'غير معروف'}</p>
                <p><strong>التاريخ:</strong> ${booking.date}</p>
                <p><strong>الوقت:</strong> ${booking.time}</p>
                <p><strong>المبلغ:</strong> ${booking.amount} ج.م</p>
            </div>
        `;

        document.getElementById('confirmCancelBtn').onclick = async () => {
            const reason = document.getElementById('cancellationReason').value;
            await this.executeCancelBooking(reason);
        };

        new bootstrap.Modal(document.getElementById('cancelBookingModal')).show();
    }

    async executeCancelBooking(reason) {
        try {
            const response = await fetch(`/api/bookings/${this.currentBookingToCancel}/cancel`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    cancellation_reason: reason || 'إلغاء من الأدمن'
                })
            });

            if (response.ok) {
                this.showAlert('✅ تم إلغاء الحجز بنجاح', 'success');
                bootstrap.Modal.getInstance(document.getElementById('cancelBookingModal')).hide();
                this.loadBookings();
            } else {
                throw new Error('Failed to cancel booking');
            }
        } catch (error) {
            console.error('Error cancelling booking:', error);
            this.showAlert('❌ حدث خطأ أثناء إلغاء الحجز', 'danger');
        }
    }

    showBookingDetails(bookingId) {
        const booking = this.allBookings.find(b => b.id === bookingId);
        if (!booking) return;

        const modalContent = document.getElementById('bookingDetailsContent');
        modalContent.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>معلومات الحجز</h6>
                    <p><strong>رقم الحجز:</strong> ${booking.id}</p>
                    <p><strong>الحالة:</strong> <span class="badge ${this.getStatusBadgeClass(booking.status)}">${this.getStatusText(booking.status)}</span></p>
                    <p><strong>التاريخ:</strong> ${booking.date}</p>
                    <p><strong>الوقت:</strong> ${booking.time}</p>
                    <p><strong>المبلغ:</strong> ${booking.amount} ج.م</p>
                    <p><strong>العربون:</strong> ${booking.deposit_amount || 0} ج.م</p>
                </div>
                <div class="col-md-6">
                    <h6>معلومات العميل</h6>
                    <p><strong>الاسم:</strong> ${booking.customer_name || 'غير معروف'}</p>
                    <p><strong>الهاتف:</strong> ${booking.customer_phone || 'غير متوفر'}</p>
                    <h6 class="mt-3">معلومات الملعب</h6>
                    <p><strong>الاسم:</strong> ${booking.pitch_name || 'غير معروف'}</p>
                    <p><strong>الموقع:</strong> ${booking.pitch_location || 'غير متوفر'}</p>
                </div>
            </div>
            ${booking.cancellation_reason ? `
                <div class="alert alert-warning mt-3">
                    <h6>سبب الإلغاء:</h6>
                    <p>${booking.cancellation_reason}</p>
                </div>
            ` : ''}
        `;

        new bootstrap.Modal(document.getElementById('bookingDetailsModal')).show();
    }

    showPaymentDetails(paymentId) {
        const payment = this.allPayments.find(p => p.id === paymentId);
        if (!payment) return;

        const modalContent = document.getElementById('paymentDetailsContent');
        modalContent.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>معلومات الدفع</h6>
                    <p><strong>رقم العملية:</strong> ${payment.transaction_id || 'غير متوفر'}</p>
                    <p><strong>المبلغ:</strong> ${payment.amount} ج.م</p>
                    <p><strong>طريقة الدفع:</strong> ${this.getPaymentMethodText(payment.provider)}</p>
                    <p><strong>الحالة:</strong> <span class="badge ${this.getPaymentStatusBadgeClass(payment.status)}">${this.getPaymentStatusText(payment.status)}</span></p>
                    <p><strong>التاريخ:</strong> ${new Date(payment.date).toLocaleDateString('ar-EG')}</p>
                </div>
                <div class="col-md-6">
                    <h6>معلومات المستخدم</h6>
                    <p><strong>الاسم:</strong> ${payment.payer_name || 'غير معروف'}</p>
                    <p><strong>البريد:</strong> ${payment.email || 'غير متوفر'}</p>
                    <p><strong>الهاتف:</strong> ${payment.phone || 'غير متوفر'}</p>
                </div>
            </div>
        `;

        new bootstrap.Modal(document.getElementById('paymentDetailsModal')).show();
    }

    // 👑 دوال إدارة المستخدمين
    async approveUser(userId) {
        try {
            const response = await fetch(`/api/users/${userId}/approve`, {
                method: 'PUT',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                this.showAlert('✅ تم تفعيل المستخدم بنجاح', 'success');
                this.loadUsers();
            } else {
                throw new Error('Failed to approve user');
            }
        } catch (error) {
            console.error('Error approving user:', error);
            this.showAlert('❌ حدث خطأ أثناء تفعيل المستخدم', 'danger');
        }
    }

    async toggleUserStatus(userId, isActive) {
        try {
            const response = await fetch(`/api/users/${userId}/status`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ is_active: isActive })
            });

            if (response.ok) {
                this.showAlert(`✅ تم ${isActive ? 'تفعيل' : 'إيقاف'} المستخدم بنجاح`, 'success');
                this.loadUsers();
            } else {
                throw new Error('Failed to toggle user status');
            }
        } catch (error) {
            console.error('Error toggling user status:', error);
            this.showAlert('❌ حدث خطأ أثناء تغيير حالة المستخدم', 'danger');
        }
    }

    // 👑 دوال إدارة المديرين
    async approveManagerRequest(managerId) {
        try {
            const response = await fetch(`/api/managers/approve/${managerId}`, {
                method: 'POST',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                this.showAlert('✅ تمت الموافقة على المدير بنجاح', 'success');
                this.loadManagers();
            } else {
                throw new Error('Failed to approve manager');
            }
        } catch (error) {
            console.error('Error approving manager:', error);
            this.showAlert('❌ حدث خطأ أثناء الموافقة على المدير', 'danger');
        }
    }

    async rejectManagerRequest(managerId) {
        if (!confirm('هل أنت متأكد من رفض هذا الطلب؟')) return;

        try {
            const response = await fetch(`/api/managers/reject/${managerId}`, {
                method: 'POST',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                this.showAlert('✅ تم رفض طلب المدير', 'success');
                this.loadManagers();
            } else {
                throw new Error('Failed to reject manager');
            }
        } catch (error) {
            console.error('Error rejecting manager:', error);
            this.showAlert('❌ حدث خطأ أثناء رفض المدير', 'danger');
        }
    }

    // 🔔 دوال الإشعارات
    async sendNotification() {
        const title = document.getElementById('notificationTitle').value;
        const message = document.getElementById('notificationMessage').value;
        const type = document.getElementById('notificationType').value;
        const userId = document.getElementById('notificationUser').value;
        const actionUrl = document.getElementById('notificationActionUrl').value;

        try {
            const response = await fetch('/api/notifications/send', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    title,
                    message,
                    type,
                    user_id: userId === 'all' ? null : userId,
                    action_url: actionUrl || null
                })
            });

            if (response.ok) {
                this.showAlert('✅ تم إرسال الإشعار بنجاح', 'success');
                document.getElementById('notificationForm').reset();
                this.loadNotifications();
            } else {
                throw new Error('Failed to send notification');
            }
        } catch (error) {
            console.error('Error sending notification:', error);
            this.showAlert('❌ حدث خطأ أثناء إرسال الإشعار', 'danger');
        }
    }

    sendNotificationToUser(userId, username) {
        document.getElementById('notificationUserId').value = userId;
        document.getElementById('notificationUserName').value = username;
        new bootstrap.Modal(document.getElementById('sendNotificationModal')).show();
    }

    async sendUserNotification() {
        const userId = document.getElementById('notificationUserId').value;
        const title = document.getElementById('userNotificationTitle').value;
        const message = document.getElementById('userNotificationMessage').value;
        
        try {
            const response = await fetch('/api/notifications/send', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    title,
                    message,
                    type: 'info',
                    user_id: userId
                })
            });

            if (response.ok) {
                this.showAlert('✅ تم إرسال الإشعار بنجاح', 'success');
                bootstrap.Modal.getInstance(document.getElementById('sendNotificationModal')).hide();
                document.getElementById('userNotificationForm').reset();
            } else {
                throw new Error('Failed to send notification');
            }
        } catch (error) {
            console.error('Error sending user notification:', error);
            this.showAlert('❌ حدث خطأ أثناء إرسال الإشعار', 'danger');
        }
    }

    populateNotificationUsers() {
        const select = document.getElementById('notificationUser');
        select.innerHTML = '<option value="all">جميع المستخدمين</option>';
        
        this.allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.username} (${this.getRoleText(user.role)})`;
            select.appendChild(option);
        });
    }

    // 🎛️ إعداد معالجات الأحداث
    setupEventListeners() {
        // فلترة الملاعب
        document.getElementById('searchStadiums').addEventListener('input', () => this.filterStadiums());
        document.getElementById('filterArea').addEventListener('change', () => this.filterStadiums());
        document.getElementById('filterType').addEventListener('change', () => this.filterStadiums());
        
        // نموذج إضافة ملعب
        document.getElementById('addPitchForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            await this.addPitch(data);
        });

        // نموذج الإشعارات
        document.getElementById('notificationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.sendNotification();
        });

        // تحديث فلتر الملاعب في الحجوزات
        this.updatePitchesFilter();
    }

    updatePitchesFilter() {
        const pitchFilter = document.getElementById('pitchFilter');
        pitchFilter.innerHTML = '<option value="">جميع الملاعب</option>' +
            this.allPitches.map(pitch => 
                `<option value="${pitch.id}">${pitch.name}</option>`
            ).join('');
    }

    populateStadiumSelect() {
        const select = document.getElementById('stadiumSelect');
        select.innerHTML = '<option value="">اختر الملعب</option>' +
            this.allPitches.map(stadium => 
                `<option value="${stadium.id}">${stadium.name}</option>`
            ).join('');
    }

    filterStadiums() {
        const searchTerm = document.getElementById('searchStadiums').value.toLowerCase();
        const areaFilter = document.getElementById('filterArea').value;
        const typeFilter = document.getElementById('filterType').value;

        const filtered = this.allPitches.filter(stadium => {
            const matchesSearch = stadium.name.toLowerCase().includes(searchTerm);
            const matchesArea = !areaFilter || stadium.area === areaFilter;
            const matchesType = !typeFilter || stadium.type === typeFilter;
            
            return matchesSearch && matchesArea && matchesType;
        });

        this.displayFilteredStadiums(filtered);
    }

    displayFilteredStadiums(stadiums) {
        const container = document.getElementById('pitchesContainer');
        
        if (stadiums.length === 0) {
            container.innerHTML = this.getEmptyState('search', 'لا توجد نتائج مطابقة', 'جرب تعديل معايير البحث');
            return;
        }

        container.innerHTML = stadiums.map(stadium => `
            <div class="col-lg-6 col-xl-4 mb-4 fade-in">
                <div class="stadium-card card-hover">
                    <div class="stadium-image img-hover-zoom" style="background-image: url('${stadium.image || '/api/placeholder/400/300'}')">
                        <span class="stadium-badge">${stadium.type === 'natural' ? 'نجيلة طبيعية' : 'نجيلة صناعية'}</span>
                        <span class="stadium-price">${stadium.price} ج.م/ساعة</span>
                    </div>
                    <div class="p-3">
                        <h5 class="mb-2">${stadium.name}</h5>
                        <p class="text-muted mb-2">
                            <i class="bi bi-geo-alt me-1"></i>${stadium.location}
                        </p>
                        <p class="text-muted mb-2">
                            <i class="bi bi-calendar me-1"></i>${stadium.availability || 'متاح'}
                        </p>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" onclick="adminSystem.editStadium(${stadium.id})">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-danger" onclick="adminSystem.confirmDelete('stadium', ${stadium.id}, '${stadium.name}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                                <button class="btn btn-outline-info" onclick="adminSystem.viewStadiumDetails(${stadium.id})">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    viewStadiumDetails(stadiumId) {
        const stadium = this.allPitches.find(s => s.id === stadiumId);
        if (!stadium) return;

        const features = stadium.features && stadium.features.length > 0 
            ? stadium.features.join('\n• ') 
            : 'لا توجد مميزات';

        alert(`تفاصيل الملعب: ${stadium.name}\nالموقع: ${stadium.location}\nالمنطقة: ${stadium.area}\nالسعر: ${stadium.price} ج.م/ساعة\nالنوع: ${stadium.type === 'natural' ? 'نجيلة طبيعية' : 'نجيلة صناعية'}\nالمميزات:\n• ${features}`);
    }

    filterBookings() {
        const statusFilter = document.getElementById('statusFilter').value;
        const pitchFilter = document.getElementById('pitchFilter').value;
        const dateFilter = document.getElementById('dateFilter').value;

        let filteredBookings = this.allBookings;

        if (statusFilter) {
            filteredBookings = filteredBookings.filter(booking => booking.status === statusFilter);
        }

        if (pitchFilter) {
            filteredBookings = filteredBookings.filter(booking => booking.pitch_id == pitchFilter);
        }

        if (dateFilter) {
            filteredBookings = filteredBookings.filter(booking => booking.date === dateFilter);
        }

        this.updateBookingsTable(filteredBookings);
    }

    filterPayments() {
        const statusFilter = document.getElementById('paymentStatusFilter').value;
        const providerFilter = document.getElementById('paymentProviderFilter').value;
        const dateFrom = document.getElementById('paymentDateFrom').value;
        const dateTo = document.getElementById('paymentDateTo').value;

        let filteredPayments = this.allPayments;

        if (statusFilter) {
            filteredPayments = filteredPayments.filter(payment => payment.status === statusFilter);
        }

        if (providerFilter) {
            filteredPayments = filteredPayments.filter(payment => payment.provider === providerFilter);
        }

        if (dateFrom) {
            filteredPayments = filteredPayments.filter(payment => payment.date >= dateFrom);
        }

        if (dateTo) {
            filteredPayments = filteredPayments.filter(payment => payment.date <= dateTo);
        }

        this.updatePaymentsTable(filteredPayments);
    }

    filterUsers() {
        const roleFilter = document.getElementById('userRoleFilter').value;
        const statusFilter = document.getElementById('userStatusFilter').value;
        const activeFilter = document.getElementById('userActiveFilter').value;

        let filteredUsers = this.allUsers;

        if (roleFilter) {
            filteredUsers = filteredUsers.filter(user => user.role === roleFilter);
        }

        if (statusFilter) {
            filteredUsers = filteredUsers.filter(user => (user.approved ? 'approved' : 'pending') === statusFilter);
        }

        if (activeFilter) {
            const isActive = activeFilter === 'active';
            filteredUsers = filteredUsers.filter(user => user.is_active === isActive);
        }

        this.updateUsersTable(filteredUsers);
    }

    filterActivityLogs() {
        const userFilter = document.getElementById('activityUserFilter').value;
        const actionFilter = document.getElementById('activityActionFilter').value;
        const dateFrom = document.getElementById('activityDateFrom').value;
        const dateTo = document.getElementById('activityDateTo').value;

        let filteredLogs = this.activityLogs;

        if (userFilter) {
            filteredLogs = filteredLogs.filter(log => log.user_id == userFilter);
        }

        if (actionFilter) {
            filteredLogs = filteredLogs.filter(log => log.action === actionFilter);
        }

        if (dateFrom) {
            filteredLogs = filteredLogs.filter(log => new Date(log.created_at) >= new Date(dateFrom));
        }

        if (dateTo) {
            filteredLogs = filteredLogs.filter(log => new Date(log.created_at) <= new Date(dateTo));
        }

        this.updateActivityLogsTable(filteredLogs);
    }

    // 🔄 التحديث التلقائي
    startAutoRefresh() {
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.loadInitialData();
            }
        }, 300000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.loadInitialData();
            }
        });
    }

    // 🔐 معالجة أخطاء المصادقة
    handleAuthError() {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

// 🌟 تهيئة النظام
const adminSystem = new AdminManagementSystem();

// 🔧 دوال عامة
function logout() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

function refreshAll() {
    adminSystem.loadInitialData();
    adminSystem.showAlert('تم تحديث البيانات', 'info');
}

function exportData() {
    const data = {
        stadiums: adminSystem.allPitches,
        bookings: adminSystem.allBookings,
        users: adminSystem.allUsers,
        payments: adminSystem.allPayments,
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    adminSystem.showAlert('تم تصدير البيانات بنجاح', 'success');
}

function showAddPitchModal() {
    new bootstrap.Modal(document.getElementById('addPitchModal')).show();
}

function addPitch() {
    document.getElementById('addPitchForm').dispatchEvent(new Event('submit'));
}

function addTimeSlots() {
    // سيتم تنفيذها في المستقبل
    adminSystem.showAlert('هذه الخاصية قيد التطوير', 'info');
}

function filterBookings() {
    adminSystem.filterBookings();
}

function filterPayments() {
    adminSystem.filterPayments();
}

function filterUsers() {
    adminSystem.filterUsers();
}

function sendUserNotification() {
    adminSystem.sendUserNotification();
}

function generateReport() {
    adminSystem.showAlert('هذه الخاصية قيد التطوير', 'info');
}

function exportToPDF() {
    adminSystem.showAlert('هذه الخاصية قيد التطوير', 'info');
}

function exportToExcel() {
    adminSystem.showAlert('هذه الخاصية قيد التطوير', 'info');
}

function filterActivityLogs() {
    adminSystem.filterActivityLogs();
}

function showHelp() {
    new bootstrap.Modal(document.getElementById('helpModal')).show();
}

function showSystemInfo() {
    const info = `
        <strong>معلومات النظام:</strong><br>
        - الإصدار: 2.0.0<br>
        - آخر تحديث: ${new Date().toLocaleDateString('ar-EG')}<br>
        - عدد الملاعب: ${adminSystem.allPitches.length}<br>
        - عدد المستخدمين: ${adminSystem.allUsers.length}<br>
        - عدد الحجوزات: ${adminSystem.allBookings.length}
    `;
    adminSystem.showAlert(info, 'info');
}

// دوال التصدير
function exportBookings() {
    const data = adminSystem.allBookings;
    const csv = convertToCSV(data);
    downloadCSV(csv, 'bookings.csv');
    adminSystem.showAlert('تم تصدير الحجوزات بنجاح', 'success');
}

function exportPayments() {
    const data = adminSystem.allPayments;
    const csv = convertToCSV(data);
    downloadCSV(csv, 'payments.csv');
    adminSystem.showAlert('تم تصدير المدفوعات بنجاح', 'success');
}

function exportUsers() {
    const data = adminSystem.allUsers;
    const csv = convertToCSV(data);
    downloadCSV(csv, 'users.csv');
    adminSystem.showAlert('تم تصدير المستخدمين بنجاح', 'success');
}

function exportActivityLogs() {
    const data = adminSystem.activityLogs;
    const csv = convertToCSV(data);
    downloadCSV(csv, 'activity-logs.csv');
    adminSystem.showAlert('تم تصدير سجل الأنشطة بنجاح', 'success');
}

function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        });
        csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 🎯 تهيئة الصفحة
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 بدء تحميل لوحة الأدمن...');
    
    // إعداد تاريخ اليوم
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        input.min = today;
        if (!input.value) {
            input.value = today;
        }
    });

    console.log('✅ تم تحميل لوحة الأدمن بنجاح');
});
