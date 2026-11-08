let scene, mainCamera, orbitControls, renderer;
let activeMainPOV = 'orbit';
let currentSceneController = null;
let realWebcamActive = false;

function initSimulation() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.025);

    mainCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    mainCamera.position.set(4.8, 3.4, 5.2);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    orbitControls = new THREE.OrbitControls(mainCamera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.06;
    orbitControls.target.set(0, 1.0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    keyLight.position.set(8, 14, 10);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x10b981, 1.1, 25);
    rimLight.position.set(-6, 5, -6);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(40, 40, 0x0284c7, 0x1e293b);
    scene.add(grid);

    buildCarAndOptics(scene);

    // Start in Scene 1: Standby Surveillance
    setSimulationScene('standby');

    window.addEventListener('resize', onWindowResize);
    animate();
}

function renderSubViewport(cam, domElementId, showCones) {
    const el = document.getElementById(domElementId);
    if (!el || !cam) return;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const width = rect.width;
    const height = rect.height;
    const left = rect.left;
    const bottom = window.innerHeight - rect.bottom;

    window.CarGuard.fovCones.forEach(c => (c.visible = showCones));

    cam.aspect = width / height;
    cam.updateProjectionMatrix();

    renderer.setViewport(left, bottom, width, height);
    renderer.setScissor(left, bottom, width, height);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(scene, cam);
}

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();

    // Run 60FPS update logic of whichever scene (1, 2, 3, or 4) is currently active
    if (currentSceneController && typeof currentSceneController.update === 'function') {
        currentSceneController.update();
    }

    const conesCheckbox = document.getElementById('toggle-cones');
    const conesUserEnabled = conesCheckbox ? conesCheckbox.checked : true;

    // PASS 1: Main Full-Screen View
    window.CarGuard.fovCones.forEach(c => (c.visible = conesUserEnabled));
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);

    let activeCam = mainCamera;
    if (activeMainPOV === 'cam1') activeCam = window.CarGuard.cameras.cam1;
    else if (activeMainPOV === 'cam2') activeCam = window.CarGuard.cameras.cam2;
    else if (activeMainPOV === 'cockpit') activeCam = window.CarGuard.cameras.cam3;

    activeCam.aspect = window.innerWidth / window.innerHeight;
    activeCam.updateProjectionMatrix();
    renderer.render(scene, activeCam);

    // PASS 2: Left Panel Live 3D CCTV Feeds
    renderSubViewport(window.CarGuard.cameras.cam1, 'cam1-viewport', false);
    renderSubViewport(window.CarGuard.cameras.cam2, 'cam2-viewport', false);
    if (!realWebcamActive) {
        renderSubViewport(window.CarGuard.cameras.cam3, 'cam3-viewport', false);
    }

    window.CarGuard.fovCones.forEach(c => (c.visible = conesUserEnabled));
}

function switchMainPOV(pov) {
    activeMainPOV = pov;
    document.querySelectorAll('.pov-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`pov-${pov}`);
    if (btn) btn.classList.add('active');
}

function toggleFOVCones(checked) {
    window.CarGuard.fovCones.forEach(c => (c.visible = checked));
}

function toggleRoofXray(checked) {
    if (window.CarGuard.roofMesh) {
        window.CarGuard.roofMesh.material.transparent = checked;
        window.CarGuard.roofMesh.material.opacity = checked ? 0.18 : 1.0;
    }
    if (window.CarGuard.externalCarModel) {
        window.CarGuard.externalCarModel.traverse(function (child) {
            if (child.isMesh && child.material) {
                const matName = (child.material.name || '').toLowerCase();
                const meshName = (child.name || '').toLowerCase();
                const isGlass =
                    matName.includes('glass') ||
                    matName.includes('window') ||
                    matName.includes('windshield') ||
                    meshName.includes('glass') ||
                    meshName.includes('window');

                if (isGlass) {
                    child.material.transparent = true;
                    child.material.opacity = 0.22;
                } else {
                    child.material.transparent = checked;
                    child.material.opacity = checked ? 0.22 : 1.0;
                }
            }
        });
    }
}

async function toggleRealWebcam() {
    const videoEl = document.getElementById('real-webcam');
    const btn = document.getElementById('webcam-btn');
    if (!realWebcamActive) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoEl.srcObject = stream;
            videoEl.classList.remove('hidden');
            realWebcamActive = true;
            btn.innerHTML = '<i class="fa-solid fa-cube"></i> 3D Cam';
            logTelegram('[CAM-03] Connected to real laptop webcam for live EAR blink tracking.');
        } catch (err) {
            alert('Webcam permission denied or unavailable.');
        }
    } else {
        if (videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(t => t.stop());
        }
        videoEl.classList.add('hidden');
        realWebcamActive = false;
        btn.innerHTML = '<i class="fa-solid fa-camera"></i> Use Real Cam';
    }
}

function setSimulationScene(mode) {
    document.querySelectorAll('footer button').forEach(b => b.classList.remove('mode-btn-active'));
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) activeBtn.classList.add('mode-btn-active');

    const sceneMap = {
        standby: window.Scene1Standby,
        loitering: window.Scene2Loitering,
        breakin: window.Scene3Breakin,
        cockpit: window.Scene4Cockpit
    };

    currentSceneController = sceneMap[mode];
    if (currentSceneController && typeof currentSceneController.enter === 'function') {
        currentSceneController.enter();
    }
}

function logTelegram(msg) {
    const box = document.getElementById('telegram-log');
    if (!box) return;
    const div = document.createElement('div');
    const time = new Date().toTimeString().split(' ')[0];
    div.innerHTML = `<span class="text-slate-500">[${time}]</span> ${msg}`;
    box.prepend(div);
}

function onWindowResize() {
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

setInterval(() => {
    const el = document.getElementById('clock');
    if (el) el.innerText = new Date().toTimeString().split(' ')[0];
}, 1000);

window.onload = initSimulation;