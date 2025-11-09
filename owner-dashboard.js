// 🚀 نظام إدارة صاحب الملعب
class OwnerManagementSystem {
    constructor() {
        this.currentUser = null;
        this.userRole = 'owner';
        this.managedPitches = [];
        this.allBookings = [];
        this.allPayments = [];
        this.timeSlots = [];
        this.selectedPitchId = 'all';
        this.charts = {};
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة نظام صاحب الملعب...');
        await this.checkAuth();
        this.setupEventListeners();
        await this.loadInitialData();
        this.initializeCharts();
        this.startAutoRefresh();
        console.log('✅ تم تهيئة نظام صاحب الملعب بنجاح');
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
            if (result.success && (result.user.role === 'owner' || result.user.role === 'manager')) {
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
        console.log('📊 بدء تحميل بيانات صاحب الملعب...');
        await this.loadManagedPitches();
        await this.loadBookings();
        await this.loadPayments();
        await this.loadOwnerStats();
        console.log('✅ تم تحميل بيانات صاحب الملعب بنجاح');
    }

    // 🏟️ تحميل الملاعب المُدارة
    async loadManagedPitches() {
        try {
            this.showLoading('pitchesContainer', 'جاري تحميل الملاعب...');
            const response = await fetch('/api/owner/stadiums', {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.managedPitches = result.stadiums || [];
                this.displayManagedPitches();
                this.populatePitchSelector();
                this.updatePitchesFilter();
                this.populateStadiumSelect();
            } else {
                throw new Error('Failed to load managed pitches');
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
            const response = await fetch('/api/owner/bookings', {
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

    // 💰 تحميل المدفوعات
    async loadPayments() {
        try {
            this.showLoading('paymentsTable', 'جاري تحميل المدفوعات...');
            const response = await fetch('/api/owner/payments', {
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

    // 📊 تحميل إحصائيات المدير
    async loadOwnerStats() {
        try {
            const stats = {};
            
            // إحصائيات الحجوزات
            const today = new Date().toISOString().split('T')[0];
            const todayBookings = this.allBookings.filter(b => b.date === today && b.status === 'confirmed');
            const pendingBookings = this.allBookings.filter(b => b.status === 'pending');
            
            stats.todayBookings = todayBookings.length;
            stats.totalBookings = this.allBookings.length;
            stats.pendingBookings = pendingBookings.length;
            stats.totalRevenue = this.allBookings
                .filter(b => b.status === 'confirmed')
                .reduce((sum, b) => sum + (b.final_amount || b.amount), 0);

            this.updateOwnerStats(stats);
            this.updateManagerQuickStats(stats);
            
        } catch (error) {
            console.error('❌ خطأ في تحميل الإحصائيات:', error);
        }
    }

    // 🎛️ تحديث واجهة المستخدم
    updateUserInfo() {
        document.getElementById('userInfo').textContent = `مرحبًا ${this.currentUser.username}`;
        document.getElementById('userInfoSidebar').textContent = `مرحبًا ${this.currentUser.username}`;
        document.getElementById('userRoleDisplay').textContent = 'صاحب الملعب';
    }

    // 🏟️ عرض الملاعب المُدارة
    displayManagedPitches() {
        const container = document.getElementById('managerPitchesContainer');
        const listContainer = document.getElementById('pitchesContainer');
        
        if (this.managedPitches.length === 0) {
            const emptyState = this.getEmptyState('map', 'لا توجد ملاعب', 'لا توجد ملاعب مسندة إليك');
            container.innerHTML = emptyState;
            listContainer.innerHTML = emptyState;
            document.getElementById('managedPitchesList').textContent = 'لا توجد ملاعب';
            return;
        }

        // تحديث قائمة الملاعب المُدارة
        document.getElementById('managedPitchesList').textContent = 
            this.managedPitches.map(p => p.name).join('، ');

        // عرض الملاعب في لوحة التحكم
        container.innerHTML = this.managedPitches.map(pitch => `
            <div class="col-md-6 col-lg-4 fade-in">
                <div class="manager-pitch-card card-hover">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h5>${pitch.name}</h5>
                            <small class="text-muted">${pitch.location}</small>
                        </div>
                        <div><span class="pitch-badge">#${pitch.id}</span></div>
                    </div>
                    <div class="manager-stats mt-3" id="stats-${pitch.id}">
                        <div class="manager-stat">
                            <div class="manager-stat-number">--</div>
                            <div class="manager-stat-label">حجوزات اليوم</div>
                        </div>
                        <div class="manager-stat">
                            <div class="manager-stat-number">--</div>
                            <div class="manager-stat-label">إجمالي الحجوزات</div>
                        </div>
                        <div class="manager-stat">
                            <div class="manager-stat-number">--</div>
                            <div class="manager-stat-label">إيرادات</div>
                        </div>
                    </div>
                    <div class="quick-actions mt-3">
                        <button class="btn btn-outline-primary quick-action-btn" onclick="ownerSystem.handlePitchChange(${pitch.id})">
                            إدارة هذا الملعب
                        </button>
                        <button class="btn btn-outline-info quick-action-btn" onclick="ownerSystem.viewPitchAvailability(${pitch.id})">
                            <i class="bi bi-calendar me-1"></i>المواعيد
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // عرض الملاعب في تبويب "ملاعبى"
        listContainer.innerHTML = this.managedPitches.map(pitch => `
            <div class="col-lg-6 col-xl-4 mb-4 fade-in">
                <div class="stadium-card card-hover">
                    <div class="stadium-image img-hover-zoom" style="background-image: url('${pitch.image || '/api/placeholder/400/300'}')">
                        <span class="stadium-badge">${pitch.type === 'natural' ? 'نجيلة طبيعية' : 'نجيلة صناعية'}</span>
                        <span class="stadium-price">${pitch.price} ج.م/ساعة</span>
                    </div>
                    <div class="p-3">
                        <h5 class="mb-2">${pitch.name}</h5>
                        <p class="text-muted mb-2">
                            <i class="bi bi-geo-alt me-1"></i>${pitch.location}
                        </p>
                        <p class="text-muted mb-2">
                            <i class="bi bi-calendar me-1"></i>${pitch.availability || 'متاح'}
                        </p>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" onclick="ownerSystem.editStadium(${pitch.id})">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-info" onclick="ownerSystem.viewStadiumDetails(${pitch.id})">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // تحميل إحصائيات كل ملعب
        this.managedPitches.forEach(pitch => {
            this.loadPitchStats(pitch.id);
        });
    }

    // 📊 تحميل إحصائيات الملعب
    async loadPitchStats(pitchId) {
        try {
            const response = await fetch(`/api/stadiums/${pitchId}/stats`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                const statsContainer = document.getElementById(`stats-${pitchId}`);
                if (statsContainer) {
                    statsContainer.innerHTML = `
                        <div class="manager-stat">
                            <div class="manager-stat-number">${result.todayBookings || 0}</div>
                            <div class="manager-stat-label">حجوزات اليوم</div>
                        </div>
                        <div class="manager-stat">
                            <div class="manager-stat-number">${result.totalBookings || 0}</div>
                            <div class="manager-stat-label">إجمالي الحجوزات</div>
                        </div>
                        <div class="manager-stat">
                            <div class="manager-stat-number">${result.revenue || 0}</div>
                            <div class="manager-stat-label">إيرادات (ج.م)</div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل إحصائيات الملعب:', error);
        }
    }

    // 🎯 تحديث إحصائيات المدير
    updateOwnerStats(stats) {
        document.getElementById('totalBookingsCount').textContent = stats.totalBookings || 0;
        document.getElementById('totalRevenueAmount').textContent = stats.totalRevenue || 0;
        document.getElementById('activePitchesCount').textContent = this.managedPitches.length;
        document.getElementById('pendingBookingsCount').textContent = stats.pendingBookings || 0;
        document.getElementById('successfulPaymentsCount').textContent = this.allPayments.filter(p => p.status === 'paid').length;
    }

    // 🏆 تحديث الإحصائيات السريعة
    updateManagerQuickStats(stats) {
        const container = document.getElementById('managerQuickStats');
        container.innerHTML = `
            <div class="col-lg-3 col-md-6">
                <div class="stat-card card-hover">
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-primary text-white me-3">
                            <i class="bi bi-currency-dollar"></i>
                        </div>
                        <div>
                            <div class="stat-number">${stats.totalRevenue || 0}</div>
                            <div class="stat-label">إجمالي الإيرادات</div>
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
                            <div class="stat-number">${stats.totalBookings || 0}</div>
                            <div class="stat-label">إجمالي الحجوزات</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6">
                <div class="stat-card card-hover">
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-success text-white me-3">
                            <i class="bi bi-clock"></i>
                        </div>
                        <div>
                            <div class="stat-number">${stats.todayBookings || 0}</div>
                            <div class="stat-label">حجوزات اليوم</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6">
                <div class="stat-card card-hover">
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-warning text-white me-3">
                            <i class="bi bi-hourglass-split"></i>
                        </div>
                        <div>
                            <div class="stat-number">${stats.pendingBookings || 0}</div>
                            <div class="stat-label">قيد الانتظار</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
                    ${booking.status === 'pending' && booking.deposit_amount === 0 ? `
                        <button class="btn btn-success btn-sm" onclick="ownerSystem.confirmBooking('${booking.id}')">
                            <i class="bi bi-check-lg"></i> تأكيد
                        </button>
                    ` : ''}
                    ${booking.status === 'confirmed' ? `
                        <button class="btn btn-warning btn-sm" onclick="ownerSystem.cancelBooking('${booking.id}')">
                            <i class="bi bi-x-circle"></i> إلغاء
                        </button>
                    ` : ''}
                    ${booking.status === 'pending' ? `
                        <button class="btn btn-danger btn-sm" onclick="ownerSystem.cancelBooking('${booking.id}')">
                            <i class="bi bi-x-circle"></i> إلغاء
                        </button>
                    ` : ''}
                    <button class="btn btn-info btn-sm" onclick="ownerSystem.showBookingDetails('${booking.id}')">
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
                    <button class="btn btn-info btn-sm" onclick="ownerSystem.showBookingDetails('${booking.id}')">
                        <i class="bi bi-eye"></i>
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
                    <button class="btn btn-info btn-sm" onclick="ownerSystem.showPaymentDetails('${payment.id}')">
                        <i class="bi bi-eye"></i> تفاصيل
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 🎛️ إعداد الرسوم البيانية
    initializeCharts() {
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

        // رسم بياني للحجوزات
        const bookingsCtx = document.getElementById('bookingsChart')?.getContext('2d');
        if (bookingsCtx) {
            this.charts.bookings = new Chart(bookingsCtx, {
                type: 'doughnut',
                data: {
                    labels: ['مؤكدة', 'قيد الانتظار', 'ملغية'],
                    datasets: [{
                        data: [
                            this.allBookings.filter(b => b.status === 'confirmed').length,
                            this.allBookings.filter(b => b.status === 'pending').length,
                            this.allBookings.filter(b => b.status === 'cancelled').length
                        ],
                        backgroundColor: ['#1a7f46', '#f39c12', '#e74c3c']
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
            'cancelled': 'bg-danger'
        };
        return classes[status] || 'bg-secondary';
    }

    getStatusText(status) {
        const texts = {
            'confirmed': 'مؤكد',
            'pending': 'قيد الانتظار',
            'cancelled': 'ملغي'
        };
        return texts[status] || status;
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
        const stadium = this.managedPitches.find(s => s.id === stadiumId);
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
            const response = await fetch(`/api/owner/stadiums/${data.id}`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(data)
            });

            if (response.ok) {
                this.showAlert('✅ تم تحديث بيانات الملعب بنجاح', 'success');
                bootstrap.Modal.getInstance(document.getElementById('editStadiumModal')).hide();
                this.loadManagedPitches();
            } else {
                this.showAlert('❌ حدث خطأ أثناء تحديث الملعب', 'danger');
            }
        } catch (error) {
            console.error('Error updating stadium:', error);
            this.showAlert('❌ حدث خطأ أثناء تحديث الملعب', 'danger');
        }
    }

    // ✅ تأكيد الحجز
    async confirmBooking(bookingId) {
        try {
            const response = await fetch(`/api/owner/bookings/${bookingId}/confirm`, {
                method: 'POST',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                this.showAlert('✅ تم تأكيد الحجز بنجاح', 'success');
                this.loadBookings();
                this.loadOwnerStats();
            } else {
                const error = await response.json();
                this.showAlert(`❌ ${error.message || 'حدث خطأ أثناء تأكيد الحجز'}`, 'danger');
            }
        } catch (error) {
            console.error('Error confirming booking:', error);
            this.showAlert('❌ حدث خطأ أثناء تأكيد الحجز', 'danger');
        }
    }

    // ❌ إلغاء الحجز
    async cancelBooking(bookingId) {
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
            const response = await fetch(`/api/owner/bookings/${this.currentBookingToCancel}/cancel`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    cancellation_reason: reason || 'إلغاء من صاحب الملعب'
                })
            });

            if (response.ok) {
                this.showAlert('✅ تم إلغاء الحجز بنجاح', 'success');
                bootstrap.Modal.getInstance(document.getElementById('cancelBookingModal')).hide();
                this.loadBookings();
                this.loadOwnerStats();
            } else {
                throw new Error('Failed to cancel booking');
            }
        } catch (error) {
            console.error('Error cancelling booking:', error);
            this.showAlert('❌ حدث خطأ أثناء إلغاء الحجز', 'danger');
        }
    }

    // 👁️ عرض تفاصيل الحجز
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

    // 👁️ عرض تفاصيل الدفع
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

    // 🎛️ إدارة محدد الملعب
    populatePitchSelector() {
        const selector = document.getElementById('pitchSelector');
        selector.innerHTML = '<option value="all">عرض كل الملاعب</option>';
        
        this.managedPitches.forEach(pitch => {
            const option = document.createElement('option');
            option.value = pitch.id;
            option.textContent = pitch.name;
            selector.appendChild(option);
        });
        
        if (this.selectedPitchId) {
            selector.value = this.selectedPitchId;
        }
        
        this.updateSelectedPitchInfo();
    }

    updateSelectedPitchInfo() {
        const infoElement = document.getElementById('selectedPitchInfo');
        
        if (this.selectedPitchId === 'all') {
            infoElement.textContent = `(${this.managedPitches.length} ملعب)`;
        } else {
            const pitch = this.managedPitches.find(p => p.id == this.selectedPitchId);
            infoElement.textContent = pitch ? `(${pitch.name})` : '';
        }
    }

    handlePitchChange(pitchId) {
        this.selectedPitchId = pitchId;
        this.updateSelectedPitchInfo();
        
        // تحميل البيانات الخاصة بالملعب المحدد
        this.loadBookingsForPitch(pitchId);
        this.loadPaymentsForPitch(pitchId);
        this.loadTimeSlotsForPitch(pitchId);
        
        this.showAlert(`تم التبديل إلى ${pitchId === 'all' ? 'كل الملاعب' : 'ملعب محدد'}`, 'info');
    }

    async loadBookingsForPitch(pitchId) {
        try {
            let url = '/api/owner/bookings';
            if (pitchId !== 'all') {
                url += `?pitch_id=${pitchId}`;
            }

            const response = await fetch(url, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                const filteredBookings = result.bookings || [];
                this.updateBookingsTable(filteredBookings);
                this.updateRecentBookings(filteredBookings.slice(0, 5));
            }
        } catch (error) {
            console.error('Error loading pitch bookings:', error);
        }
    }

    async loadPaymentsForPitch(pitchId) {
        try {
            let url = '/api/owner/payments';
            if (pitchId !== 'all') {
                url += `?pitch_id=${pitchId}`;
            }

            const response = await fetch(url, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                const filteredPayments = result.payments || [];
                this.updatePaymentsTable(filteredPayments);
            }
        } catch (error) {
            console.error('Error loading pitch payments:', error);
        }
    }

    async loadTimeSlotsForPitch(pitchId) {
        if (pitchId !== 'all') {
            document.getElementById('stadiumSelect').value = pitchId;
            await this.loadSelectedTimeSlots();
        }
    }

    // 🕒 إدارة الساعات
    populateStadiumSelect() {
        const select = document.getElementById('stadiumSelect');
        select.innerHTML = '<option value="">اختر الملعب</option>';
        
        this.managedPitches.forEach(stadium => {
            const option = document.createElement('option');
            option.value = stadium.id;
            option.textContent = stadium.name;
            select.appendChild(option);
        });
    }

    async loadSelectedTimeSlots() {
        const stadiumId = document.getElementById('stadiumSelect').value;
        const date = document.getElementById('slotDate').value;
        
        if (stadiumId && date) {
            await this.loadTimeSlots(stadiumId, date);
        }
    }

    async loadTimeSlots(stadiumId, date) {
        try {
            this.showLoading('timeSlotsContainer', 'جاري تحميل الساعات...');
            const response = await fetch(`/api/owner/time-slots/${stadiumId}?date=${date}`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                this.timeSlots = result.time_slots || [];
                this.displayTimeSlots();
                document.getElementById('addTimeSlotsSection').style.display = 'block';
            } else {
                throw new Error('Failed to load time slots');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الساعات:', error);
            this.showAlert('حدث خطأ في تحميل الساعات', 'danger');
        }
    }

    displayTimeSlots() {
        const container = document.getElementById('timeSlotsContainer');
        
        if (this.timeSlots.length === 0) {
            container.innerHTML = this.getEmptyState('clock', 'لا توجد ساعات', 'يمكنك إضافة ساعات جديدة للملعب');
            return;
        }

        container.innerHTML = `
            <h6 class="mb-3">الساعات المتاحة</h6>
            <div class="time-slot-grid">
                ${this.timeSlots.map(slot => `
                    <div class="time-slot ${slot.status} ${slot.selected ? 'selected' : ''}" 
                         onclick="ownerSystem.toggleTimeSlot(${slot.id})">
                        ${slot.start_time} - ${slot.end_time}
                        <br>
                        <small>${slot.price} ج.م</small>
                        <br>
                        <small class="status-badge">${this.getSlotStatusText(slot.status)}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getSlotStatusText(status) {
        const texts = {
            'available': 'متاح',
            'booked': 'محجوز',
            'pending': 'قيد الانتظار'
        };
        return texts[status] || status;
    }

    toggleTimeSlot(slotId) {
        const slot = this.timeSlots.find(s => s.id === slotId);
        if (slot && slot.status === 'available') {
            slot.selected = !slot.selected;
            this.displayTimeSlots();
        }
    }

    async addTimeSlots() {
        const stadiumId = document.getElementById('stadiumSelect').value;
        const date = document.getElementById('slotDate').value;
        
        if (!stadiumId || !date) {
            this.showAlert('يرجى اختيار الملعب والتاريخ', 'warning');
            return;
        }

        try {
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;
            
            const response = await fetch(`/api/owner/time-slots`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    stadium_id: stadiumId,
                    date: date,
                    start_time: startTime,
                    end_time: endTime
                })
            });

            if (response.ok) {
                this.showAlert('✅ تم إضافة الساعات بنجاح', 'success');
                await this.loadTimeSlots(stadiumId, date);
            } else {
                this.showAlert('❌ حدث خطأ أثناء إضافة الساعات', 'danger');
            }
        } catch (error) {
            console.error('Error adding time slots:', error);
            this.showAlert('❌ حدث خطأ أثناء إضافة الساعات', 'danger');
        }
    }

    viewPitchAvailability(pitchId) {
        document.querySelector('a[href="#time-slots"]').click();
        document.getElementById('stadiumSelect').value = pitchId;
        document.getElementById('slotDate').value = new Date().toISOString().split('T')[0];
        this.loadSelectedTimeSlots();
    }

    viewStadiumDetails(stadiumId) {
        const stadium = this.managedPitches.find(s => s.id === stadiumId);
        if (!stadium) return;

        const features = stadium.features && stadium.features.length > 0 
            ? stadium.features.join('\n• ') 
            : 'لا توجد مميزات';

        alert(`تفاصيل الملعب: ${stadium.name}\nالموقع: ${stadium.location}\nالمنطقة: ${stadium.area}\nالسعر: ${stadium.price} ج.م/ساعة\nالنوع: ${stadium.type === 'natural' ? 'نجيلة طبيعية' : 'نجيلة صناعية'}\nالمميزات:\n• ${features}`);
    }

    // 🎛️ إعداد معالجات الأحداث
    setupEventListeners() {
        // فلترة الملاعب
        document.getElementById('searchStadiums').addEventListener('input', () => this.filterStadiums());
        document.getElementById('filterArea').addEventListener('change', () => this.filterStadiums());
        
        // إدارة الساعات
        document.getElementById('stadiumSelect').addEventListener('change', () => this.loadSelectedTimeSlots());
        document.getElementById('slotDate').addEventListener('change', () => this.loadSelectedTimeSlots());
        
        // تحديث فلتر الملاعب في الحجوزات
        this.updatePitchesFilter();
    }

    updatePitchesFilter() {
        const pitchFilter = document.getElementById('pitchFilter');
        pitchFilter.innerHTML = '<option value="">جميع الملاعب</option>' +
            this.managedPitches.map(pitch => 
                `<option value="${pitch.id}">${pitch.name}</option>`
            ).join('');
    }

    filterStadiums() {
        const searchTerm = document.getElementById('searchStadiums').value.toLowerCase();
        const areaFilter = document.getElementById('filterArea').value;

        const filtered = this.managedPitches.filter(stadium => {
            const matchesSearch = stadium.name.toLowerCase().includes(searchTerm);
            const matchesArea = !areaFilter || stadium.area === areaFilter;
            
            return matchesSearch && matchesArea;
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
                                <button class="btn btn-outline-primary" onclick="ownerSystem.editStadium(${stadium.id})">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-info" onclick="ownerSystem.viewStadiumDetails(${stadium.id})">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
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
const ownerSystem = new OwnerManagementSystem();

// 🔧 دوال عامة
function logout() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

function refreshAll() {
    ownerSystem.loadInitialData();
    ownerSystem.showAlert('تم تحديث البيانات', 'info');
}

function exportData() {
    const data = {
        stadiums: ownerSystem.managedPitches,
        bookings: ownerSystem.allBookings,
        payments: ownerSystem.allPayments,
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
    
    ownerSystem.showAlert('تم تصدير البيانات بنجاح', 'success');
}

function addTimeSlots() {
    ownerSystem.addTimeSlots();
}

function filterBookings() {
    ownerSystem.filterBookings();
}

function filterPayments() {
    ownerSystem.filterPayments();
}

function exportToPDF() {
    ownerSystem.showAlert('هذه الخاصية قيد التطوير', 'info');
}

function exportToExcel() {
    ownerSystem.showAlert('هذه الخاصية قيد التطوير', 'info');
}

// دوال التصدير
function exportBookings() {
    const data = ownerSystem.allBookings;
    const csv = convertToCSV(data);
    downloadCSV(csv, 'bookings.csv');
    ownerSystem.showAlert('تم تصدير الحجوزات بنجاح', 'success');
}

function exportPayments() {
    const data = ownerSystem.allPayments;
    const csv = convertToCSV(data);
    downloadCSV(csv, 'payments.csv');
    ownerSystem.showAlert('تم تصدير المدفوعات بنجاح', 'success');
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
    console.log('🚀 بدء تحميل لوحة صاحب الملعب...');
    
    // إعداد تاريخ اليوم
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        input.min = today;
        if (!input.value) {
            input.value = today;
        }
    });

    console.log('✅ تم تحميل لوحة صاحب الملعب بنجاح');
});
