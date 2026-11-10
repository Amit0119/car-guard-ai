// PURE WEB AUDIO API SYNTHESIZER (NO EXTERNAL MP3 FILES NEEDED)
window.CarAudio = {
    ctx: null,
    sirenInterval: null,
    sirenOsc: null,

    init: function () {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // 1. Biometric / PIN Beep
    playBeep: function (freq = 920, duration = 0.12, type = 'sine') {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    // 2. Mechanical Servo Motor Whir (When Red Flip-Guard Opens)
    playServoWhir: function () {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(460, now + 0.22);
        osc.frequency.linearRampToValueAtTime(320, now + 0.38);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.40);
    },

    // 3. 3D Glass Shatter Sound (Scene 3 Hammer Break-In)
    playGlassShatter: function () {
        this.init();
        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.45;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.12));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2800;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);

        // High-pitched falling glass shards tinkle
        [2400, 3100, 3800, 4400, 2900, 4900].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const sGain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.05);
            sGain.gain.setValueAtTime(0.08, now + idx * 0.05);
            sGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.14);
            osc.connect(sGain);
            sGain.connect(this.ctx.destination);
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.15);
        });
    },

    // 4. Police / SOS Alarm Siren (Scene 3)
    startSiren: function () {
        this.init();
        this.stopSiren();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 680;
        gain.gain.value = 0.12;
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        this.sirenOsc = osc;

        let high = false;
        this.sirenInterval = setInterval(() => {
            if (!this.sirenOsc || !this.ctx) return;
            high = !high;
            this.sirenOsc.frequency.setTargetAtTime(high ? 1120 : 680, this.ctx.currentTime, 0.08);
        }, 380);
    },

    stopSiren: function () {
        if (this.sirenInterval) {
            clearInterval(this.sirenInterval);
            this.sirenInterval = null;
        }
        if (this.sirenOsc) {
            try { this.sirenOsc.stop(); } catch (e) {}
            this.sirenOsc = null;
        }
    },

    // 5. Starter Crank + Porsche V8 Ignition Roar (Scene 4 Key Turn)
    playEngineStart: function () {
        this.init();
        const now = this.ctx.currentTime;

        [0, 0.18, 0.36].forEach(offset => {
            const crankOsc = this.ctx.createOscillator();
            const crankGain = this.ctx.createGain();
            crankOsc.type = 'sawtooth';
            crankOsc.frequency.setValueAtTime(85, now + offset);
            crankOsc.frequency.linearRampToValueAtTime(135, now + offset + 0.12);
            crankGain.gain.setValueAtTime(0.18, now + offset);
            crankGain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.15);
            crankOsc.connect(crankGain);
            crankGain.connect(this.ctx.destination);
            crankOsc.start(now + offset);
            crankOsc.stop(now + offset + 0.16);
        });

        const v8Osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const v8Gain = this.ctx.createGain();

        v8Osc.type = 'sawtooth';
        v8Osc.frequency.setValueAtTime(65, now + 0.55);
        v8Osc.frequency.exponentialRampToValueAtTime(210, now + 0.90);
        v8Osc.frequency.exponentialRampToValueAtTime(78, now + 2.20);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now + 0.55);

        v8Gain.gain.setValueAtTime(0.001, now);
        v8Gain.gain.setValueAtTime(0.28, now + 0.55);
        v8Gain.gain.exponentialRampToValueAtTime(0.001, now + 2.30);

        v8Osc.connect(filter);
        filter.connect(v8Gain);
        v8Gain.connect(this.ctx.destination);
        v8Osc.start(now + 0.55);
        v8Osc.stop(now + 2.35);
    }
};

