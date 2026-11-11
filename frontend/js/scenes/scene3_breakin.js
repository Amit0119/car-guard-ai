// SCENE 3: HAMMER BREAK-IN & SHATTER PHYSICS + SIREN AUDIO + WHATSAPP SOS
window.Scene3Breakin = {
    shardsGroup: null,
    shards: [],
    sirenLight: null,
    sirenTick: 0,
    swingPhase: 0, // 0: idle, 1: wind-up back, 2: fast hammer strike, 3: post-impact recoil
    impactTriggered: false,

    initPhysicsObjects: function (scene) {
        this.shardsGroup = new THREE.Group();
        this.shardsGroup.visible = false;
        scene.add(this.shardsGroup);

        const shardMat = new THREE.MeshPhysicalMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.75,
            roughness: 0.1
        });

        for (let i = 0; i < 35; i++) {
            const geo = new THREE.TetrahedronGeometry(0.06 + Math.random() * 0.05);
            const mesh = new THREE.Mesh(geo, shardMat);
            this.shardsGroup.add(mesh);
            this.shards.push({
                mesh: mesh,
                vx: 0,
                vy: 0,
                vz: 0
            });
        }

        // High-intensity Police/Alarm Strobe Light above the car
        this.sirenLight = new THREE.PointLight(0xff0033, 0, 18);
        this.sirenLight.position.set(0, 3.2, 0);
        scene.add(this.sirenLight);
    },

    enter: function () {
        if (window.Scene2Loitering) window.Scene2Loitering.cleanup();
        if (window.Scene4Cockpit) window.Scene4Cockpit.stopLivenessPolling();
        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;

        if (!this.shardsGroup) this.initPhysicsObjects(scene);

        switchMainPOV('orbit');

        // Keep window intact during the hammer wind-up before impact
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        this.shardsGroup.visible = false;
        if (this.sirenLight) this.sirenLight.intensity = 0;

        // Position suspect right next to Front Right Window (X = 1.42, Z = 0.40) facing the glass (-Math.PI / 2)
        if (window.CarGuard.thiefGroup) {
            window.CarGuard.thiefGroup.visible = true;
            window.CarGuard.thiefGroup.position.set(1.42, 0, 0.40);
            window.CarGuard.thiefGroup.rotation.y = -Math.PI / 2;
        }

        if (window.CarGuard.thiefArmPivot) {
            window.CarGuard.thiefArmPivot.rotation.set(-0.45, 0, 0);
        }

        this.impactTriggered = false;
        this.swingPhase = 1; // Start raising the hammer

        document.getElementById('cam1-bbox')?.classList.remove('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-amber-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'THREAT: WEAPON DETECTED AT RIGHT WINDOW';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-amber-400 font-bold';

        logTelegram('⚠️ [CAM-01 OPTICAL] Suspect raising heavy iron breaker tool at Front Right Window!');
    },

    triggerHammerImpact: function () {
        if (this.impactTriggered) return;
        this.impactTriggered = true;

        // 1. Trigger Web Audio Glass Shatter + Police Siren at hammer impact
        window.CarAudio?.playGlassShatter();
        window.CarAudio?.startSiren();

        // 2. Hide intact right window and spawn exploding 3D glass shards with original natural scatter
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = false;
        this.shardsGroup.visible = true;

        this.shards.forEach(s => {
            s.mesh.position.set(
                0.82 + (Math.random() - 0.5) * 0.15,
                1.05 + Math.random() * 0.35,
                0.40 + (Math.random() - 0.5) * 0.75
            );
            s.vx = (Math.random() - 0.25) * 0.045;
            s.vy = 0.02 + Math.random() * 0.03;
            s.vz = (Math.random() - 0.5) * 0.04;
        });

        // 3. Turn All Cones Crimson Red & Flash UI
        window.CarGuard.fovCones.forEach(c => c.material.color.setHex(0xef4444));
        document.getElementById('telegram-panel')?.classList.add('alarm-flash');

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-rose-500 animate-ping';
        document.getElementById('system-status-text').innerText = 'SOS: BREAK-IN DETECTED!';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-rose-500 font-bold';

        const radarEl = document.getElementById('tel-radar');
        if (radarEl) {
            radarEl.innerText = 'INTRUSION LOCKED (HAMMER STRIKE)';
            radarEl.className = 'text-rose-500 font-bold';
        }

        const glassEl = document.getElementById('tel-glass');
        if (glassEl) {
            glassEl.innerText = 'SHATTERED (940 Hz ALERT!)';
            glassEl.className = 'text-rose-400 font-bold animate-pulse';
        }

        const shieldEl = document.getElementById('tel-shield');
        if (shieldEl) {
            shieldEl.innerHTML = '<i class="fa-solid fa-lock mr-1"></i>DEADLOCKED (3-OF-3 STRICT MFA)';
            shieldEl.className = 'text-rose-400 font-bold';
        }

        logTelegram('🚨 [PIEZO SENSOR] Right Window Glass Shatter detected (940 Hz hammer impact spike)!');

        if (typeof dispatchWhatsAppSOS === 'function') {
            dispatchWhatsAppSOS(
                'CRITICAL BREAK-IN & GLASS SHATTER SOS',
                'Suspect shattered Front Right Window with heavy iron breaker tool (Piezo: 940 Hz spike). Immobilizer deadlocked!'
            );
        }
    },

    update: function () {
        // 1. Animate Suspect's Right Arm Swinging the Hammer into the Right Window
        const arm = window.CarGuard.thiefArmPivot;
        if (arm && this.swingPhase > 0) {
            if (this.swingPhase === 1) {
                arm.rotation.x -= 0.075;
                if (arm.rotation.x <= -2.25) {
                    this.swingPhase = 2;
                }
            } else if (this.swingPhase === 2) {
                arm.rotation.x += 0.22;
                if (arm.rotation.x >= -0.82) {
                    this.triggerHammerImpact();
                    this.swingPhase = 3;
                }
            } else if (this.swingPhase === 3) {
                arm.rotation.x += (-1.20 - arm.rotation.x) * 0.12;
            }
        }

        // 2. Original Natural Glass Shard Scatter Physics (Spreads across the right side floor)
        if (this.shardsGroup && this.shardsGroup.visible) {
            this.shards.forEach(s => {
                if (s.mesh.position.y > 0.06) {
                    s.vy -= 0.0028;
                    s.mesh.position.x += s.vx;
                    s.mesh.position.y += s.vy;
                    s.mesh.position.z += s.vz;
                    s.mesh.rotation.x += 0.12;
                    s.mesh.rotation.z += 0.15;
                } else {
                    s.mesh.position.y = 0.05;
                }
            });
        }

        // 3. Police Siren Strobe Light after impact
        if (this.sirenLight && this.impactTriggered) {
            this.sirenTick += 0.18;
            this.sirenLight.intensity = 2.8;
            const isRed = Math.sin(this.sirenTick) > 0;
            this.sirenLight.color.setHex(isRed ? 0xff0033 : 0x0066ff);
        }
    }
};