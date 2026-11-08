// SCENE 1: STANDBY SURVEILLANCE (ARMED & FULL TELEMETRY + AUDIO/IGNITION RESET)
window.Scene1Standby = {
    enter: function () {
        switchMainPOV('orbit');

        // 1. Stop any active Siren audio
        window.CarAudio?.stopSiren();

        // 2. Hide suspect & bounding box
        if (window.CarGuard.thiefGroup) window.CarGuard.thiefGroup.visible = false;
        const bbox = document.getElementById('cam1-bbox');
        if (bbox) bbox.classList.add('hidden');

        // 3. Restore intact Right Window & hide shattered glass shards / siren light
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.Scene3Breakin && window.Scene3Breakin.shardsGroup) {
            window.Scene3Breakin.shardsGroup.visible = false;
        }
        if (window.Scene3Breakin && window.Scene3Breakin.sirenLight) {
            window.Scene3Breakin.sirenLight.intensity = 0;
        }

        // 4. Close the Hinged Flip-Guard, reset Fingerprint Ring, hide 3D Key & turn off Headlights
        if (window.CarGuard.servoShieldMesh) {
            window.CarGuard.servoShieldMesh.rotation.x = 0;
        }
        if (window.CarGuard.fingerprintMesh) {
            window.CarGuard.fingerprintMesh.material.color.setHex(0x38bdf8);
        }
        if (window.CarGuard.keyMesh) {
            window.CarGuard.keyMesh.visible = false;
            window.CarGuard.keyMesh.position.set(-0.018, 0, -0.065);
            window.CarGuard.keyMesh.rotation.set(0, 0, 0);
        }
        if (window.CarGuard.headlightsGroup) {
            window.CarGuard.headlightsGroup.visible = false;
        }

        // 5. Reset Cones (0 & 1 = Green B-Pillar Cones, 2 = Cyan Dashboard Cone)
        if (window.CarGuard.fovCones[0]) window.CarGuard.fovCones[0].material.color.setHex(0x10b981);
        if (window.CarGuard.fovCones[1]) window.CarGuard.fovCones[1].material.color.setHex(0x10b981);
        if (window.CarGuard.fovCones[2]) window.CarGuard.fovCones[2].material.color.setHex(0x38bdf8);

        // 6. Hide interactive overlays from Scene 2 & Scene 4
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');
        document.getElementById('start-engine-box')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        // 7. Full Telemetry Reset on Right Panel
        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-emerald-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'STATE: STANDBY ARMED';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-emerald-400 font-semibold';

        document.getElementById('tel-radar').innerText = '3-CAM ACTIVE (OK)';
        document.getElementById('tel-radar').className = 'text-emerald-400 font-semibold';

        document.getElementById('tel-timer').innerText = '00:00 / 05:00';
        document.getElementById('tel-timer').className = 'text-cyan-300 font-bold';

        document.getElementById('tel-glass').innerText = 'NORMAL (12 Hz)';
        document.getElementById('tel-glass').className = 'text-emerald-400';

        document.getElementById('tel-shield').innerHTML = '<i class="fa-solid fa-lock mr-1"></i>FLIP-GUARD LOCKED';
        document.getElementById('tel-shield').className = 'text-amber-400 font-semibold';

        logTelegram('[STANDBY] All sensors, Keyhole Flip-Guard & Headlights reset. System armed.');
    },

    update: function () {
        // Keep car stationary so cameras and calibration stay locked in place
        if (activeMainPOV === 'orbit' && window.CarGuard.carGroup) {
            window.CarGuard.carGroup.rotation.y = 0;
        }
    }
};