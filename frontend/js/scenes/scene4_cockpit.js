// SCENE 4: ZERO-TRUST COCKPIT AUTH (LIVE WEBCAM OWNER FACE + EAR BLINK + 1.5s HOLD FINGERPRINT + PIN)
window.Scene4Cockpit = {
    blinkVerified: false,
    fingerVerified: false,
    pinVerified: false,
    priorThreatDetected: false,
    shieldUnlocked: false,
    engineStarted: false,
    keyTurning: false,
    targetShieldAngle: 0,

    // Live Webcam Liveness Polling State
    livenessPollId: null,
    pollBusy: false,
    intruderFrames: 0,
    intruderAlertSent: false,

    // 1.5s Press & Hold Fingerprint State
    fpHoldInterval: null,
    fpHoldProgress: 0,

    enter: function () {
        if (window.Scene2Loitering) window.Scene2Loitering.cleanup();
        window.CarAudio?.stopSiren();
        this.stopLivenessPolling();
        this.cancelFingerprintHold();

        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;

        // Detect if Scene 2 (Loitering) or Scene 3 (Break-In) happened right before entering Cockpit
        const currentStatus = document.getElementById('system-status-text')?.innerText || '';
        if (currentStatus.includes('LOITERING') || currentStatus.includes('BREAK-IN')) {
            this.priorThreatDetected = true;
        } else {
            this.priorThreatDetected = false;
        }

        // Switch main camera straight to Driver Cockpit POV
        switchMainPOV('cockpit');

        if (window.CarGuard.thiefGroup) window.CarGuard.thiefGroup.visible = false;
        document.getElementById('cam1-bbox')?.classList.add('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        const modal = document.getElementById('cockpit-auth-modal');
        if (modal) modal.classList.remove('hidden');

        // Reset all auth states & 3D objects
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

        // Inject Upgraded Cockpit UI (Live Camera Status + 1.5s Hold Fingerprint Bar)
        this.injectUpgradedAuthUI();

        const pinInput = document.getElementById('pin-input');
        if (pinInput) pinInput.value = '';
        document.getElementById('start-engine-box')?.classList.add('hidden');

        // Update Telemetry Header
        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-cyan-400 animate-ping';
        document.getElementById('system-status-text').innerText = this.priorThreatDetected
            ? 'COCKPIT: 3-OF-3 HIGH-ALERT LOCK'
            : 'COCKPIT: 2-OF-3 FAST AUTH';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-cyan-400 font-semibold';

        document.getElementById('tel-shield').innerHTML = '<i class="fa-solid fa-lock mr-1"></i>FLIP-GUARD LOCKED';
        document.getElementById('tel-shield').className = 'text-amber-400 font-semibold';

        // Reset Backend Liveness Session & Start Webcam Polling
        fetch('http://127.0.0.1:5000/api/reset-liveness', { method: 'POST' }).catch(() => {});
        this.startLivenessPolling();

        if (this.priorThreatDetected) {
            logTelegram('⚠️ [HIGH-ALERT MODE] Prior threat recorded! All 3 Factors (3-of-3) required.');
        } else {
            logTelegram('⚡ [FAST-AUTH MODE] Normal entry: Complete ANY 2 of 3 checks to flip open Keyhole Guard.');
        }
    },

    injectUpgradedAuthUI: function () {
        const modal = document.getElementById('cockpit-auth-modal');
        if (!modal) return;

        const modeBanner = this.priorThreatDetected
            ? `<div class="mb-2 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/50 text-[10px] text-rose-300 font-semibold flex items-center justify-between">
                   <span><i class="fa-solid fa-triangle-exclamation mr-1"></i>HIGH-ALERT: 3-OF-3 REQUIRED</span>
                   <span class="mono">STRICT LOCK</span>
               </div>`
            : `<div class="mb-2 px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-[10px] text-cyan-300 font-semibold flex items-center justify-between">
                   <span><i class="fa-solid fa-bolt mr-1"></i>FAST AUTH: ANY 2-OF-3 UNLOCKS</span>
                   <span class="mono">0 / 2 DONE</span>
               </div>`;

        modal.innerHTML = `
            <div class="hud-panel p-3.5 rounded-2xl border border-cyan-500/40 shadow-2xl text-xs">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                    <div class="flex items-center space-x-2">
                        <i class="fa-solid fa-shield-halved text-cyan-400"></i>
                        <span class="font-bold tracking-wider text-white">ZERO-TRUST COCKPIT ENGINE</span>
                    </div>
                    <button onclick="window.Scene4Cockpit.enrollOwnerFace()" class="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-400/50 text-[10px] text-cyan-200 mono" title="Save current webcam face as Owner (Amit)">
                        <i class="fa-solid fa-user-lock mr-1"></i>Register My Face
                    </button>
                </div>

                <div id="auth-mode-banner">${modeBanner}</div>

                <div class="space-y-2">
                    <!-- FACTOR 1: FACE LOCK + EYE-BLINK (EAR) -->
                    <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-semibold text-slate-200">1. Owner Face + Eye-Blink (EAR)</div>
                                <div id="live-ear-status" class="text-[10px] text-cyan-400 mono">Turn on "Use Real Cam" or click Simulate</div>
                            </div>
                            <button id="btn-auth-blink" onclick="window.Scene4Cockpit.verifyBlink(false)" class="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border border-cyan-500/40 text-[10px] font-semibold">
                                Simulate Blink
                            </button>
                        </div>
                    </div>

                    <!-- FACTOR 2: 1.5s PRESS & HOLD CAPACITIVE FINGERPRINT -->
                    <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div class="flex items-center justify-between mb-1">
                            <div>
                                <div class="font-semibold text-slate-200">2. Capacitive Fingerprint</div>
                                <div id="fp-status-lbl" class="text-[10px] text-slate-400 mono">Press & Hold for 1.5s to scan</div>
                            </div>
                            <button id="btn-auth-finger"
                                onmousedown="window.Scene4Cockpit.startFingerprintHold()"
                                onmouseup="window.Scene4Cockpit.cancelFingerprintHold()"
                                onmouseleave="window.Scene4Cockpit.cancelFingerprintHold()"
                                ontouchstart="window.Scene4Cockpit.startFingerprintHold(); event.preventDefault();"
                                ontouchend="window.Scene4Cockpit.cancelFingerprintHold()"
                                class="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border border-cyan-500/40 text-[10px] font-semibold select-none">
                                Hold 1.5s Scan
                            </button>
                        </div>
                        <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div id="fp-progress-bar" class="h-full bg-cyan-400 transition-all duration-75" style="width: 0%"></div>
                        </div>
                    </div>

                    <!-- FACTOR 3: FALLBACK SECURITY PIN -->
                    <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                        <div>
                            <div class="font-semibold text-slate-200">3. Security PIN (2026)</div>
                            <div class="text-[10px] text-slate-400">2-of-3 backup if camera/sensor dark</div>
                        </div>
                        <div class="flex items-center space-x-1">
                            <input id="pin-input" type="password" maxlength="4" placeholder="2026" class="w-14 px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-center mono text-cyan-300 text-xs focus:outline-none">
                            <button id="btn-auth-pin" onclick="window.Scene4Cockpit.verifyPin()" class="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 text-[10px] font-semibold">
                                Verify
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ENGINE START BUTTON (APPEARS ONCE KEYHOLE FLIP-GUARD UNLOCKS) -->
                <div id="start-engine-box" class="hidden mt-2.5 pt-2 border-t border-slate-800">
                    <button id="btn-start-engine" onclick="window.Scene4Cockpit.igniteEngine()" class="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black tracking-wider text-xs shadow-lg hover:brightness-110">
                        <i class="fa-solid fa-key mr-1"></i> INSERT 3D KEY & IGNITE ENGINE
                    </button>
                </div>
            </div>
        `;
    },

    // --- 1. LIVE WEBCAM OWNER FACE + EYE-BLINK POLLING ---
    startLivenessPolling: function () {
        this.stopLivenessPolling();
        this.livenessPollId = setInterval(() => {
            this.pollWebcamFrame();
        }, 350);
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
        return c.toDataURL('image/jpeg', 0.75);
    },

    enrollOwnerFace: async function () {
        const frame = this.captureWebcamBase64();
        if (!frame) {
            alert('Pehle left panel mein "Use Real Cam" button daba kar laptop camera on kar!');
            return;
        }
        try {
            const res = await fetch('http://127.0.0.1:5000/api/enroll-owner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: frame })
            });
            const data = await res.json();
            if (data.ok) {
                window.CarAudio?.playBeep(1250, 0.16, 'sine');
                logTelegram(`✅ [FACE LOCK ENROLLED] ${data.message}`);
                const lbl = document.getElementById('live-ear-status');
                if (lbl) lbl.innerText = 'OWNER FACE SAVED! Now blink your eyes...';
            } else {
                alert(data.message || 'Face enrollment failed.');
            }
        } catch (err) {
            alert('Backend server offline! Run: python backend/server.py');
        }
    },

    pollWebcamFrame: async function () {
        if (this.blinkVerified || this.pollBusy) return;
        const frame = this.captureWebcamBase64();
        if (!frame) return;

        this.pollBusy = true;
        try {
            const res = await fetch('http://127.0.0.1:5000/api/liveness-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: frame })
            });
            const data = await res.json();
            const lbl = document.getElementById('live-ear-status');

            if (data.ok && lbl) {
                lbl.innerText = data.status_text;

                if (data.face_detected && !data.is_owner) {
                    lbl.className = 'text-[10px] text-rose-400 font-bold mono animate-pulse';
                    this.intruderFrames++;
                    // If an unauthorized face sits in driver seat for ~4 seconds, trigger WhatsApp SOS!
                    if (this.intruderFrames >= 11 && !this.intruderAlertSent) {
                        this.intruderAlertSent = true;
                        window.CarAudio?.playBeep(260, 0.35, 'sawtooth');
                        logTelegram('🚨 [FACE LOCK REJECTED] Unauthorized person in Driver Seat! Sending WhatsApp snapshot...');
                        if (typeof dispatchWhatsAppSOS === 'function') {
                            dispatchWhatsAppSOS(
                                'UNAUTHORIZED DRIVER FACE DETECTED',
                                `CAM-03 rejected non-owner face (${data.match_confidence}% match). Keyhole Flip-Guard locked!`
                            );
                        }
                    }
                } else if (data.face_detected && data.is_owner) {
                    this.intruderFrames = 0;
                    lbl.className = 'text-[10px] text-emerald-400 font-semibold mono';
                    if (data.liveness_passed && !this.blinkVerified) {
                        this.verifyBlink(true, data.ear, data.match_confidence);
                    }
                }
            }
        } catch (e) {
            // Silent ignore if backend is not running
        } finally {
            this.pollBusy = false;
        }
    },

    verifyBlink: function (fromRealCam = false, earVal = 0.17, matchScore = 98.4) {
        if (this.blinkVerified) return;
        this.blinkVerified = true;
        window.CarAudio?.playBeep(980, 0.12, 'sine');

        const btn = document.getElementById('btn-auth-blink');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Verified';
            btn.className = 'px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold';
        }
        const lbl = document.getElementById('live-ear-status');
        if (lbl) {
            lbl.innerText = fromRealCam
                ? `REAL CAM VERIFIED (Match: ${matchScore}% | EAR: ${earVal})`
                : 'SIMULATED LIVENESS PASSED (EAR: 0.17)';
            lbl.className = 'text-[10px] text-emerald-400 font-bold mono';
        }

        logTelegram(fromRealCam
            ? `👁️ [REAL CAM-03] Owner Face (${matchScore}%) + Live Eye-Blink (EAR ${earVal}) verified!`
            : '👁️ [CAM-03 LIVENESS] Driver Face + Eye-Blink (EAR < 0.21) confirmed.');
        this.checkUnlockCondition();
    },

    // --- 2. 1.5-SECOND PRESS & HOLD CAPACITIVE FINGERPRINT ---
    startFingerprintHold: function () {
        if (this.fingerVerified || this.fpHoldInterval) return;

        this.fpHoldProgress = 0;
        const bar = document.getElementById('fp-progress-bar');
        const lbl = document.getElementById('fp-status-lbl');
        if (lbl) {
            lbl.innerText = 'Scanning biometric ridges... Keep holding!';
            lbl.className = 'text-[10px] text-cyan-300 font-semibold mono animate-pulse';
        }

        // 15 steps x 100ms = 1.5 seconds hold
        this.fpHoldInterval = setInterval(() => {
            this.fpHoldProgress += 6.67;
            if (bar) bar.style.width = `${Math.min(100, this.fpHoldProgress)}%`;

            // Play subtle rising ultrasonic scan pitch every 200ms
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
                lbl.innerText = 'Scan aborted! Hold full 1.5 seconds.';
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
            btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Scanned';
            btn.className = 'px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold';
        }
        const lbl = document.getElementById('fp-status-lbl');
        if (lbl) {
            lbl.innerText = '1.5s Capacitive Ridge Match: 99.6%';
            lbl.className = 'text-[10px] text-emerald-400 font-bold mono';
        }
        const bar = document.getElementById('fp-progress-bar');
        if (bar) bar.className = 'h-full bg-emerald-400';

        if (window.CarGuard.fingerprintMesh) {
            window.CarGuard.fingerprintMesh.material.color.setHex(0x10b981);
        }

        logTelegram('🧬 [FINGERPRINT] 1.5s Capacitive Hold Scan verified (Match confidence: 99.6%).');
        this.checkUnlockCondition();
    },

    // --- 3. FALLBACK SECURITY PIN (2026) ---
    verifyPin: function () {
        if (this.pinVerified) return;
        const val = document.getElementById('pin-input')?.value.trim();

        if (val === '2026') {
            this.pinVerified = true;
            window.CarAudio?.playBeep(1320, 0.15, 'sine');
            const btn = document.getElementById('btn-auth-pin');
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>PIN OK';
                btn.className = 'px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold';
            }
            logTelegram('🔢 [PIN VERIFIED] 4-Digit Cryptographic PIN (2026) accepted.');
            this.checkUnlockCondition();
        } else {
            window.CarAudio?.playBeep(240, 0.30, 'sawtooth');
            logTelegram('❌ [PIN ERROR] Invalid PIN entered! Enter 2026.');
        }
    },

    checkUnlockCondition: function () {
        const passedCount =
            (this.blinkVerified ? 1 : 0) +
            (this.fingerVerified ? 1 : 0) +
            (this.pinVerified ? 1 : 0);

        const requiredCount = this.priorThreatDetected ? 3 : 2;

        // Update mode progress badge
        const banner = document.getElementById('auth-mode-banner');
        if (banner && !this.priorThreatDetected) {
            banner.innerHTML = `<div class="mb-2 px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-[10px] text-cyan-300 font-semibold flex items-center justify-between">
                <span><i class="fa-solid fa-bolt mr-1"></i>FAST AUTH: ANY 2-OF-3 UNLOCKS</span>
                <span class="mono">${passedCount} / 2 DONE</span>
            </div>`;
        }

        if (passedCount >= requiredCount && !this.shieldUnlocked) {
            this.shieldUnlocked = true;
            this.targetShieldAngle = -Math.PI * 0.62; // Flip red cover UP by 112 degrees!

            setTimeout(() => window.CarAudio?.playServoWhir(), 180);

            document.getElementById('tel-shield').innerHTML = '<i class="fa-solid fa-lock-open mr-1"></i>FLIP-GUARD OPEN';
            document.getElementById('tel-shield').className = 'text-emerald-400 font-bold animate-pulse';

            document.getElementById('start-engine-box')?.classList.remove('hidden');

            logTelegram(`🔓 [SERVO ACTUATED] ${passedCount}/${requiredCount} factors verified! Hinged Red Keyhole Guard flipped UP.`);
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
            startBtn.innerHTML = '<i class="fa-solid fa-fire-flame-curved mr-1"></i> PORSCHE V8 ENGINE RUNNING (HEADLIGHTS ON)';
            startBtn.className = 'w-full py-2 rounded-xl bg-emerald-500/30 text-emerald-300 border border-emerald-400 font-bold text-xs cursor-default';
        }

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-emerald-400';
        document.getElementById('system-status-text').innerText = 'AUTHORIZED: ENGINE RUNNING';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-emerald-400 font-bold';

        logTelegram('🚗 [V8 IGNITION] 3D Key inserted & turned 90°! Engine started & Front LED Headlights ON.');
    },

    update: function () {
        // 1. Smoothly animate Fighter-Jet Flip-Up Armor Cover
        if (window.CarGuard.servoShieldMesh) {
            const currentRx = window.CarGuard.servoShieldMesh.rotation.x;
            window.CarGuard.servoShieldMesh.rotation.x += (this.targetShieldAngle - currentRx) * 0.12;
        }

        // 2. Animate 3D Ignition Key Sliding into Keyhole & Turning 90 Degrees Clockwise
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