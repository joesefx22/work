// نظام اللاعبين - لاعبوني معاكم
class PlayersSystem {
    constructor() {
        this.goldenSlots = [];
        this.playerRequests = [];
        this.init();
    }

    init() {
        this.loadGoldenSlots();
        this.setupEventListeners();
        setInterval(() => this.loadGoldenSlots(), 30000); // تحديث كل 30 ثانية
    }

    async loadGoldenSlots() {
        try {
            const response = await fetch('/api/golden-slots');
            if (response.ok) {
                this.goldenSlots = await response.json();
                this.displayGoldenSlots();
                this.updateStats();
            }
        } catch (error) {
            console.error('Error loading golden slots:', error);
        }
    }

    displayGoldenSlots() {
        const container = document.getElementById('goldenSlotsContainer');
        
        if (this.goldenSlots.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info text-center">
                        <i class="bi bi-info-circle me-2"></i>
                        لا توجد ساعات تحتاج لاعبين حالياً
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.goldenSlots.map(slot => `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card golden-slot h-100">
                    <div class="card-body">
                        <h5 class="card-title">${slot.stadium_name}</h5>
                        <p class="card-text">
                            <i class="bi bi-calendar me-2"></i>${slot.date}<br>
                            <i class="bi bi-clock me-2"></i>${slot.start_time} - ${slot.end_time}<br>
                            <i class="bi bi-person me-2"></i>بحاجة لـ ${slot.players_needed} لاعبين<br>
                            <small class="text-muted">منظم المباراة: ${slot.booker_name}</small>
                        </p>
                        <button class="btn btn-warning btn-sm" onclick="playersSystem.showJoinRequestModal(${slot.id})">
                            <i class="bi bi-person-plus me-1"></i>انضم للمباراة
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    showJoinRequestModal(timeSlotId) {
        const slot = this.goldenSlots.find(s => s.id === timeSlotId);
        if (!slot) return;

        document.getElementById('selectedTimeSlotId').value = timeSlotId;
        document.getElementById('slotDetails').innerHTML = `
            <div class="alert alert-info">
                <h6>تفاصيل الساعة:</h6>
                <p class="mb-1"><strong>الملعب:</strong> ${slot.stadium_name}</p>
                <p class="mb-1"><strong>التاريخ:</strong> ${slot.date}</p>
                <p class="mb-1"><strong>الوقت:</strong> ${slot.start_time} - ${slot.end_time}</p>
                <p class="mb-0"><strong>اللاعبين المطلوبين:</strong> ${slot.players_needed}</p>
            </div>
        `;

        // إعادة تعيين النموذج
        document.getElementById('joinRequestForm').reset();
        
        const modal = new bootstrap.Modal(document.getElementById('joinRequestModal'));
        modal.show();
    }

    async submitJoinRequest(formData) {
        try {
            const response = await fetch('/api/player-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok) {
                alert('✅ ' + result.message);
                bootstrap.Modal.getInstance(document.getElementById('joinRequestModal')).hide();
                this.loadGoldenSlots();
            } else {
                alert('❌ ' + result.message);
            }
        } catch (error) {
            console.error('Error submitting join request:', error);
            alert('❌ حدث خطأ أثناء إرسال الطلب');
        }
    }

    updateStats() {
        document.getElementById('goldenSlotsCount').textContent = this.goldenSlots.length;
        document.getElementById('totalRequests').textContent = this.playerRequests.length;
    }

    setupEventListeners() {
        document.getElementById('joinRequestForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                timeSlotId: parseInt(document.getElementById('selectedTimeSlotId').value),
                requesterName: document.getElementById('requesterName').value,
                requesterAge: parseInt(document.getElementById('requesterAge').value),
                comment: document.getElementById('requestComment').value,
                playersCount: parseInt(document.getElementById('playersCount').value)
            };

            await this.submitJoinRequest(formData);
        });
    }
}

// تهيئة النظام عند تحميل الصفحة
let playersSystem;
document.addEventListener('DOMContentLoaded', function() {
    playersSystem = new PlayersSystem();
});
