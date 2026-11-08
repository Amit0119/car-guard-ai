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
    fovCones: [],
    cameras: {
        cam1: null, // Left B-Pillar -> Right Front Door Window
        cam2: null, // Right B-Pillar -> Left Front Door Window
        cam3: null  // Cockpit POV -> Real Steering Wheel + Center Console Key Safe & Fingerprint
    },
    thiefGroup: null,
    carDimensions: { width: 1.85, height: 1.55, length: 4.6 },
    // Calibration defaults tuned for the Porsche Cayenne car.glb interior
    calib: {
        carRotY: Math.PI,     // 180 deg default
        bPillarX: 0.74,       // Outer Left/Right B-Pillar width
        bPillarY: 0.82,       // Upper B-Pillar height
        bPillarZ: -0.05,      // B-Pillar Z position
        keySafeX: -0.08,      // Center console beside real steering wheel (unobstructed!)
        keySafeY: 0.58,       // Dashboard center console height ratio
        keySafeZ: 0.16        // Pulled back flush with front console face (in front of dash, not behind steering!)
    }
};

// Load saved calibration from localStorage if available
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

            // Hide procedural fallback body (and fake steering) once real car.glb loads
            if (window.CarGuard.fallbackBodyGroup) {
                window.CarGuard.fallbackBodyGroup.visible = false;
            }

            const wrapper = new THREE.Group();
            wrapper.add(rawCar);
            window.CarGuard.externalCarModel = rawCar;
            window.CarGuard.externalCarWrapper = wrapper;
            carGroup.add(wrapper);

            applyCarTransformAndRebuild();

            // Make all glass/window meshes transparent so interior cameras see outside cleanly
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

            logTelegram('[COCKPIT FIXED] Fake blue steering ring removed. Key Safe mounted on Center Console beside real steering.');
        },
        undefined,
        function () {
            console.log('Using fallback procedural SUV.');
        }
    );

    // 3. Create 3D Suspect Model Outside Front Right Door
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
        color: 0x38bdf8, transparent: true, opacity: 0.14, roughness: 0.1
    });
    const rightWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.85, H * 0.25), glassMat);
    rightWindow.position.set(hw * 0.86, windowCenterY, frontWindowZ);
    rightWindow.rotation.y = Math.PI / 2;
    window.CarGuard.rightWindowMesh = rightWindow;
    rigGroup.add(rightWindow);

    // Realistic Cabin & Dashboard Spot Lighting (So Porsche Steering & Pod look sharp)
    const cabinLight = new THREE.PointLight(0xffffff, 2.4, 5.5);
    cabinLight.position.set(0, H * 0.85, 0.10);
    rigGroup.add(cabinLight);

    const podLight = new THREE.PointLight(0x38bdf8, 1.8, 1.8);
    podLight.position.set(keySafeX, keySafeY + 0.15, keySafeZ - 0.20);
    rigGroup.add(podLight);

    // --- OEM SUPERCAR IGNITION POD (SLEEK FLUSH MOUNT + FIGHTER-JET FLIP COVER) ---
    const ignitionModuleGroup = new THREE.Group();
    ignitionModuleGroup.position.set(keySafeX, keySafeY, keySafeZ);
    ignitionModuleGroup.rotation.x = -0.22; // Flush with dashboard slope
    window.CarGuard.ignitionModuleGroup = ignitionModuleGroup;
    rigGroup.add(ignitionModuleGroup);

    // 1. Sleek Rounded-Look Carbon Backing Plate (Compact 9cm x 5.5cm, 8mm thin)
    const backingPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, 0.056, 0.008),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.2 })
    );
    ignitionModuleGroup.add(backingPlate);

    // 2. Keyhole Outer LED Halo Bezel (Left side of pod: X = -0.018)
    const haloRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.019, 0.0022, 16, 32),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    haloRing.position.set(-0.018, 0, -0.006);
    ignitionModuleGroup.add(haloRing);

    // 3. Brushed Silver Keyhole Cylinder & Black Key Slot Inside
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

    // 4. FIGHTER-JET HINGED FLIP-UP ARMOR COVER (Pivots from top hinge at Y = +0.020)
    const flipCoverPivot = new THREE.Group();
    flipCoverPivot.position.set(-0.018, 0.020, -0.008); // Top Hinge Point
    window.CarGuard.servoShieldMesh = flipCoverPivot; // Scene 4 will rotate .rotation.x to flip it open!
    ignitionModuleGroup.add(flipCoverPivot);

    // Red Anodized Aluminum Flip Cap (hangs down from hinge to cover keyhole)
    const flipCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.021, 0.021, 0.008, 6), // Hexagonal supercar style cap
        new THREE.MeshStandardMaterial({ color: 0xe11d48, metalness: 0.75, roughness: 0.2 })
    );
    flipCap.rotation.x = Math.PI / 2;
    flipCap.position.set(0, -0.020, -0.004);
    flipCoverPivot.add(flipCap);

    // 5. Sleek Circular Capacitive Fingerprint Sensor (Right side of pod: X = +0.024)
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

    // CAM-03 Physical Sensor on Top Dashboard
    const driverHeadTarget = new THREE.Vector3(0.26, bPillarCamY - 0.04, -0.05);
    const cam3Mesh = createCameraMesh(0x38bdf8);
    cam3Mesh.position.set(0.22, keySafeY + 0.20, keySafeZ + 0.12);
    cam3Mesh.lookAt(driverHeadTarget);
    rigGroup.add(cam3Mesh);

    // Cockpit POV Camera: Wide natural driver view showing Steering Wheel + Dashboard + Sleek Ignition Pod
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

function createSuspectModel(scene) {
    const thief = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 1.15, 16), mat);
    body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), mat);
    head.position.y = 1.55;

    const bbox = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.75, 1.85, 0.75)),
        new THREE.LineBasicMaterial({ color: 0xff0044 })
    );
    bbox.position.y = 0.95;

    thief.add(body, head, bbox);
    thief.position.set(1.95, 0, 0.40);
    thief.visible = false;
    window.CarGuard.thiefGroup = thief;
    scene.add(thief);
}

// Live Calibration Panel with Sliders for both B-Pillar Cameras AND Key Safe Position!
function injectCalibrationUI() {
    if (document.getElementById('calib-widget')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'calib-widget';
    wrapper.className = 'fixed bottom-16 right-4 z-30 pointer-events-auto mono text-xs';
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