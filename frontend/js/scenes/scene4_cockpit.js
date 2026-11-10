// SCENE 4: ZERO-TRUST COCKPIT HMI (PROTECTED FACE ENROLLMENT + 2-BLINK LIVENESS + 1.5s HOLD FINGERPRINT + PASSCODE)
window.Scene4Cockpit = {
    blinkVerified: false,
    fingerVerified: false,
    pinVerified: false,
    priorThreatDetected: false,
    shieldUnlocked: false,
    engineStarted: false,
    keyTurning: false,
    targetShieldAngle: 0,

    livenessPollId: null,
    pollBusy: false,
    intruderFrames: 0,
    intruderAlertSent: false,

    fpHoldInterval: null,
    fpHoldProgress: 0,

    enter: function () {
        if (window.Scene2Loitering) window.Scene2Loitering.cleanup();
        window.CarAudio?.stopSiren();
        this.stopLivenessPolling();
        this.cancelFingerprintHold();

        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;

        const currentStatus = document.getElementById('system-status-text')?.innerText || '';
        if (currentStatus.includes('LOITERING') || currentStatus.includes('BREAK-IN')) {
            this.priorThreatDetected = true;
        } else {
            this.priorThreatDetected = false;
        }

        switchMainPOV('cockpit');

        if (window.CarGuard.thiefGroup) window.CarGuard.thiefGroup.visible = false;
        document.getElementById('cam1-bbox')?.classList.add('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        const modal = document.getElementById('cockpit-auth-modal');
        if (modal) modal.classList.remove('hidden');

        this.blinkVerified = false;
        this.fingerVerified = false;
        this.pinVerified = false;
        this.shieldUnlocked = false;
        this.engineStarted = false;
        this.keyTurning = false;
        this.targetShieldAngle = 0;
        this.intruderFrames = 0;
        this.intruderAlertSent = false;

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

        if (window.CarGuard.fovCones[0]) window.CarGuard.fovCones[0].material.color.setHex(0x10b981);
        if (window.CarGuard.fovCones[1]) window.CarGuard.fovCones[1].material.color.setHex(0x10b981);
        if (window.CarGuard.fovCones[2]) window.CarGuard.fovCones[2].material.color.setHex(0x38bdf8);

        this.injectUpgradedAuthUI();

        const pinInput = document.getElementById('pin-input');
        if (pinInput) pinInput.value = '';
        document.getElementById('start-engine-box')?.classList.add('hidden');

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-cyan-400 animate-ping';
        document.getElementById('system-status-text').innerText = this.priorThreatDetected
            ? 'COCKPIT: 3-OF-3 HIGH-ALERT LOCK'
            : 'COCKPIT: 2-OF-3 ADAPTIVE AUTH';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-cyan-400 font-semibold';

        document.getElementById('tel-shield').innerHTML = '<i class="fa-solid fa-lock mr-1"></i>IMMOBILIZER LOCKED';
        document.getElementById('tel-shield').className = 'text-amber-400 font-semibold';

        fetch('http://127.0.0.1:5000/api/reset-liveness', { method: 'POST' }).catch(() => {});
        this.startLivenessPolling();

        if (this.priorThreatDetected) {
            logTelegram('⚠️ [HIGH-ALERT PROTOCOL] Prior perimeter breach logged. All 3 factors (3-of-3) required.');
        } else {
            logTelegram('⚡ [ADAPTIVE AUTH] Standard entry: Verify any 2 of 3 factors to disengage immobilizer.');
        }
    },

    showInlineNotice: function (message, tone = 'amber') {
        const box = document.getElementById('cockpit-inline-notice');
        if (!box) return;

        const palette = {
            amber: 'bg-amber-500/15 border-amber-500/50 text-amber-300',
            rose: 'bg-rose-500/20 border-rose-500/60 text-rose-300',
            emerald: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
        };
        box.className = `mb-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold mono flex items-center justify-between ${palette[tone] || palette.amber}`;
        box.innerHTML = `<span>${message}</span>`;
        box.classList.remove('hidden');
    },

    injectUpgradedAuthUI: function () {
        const modal = document.getElementById('cockpit-auth-modal');
        if (!modal) return;

        const modeBanner = this.priorThreatDetected
            ? `<div class="mb-2 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/50 text-[10px] text-rose-300 font-semibold flex items-center justify-between">
                   <span><i class="fa-solid fa-triangle-exclamation mr-1"></i>HIGH-ALERT: 3-OF-3 REQUIRED</span>
                   <span class="mono">STRICT MFA</span>
               </div>`
            : `<div class="mb-2 px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-[10px] text-cyan-300 font-semibold flex items-center justify-between">
                   <span><i class="fa-solid fa-bolt mr-1"></i>ADAPTIVE AUTH: ANY 2-OF-3 UNLOCKS</span>
                   <span class="mono">0 / 2 VERIFIED</span>
               </div>`;

        modal.innerHTML = `
            <div class="hud-panel p-3.5 rounded-2xl border border-cyan-500/40 shadow-2xl text-xs">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                    <div class="flex items-center space-x-2">
                        <i class="fa-solid fa-shield-halved text-cyan-400"></i>
                        <span class="font-bold tracking-wider text-white">ZERO-TRUST COCKPIT HMI</span>
                    </div>
                    <button id="btn-enroll-face" onclick="window.Scene4Cockpit.enrollOwnerFace()" class="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-400/50 text-[10px] text-cyan-200 mono" title="Requires existing Owner Face match or Passcode to overwrite">
                        <i class="fa-solid fa-id-badge mr-1"></i><span id="btn-enroll-label">Enroll Biometrics</span>
                    </button>
                </div>

                <div id="auth-mode-banner">${modeBanner}</div>
                <div id="cockpit-inline-notice" class="hidden"></div>

                <div class="space-y-2">
                    <!-- FACTOR 1: OPTICAL FACE ID + LIVENESS -->
                    <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-semibold text-slate-200">1. Optical Face ID & Liveness</div>
                                <div id="live-ear-status" class="text-[10px] text-amber-400 mono">Enable "Use Real Cam" on CAM-03</div>
                            </div>
                            <span id="badge-auth-blink" class="px-2.5 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold mono">
                                <i class="fa-solid fa-video-slash mr-1"></i>Standby
                            </span>
                        </div>
                    </div>

                    <!-- FACTOR 2: 1.5s CAPACITIVE BIOMETRIC SENSOR -->
                    <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div class="flex items-center justify-between mb-1">
                            <div>
                                <div class="font-semibold text-slate-200">2. Capacitive Fingerprint Sensor</div>
                                <div id="fp-status-lbl" class="text-[10px] text-slate-400 mono">Press & Hold 1.5s to authenticate</div>
                            </div>
                            <button id="btn-auth-finger"
                                onmousedown="window.Scene4Cockpit.startFingerprintHold()"
                                onmouseup="window.Scene4Cockpit.cancelFingerprintHold()"
                                onmouseleave="window.Scene4Cockpit.cancelFingerprintHold()"
                                ontouchstart="window.Scene4Cockpit.startFingerprintHold(); event.preventDefault();"
                                ontouchend="window.Scene4Cockpit.cancelFingerprintHold()"
                                class="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border border-cyan-500/40 text-[10px] font-semibold select-none">
                                Hold 1.5s
                            </button>
                        </div>
                        <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div id="fp-progress-bar" class="h-full bg-cyan-400 transition-all duration-75" style="width: 0%"></div>
                        </div>
                    </div>

                    <!-- FACTOR 3: CRYPTOGRAPHIC PASSCODE -->
                    <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                        <div>
                            <div class="font-semibold text-slate-200">3. Cryptographic Passcode</div>
                            <div class="text-[10px] text-slate-400">Secondary ECU key-pad verification</div>
                        </div>
                        <div class="flex items-center space-x-1">
                            <input id="pin-input" type="password" maxlength="4" placeholder="••••" class="w-14 px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-center mono text-cyan-300 text-xs focus:outline-none">
                            <button id="btn-auth-pin" onclick="window.Scene4Cockpit.verifyPin()" class="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 text-[10px] font-semibold">
                                Verify
                            </button>
                        </div>
                    </div>
                </div>

                <!-- IGNITION SYSTEM BUTTON -->
                <div id="start-engine-box" class="hidden mt-2.5 pt-2 border-t border-slate-800">
                    <button id="btn-start-engine" onclick="window.Scene4Cockpit.igniteEngine()" class="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black tracking-wider text-xs shadow-lg hover:brightness-110">
                        <i class="fa-solid fa-power-off mr-1.5"></i> ENGAGE IGNITION SYSTEM
                    </button>
                </div>
            </div>
        `;
    },

    startLivenessPolling: function () {
        this.stopLivenessPolling();
        this.livenessPollId = setInterval(() => {
            this.pollWebcamFrame();
        }, 320);
    },

    stopLivenessPolling: function () {
        if (this.livenessPollId) {
            clearInterval(this.livenessPollId);
            this.livenessPollId = null;
        }
    },

    captureWebcamBase64: function () {
        const videoEl = document.getElementById('real-webcam');
        if (!realWebcamActive || !videoEl || videoEl.readyState < 2) return null;
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 240;
        const ctx = c.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.80);
    },

    enrollOwnerFace: async function () {
        const frame = this.captureWebcamBase64();
        if (!frame) {
            window.CarAudio?.playBeep(280, 0.2, 'sawtooth');
            this.showInlineNotice('OPTICAL SENSOR OFFLINE: Enable "Use Real Cam" in CAM-03 first.', 'amber');
            return;
        }

        const enteredPin = document.getElementById('pin-input')?.value.trim() || '';
        const authPin = this.pinVerified ? '2026' : enteredPin;

        try {
            const res = await fetch('http://127.0.0.1:5000/api/enroll-owner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: frame, pin: authPin })
            });
            const data = await res.json();

            if (data.ok) {
                window.CarAudio?.playBeep(1250, 0.16, 'sine');
                this.showInlineNotice(data.message, 'emerald');
                logTelegram(`✅ [BIOMETRIC VAULT] ${data.message}`);
                const btnLbl = document.getElementById('btn-enroll-label');
                if (btnLbl) btnLbl.innerText = 'ID Locked (Update)';
            } else if (data.code === 'UNAUTHORIZED_OVERWRITE') {
                window.CarAudio?.playBeep(240, 0.35, 'sawtooth');
                this.showInlineNotice(data.message, 'rose');
                logTelegram(`🚨 [SECURITY VIOLATION] Unauthorized attempt to overwrite Owner Biometric ID (${data.match_confidence}% match)!`);
                if (typeof dispatchWhatsAppSOS === 'function') {
                    dispatchWhatsAppSOS(
                        'UNAUTHORIZED BIOMETRIC OVERWRITE ATTEMPT',
                        `Unrecognized individual (${data.match_confidence}% match) attempted to overwrite Owner Face ID on CAM-03.`
                    );
                }
            } else {
                window.CarAudio?.playBeep(280, 0.2, 'sawtooth');
                this.showInlineNotice(data.message || 'Biometric enrollment failed.', 'amber');
            }
        } catch (err) {
            this.showInlineNotice('TELEMETRY SERVER OFFLINE: Start backend service on port 5000.', 'rose');
        }
    },

    pollWebcamFrame: async function () {
        if (this.blinkVerified || this.pollBusy) return;

        const lbl = document.getElementById('live-ear-status');
        const badge = document.getElementById('badge-auth-blink');

        const frame = this.captureWebcamBase64();
        if (!frame) {
            if (lbl) {
                lbl.innerText = 'OPTICAL FEED STANDBY — Enable "Use Real Cam"';
                lbl.className = 'text-[10px] text-amber-400 mono';
            }
            if (badge) {
                badge.innerHTML = '<i class="fa-solid fa-video-slash mr-1"></i>Standby';
                badge.className = 'px-2.5 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold mono';
            }
            return;
        }

        this.pollBusy = true;
        try {
            const res = await fetch('http://127.0.0.1:5000/api/liveness-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: frame })
            });
            const data = await res.json();

            if (data.ok && lbl) {
                lbl.innerText = data.status_text;

                const btnLbl = document.getElementById('btn-enroll-label');
                if (btnLbl && data.owner_enrolled) {
                    btnLbl.innerText = 'ID Locked (Update)';
                }

                const earEl = document.getElementById('ear-val');
                const blinkEl = document.getElementById('blink-count');
                if (earEl) earEl.innerText = data.face_detected ? `${data.ear} (${data.ear < 0.20 ? 'CLOSED' : 'OPEN'})` : 'NO FACE';
                if (blinkEl) blinkEl.innerText = `${data.blink_count}/2`;

                if (!data.face_detected) {
                    lbl.className = 'text-[10px] text-amber-400 mono';
                    if (badge) {
                        badge.innerHTML = '<i class="fa-solid fa-eye-slash mr-1"></i>No Face';
                        badge.className = 'px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-semibold mono';
                    }
                } else if (!data.is_owner) {
                    lbl.className = 'text-[10px] text-rose-400 font-bold mono animate-pulse';
                    if (badge) {
                        badge.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i>Denied';
                        badge.className = 'px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold mono';
                    }
                    this.intruderFrames++;
                    if (this.intruderFrames >= 12 && !this.intruderAlertSent) {
                        this.intruderAlertSent = true;
                        window.CarAudio?.playBeep(260, 0.35, 'sawtooth');
                        logTelegram('🚨 [BIOMETRIC REJECTED] Unrecognized driver in cockpit! Dispatching WhatsApp evidence...');
                        if (typeof dispatchWhatsAppSOS === 'function') {
                            dispatchWhatsAppSOS(
                                'UNAUTHORIZED DRIVER DETECTED IN COCKPIT',
                                `CAM-03 rejected non-owner facial geometry (${data.match_confidence}% match). Immobilizer locked.`
                            );
                        }
                    }
                } else {
                    this.intruderFrames = 0;
                    lbl.className = 'text-[10px] text-cyan-300 font-semibold mono';
                    if (badge) {
                        badge.innerHTML = `Liveness ${data.blink_count}/2`;
                        badge.className = 'px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold mono';
                    }
                    if (data.liveness_passed && !this.blinkVerified) {
                        this.verifyBlink(data.ear, data.match_confidence);
                    }
                }
            }
        } catch (e) {
            // Silent ignore when server is unreachable
        } finally {
            this.pollBusy = false;
        }
    },

    verifyBlink: function (earVal = 0.15, matchScore = 92.0) {
        if (this.blinkVerified) return;
        this.blinkVerified = true;
        window.CarAudio?.playBeep(980, 0.12, 'sine');

        const badge = document.getElementById('badge-auth-blink');
        if (badge) {
            badge.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Verified';
            badge.className = 'px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold mono';
        }
        const lbl = document.getElementById('live-ear-status');
        if (lbl) {
            lbl.innerText = `BIOMETRIC CONFIRMED (Match: ${matchScore}% | Liveness: 2/2)`;
            lbl.className = 'text-[10px] text-emerald-400 font-bold mono';
        }

        logTelegram(`👁️ [CAM-03 BIOMETRICS] Owner identity (${matchScore}%) & 2-blink liveness verified.`);
        this.checkUnlockCondition();
    },

    startFingerprintHold: function () {
        if (this.fingerVerified || this.fpHoldInterval) return;

        this.fpHoldProgress = 0;
        const bar = document.getElementById('fp-progress-bar');
        const lbl = document.getElementById('fp-status-lbl');
        if (lbl) {
            lbl.innerText = 'Scanning dermal ridge topology... Keep holding';
            lbl.className = 'text-[10px] text-cyan-300 font-semibold mono animate-pulse';
        }

        this.fpHoldInterval = setInterval(() => {
            this.fpHoldProgress += 6.67;
            if (bar) bar.style.width = `${Math.min(100, this.fpHoldProgress)}%`;

            if (Math.round(this.fpHoldProgress) % 13 === 0) {
                window.CarAudio?.playBeep(600 + this.fpHoldProgress * 6, 0.05, 'sine');
            }

            if (this.fpHoldProgress >= 100) {
                clearInterval(this.fpHoldInterval);
                this.fpHoldInterval = null;
                this.verifyFingerprint();
            }
        }, 100);
    },

    cancelFingerprintHold: function () {
        if (this.fingerVerified) return;
        if (this.fpHoldInterval) {
            clearInterval(this.fpHoldInterval);
            this.fpHoldInterval = null;
        }
        if (this.fpHoldProgress > 0 && this.fpHoldProgress < 100) {
            this.fpHoldProgress = 0;
            const bar = document.getElementById('fp-progress-bar');
            const lbl = document.getElementById('fp-status-lbl');
            if (bar) bar.style.width = '0%';
            if (lbl) {
                lbl.innerText = 'Scan incomplete — Maintain contact for 1.5s';
                lbl.className = 'text-[10px] text-amber-400 mono';
            }
            window.CarAudio?.playBeep(300, 0.12, 'sawtooth');
        }
    },

    verifyFingerprint: function () {
        if (this.fingerVerified) return;
        this.fingerVerified = true;
        window.CarAudio?.playBeep(1180, 0.14, 'sine');

        const btn = document.getElementById('btn-auth-finger');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Verified';
            btn.className = 'px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold';
        }
        const lbl = document.getElementById('fp-status-lbl');
        if (lbl) {
            lbl.innerText = 'Capacitive Ridge Match: 99.6% Confidence';
            lbl.className = 'text-[10px] text-emerald-400 font-bold mono';
        }
        const bar = document.getElementById('fp-progress-bar');
        if (bar) bar.className = 'h-full bg-emerald-400';

        if (window.CarGuard.fingerprintMesh) {
            window.CarGuard.fingerprintMesh.material.color.setHex(0x10b981);
        }

        logTelegram('🧬 [CAPACITIVE SENSOR] 1.5s dermal ridge scan authenticated (99.6% match).');
        this.checkUnlockCondition();
    },

    verifyPin: function () {
        if (this.pinVerified) return;
        const val = document.getElementById('pin-input')?.value.trim();

        if (val === '2026') {
            this.pinVerified = true;
            window.CarAudio?.playBeep(1320, 0.15, 'sine');
            const btn = document.getElementById('btn-auth-pin');
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Verified';
                btn.className = 'px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold';
            }
            this.showInlineNotice('CRYPTOGRAPHIC PASSCODE ACCEPTED.', 'emerald');
            logTelegram('🔢 [ECU KEYPAD] Cryptographic passcode authenticated.');
            this.checkUnlockCondition();
        } else {
            window.CarAudio?.playBeep(240, 0.30, 'sawtooth');
            this.showInlineNotice('ACCESS DENIED: Invalid cryptographic passcode.', 'rose');
            logTelegram('❌ [ECU KEYPAD] Invalid cryptographic passcode entered.');
        }
    },

    checkUnlockCondition: function () {
        const passedCount =
            (this.blinkVerified ? 1 : 0) +
            (this.fingerVerified ? 1 : 0) +
            (this.pinVerified ? 1 : 0);

        const requiredCount = this.priorThreatDetected ? 3 : 2;

        const banner = document.getElementById('auth-mode-banner');
        if (banner && !this.priorThreatDetected) {
            banner.innerHTML = `<div class="mb-2 px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-[10px] text-cyan-300 font-semibold flex items-center justify-between">
                <span><i class="fa-solid fa-bolt mr-1"></i>ADAPTIVE AUTH: ANY 2-OF-3 UNLOCKS</span>
                <span class="mono">${passedCount} / 2 VERIFIED</span>
            </div>`;
        }

        if (passedCount >= requiredCount && !this.shieldUnlocked) {
            this.shieldUnlocked = true;
            this.targetShieldAngle = Math.PI * 0.62;

            setTimeout(() => window.CarAudio?.playServoWhir(), 180);

            document.getElementById('tel-shield').innerHTML = '<i class="fa-solid fa-lock-open mr-1"></i>IMMOBILIZER DISENGAGED';
            document.getElementById('tel-shield').className = 'text-emerald-400 font-bold animate-pulse';

            document.getElementById('start-engine-box')?.classList.remove('hidden');

            logTelegram(`🔓 [SERVO ACTUATOR] ${passedCount}/${requiredCount} factors authenticated. Ignition guard disengaged.`);
        }
    },

    igniteEngine: function () {
        if (!this.shieldUnlocked || this.engineStarted) return;
        this.engineStarted = true;
        this.keyTurning = true;

        if (window.CarGuard.keyMesh) {
            window.CarGuard.keyMesh.visible = true;
            window.CarGuard.keyMesh.position.set(-0.018, 0, -0.065);
            window.CarGuard.keyMesh.rotation.set(0, 0, 0);
        }

        window.CarAudio?.playEngineStart();

        setTimeout(() => {
            if (window.CarGuard.headlightsGroup) {
                window.CarGuard.headlightsGroup.visible = true;
            }
        }, 550);

        const startBtn = document.getElementById('btn-start-engine');
        if (startBtn) {
            startBtn.innerHTML = '<i class="fa-solid fa-gauge-high mr-1.5"></i> POWERTRAIN ONLINE — DRIVE READY';
            startBtn.className = 'w-full py-2 rounded-xl bg-emerald-500/30 text-emerald-300 border border-emerald-400 font-bold text-xs cursor-default';
        }

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-emerald-400';
        document.getElementById('system-status-text').innerText = 'POWERTRAIN ONLINE — DRIVE READY';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-emerald-400 font-bold';

        logTelegram('🚗 [ECU IGNITION] Immobilizer disengaged. Powertrain & DRL optics online.');
    },

    update: function () {
        if (window.CarGuard.servoShieldMesh) {
            const currentRx = window.CarGuard.servoShieldMesh.rotation.x;
            window.CarGuard.servoShieldMesh.rotation.x += (this.targetShieldAngle - currentRx) * 0.12;
        }

        if (this.keyTurning && window.CarGuard.keyMesh) {
            const key = window.CarGuard.keyMesh;
            if (key.position.z < -0.016) {
                key.position.z += 0.0035;
            } else {
                const targetTurn = -Math.PI / 2;
                key.rotation.z += (targetTurn - key.rotation.z) * 0.15;
            }
        }
    }
};

// Auto-update legacy Telegram labels in DOM to WhatsApp Cloud Telemetry
window.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('telegram-panel');
    if (panel) {
        panel.innerHTML = panel.innerHTML
            .replace(/Telegram Bot Dispatch/gi, 'WhatsApp Cloud Telemetry')
            .replace(/fa-telegram/gi, 'fa-whatsapp');
    }
});