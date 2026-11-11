// SCENE 6 (BUTTON 5): HYDRAULIC JACK CAR-TILT (FORWARD-LEANING MECHANIC PUMP AT X=2.15)
window.Scene6TiltRelay = {
    jackGroup: null,
    jackLiftArm: null,
    jackSaddle: null,
    jackHandlePivot: null,
    rfWavesGroup: null,
    rfRings: [],
    sirenLight: null,
    sirenTick: 0,
    phase: 0, // 1: Standing RF Relay Attack, 2: Leaning Forward Behind Jack & Pumping Handle, 3: IMU Alarm Active
    phaseTicks: 0,
    tiltAngle: 0,
    alarmTriggered: false,

    initObjects: function (scene) {
        // 1. 3D Heavy-Duty Hydraulic Floor Jack (Saddle under right sill, long handle reaching out to X = 1.78)
        this.jackGroup = new THREE.Group();
        this.jackGroup.position.set(0.92, 0.01, 0.15);
        this.jackGroup.visible = false;

        const redSteelMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.65, roughness: 0.25 });
        const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.92, roughness: 0.12 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5, roughness: 0.5 });
        const yellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

        const jackBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.26), redSteelMat);
        jackBase.position.set(0.09, 0.05, 0);
        this.jackGroup.add(jackBase);

        const wheelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14);
        wheelGeo.rotateX(Math.PI / 2);
        [
            [-0.12, 0.04, 0.14],
            [-0.12, 0.04, -0.14],
            [0.30, 0.04, 0.14],
            [0.30, 0.04, -0.14]
        ].forEach(pos => {
            const w = new THREE.Mesh(wheelGeo, darkMat);
            w.position.set(pos[0], pos[1], pos[2]);
            this.jackGroup.add(w);
        });

        this.jackLiftArm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.14), chromeMat);
        this.jackLiftArm.position.set(-0.02, 0.11, 0);
        this.jackGroup.add(this.jackLiftArm);

        this.jackSaddle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.06, 18), yellowMat);
        this.jackSaddle.position.set(-0.14, 0.15, 0);
        this.jackGroup.add(this.jackSaddle);

        // Long 1.05m Pump Handle extending up and outward to meet the forward-leaning thief's hands (X = 1.80, Y = 0.78)
        this.jackHandlePivot = new THREE.Group();
        this.jackHandlePivot.position.set(0.34, 0.08, 0);
        this.jackGroup.add(this.jackHandlePivot);

        const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.02, 12), chromeMat);
        handleBar.position.set(0.28, 0.36, 0);
        handleBar.rotation.z = -0.62;
        this.jackHandlePivot.add(handleBar);

        const handleGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 12), redSteelMat);
        handleGrip.rotation.x = Math.PI / 2;
        handleGrip.position.set(0.56, 0.72, 0);
        this.jackHandlePivot.add(handleGrip);

        scene.add(this.jackGroup);

        // 2. 3D 433.92 MHz Keyless RF Relay Signal Wave Rings
        this.rfWavesGroup = new THREE.Group();
        this.rfWavesGroup.visible = false;
        scene.add(this.rfWavesGroup);

        const waveMat = new THREE.MeshBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 12, 28), waveMat.clone());
            ring.rotation.y = Math.PI / 2;
            this.rfWavesGroup.add(ring);
            this.rfRings.push({ mesh: ring, progress: i * 0.33 });
        }

        // 3. Strobe Siren Light
        this.sirenLight = new THREE.PointLight(0xff0033, 0, 18);
        this.sirenLight.position.set(0, 3.2, 0);
        scene.add(this.sirenLight);
    },

    enter: function () {
        if (window.Scene2Loitering) window.Scene2Loitering.cleanup();
        if (window.Scene5Tamper) window.Scene5Tamper.cleanup();
        if (window.Scene4Cockpit) window.Scene4Cockpit.stopLivenessPolling();
        this.cleanup();

        if (!this.jackGroup) this.initObjects(scene);

        switchMainPOV('orbit');

        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.CarGuard.leftWindowMesh) window.CarGuard.leftWindowMesh.visible = true;
        if (window.Scene3Breakin?.shardsGroup) window.Scene3Breakin.shardsGroup.visible = false;
        if (window.Scene3Breakin?.sirenLight) window.Scene3Breakin.sirenLight.intensity = 0;

        if (window.CarGuard.carGroup) {
            window.CarGuard.carGroup.rotation.set(0, 0, 0);
            window.CarGuard.carGroup.position.set(0, 0, 0);
        }

        if (typeof window.setHumanCharacterState === 'function') {
            window.setHumanCharacterState('thief', 'standing');
        }
        if (window.CarGuard.hammerGroup) {
            window.CarGuard.hammerGroup.visible = false;
        }

        // Phase 1: Suspect stands at X = 2.05 sending 433MHz RF Relay signals
        if (window.CarGuard.thiefGroup) {
            window.CarGuard.thiefGroup.visible = true;
            window.CarGuard.thiefGroup.position.set(2.05, 0, 0.15);
            window.CarGuard.thiefGroup.rotation.y = -Math.PI / 2;
        }
        if (window.CarGuard.thiefArmPivot) {
            window.CarGuard.thiefArmPivot.rotation.set(-0.85, 0, 0);
        }

        this.phase = 1;
        this.phaseTicks = 0;
        this.tiltAngle = 0;
        this.alarmTriggered = false;

        this.rfWavesGroup.visible = true;
        this.jackGroup.visible = false;
        if (this.sirenLight) this.sirenLight.intensity = 0;

        document.getElementById('cam1-bbox')?.classList.remove('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        if (window.CarGuard.fovCones[0]) window.CarGuard.fovCones[0].material.color.setHex(0xa855f7);
        if (window.CarGuard.fovCones[1]) window.CarGuard.fovCones[1].material.color.setHex(0x10b981);
        if (window.CarGuard.fovCones[2]) window.CarGuard.fovCones[2].material.color.setHex(0x38bdf8);

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-purple-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'WARNING: 433MHz RF RELAY SPOOFING';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-purple-400 font-bold';

        const imuEl = document.getElementById('tel-imu');
        if (imuEl) {
            imuEl.innerText = 'RF RELAY BLOCKED (433.9 MHz)';
            imuEl.className = 'text-purple-400 font-bold animate-pulse';
        }

        window.CarAudio?.playBeep(620, 0.18, 'sawtooth');
        logTelegram('📡 [RF SPECTRUM] 433.92 MHz Key-Fob Relay amplification detected! Physical Servo Flip-Guard blocked remote unlock.');
    },

    triggerTiltSOS: function () {
        if (this.alarmTriggered) return;
        this.alarmTriggered = true;

        window.CarAudio?.playBeep(260, 0.35, 'sawtooth');
        window.CarAudio?.startSiren();

        window.CarGuard.fovCones.forEach(c => c.material.color.setHex(0xef4444));
        document.getElementById('telegram-panel')?.classList.add('alarm-flash');

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-rose-500 animate-ping';
        document.getElementById('system-status-text').innerText = 'SOS: HYDRAULIC JACK / TOW TILT (5.4°)!';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-rose-500 font-bold';

        const radarEl = document.getElementById('tel-radar');
        if (radarEl) {
            radarEl.innerText = 'INTRUSION: CHASSIS LIFTED';
            radarEl.className = 'text-rose-500 font-bold';
        }

        const imuEl = document.getElementById('tel-imu');
        if (imuEl) {
            imuEl.innerText = 'TILT BREACH (5.4° | JACK/TOW!)';
            imuEl.className = 'text-rose-400 font-bold animate-pulse';
        }

        const shieldEl = document.getElementById('tel-shield');
        if (shieldEl) {
            shieldEl.innerHTML = '<i class="fa-solid fa-lock mr-1"></i>DEADLOCKED (3-OF-3 STRICT MFA)';
            shieldEl.className = 'text-rose-400 font-bold';
        }

        logTelegram('🚨 [6-AXIS IMU GYRO] Critical 5.4° chassis roll angle exceeded! Hydraulic jack / wheel-theft or tow attempt locked.');

        if (typeof dispatchWhatsAppSOS === 'function') {
            dispatchWhatsAppSOS(
                'CRITICAL JACK-TILT & RF RELAY ATTACK SOS',
                '6-Axis IMU Gyroscope detected 5.4° vehicle chassis roll (Hydraulic Jack / Wheel Theft or Tow attempt) following 433MHz RF Relay attack. Immobilizer deadlocked!'
            );
        }
    },

    update: function () {
        const thief = window.CarGuard.thiefGroup;
        const arm = window.CarGuard.thiefArmPivot;
        const car = window.CarGuard.carGroup;

        if (!thief || !car || this.phase === 0) return;

        this.phaseTicks++;

        if (this.phase === 1) {
            this.rfRings.forEach(r => {
                r.progress += 0.025;
                if (r.progress > 1.0) r.progress = 0;
                r.mesh.position.set(1.75 - r.progress * 1.45, 1.15 - r.progress * 0.25, 0.15);
                const s = 0.6 + r.progress * 1.6;
                r.mesh.scale.set(s, s, s);
                r.mesh.material.opacity = (1.0 - r.progress) * 0.85;
            });

            if (this.phaseTicks > 105) {
                this.rfWavesGroup.visible = false;
                this.jackGroup.visible = true;

                // Stand well back at X = 2.15 (0.85m behind the jack base) and lean FORWARD over the T-handle!
                if (typeof window.setHumanCharacterState === 'function') {
                    window.setHumanCharacterState('thief', 'crouching');
                }
                thief.position.set(2.15, 0.0, 0.15);
                if (window.CarGuard.suspectBBox) {
                    window.CarGuard.suspectBBox.position.y = 0.89;
                }

                this.phase = 2;
                this.phaseTicks = 0;
                logTelegram('🔧 [CHASSIS SENSOR] RF Relay failed. Suspect leaning forward behind hydraulic jack & pumping handle...');
            }
        } else if (this.phase === 2) {
            // Pump both hands downward & upward at waist height (-0.38 rad) in sync with the jack lever
            const pumpOsc = Math.sin(this.phaseTicks * 0.20);
            if (arm) {
                arm.rotation.x = -0.38 + pumpOsc * 0.22;
            }
            if (this.jackHandlePivot) {
                this.jackHandlePivot.rotation.z = pumpOsc * 0.24;
            }

            if (this.tiltAngle < 0.095) {
                this.tiltAngle += 0.00085;
                car.rotation.z = this.tiltAngle;
                car.position.y = this.tiltAngle * 0.85;

                if (this.jackSaddle) {
                    this.jackSaddle.position.y = 0.15 + this.tiltAngle * 1.45;
                }
                if (this.jackLiftArm) {
                    this.jackLiftArm.position.y = 0.11 + this.tiltAngle * 0.85;
                    this.jackLiftArm.rotation.z = -this.tiltAngle * 2.2;
                }

                const deg = (this.tiltAngle * (180 / Math.PI)).toFixed(1);
                const imuEl = document.getElementById('tel-imu');
                if (imuEl) {
                    imuEl.innerText = `GYRO ROLL: ${deg}° / 5.0° MAX`;
                    imuEl.className = 'text-amber-400 font-bold';
                }
            } else {
                this.triggerTiltSOS();
                this.phase = 3;
            }
        } else if (this.phase === 3) {
            if (arm) {
                arm.rotation.x += (-0.38 - arm.rotation.x) * 0.1;
            }
        }

        if (this.sirenLight && this.alarmTriggered) {
            this.sirenTick += 0.18;
            this.sirenLight.intensity = 2.8;
            const isRed = Math.sin(this.sirenTick) > 0;
            this.sirenLight.color.setHex(isRed ? 0xff0033 : 0x0066ff);
        }
    },

    cleanup: function () {
        this.phase = 0;
        if (this.jackGroup) this.jackGroup.visible = false;
        if (this.rfWavesGroup) this.rfWavesGroup.visible = false;
        if (this.sirenLight) this.sirenLight.intensity = 0;
        if (window.CarGuard) {
            if (window.CarGuard.carGroup) {
                window.CarGuard.carGroup.rotation.z = 0;
                window.CarGuard.carGroup.rotation.x = 0;
                window.CarGuard.carGroup.position.y = 0;
            }
            if (window.CarGuard.thiefGroup) {
                window.CarGuard.thiefGroup.position.y = 0;
            }
            if (window.CarGuard.suspectBBox) {
                window.CarGuard.suspectBBox.position.y = 0.89;
            }
        }
    }
};