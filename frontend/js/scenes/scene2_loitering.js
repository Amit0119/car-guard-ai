// SCENE 2: SUSPECT LOITERING (YOLOv8 TRACKING + 5-MIN REALTIME TIMER)
window.Scene2Loitering = {
    seconds: 0,
    timerId: null,
    alertSent: false,
    walkAngle: 0,

    enter: function () {
        this.cleanup();
        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;

        // Restore window if coming from Scene 3
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.Scene3Breakin?.shardsGroup) window.Scene3Breakin.shardsGroup.visible = false;
        if (window.Scene3Breakin?.sirenLight) window.Scene3Breakin.sirenLight.intensity = 0;

        // Show 3D Suspect outside Front Right Driver Window (Z = +0.38) & CAM-01 Red YOLO Bounding Box
        if (window.CarGuard.thiefGroup) {
            window.CarGuard.thiefGroup.visible = true;
            window.CarGuard.thiefGroup.position.set(1.95, 0, 0.38);
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
        document.getElementById('system-status-text').innerText = 'ALERT: SUSPECT LOITERING';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-amber-400 font-semibold';
        document.getElementById('tel-radar').innerText = 'YOLOv8 TRACKING (0.94)';
        document.getElementById('tel-radar').className = 'text-amber-400 font-semibold';
        document.getElementById('tel-glass').innerText = 'NORMAL (14 Hz)';
        document.getElementById('tel-glass').className = 'text-emerald-400';

        logTelegram('[YOLOv8] Person tracked outside Front Right Door by CAM-01 (Left B-Pillar).');

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
            logTelegram('📸 [PRE-EMPTIVE ALERT] 5-Min Loitering threshold exceeded! Silent snapshot sent to Owner via Telegram.');
        }
    },

    update: function () {
        // Subtle pacing motion of the suspect outside the Front Right Window (Z = +0.38)
        if (window.CarGuard.thiefGroup && window.CarGuard.thiefGroup.visible) {
            this.walkAngle += 0.035;
            window.CarGuard.thiefGroup.position.z = 0.38 + Math.sin(this.walkAngle) * 0.28;
            window.CarGuard.thiefGroup.rotation.y = Math.cos(this.walkAngle) * 0.25;
        }
    },

    cleanup: function () {
        if (this.timerId) clearInterval(this.timerId);
    }
};