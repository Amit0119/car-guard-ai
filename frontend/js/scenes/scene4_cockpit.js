// SCENE 4: ADAPTIVE ZERO-TRUST COCKPIT AUTH (ANY 2-OF-3 NORMAL + 3-OF-3 THREAT LOCKDOWN)
window.Scene4Cockpit = {
    blinkCount: 0,
    fpVerified: false,
    pinVerified: false,
    threatLockdown: false, // false = Any 2-of-3 Unlock | true = All 3-of-3 Mandatory
    isUnlocked: false,
    targetFlipAngle: 0,    // 0 = Closed flat over keyhole, 1.95 rad (~110 deg) = Flipped Open upward

    enter: function () {
        if (window.Scene2Loitering) window.Scene2Loitering.cleanup();
        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;

        // 1. AUTO-DETECT PRIOR THREAT: Check if we came from Scene 2 (Loitering) or Scene 3 (Break-In)
        const cameFromThreat =
            (window.CarGuard.thiefGroup && window.CarGuard.thiefGroup.visible) ||
            (window.Scene3Breakin?.shardsGroup && window.Scene3Breakin.shardsGroup.visible);

        this.threatLockdown = Boolean(cameFromThreat);

        // Clean up external scene objects
        if (window.CarGuard.thiefGroup) window.CarGuard.thiefGroup.visible = false;
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.Scene3Breakin?.shardsGroup) window.Scene3Breakin.shardsGroup.visible = false;
        if (window.Scene3Breakin?.sirenLight) window.Scene3Breakin.sirenLight.intensity = 0;

        document.getElementById('cam1-bbox')?.classList.add('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        // Prevent Right Panel & Calibrate Button overlap at the bottom
        const tgLog = document.getElementById('telegram-log');
        if (tgLog) tgLog.className = 'bg-slate-950/90 rounded-lg p-2 mono text-[10px] text-slate-300 h-20 overflow-y-auto space-y-1 border border-slate-800';
        const calibWidget = document.getElementById('calib-widget');
        if (calibWidget) calibWidget.className = 'fixed bottom-16 left-80 z-30 pointer-events-auto mono text-xs';

        // Switch Main Screen to Cockpit Driver POV
        switchMainPOV('cockpit');

        // Reset all 3 security factors & close the Hinged Flip-Guard
        this.blinkCount = 0;
        this.fpVerified = false;
        this.pinVerified = false;
        this.isUnlocked = false;
        this.targetFlipAngle = 0;

        if (window.CarGuard.servoShieldMesh) {
            window.CarGuard.servoShieldMesh.position.set(-0.018, 0.020, -0.008);
            window.CarGuard.servoShieldMesh.rotation.x = 0;
        }
        if (window.CarGuard.fingerprintMesh) {
            window.CarGuard.fingerprintMesh.material.color.setHex(0x38bdf8);
        }

        // Reset Modal Inputs & Badges
        const modal = document.getElementById('cockpit-auth-modal');
        if (modal) modal.classList.remove('hidden');

        const pinInput = document.getElementById('pin-input');
        if (pinInput) {
            pinInput.value = '';
            pinInput.placeholder = '2026';
        }

        const step1 = document.getElementById('auth-step1-badge');
        if (step1) {
            step1.innerText = 'PENDING (0/2 BLINKS)';
            step1.className = 'text-amber-400 font-bold';
        }
        const step2 = document.getElementById('auth-step2-badge');
        if (step2) {
            step2.innerText = 'WAITING TOUCH...';
            step2.className = 'text-amber-400 font-bold';
        }

        document.getElementById('blinks-readout').innerText = 'BLINKS: 0/2';

        // Update Telemetry cleanly
        document.getElementById('tel-radar').innerText = 'COCKPIT BIOMETRICS';
        document.getElementById('tel-radar').className = 'text-cyan-400 font-semibold';
        document.getElementById('tel-timer').innerText = '00:00 / 05:00';
        document.getElementById('tel-timer').className = 'text-cyan-300 font-bold';

        this.updateLockdownUI();
    },

    // Toggle between 2-of-3 Normal Mode and 3-of-3 Threat Lockdown Mode (can also be clicked manually in UI)
    toggleLockdownMode: function () {
        this.threatLockdown = !this.threatLockdown;
        this.isUnlocked = false;
        this.targetFlipAngle = 0;
        if (window.CarGuard.servoShieldMesh) {
            window.CarGuard.servoShieldMesh.rotation.x = 0;
        }
        this.updateLockdownUI();
        this.checkUnlockCondition();
    },

    updateLockdownUI: function () {
        const modal = document.getElementById('cockpit-auth-modal');
        const header = modal ? modal.querySelector('h3') : null;

        if (header) {
            if (this.threatLockdown) {
                header.innerHTML = `
                    <span class="text-rose-400"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Threat Lockdown Auth</span>
                    <button onclick="window.Scene4Cockpit.toggleLockdownMode()" title="Click to switch mode" class="mono text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/50 px-1.5 py-0.5 rounded hover:bg-rose-500/30">
                        3-OF-3 MANDATORY
                    </button>
                `;
            } else {
                header.innerHTML = `
                    <span class="text-emerald-400"><i class="fa-solid fa-key mr-1"></i> Smart Keyhole Auth</span>
                    <button onclick="window.Scene4Cockpit.toggleLockdownMode()" title="Click to switch mode" class="mono text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded hover:bg-emerald-500/30">
                        ANY 2-OF-3 FAST
                    </button>
                `;
            }
        }

        document.getElementById('tel-shield').innerHTML = '<i class="fa-solid fa-lock mr-1"></i>FLIP-GUARD LOCKED';
        document.getElementById('tel-shield').className = 'text-amber-400 font-semibold';

        if (this.threatLockdown) {
            document.getElementById('system-status-text').innerText = 'LOCKDOWN: 3/3 AUTH REQ';
            logTelegram('🚨 [THREAT LOCKDOWN] Prior intrusion detected! All 3 factors (Blink + Fingerprint + PIN) required.');
        } else {
            document.getElementById('system-status-text').innerText = 'SMART AUTH: ANY 2/3 REQ';
            logTelegram('[SMART 2-OF-3] Complete ANY 2 factors (e.g., Blink + Fingerprint, or Fingerprint + PIN 2026) to flip open guard.');
        }
    },

    triggerBlink: function () {
        if (this.blinkCount < 2) {
            this.blinkCount++;
            const earEl = document.getElementById('ear-readout');
            const blinkEl = document.getElementById('blinks-readout');
            if (earEl) earEl.innerText = 'EAR: 0.14 (BLINK!)';
            if (blinkEl) blinkEl.innerText = `BLINKS: ${this.blinkCount}/2`;

            setTimeout(() => {
                if (earEl) earEl.innerText = 'EAR: 0.31 (OPEN)';
            }, 450);

            const badge = document.getElementById('auth-step1-badge');
            if (this.blinkCount >= 2) {
                badge.innerText = 'VERIFIED (LIVENESS OK)';
                badge.className = 'text-emerald-400 font-bold';
                logTelegram('[FACTOR 1] CAM-03 Eye-Blink Liveness verified.');
                this.checkUnlockCondition();
            } else {
                badge.innerText = 'BLINK 1/2 DETECTED';
            }
        }
    },

    triggerFingerprint: function () {
        this.fpVerified = true;
        if (window.CarGuard.fingerprintMesh) {
            window.CarGuard.fingerprintMesh.material.color.setHex(0x10b981);
        }
        const badge = document.getElementById('auth-step2-badge');
        if (badge) {
            badge.innerText = 'MATCHED (ID #01 OWNER)';
            badge.className = 'text-emerald-400 font-bold';
        }
        logTelegram('[FACTOR 2] Capacitive Fingerprint Ring matched Owner template.');
        this.checkUnlockCondition();
    },

    verifyPin: function () {
        const val = document.getElementById('pin-input').value.trim();
        if (val === '2026') {
            this.pinVerified = true;
            logTelegram('[FACTOR 3] Cryptographic PIN 2026 verified.');
            this.checkUnlockCondition();
        } else {
            logTelegram('❌ [PIN ERROR] Invalid PIN! Enter 2026.');
        }
    },

    checkUnlockCondition: function () {
        const passedFactors =
            (this.blinkCount >= 2 ? 1 : 0) +
            (this.fpVerified ? 1 : 0) +
            (this.pinVerified ? 1 : 0);

        const requiredFactors = this.threatLockdown ? 3 : 2;

        if (passedFactors >= requiredFactors && !this.isUnlocked) {
            this.isUnlocked = true;
            this.targetFlipAngle = 1.95; // Flip red hexagonal cover upward ~110 degrees!

            document.getElementById('tel-shield').innerHTML =
                `<i class="fa-solid fa-key mr-1"></i>OPEN (${passedFactors}/${requiredFactors} VERIFIED)`;
            document.getElementById('tel-shield').className = 'text-emerald-400 font-bold';
            document.getElementById('system-status-text').innerText = 'KEYHOLE UNLOCKED';

            if (this.threatLockdown) {
                logTelegram('✅ [LOCKDOWN CLEARED] All 3/3 factors verified! Red Flip-Guard rotated open.');
            } else {
                logTelegram(`✅ [FAST ${passedFactors}/3 AUTH] Biometric threshold met without friction! Flip-Guard opened.`);
            }
        }
    },

    update: function () {
        if (window.CarGuard.servoShieldMesh) {
            const currentRot = window.CarGuard.servoShieldMesh.rotation.x;
            window.CarGuard.servoShieldMesh.rotation.x += (this.targetFlipAngle - currentRot) * 0.10;
        }
    }
};ffffff