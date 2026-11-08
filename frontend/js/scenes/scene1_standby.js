// SCENE 1: STANDBY SURVEILLANCE (ARMED & FULL TELEMETRY RESET)
window.Scene1Standby = {
    enter: function () {
        switchMainPOV('orbit');

        // 1. Hide suspect & bounding box
        if (window.CarGuard.thiefGroup) window.CarGuard.thiefGroup.visible = false;
        const bbox = document.getElementById('cam1-bbox');
        if (bbox) bbox.classList.add('hidden');

        // 2. Restore intact Right Window & hide any shattered glass shards
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.Scene3Breakin && window.Scene3Breakin.shardsGroup) {
            window.Scene3Breakin.shardsGroup.visible = false;
        }
        if (window.Scene3Breakin && window.Scene3Breakin.sirenLight) {
            window.Scene3Breakin.sirenLight.intensity = 0;
        }

        // 3. Lock the 3D Mechanical Servo Shield back over the Start Button
        if (window.CarGuard.servoShieldMesh) {
            window.CarGuard.servoShieldMesh.rotation.x = 0;
        }

        // 4. Reset FOV Cones to Normal Green
        window.CarGuard.fovCones.forEach(c => c.material.color.setHex(0x10b981));

        // 5. Hide interactive overlays from Scene 2 & Scene 4
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        // 6. Full Telemetry Reset on Right Panel
        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-emerald-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'STATE: STANDBY ARMED';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-emerald-400 font-semibold';

        document.getElementById('tel-radar').innerText = 'ACTIVE (GREEN)';
        document.getElementById('tel-radar').className = 'text-emerald-400 font-semibold';

        document.getElementById('tel-timer').innerText = '00:00 / 05:00';
        document.getElementById('tel-timer').className = 'text-cyan-300 font-bold';

        document.getElementById('tel-glass').innerText = 'NORMAL (12 Hz)';
        document.getElementById('tel-glass').className = 'text-emerald-400';

        document.getElementById('tel-shield').innerHTML = '<i class="fa-solid fa-lock mr-1"></i>LOCKED (CLOSED)';
        document.getElementById('tel-shield').className = 'text-amber-400 font-semibold';

        logTelegram('[STANDBY] All sensors reset. Cross-Cabin B-Pillar radar active.');
    },

    update: function () {
        // Gentle turntable orbit rotation during standby
        if (activeMainPOV === 'orbit' && window.CarGuard.carGroup) {
            window.CarGuard.carGroup.rotation.y += 0.0018;
        }
    }
};