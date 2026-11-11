// SCENE 5: OPTICAL CLOTH TAMPER & CAMERA BLINDING ATTACK (3D WINDOW CLOTH + LIVE WEBCAM OCCLUSION)
window.Scene5Tamper = {
    clothMesh: null,
    sirenLight: null,
    sirenTick: 0,
    phase: 0, // 1: Walk to window, 2: Raise arm & drape black cloth over window, 3: Tamper alarm active
    tamperTriggered: false,
    preTamperSnapshot: null,
    webcamPollId: null,
    webcamTamperSent: false,

    initObjects: function (scene) {
        // 3D Black Microfiber Cloth / Cover Sheet that drapes over the Front Right Window
        const clothGeo = new THREE.PlaneGeometry(0.92, 0.46, 12, 6);
        const clothMat = new THREE.MeshStandardMaterial({
            color: 0x090d16,
            roughness: 0.95,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        this.clothMesh = new THREE.Mesh(clothGeo, clothMat);
        this.clothMesh.rotation.y = Math.PI / 2;
        this.clothMesh.position.set(0.84, 1.45, 0.40);
        this.clothMesh.scale.set(1, 0.05, 1);
        this.clothMesh.visible = false;
        scene.add(this.clothMesh);

        this.sirenLight = new THREE.PointLight(0xff0033, 0, 18);
        this.sirenLight.position.set(0, 3.2, 0);
        scene.add(this.sirenLight);
    },

    enter: function () {
        if (window.Scene2Loitering) window.Scene2Loitering.cleanup();
        if (window.Scene4Cockpit) window.Scene4Cockpit.stopLivenessPolling();
        this.cleanup();

        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;
        if (!this.clothMesh) this.initObjects(scene);

        switchMainPOV('orbit');

        // Restore windows if coming from Scene 3
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.CarGuard.leftWindowMesh) window.CarGuard.leftWindowMesh.visible = true;
        if (window.Scene3Breakin?.shardsGroup) window.Scene3Breakin.shardsGroup.visible = false;
        if (window.Scene3Breakin?.sirenLight) window.Scene3Breakin.sirenLight.intensity = 0;

        // Configure .GLB suspect without hammer (carrying cloth to blind CAM-01)
        if (typeof window.setHumanCharacterState === 'function') {
            window.setHumanCharacterState('thief', 'walking');
        }
        if (window.CarGuard.hammerGroup) {
            window.CarGuard.hammerGroup.visible = false;
        }

        // Start suspect at X = 2.05 walking in toward the Front Right Window (X = 1.35, Z = 0.40)
        if (window.CarGuard.thiefGroup) {
            window.CarGuard.thiefGroup.visible = true;
            window.CarGuard.thiefGroup.position.set(2.05, 0, 0.40);
            window.CarGuard.thiefGroup.rotation.y = -Math.PI / 2;
        }
        if (window.CarGuard.thiefArmPivot) {
            window.CarGuard.thiefArmPivot.rotation.set(-0.35, 0, 0);
        }

        this.clothMesh.visible = false;
        this.clothMesh.position.set(0.83, 1.30, 0.40);
        this.clothMesh.scale.set(1, 0.05, 1);
        if (this.sirenLight) this.sirenLight.intensity = 0;

        this.phase = 1;
        this.tamperTriggered = false;
        this.preTamperSnapshot = null;
        this.webcamTamperSent = false;

        document.getElementById('cam1-bbox')?.classList.remove('hidden');
        document.getElementById('cam1-tamper-overlay')?.classList.add('hidden');
        document.getElementById('cam3-tamper-overlay')?.classList.add('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');

        if (window.CarGuard.fovCones[0]) window.CarGuard.fovCones[0].material.color.setHex(0xf59e0b);
        if (window.CarGuard.fovCones[1]) window.CarGuard.fovCones[1].material.color.setHex(0x10b981);
        if (window.CarGuard.fovCones[2]) window.CarGuard.fovCones[2].material.color.setHex(0x38bdf8);

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-amber-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'WARNING: SUSPECT APPROACHING OPTICS';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-amber-400 font-bold';

        const opticsEl = document.getElementById('tel-optics');
        if (opticsEl) {
            opticsEl.innerText = 'TRACKING (LUX: 94% | CLEAR)';
            opticsEl.className = 'text-amber-400 font-semibold';
        }

        logTelegram('🕵️ [CAM-01 OPTICAL] Suspect approaching Right Window with opaque cloth cover...');

        // Also poll physical laptop webcam if "Use Real Cam" is active
        this.startRealWebcamTamperWatch();
    },

    capturePreOcclusionFrame: function () {
        if (!renderer || !renderer.domElement) return;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 640;
        tempCanvas.height = 360;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(renderer.domElement, 0, 0, tempCanvas.width, tempCanvas.height);
        this.preTamperSnapshot = tempCanvas.toDataURL('image/jpeg', 0.78);
        logTelegram('📸 [BUFFER LOCKED] CAM-01 cached pre-occlusion clear suspect frame before lens blackout.');
    },

    triggerOpticalTamperSOS: function (sourceLabel) {
        if (this.tamperTriggered) return;
        this.tamperTriggered = true;

        window.CarAudio?.playBeep(320, 0.25, 'sawtooth');
        window.CarAudio?.startSiren();

        window.CarGuard.fovCones.forEach(c => c.material.color.setHex(0xef4444));
        document.getElementById('telegram-panel')?.classList.add('alarm-flash');
        document.getElementById('cam1-tamper-overlay')?.classList.remove('hidden');

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-rose-500 animate-ping';
        document.getElementById('system-status-text').innerText = 'SOS: OPTICAL TAMPER DETECTED!';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-rose-500 font-bold';

        const radarEl = document.getElementById('tel-radar');
        if (radarEl) {
            radarEl.innerText = 'INTRUSION: LENS OCCLUDED';
            radarEl.className = 'text-rose-500 font-bold';
        }

        const opticsEl = document.getElementById('tel-optics');
        if (opticsEl) {
            opticsEl.innerText = 'BLINDED (LUX: 1.8% | VAR: 1.2)';
            opticsEl.className = 'text-rose-400 font-bold animate-pulse';
        }

        const shieldEl = document.getElementById('tel-shield');
        if (shieldEl) {
            shieldEl.innerHTML = '<i class="fa-solid fa-lock mr-1"></i>DEADLOCKED (3-OF-3 STRICT MFA)';
            shieldEl.className = 'text-rose-400 font-bold';
        }

        logTelegram(`🚨 [OPTICAL TAMPER SOS] ${sourceLabel} blinded! Pixel variance dropped below threshold. Dispatching pre-tamper snapshot...`);

        if (typeof dispatchWhatsAppSOS === 'function') {
            dispatchWhatsAppSOS(
                'CRITICAL CAMERA / WINDOW CLOTH TAMPER SOS',
                `${sourceLabel} covered with opaque cloth (Optical Lux: 1.8%, Variance: 1.2). Pre-occlusion suspect frame captured & immobilizer deadlocked!`
            );
        }
    },

    startRealWebcamTamperWatch: function () {
        this.webcamPollId = setInterval(async () => {
            const videoEl = document.getElementById('real-webcam');
            if (!realWebcamActive || !videoEl || videoEl.readyState < 2 || this.webcamTamperSent) return;

            const c = document.createElement('canvas');
            c.width = 320;
            c.height = 240;
            c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
            const frame = c.toDataURL('image/jpeg', 0.75);

            try {
                const res = await fetch('http://127.0.0.1:5000/api/liveness-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: frame })
                });
                const data = await res.json();
                if (data.camera_tampered && !this.webcamTamperSent) {
                    this.webcamTamperSent = true;
                    document.getElementById('cam3-tamper-overlay')?.classList.remove('hidden');
                    this.triggerOpticalTamperSOS(`Physical Webcam CAM-03 (Lux: ${data.mean_lux})`);
                }
            } catch (e) {}
        }, 400);
    },

    update: function () {
        const thief = window.CarGuard.thiefGroup;
        const arm = window.CarGuard.thiefArmPivot;

        if (thief && arm && this.phase > 0) {
            if (this.phase === 1) {
                // Step 1: Walk up to the Front Right Window
                if (thief.position.x > 1.34) {
                    thief.position.x -= 0.018;
                } else {
                    if (typeof window.setHumanCharacterState === 'function') {
                        window.setHumanCharacterState('thief', 'standing');
                    }
                    if (window.CarGuard.hammerGroup) {
                        window.CarGuard.hammerGroup.visible = false;
                    }
                    // Capture clean pre-tamper evidence right before suspect drapes the black cloth
                    this.capturePreOcclusionFrame();
                    this.clothMesh.visible = true;
                    this.phase = 2;
                }
            } else if (this.phase === 2) {
                // Step 2: Suspect raises arm & unfurls the black cloth across the Right Window glass
                arm.rotation.x += (-1.55 - arm.rotation.x) * 0.10;
                this.clothMesh.scale.y = Math.min(1.0, this.clothMesh.scale.y + 0.035);
                this.clothMesh.position.y = 1.30 - (this.clothMesh.scale.y * 0.18);

                if (this.clothMesh.scale.y >= 0.98) {
                    this.triggerOpticalTamperSOS('Front Right Window (CAM-01)');
                    this.phase = 3;
                }
            } else if (this.phase === 3) {
                // Step 3: Suspect holds cloth against the window while alarm strobes
                arm.rotation.x += (-1.35 - arm.rotation.x) * 0.08;
            }
        }

        if (this.sirenLight && this.tamperTriggered) {
            this.sirenTick += 0.18;
            this.sirenLight.intensity = 2.8;
            const isRed = Math.sin(this.sirenTick) > 0;
            this.sirenLight.color.setHex(isRed ? 0xff0033 : 0x0066ff);
        }
    },

    cleanup: function () {
        if (this.webcamPollId) {
            clearInterval(this.webcamPollId);
            this.webcamPollId = null;
        }
        if (this.clothMesh) {
            this.clothMesh.visible = false;
        }
        if (this.sirenLight) {
            this.sirenLight.intensity = 0;
        }
        document.getElementById('cam1-tamper-overlay')?.classList.add('hidden');
        document.getElementById('cam3-tamper-overlay')?.classList.add('hidden');
    }
};