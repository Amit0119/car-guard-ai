// SCENE 3: BREAK-IN & SOS ALARM (3D GLASS SHATTER PHYSICS + SIREN AUDIO + TELEGRAM SOS)
window.Scene3Breakin = {
    shardsGroup: null,
    shards: [],
    sirenLight: null,
    sirenTick: 0,

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
        if (window.CarGuard.carGroup) window.CarGuard.carGroup.rotation.y = 0;

        if (!this.shardsGroup) this.initPhysicsObjects(scene);

        // Trigger Web Audio Glass Shatter + Police Siren!
        window.CarAudio?.playGlassShatter();
        window.CarAudio?.startSiren();

        // Hide intact right window and spawn exploding 3D glass shards at Front Right Window (Z = 0.40)
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

        // Position suspect right next to broken Front Right Window (Z = 0.40)
        if (window.CarGuard.thiefGroup) {
            window.CarGuard.thiefGroup.visible = true;
            window.CarGuard.thiefGroup.position.set(1.55, 0, 0.40);
        }

        document.getElementById('cam1-bbox')?.classList.remove('hidden');
        document.getElementById('loiter-controls')?.classList.add('hidden');
        document.getElementById('cockpit-auth-modal')?.classList.add('hidden');
        document.getElementById('telegram-panel')?.classList.add('alarm-flash');

        // Turn All Cones Crimson Red during Break-In
        window.CarGuard.fovCones.forEach(c => c.material.color.setHex(0xef4444));

        // Update Telemetry UI
        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-rose-500 animate-ping';
        document.getElementById('system-status-text').innerText = 'SOS: BREAK-IN DETECTED!';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-rose-500 font-bold';

        document.getElementById('tel-radar').innerText = 'INTRUSION LOCKED (RED)';
        document.getElementById('tel-radar').className = 'text-rose-500 font-bold';

        document.getElementById('tel-glass').innerText = 'SHATTERED (940 Hz ALERT!)';
        document.getElementById('tel-glass').className = 'text-rose-400 font-bold animate-pulse';

        logTelegram('🚨 [PIEZO SENSOR] Right Window Glass Shatter detected (940 Hz spike)!');
        logTelegram('📡 [TELEGRAM SOS] High-Res CAM-01 Face Capture + Live GPS (28.3670° N, 79.4304° E) dispatched!');
    },

    update: function () {
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

        if (this.sirenLight) {
            this.sirenTick += 0.18;
            this.sirenLight.intensity = 2.8;
            const isRed = Math.sin(this.sirenTick) > 0;
            this.sirenLight.color.setHex(isRed ? 0xff0033 : 0x0066ff);
        }
    }
};