// Global namespace for Car-Guard-AI 3D Objects & Cameras
window.CarGuard = {
    carGroup: null,
    interiorRigGroup: null,
    ignitionModuleGroup: null,
    fallbackBodyGroup: null,
    externalCarModel: null,
    externalCarWrapper: null,
    roofMesh: null,
    rightWindowMesh: null,
    servoShieldMesh: null,
    fingerprintMesh: null,
    keySlotMesh: null,
    keyMesh: null,
    headlightsGroup: null,
    fovCones: [],
    cameras: {
        cam1: null, // Left B-Pillar -> Right Front Door Window
        cam2: null, // Right B-Pillar -> Left Front Door Window
        cam3: null  // Cockpit POV -> Real Steering Wheel + Center Console Key Safe & Fingerprint
    },
    thiefGroup: null,
    thiefArmPivot: null,
    hammerGroup: null,
    carDimensions: { width: 1.85, height: 1.55, length: 4.6 },
    calib: {
        carRotY: Math.PI,
        bPillarX: 0.74,
        bPillarY: 0.82,
        bPillarZ: -0.05,
        keySafeX: -0.08,
        keySafeY: 0.58,
        keySafeZ: 0.16
    }
};

try {
    const saved = localStorage.getItem('carguard_calib_v3');
    if (saved) {
        Object.assign(window.CarGuard.calib, JSON.parse(saved));
    }
} catch (e) {}

function buildCarAndOptics(scene) {
    const carGroup = new THREE.Group();
    window.CarGuard.carGroup = carGroup;
    scene.add(carGroup);

    const interiorRigGroup = new THREE.Group();
    window.CarGuard.interiorRigGroup = interiorRigGroup;
    carGroup.add(interiorRigGroup);

    // 1. Build Fallback Outer Body + Initial Interior Rig
    createFallbackBody(carGroup);
    rebuildCalibrationRig();

    // 2. Load Real 3D Car Model ('assets/car.glb')
    const loader = new THREE.GLTFLoader();
    loader.load(
        'assets/car.glb',
        function (gltf) {
            const rawCar = gltf.scene;

            if (window.CarGuard.fallbackBodyGroup) {
                window.CarGuard.fallbackBodyGroup.visible = false;
            }

            const wrapper = new THREE.Group();
            wrapper.add(rawCar);
            window.CarGuard.externalCarModel = rawCar;
            window.CarGuard.externalCarWrapper = wrapper;
            carGroup.add(wrapper);

            applyCarTransformAndRebuild();

            rawCar.traverse(function (child) {
                if (child.isMesh && child.material) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    const matName = (child.material.name || '').toLowerCase();
                    const meshName = (child.name || '').toLowerCase();
                    const isLikelyGlass =
                        matName.includes('glass') ||
                        matName.includes('window') ||
                        matName.includes('windshield') ||
                        matName.includes('vitre') ||
                        matName.includes('cristal') ||
                        matName.includes('tint') ||
                        meshName.includes('glass') ||
                        meshName.includes('window') ||
                        meshName.includes('windshield') ||
                        child.material.transparent === true ||
                        (typeof child.material.opacity === 'number' && child.material.opacity < 0.95);

                    if (isLikelyGlass) {
                        child.material = child.material.clone();
                        child.material.transparent = true;
                        child.material.opacity = 0.15;
                        child.material.depthWrite = false;
                        child.material.side = THREE.DoubleSide;
                    }
                }
            });

            logTelegram('[COCKPIT READY] Supercar Flip-Guard, 3D Key & Audio Synthesizer initialized.');
        },
        undefined,
        function () {
            console.log('Using fallback procedural SUV.');
        }
    );

    // 3. Create Articulated 3D Suspect Model with Iron Hammer Outside Front Right Door
    createSuspectModel(scene);

    // 4. Inject Live 3D Camera & Key Safe Calibration UI
    injectCalibrationUI();
}

