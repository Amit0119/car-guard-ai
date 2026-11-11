// SCENE 3: DUAL-WINDOW HAMMER BREAK-IN (RIGHT WINDOW SMASH -> RUN AROUND HOOD -> LEFT WINDOW SMASH)
window.Scene3Breakin = {
    shardsGroup: null,
    rightShards: [],
    leftShards: [],
    sirenLight: null,
    sirenTick: 0,
    // Phases:
    // 1: Right window wind-up, 2: Right window strike, 3: Run around front hood to Left window,
    // 4: Left window wind-up, 5: Left window strike, 6: Post-strike stance
    attackPhase: 0,
    rightImpactDone: false,
    leftImpactDone: false,
    runWaypoints: [],
    currentWaypointIdx: 0,

    initPhysicsObjects: function (scene) {
        this.shardsGroup = new THREE.Group();
        this.shardsGroup.visible = false;
        scene.add(this.shardsGroup);

        const shardMat = new THREE.MeshPhysicalMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.78,
            roughness: 0.1
        });

        // 35 Shards for Right Window
        for (let i = 0; i < 35; i++) {
            const geo = new THREE.TetrahedronGeometry(0.06 + Math.random() * 0.05);
            const mesh = new THREE.Mesh(geo, shardMat);
            mesh.visible = false;
            this.shardsGroup.add(mesh);
            this.rightShards.push({ mesh, vx: 0, vy: 0, vz: 0, active: false });
        }

        // 35 Shards for Left Window
        for (let i = 0; i < 35; i++) {
            const geo = new THREE.TetrahedronGeometry(0.06 + Math.random() * 0.05);
            const mesh = new THREE.Mesh(geo, shardMat);
            mesh.visible = false;
            this.shardsGroup.add(mesh);
            this.leftShards.push({ mesh, vx: 0, vy: 0, vz: 0, active: false });
        }

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

        if (typeof window.setHumanCharacterState === 'function') {
            window.setHumanCharacterState('thief', 'standing');
        }

        // Restore both windows before the dual attack begins
        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
        if (window.CarGuard.leftWindowMesh) window.CarGuard.leftWindowMesh.visible = true;

        this.shardsGroup.visible = true;
        this.rightShards.forEach(s => { s.mesh.visible = false; s.active = false; });
        this.leftShards.forEach(s => { s.mesh.visible = false; s.active = false; });

        if (this.sirenLight) this.sirenLight.intensity = 0;

        // Start suspect at Front Right Window (X = 1.42, Z = 0.40) facing the glass (-Math.PI / 2)
        if (window.CarGuard.thiefGroup) {
            window.CarGuard.thiefGroup.visible = true;
            window.CarGuard.thiefGroup.position.set(1.42, 0, 0.40);
            window.CarGuard.thiefGroup.rotation.y = -Math.PI / 2;
        }

        if (window.CarGuard.thiefArmPivot) {
            window.CarGuard.thiefArmPivot.rotation.set(-0.45, 0, 0);
        }

        // Waypoints around the front bumper from Right Window (1.42, 0.40) to Left Window (-1.42, 0.40)
        this.runWaypoints = [
            new THREE.Vector3(1.45, 0, 2.55),
            new THREE.Vector3(0.0, 0, 2.85),
            new THREE.Vector3(-1.45, 0, 2.55),
            new THREE.Vector3(-1.42, 0, 0.40)
        ];
        this.currentWaypointIdx = 0;

        this.rightImpactDone = false;
        this.leftImpactDone = false;
        this.attackPhase = 1; // Start Wind-up at Right Window

        document.getElementById('cam1-bbox')?.classList.remove('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-amber-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'THREAT: ARMED INTRUDER AT RIGHT WINDOW';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-amber-400 font-bold';

        logTelegram('⚠️ [CAM-01 OPTICAL] Armed suspect raising iron breaker tool at Front Right Window!');
    },

    triggerRightWindowImpact: function () {
        if (this.rightImpactDone) return;
        this.rightImpactDone = true;

        window.CarAudio?.playGlassShatter();
        window.CarAudio?.startSiren();

        if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = false;

        this.rightShards.forEach(s => {
            s.mesh.visible = true;
            s.active = true;
            s.mesh.position.set(
                0.82 + (Math.random() - 0.5) * 0.15,
                1.05 + Math.random() * 0.35,
                0.40 + (Math.random() - 0.5) * 0.75
            );
            s.vx = (Math.random() - 0.25) * 0.045;
            s.vy = 0.02 + Math.random() * 0.03;
            s.vz = (Math.random() - 0.5) * 0.04;
        });

        if (window.CarGuard.fovCones[0]) window.CarGuard.fovCones[0].material.color.setHex(0xef4444);
        document.getElementById('telegram-panel')?.classList.add('alarm-flash');

        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-rose-500 animate-ping';
        document.getElementById('system-status-text').innerText = 'SOS: RIGHT WINDOW SHATTERED!';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-rose-500 font-bold';

        const glassEl = document.getElementById('tel-glass');
        if (glassEl) {
            glassEl.innerText = 'RIGHT SHATTERED (940 Hz ALERT!)';
            glassEl.className = 'text-rose-400 font-bold animate-pulse';
        }

        logTelegram('🚨 [PIEZO SENSOR] Front Right Window shattered (940 Hz spike)! Suspect moving to Left side...');
    },

    triggerLeftWindowImpact: function () {
        if (this.leftImpactDone) return;
        this.leftImpactDone = true;

        window.CarAudio?.playGlassShatter();

        if (window.CarGuard.leftWindowMesh) window.CarGuard.leftWindowMesh.visible = false;

        this.leftShards.forEach(s => {
            s.mesh.visible = true;
            s.active = true;
            s.mesh.position.set(
                -0.82 + (Math.random() - 0.5) * 0.15,
                1.05 + Math.random() * 0.35,
                0.40 + (Math.random() - 0.5) * 0.75
            );
            s.vx = (Math.random() - 0.75) * 0.045;
            s.vy = 0.02 + Math.random() * 0.03;
            s.vz = (Math.random() - 0.5) * 0.04;
        });

        window.CarGuard.fovCones.forEach(c => c.material.color.setHex(0xef4444));

        document.getElementById('system-status-text').innerText = 'CRITICAL: BOTH WINDOWS SHATTERED (SOS SENT)';

        const radarEl = document.getElementById('tel-radar');
        if (radarEl) {
            radarEl.innerText = 'DUAL INTRUSION LOCKED (CAM-01 & CAM-02)';
            radarEl.className = 'text-rose-500 font-bold';
        }

        const glassEl = document.getElementById('tel-glass');
        if (glassEl) {
            glassEl.innerText = 'BOTH WINDOWS SHATTERED (940 Hz!)';
            glassEl.className = 'text-rose-400 font-bold animate-pulse';
        }

        const shieldEl = document.getElementById('tel-shield');
        if (shieldEl) {
            shieldEl.innerHTML = '<i class="fa-solid fa-lock mr-1"></i>DEADLOCKED (3-OF-3 STRICT MFA)';
            shieldEl.className = 'text-rose-400 font-bold';
        }

        logTelegram('🚨 [CAM-02 & PIEZO] Front Left Window ALSO shattered! Dual-side breach locked.');

        if (typeof dispatchWhatsAppSOS === 'function') {
            dispatchWhatsAppSOS(
                'CRITICAL DUAL-WINDOW BREAK-IN SOS',
                'Armed suspect shattered BOTH Right and Left vehicle windows (Piezo: 940 Hz spike). Immobilizer deadlocked!'
            );
        }
    },

    updateShardList: function (list) {
        list.forEach(s => {
            if (!s.active) return;
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
    },

    update: function () {
        const thief = window.CarGuard.thiefGroup;
        const arm = window.CarGuard.thiefArmPivot;

        if (thief && arm && this.attackPhase > 0) {
            if (this.attackPhase === 1) {
                // Phase 1: Wind-up hammer at Right Window
                arm.rotation.x -= 0.08;
                if (arm.rotation.x <= -2.25) {
                    this.attackPhase = 2;
                }
            } else if (this.attackPhase === 2) {
                // Phase 2: Smash Right Window
                arm.rotation.x += 0.24;
                if (arm.rotation.x >= -0.82) {
                    this.triggerRightWindowImpact();
                    arm.rotation.x = -0.55;
                    this.attackPhase = 3;
                }
            } else if (this.attackPhase === 3) {
                // Phase 3: Run around the front hood to the Left Window
                const target = this.runWaypoints[this.currentWaypointIdx];
                const dx = target.x - thief.position.x;
                const dz = target.z - thief.position.z;
                const dist = Math.hypot(dx, dz);

                if (dist > 0.08) {
                    const speed = 0.065;
                    thief.position.x += (dx / dist) * speed;
                    thief.position.z += (dz / dist) * speed;
                    thief.rotation.y = Math.atan2(dx, dz);
                } else {
                    this.currentWaypointIdx++;
                    if (this.currentWaypointIdx >= this.runWaypoints.length) {
                        // Arrived at Left Window (-1.42, 0, 0.40) -> Face the Left glass (+Math.PI / 2)
                        thief.position.set(-1.42, 0, 0.40);
                        thief.rotation.y = Math.PI / 2;
                        arm.rotation.x = -0.45;
                        this.attackPhase = 4;
                    }
                }
            } else if (this.attackPhase === 4) {
                // Phase 4: Wind-up hammer at Left Window
                arm.rotation.x -= 0.08;
                if (arm.rotation.x <= -2.25) {
                    this.attackPhase = 5;
                }
            } else if (this.attackPhase === 5) {
                // Phase 5: Smash Left Window
                arm.rotation.x += 0.24;
                if (arm.rotation.x >= -0.82) {
                    this.triggerLeftWindowImpact();
                    this.attackPhase = 6;
                }
            } else if (this.attackPhase === 6) {
                // Phase 6: Settle into post-strike stance
                arm.rotation.x += (-1.20 - arm.rotation.x) * 0.12;
            }
        }

        // Update falling glass shards on both sides
        this.updateShardList(this.rightShards);
        this.updateShardList(this.leftShards);

        if (this.sirenLight && this.rightImpactDone) {
            this.sirenTick += 0.18;
            this.sirenLight.intensity = 2.8;
            const isRed = Math.sin(this.sirenTick) > 0;
            this.sirenLight.color.setHex(isRed ? 0xff0033 : 0x0066ff);
        }
    }
};