// SCENE 2: 360-DEGREE PERIMETER LOITERING (CROSS-CABIN CAM-01 & CAM-02 TRACKING + 5-MIN TIMER)
window.Scene2Loitering = {
    seconds: 0,
    timerId: null,
    alertSent: false,
    walkAngle: 0,

    enter: function () {
        this.cleanup();
        window.CarAudio?.stopSiren();
        if (window.Scene4Cockpit) window.Scene4Cockpit.stopLivenessPolling();
        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;

        // Switch to 3D Orbit POV so user sees the .GLB suspect walking 360 degrees around the car
        switchMainPOV('orbit');

        // Restore both Right & Left windows if coming from Scene 3
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.CarGuard.leftWindowMesh) window.CarGuard.leftWindowMesh.visible = true;
        if (window.Scene3Breakin?.shardsGroup) window.Scene3Breakin.shardsGroup.visible = false;
        if (window.Scene3Breakin?.sirenLight) window.Scene3Breakin.sirenLight.intensity = 0;

        // Configure .GLB character as walking suspect (with Red BBox, without hammer strike)
        if (typeof window.setHumanCharacterState === 'function') {
            window.setHumanCharacterState('thief', 'walking');
        }
        if (window.CarGuard.hammerGroup) {
            window.CarGuard.hammerGroup.visible = false; // Hide hammer during loitering recon
        }

        this.walkAngle = 0;
        if (window.CarGuard.thiefGroup) {
            window.CarGuard.thiefGroup.visible = true;
            window.CarGuard.thiefGroup.position.set(1.75, 0, 0);
            window.CarGuard.thiefGroup.rotation.y = 0;
        }

        document.getElementById('cam1-bbox')?.classList.remove('hidden');
        document.getElementById('loiter-controls')?.classList.remove('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        // Turn Left B-Pillar Cone Amber (Tracking), Right Cone Green, Dashboard Cone Cyan
        if (window.CarGuard.fovCones[0]) window.CarGuard.fovCones[0].material.color.setHex(0xf59e0b);
        if (window.CarGuard.fovCones[1]) window.CarGuard.fovCones[1].material.color.setHex(0x10b981);
        if (window.CarGuard.fovCones[2]) window.CarGuard.fovCones[2].material.color.setHex(0x38bdf8);

        // Update Telemetry UI
        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-amber-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'ALERT: 360° PERIMETER LOITERING';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-amber-400 font-semibold';
        document.getElementById('tel-radar').innerText = 'YOLOv8 360° TRACKING (0.94)';
        document.getElementById('tel-radar').className = 'text-amber-400 font-semibold';
        document.getElementById('tel-glass').innerText = 'NORMAL (14 Hz)';
        document.getElementById('tel-glass').className = 'text-emerald-400';

        const timerEl = document.getElementById('tel-timer');
        if (timerEl) timerEl.className = 'mono text-amber-400 font-semibold';

        logTelegram('🚶 [YOLOv8 PERIMETER] Suspect circling vehicle perimeter. Cross-cabin CAM-01 & CAM-02 tracking active.');

        this.seconds = 0;
        this.alertSent = false;
        this.updateTimerUI();

        this.timerId = setInterval(() => {
            this.seconds++;
            this.updateTimerUI();
        }, 1000);
    },

    fastForward60s: function () {
        this.seconds = Math.min(300, this.seconds + 60);
        this.updateTimerUI();
    },

    updateTimerUI: function () {
        const mins = String(Math.floor(this.seconds / 60)).padStart(2, '0');
        const secs = String(this.seconds % 60).padStart(2, '0');
        const timerEl = document.getElementById('tel-timer');
        if (timerEl) timerEl.innerText = `${mins}:${secs} / 05:00`;

        if (this.seconds >= 300 && !this.alertSent) {
            this.alertSent = true;
            if (timerEl) timerEl.className = 'text-rose-400 font-bold animate-pulse';
            logTelegram('📸 [PRE-EMPTIVE ALERT] 5-Min Loitering threshold exceeded! Dispatched snapshot & live GPS via WhatsApp Cloud.');
        }
    },

    update: function () {
        const thief = window.CarGuard.thiefGroup;
        if (!thief || !thief.visible) return;

        // Smooth 360-degree elliptical patrol path around the entire car
        const rx = 1.75; // Clears left/right doors
        const rz = 2.95; // Clears front hood and rear trunk
        this.walkAngle += 0.012;

        const nextX = Math.cos(this.walkAngle) * rx;
        const nextZ = Math.sin(this.walkAngle) * rz;

        // Tangent velocity vector so the .GLB human faces the exact walking direction
        const dx = -Math.sin(this.walkAngle) * rx;
        const dz = Math.cos(this.walkAngle) * rz;

        thief.position.x = nextX;
        thief.position.z = nextZ;
        thief.rotation.y = Math.atan2(dx, dz);

        // Dynamic Cross-Cabin Radar Handoff between CAM-01 (Right Side) and CAM-02 (Left Side)
        const cone1 = window.CarGuard.fovCones[0];
        const cone2 = window.CarGuard.fovCones[1];
        const radarEl = document.getElementById('tel-radar');

        if (nextX >= 0) {
            if (cone1) cone1.material.color.setHex(0xf59e0b); // CAM-01 Amber
            if (cone2) cone2.material.color.setHex(0x10b981); // CAM-02 Green
            if (radarEl) radarEl.innerText = 'CAM-01 TRACKING RIGHT (0.94)';
        } else {
            if (cone1) cone1.material.color.setHex(0x10b981); // CAM-01 Green
            if (cone2) cone2.material.color.setHex(0xf59e0b); // CAM-02 Amber
            if (radarEl) radarEl.innerText = 'CAM-02 TRACKING LEFT (0.93)';
        }
    },

    cleanup: function () {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
};