function applyCarTransformAndRebuild() {
    const rawCar = window.CarGuard.externalCarModel;
    const wrapper = window.CarGuard.externalCarWrapper;
    if (!rawCar || !wrapper) {
        rebuildCalibrationRig();
        return;
    }

    wrapper.scale.set(1, 1, 1);
    wrapper.position.set(0, 0, 0);
    rawCar.position.set(0, 0, 0);
    rawCar.rotation.set(0, window.CarGuard.calib.carRotY, 0);
    wrapper.updateMatrixWorld(true);

    const rotBox = new THREE.Box3().setFromObject(wrapper);
    const rotSize = new THREE.Vector3();
    rotBox.getSize(rotSize);

    const maxDim = Math.max(rotSize.x, rotSize.y, rotSize.z);
    const targetLength = 4.6;
    const scaleFactor = targetLength / maxDim;
    wrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);
    wrapper.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(wrapper);
    const finalCenter = new THREE.Vector3();
    const finalSize = new THREE.Vector3();
    finalBox.getCenter(finalCenter);
    finalBox.getSize(finalSize);

    wrapper.position.x = -finalCenter.x;
    wrapper.position.z = -finalCenter.z;
    wrapper.position.y = -finalBox.min.y;
    wrapper.updateMatrixWorld(true);

    window.CarGuard.carDimensions = {
        width: finalSize.x,
        height: finalSize.y,
        length: finalSize.z
    };

    rebuildCalibrationRig();
}

function createFallbackBody(carGroup) {
    const fallbackBodyGroup = new THREE.Group();
    window.CarGuard.fallbackBodyGroup = fallbackBodyGroup;
    carGroup.add(fallbackBodyGroup);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.25 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.5), bodyMat);
    chassis.position.set(0, 0.6, 0);
    fallbackBodyGroup.add(chassis);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 2.2), bodyMat.clone());
    roof.position.set(0, 1.55, -0.15);
    window.CarGuard.roofMesh = roof;
    fallbackBodyGroup.add(roof);
}

function rebuildCalibrationRig() {
    const rigGroup = window.CarGuard.interiorRigGroup;
    if (!rigGroup) return;

    while (rigGroup.children.length > 0) {
        rigGroup.remove(rigGroup.children[0]);
    }
    window.CarGuard.fovCones.length = 0;

    const W = window.CarGuard.carDimensions.width || 1.85;
    const H = window.CarGuard.carDimensions.height || 1.55;
    const L = window.CarGuard.carDimensions.length || 4.6;
    const c = window.CarGuard.calib;

    const hw = W * 0.5;
    const hl = L * 0.5;

    const camX = hw * c.bPillarX;
    const bPillarCamY = H * c.bPillarY;
    const camZ = c.bPillarZ;

    const keySafeX = c.keySafeX;
    const keySafeY = H * c.keySafeY;
    const keySafeZ = hl * c.keySafeZ;
    const frontWindowZ = 0.40;
    const windowCenterY = H * 0.72;

    // Right Front Window Plane (for Scene 3 Break-In Shatter)
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.24, roughness: 0.1
    });
    const rightWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.85, H * 0.25), glassMat);
    rightWindow.position.set(hw * 0.86, windowCenterY, frontWindowZ);
    rightWindow.rotation.y = Math.PI / 2;
    window.CarGuard.rightWindowMesh = rightWindow;
    rigGroup.add(rightWindow);

    // Realistic Cabin & Dashboard Spot Lighting
    const cabinLight = new THREE.PointLight(0xffffff, 2.4, 5.5);
    cabinLight.position.set(0, H * 0.85, 0.10);
    rigGroup.add(cabinLight);

    const podLight = new THREE.PointLight(0x38bdf8, 1.8, 1.8);
    podLight.position.set(keySafeX, keySafeY + 0.15, keySafeZ - 0.20);
    rigGroup.add(podLight);

    // --- OEM SUPERCAR IGNITION POD (SLEEK FLUSH MOUNT + FIGHTER-JET FLIP COVER) ---
    const ignitionModuleGroup = new THREE.Group();
    ignitionModuleGroup.position.set(keySafeX, keySafeY, keySafeZ);
    ignitionModuleGroup.rotation.x = -0.22;
    window.CarGuard.ignitionModuleGroup = ignitionModuleGroup;
    rigGroup.add(ignitionModuleGroup);

    const backingPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, 0.056, 0.008),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.2 })
    );
    ignitionModuleGroup.add(backingPlate);

    const haloRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.019, 0.0022, 16, 32),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    haloRing.position.set(-0.018, 0, -0.006);
    ignitionModuleGroup.add(haloRing);

    const keyholeCylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.01, 24),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 })
    );
    keyholeCylinder.rotation.x = Math.PI / 2;
    keyholeCylinder.position.set(-0.018, 0, -0.006);
    ignitionModuleGroup.add(keyholeCylinder);

    const keySlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.0035, 0.020, 0.004),
        new THREE.MeshBasicMaterial({ color: 0x020617 })
    );
    keySlot.position.set(-0.018, 0, -0.012);
    window.CarGuard.keySlotMesh = keySlot;
    ignitionModuleGroup.add(keySlot);

    const flipCoverPivot = new THREE.Group();
    flipCoverPivot.position.set(-0.018, 0.020, -0.008);
    window.CarGuard.servoShieldMesh = flipCoverPivot;
    ignitionModuleGroup.add(flipCoverPivot);

    const flipCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.021, 0.021, 0.008, 6),
        new THREE.MeshStandardMaterial({ color: 0xe11d48, metalness: 0.75, roughness: 0.2 })
    );
    flipCap.rotation.x = Math.PI / 2;
    flipCap.position.set(0, -0.020, -0.004);
    flipCoverPivot.add(flipCap);

    const fpBezel = new THREE.Mesh(
        new THREE.TorusGeometry(0.013, 0.002, 16, 28),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    fpBezel.position.set(0.024, 0, -0.006);
    window.CarGuard.fingerprintMesh = fpBezel;
    ignitionModuleGroup.add(fpBezel);

    const fpPad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.006, 24),
        new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.5, roughness: 0.4 })
    );
    fpPad.rotation.x = Math.PI / 2;
    fpPad.position.set(0.024, 0, -0.005);
    ignitionModuleGroup.add(fpPad);

    const keyMeshGroup = new THREE.Group();
    keyMeshGroup.position.set(-0.018, 0, -0.065);
    keyMeshGroup.visible = false;

    const keyBlade = new THREE.Mesh(
        new THREE.BoxGeometry(0.003, 0.012, 0.028),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 })
    );
    keyBlade.position.set(0, 0, 0.014);
    keyMeshGroup.add(keyBlade);

    const keyFob = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.030, 0.032),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.25 })
    );
    keyFob.position.set(0, 0, -0.014);
    keyMeshGroup.add(keyFob);

    const keyAccent = new THREE.Mesh(
        new THREE.BoxGeometry(0.019, 0.008, 0.022),
        new THREE.MeshBasicMaterial({ color: 0xe11d48 })
    );
    keyAccent.position.set(0, 0, -0.016);
    keyMeshGroup.add(keyAccent);

    window.CarGuard.keyMesh = keyMeshGroup;
    ignitionModuleGroup.add(keyMeshGroup);

    // 7. 3D PORSCHE FRONT LED HEADLIGHTS & VOLUMETRIC BEAMS
    const headlightsGroup = new THREE.Group();
    headlightsGroup.visible = false;
    window.CarGuard.headlightsGroup = headlightsGroup;
    rigGroup.add(headlightsGroup);

    const lampGeo = new THREE.SphereGeometry(0.07, 16, 16);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });

    const beamLen = 5.5;
    const beamGeo = new THREE.ConeGeometry(1.15, beamLen, 24, 1, true);
    beamGeo.translate(0, -beamLen / 2, 0);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    [-hw * 0.68, hw * 0.68].forEach(lx => {
        const bulb = new THREE.Mesh(lampGeo, lampMat);
        bulb.position.set(lx, H * 0.47, hl * 0.90);
        headlightsGroup.add(bulb);

        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.copy(bulb.position);
        beam.lookAt(lx * 1.15, 0.05, hl * 0.90 + 6.0);
        headlightsGroup.add(beam);
    });

    const roadLight = new THREE.PointLight(0x38bdf8, 3.5, 14);
    roadLight.position.set(0, H * 0.55, hl * 1.45);
    headlightsGroup.add(roadLight);

    // --- MOUNT ALL 3 CAMERAS ---
    function createCameraMesh(lensColorHex) {
        const camBody = new THREE.Group();
        const housing = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.034, 0.065),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 })
        );
        const lensRing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16),
            new THREE.MeshBasicMaterial({ color: lensColorHex })
        );
        lensRing.rotation.x = Math.PI / 2;
        lensRing.position.z = 0.034;
        camBody.add(housing, lensRing);
        return camBody;
    }

    const rightTarget = new THREE.Vector3(2.1, windowCenterY - 0.05, frontWindowZ);
    const leftTarget = new THREE.Vector3(-2.1, windowCenterY - 0.05, frontWindowZ);

    const cam1Mesh = createCameraMesh(0x10b981);
    cam1Mesh.position.set(-camX, bPillarCamY, camZ);
    cam1Mesh.lookAt(rightTarget);
    rigGroup.add(cam1Mesh);

    const cam1 = new THREE.PerspectiveCamera(68, 1.6, 0.08, 30);
    cam1.position.copy(cam1Mesh.position);
    cam1.lookAt(rightTarget);
    window.CarGuard.cameras.cam1 = cam1;
    rigGroup.add(cam1);

    const cam2Mesh = createCameraMesh(0x10b981);
    cam2Mesh.position.set(camX, bPillarCamY, camZ);
    cam2Mesh.lookAt(leftTarget);
    rigGroup.add(cam2Mesh);

    const cam2 = new THREE.PerspectiveCamera(68, 1.6, 0.08, 30);
    cam2.position.copy(cam2Mesh.position);
    cam2.lookAt(leftTarget);
    window.CarGuard.cameras.cam2 = cam2;
    rigGroup.add(cam2);

    const driverHeadTarget = new THREE.Vector3(0.26, bPillarCamY - 0.04, -0.05);
    const cam3Mesh = createCameraMesh(0x38bdf8);
    cam3Mesh.position.set(0.22, keySafeY + 0.20, keySafeZ + 0.12);
    cam3Mesh.lookAt(driverHeadTarget);
    rigGroup.add(cam3Mesh);

    const cam3 = new THREE.PerspectiveCamera(62, 1.6, 0.05, 15);
    cam3.position.set(0.12, keySafeY + 0.22, keySafeZ - 0.58);
    cam3.lookAt(keySafeX + 0.06, keySafeY + 0.02, keySafeZ);
    window.CarGuard.cameras.cam3 = cam3;
    rigGroup.add(cam3);

    // --- 3D FOV CONES ---
    const coneLength = 2.45;
    const sideConeGeo = new THREE.ConeGeometry(0.35, coneLength, 24, 1, true);
    sideConeGeo.translate(0, -coneLength / 2, 0);
    sideConeGeo.rotateX(-Math.PI / 2);

    const greenConeMat = new THREE.MeshBasicMaterial({
        color: 0x10b981, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false
    });

    const fovCone1 = new THREE.Mesh(sideConeGeo, greenConeMat);
    fovCone1.position.copy(cam1Mesh.position);
    fovCone1.lookAt(rightTarget);
    rigGroup.add(fovCone1);

    const fovCone2 = new THREE.Mesh(sideConeGeo, greenConeMat.clone());
    fovCone2.position.copy(cam2Mesh.position);
    fovCone2.lookAt(leftTarget);
    rigGroup.add(fovCone2);

    const dashConeLen = 0.48;
    const dashConeGeo = new THREE.ConeGeometry(0.14, dashConeLen, 20, 1, true);
    dashConeGeo.translate(0, -dashConeLen / 2, 0);
    dashConeGeo.rotateX(-Math.PI / 2);

    const blueConeMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false
    });

    const fovCone3 = new THREE.Mesh(dashConeGeo, blueConeMat);
    fovCone3.position.copy(cam3Mesh.position);
    fovCone3.lookAt(driverHeadTarget);
    rigGroup.add(fovCone3);

    window.CarGuard.fovCones.push(fovCone1, fovCone2, fovCone3);
}

// ARTICULATED 3D INTRUDER MODEL WITH IRON SLEDGEHAMMER / BREAKER TOOL
function createSuspectModel(scene) {
    const thief = new THREE.Group();

    const hoodieMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd6a384, roughness: 0.6 });
    const maskMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.8 });

    // 1. Legs & Boots
    const legGeo = new THREE.CylinderGeometry(0.10, 0.085, 0.78, 14);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.13, 0.39, 0);
    thief.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.13, 0.39, 0);
    thief.add(rightLeg);

    // 2. Torso & High-Contrast Tactical Vest (Visible in CAM-01)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.21, 0.76, 16), hoodieMat);
    torso.position.y = 1.12;
    torso.castShadow = true;
    thief.add(torso);

    const chestBand = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.23, 0.32, 16), vestMat);
    chestBand.position.y = 1.18;
    thief.add(chestBand);

    // 3. Head + Ski Mask Balaclava + Eye Slit
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.66;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 16), maskMat);
    headGroup.add(head);

    const eyeBand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.14), skinMat);
    eyeBand.position.set(0, 0.02, 0.10);
    headGroup.add(eyeBand);
    thief.add(headGroup);

    // 4. Left Arm (Bracing posture)
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.60, 12), hoodieMat);
    leftArm.position.set(-0.32, 1.14, 0.10);
    leftArm.rotation.z = 0.18;
    leftArm.rotation.x = -0.35;
    thief.add(leftArm);

    // 5. Articulated Right Shoulder Pivot + Arm + Heavy Iron Hammer
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.32, 1.40, 0.0); // Shoulder joint height

    const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.068, 0.58, 12), hoodieMat);
    rightArmMesh.position.set(0, -0.26, 0);
    rightArmPivot.add(rightArmMesh);

    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), skinMat);
    rightHand.position.set(0, -0.56, 0);
    rightArmPivot.add(rightHand);

    // 3D Iron Sledgehammer / Window Breaker in Right Hand
    const hammerGroup = new THREE.Group();
    hammerGroup.position.set(0, -0.56, 0.04);

    // Wooden Handle Shaft extending forward (+Z in local suspect space)
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.65 });
    const handleShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.65, 12), handleMat);
    handleShaft.rotation.x = Math.PI / 2;
    handleShaft.position.z = 0.26;
    hammerGroup.add(handleShaft);

    // Forged Steel Hammerhead
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.12), steelMat);
    hammerHead.position.set(0, 0, 0.55);
    hammerGroup.add(hammerHead);

    // Red Hardened Strike Spike (Points down/forward when swung)
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.6, roughness: 0.3 });
    const strikeSpike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 10), spikeMat);
    strikeSpike.rotation.x = Math.PI;
    strikeSpike.position.set(0, -0.18, 0.55);
    hammerGroup.add(strikeSpike);

    rightArmPivot.add(hammerGroup);
    // Default ready pose: holding hammer slightly raised
    rightArmPivot.rotation.x = -0.55;
    thief.add(rightArmPivot);

    // 6. Red YOLOv8 3D Bounding Box Wireframe
    const bbox = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.82, 1.90, 0.82)),
        new THREE.LineBasicMaterial({ color: 0xff0044 })
    );
    bbox.position.y = 0.95;
    thief.add(bbox);

    // Face -X direction directly towards the car's Front Right Window (X = 0.82, Z = 0.40)
    thief.position.set(1.95, 0, 0.40);
    thief.rotation.y = -Math.PI / 2;
    thief.visible = false;

    window.CarGuard.thiefGroup = thief;
    window.CarGuard.thiefArmPivot = rightArmPivot;
    window.CarGuard.hammerGroup = hammerGroup;
    scene.add(thief);
}

function injectCalibrationUI() {
    if (document.getElementById('calib-widget')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'calib-widget';
    wrapper.className = 'fixed bottom-16 left-80 z-30 pointer-events-auto mono text-xs';
    wrapper.innerHTML = `
        <div class="flex justify-end mb-1.5">
            <button onclick="document.getElementById('calib-panel').classList.toggle('hidden')" class="hud-panel px-3 py-1.5 rounded-lg text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 flex items-center gap-1.5 shadow-lg">
                <i class="fa-solid fa-sliders"></i>
                <span>Calibrate 3D Cameras & Key Safe</span>
            </button>
        </div>
        <div id="calib-panel" class="hidden hud-panel p-3 rounded-xl w-76 space-y-2 border border-cyan-500/40">
            <div class="flex justify-between items-center border-b border-slate-800 pb-1.5">
                <span class="font-bold text-cyan-400 text-[11px]">3D COCKPIT & OPTICS TUNER</span>
                <button onclick="flipCarOrientation()" class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] hover:bg-amber-500/40">
                    <i class="fa-solid fa-rotate"></i> Flip Car 180°
                </button>
            </div>
            <div>
                <div class="flex justify-between text-[10px] text-emerald-300">
                    <span>Key Safe Left/Right (X):</span>
                    <span id="val-ksx">${window.CarGuard.calib.keySafeX.toFixed(2)}</span>
                </div>
                <input type="range" min="-0.35" max="0.35" step="0.01" value="${window.CarGuard.calib.keySafeX}" oninput="updateCalib('keySafeX', this.value, 'val-ksx')" class="w-full accent-emerald-400">
            </div>
            <div>
                <div class="flex justify-between text-[10px] text-emerald-300">
                    <span>Key Safe Height (Y):</span>
                    <span id="val-ksy">${window.CarGuard.calib.keySafeY.toFixed(2)}</span>
                </div>
                <input type="range" min="0.40" max="0.80" step="0.01" value="${window.CarGuard.calib.keySafeY}" oninput="updateCalib('keySafeY', this.value, 'val-ksy')" class="w-full accent-emerald-400">
            </div>
            <div>
                <div class="flex justify-between text-[10px] text-emerald-300">
                    <span>Key Safe Depth Front/Back (Z):</span>
                    <span id="val-ksz">${window.CarGuard.calib.keySafeZ.toFixed(2)}</span>
                </div>
                <input type="range" min="-0.10" max="0.45" step="0.01" value="${window.CarGuard.calib.keySafeZ}" oninput="updateCalib('keySafeZ', this.value, 'val-ksz')" class="w-full accent-emerald-400">
            </div>
            <div class="border-t border-slate-800 pt-1.5">
                <div class="flex justify-between text-[10px] text-slate-300">
                    <span>B-Pillar Width (X):</span>
                    <span id="val-bx">${window.CarGuard.calib.bPillarX.toFixed(2)}</span>
                </div>
                <input type="range" min="0.50" max="0.95" step="0.02" value="${window.CarGuard.calib.bPillarX}" oninput="updateCalib('bPillarX', this.value, 'val-bx')" class="w-full accent-cyan-400">
            </div>
            <div>
                <div class="flex justify-between text-[10px] text-slate-300">
                    <span>B-Pillar Height (Y):</span>
                    <span id="val-by">${window.CarGuard.calib.bPillarY.toFixed(2)}</span>
                </div>
                <input type="range" min="0.65" max="0.95" step="0.01" value="${window.CarGuard.calib.bPillarY}" oninput="updateCalib('bPillarY', this.value, 'val-by')" class="w-full accent-cyan-400">
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);
}

window.updateCalib = function (key, val, labelId) {
    const num = parseFloat(val);
    window.CarGuard.calib[key] = num;
    const lbl = document.getElementById(labelId);
    if (lbl) lbl.innerText = num.toFixed(2);
    try {
        localStorage.setItem('carguard_calib_v3', JSON.stringify(window.CarGuard.calib));
    } catch (e) {}
    rebuildCalibrationRig();
};

window.flipCarOrientation = function () {
    window.CarGuard.calib.carRotY = (window.CarGuard.calib.carRotY + Math.PI) % (Math.PI * 2);
    try {
        localStorage.setItem('carguard_calib_v3', JSON.stringify(window.CarGuard.calib));
    } catch (e) {}
    applyCarTransformAndRebuild();
    logTelegram('[CALIBRATION] Flipped 3D Car 180°.');
};