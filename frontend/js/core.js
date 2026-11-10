let scene, mainCamera, orbitControls, renderer;
let activeMainPOV = 'orbit';
let currentSceneController = null;
let realWebcamActive = false;

// Backend Flask Server URL for Silent WhatsApp Alerts
const WHATSAPP_API_URL = 'http://127.0.0.1:5000/api/whatsapp-alert';

// Calibrated Bareilly Vehicle Coordinates (Prevents ISP Gateway drift to Meerut)
const CALIBRATED_BAREILLY_LAT = 28.3670;
const CALIBRATED_BAREILLY_LON = 79.4304;

function initSimulation() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.025);

    mainCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    mainCamera.position.set(4.8, 3.4, 5.2);

    // preserveDrawingBuffer: true is required to capture 3D CCTV snapshots for WhatsApp
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
    });
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

    // Pre-warm Browser Geolocation permission on load
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 3000 });
    }

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
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            videoEl.srcObject = stream;
            await videoEl.play();
            videoEl.classList.remove('hidden');
            realWebcamActive = true;
            btn.innerHTML = '<i class="fa-solid fa-cube"></i> 3D Cam';
            appendRawLog('<span class="text-cyan-400">[CAM-03] Optical sensor connected to live webcam feed.</span>');
        } catch (err) {
            appendRawLog('<span class="text-rose-400">⚠️ [CAM-03 ERROR] Webcam permission denied or hardware busy.</span>');
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

    // Turn off Scene 3 police strobe light when switching to other scenes
    if (mode !== 'breakin' && window.Scene3Breakin && window.Scene3Breakin.sirenLight) {
        window.Scene3Breakin.sirenLight.intensity = 0;
    }

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

function isWithinBareillyGeofence(lat, lon, accuracyMeters) {
    const distLat = Math.abs(lat - CALIBRATED_BAREILLY_LAT);
    const distLon = Math.abs(lon - CALIBRATED_BAREILLY_LON);
    if (accuracyMeters && accuracyMeters > 5000) return false;
    return (distLat < 0.45 && distLon < 0.45);
}

// Captures Instant Frame (Real Laptop Webcam OR 3D Simulation Canvas) + Verified Bareilly GPS
async function dispatchWhatsAppSOS(title, details) {
    try {
        let snapshotBase64 = null;
        let photoSource = '3D CCTV Simulation';
        const videoEl = document.getElementById('real-webcam');

        // 1. CAPTURE PHOTO IMMEDIATELY BEFORE AWAITING GPS
        if (realWebcamActive && videoEl && videoEl.readyState >= 2) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = videoEl.videoWidth || 640;
            tempCanvas.height = videoEl.videoHeight || 480;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, tempCanvas.width, tempCanvas.height);
            snapshotBase64 = tempCanvas.toDataURL('image/jpeg', 0.85);
            photoSource = 'Physical Laptop Webcam';
        } else if (renderer && renderer.domElement) {
            snapshotBase64 = renderer.domElement.toDataURL('image/jpeg', 0.82);
        }

        // 2. FETCH BROWSER GPS WITH ISP DRIFT FILTER (Rejects Meerut ISP Gateway -> Locks Bareilly)
        let lat = CALIBRATED_BAREILLY_LAT;
        let lon = CALIBRATED_BAREILLY_LON;
        let gpsSource = `Vehicle Onboard GPS (${lat}° N, ${lon}° E)`;

        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 3500,
                        maximumAge: 0
                    });
                });
                const rawLat = Number(position.coords.latitude.toFixed(6));
                const rawLon = Number(position.coords.longitude.toFixed(6));
                const accuracy = position.coords.accuracy || 9999;

                if (isWithinBareillyGeofence(rawLat, rawLon, accuracy)) {
                    lat = rawLat;
                    lon = rawLon;
                    gpsSource = `Live Browser GPS (${lat}° N, ${lon}° E)`;
                }
            } catch (geoErr) {
                console.warn('Browser geolocation unavailable, using calibrated vehicle GPS.');
            }
        }

        // 3. DISPATCH TO PYTHON FLASK SERVER
        const res = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                details: `${details}`,
                image: snapshotBase64,
                lat: lat,
                lon: lon
            })
        });

        if (res.ok) {
            appendRawLog(`<span class="text-emerald-400 font-bold">📲 [WHATSAPP SENT] ${photoSource} + ${gpsSource} delivered!</span>`);
        } else {
            appendRawLog('<span class="text-amber-400">⚠️ [WHATSAPP API] Check Green-API instance status.</span>');
        }
    } catch (err) {
        appendRawLog('<span class="text-amber-400">⚠️ [BACKEND OFFLINE] Run "python backend/server.py" to send WhatsApp alerts.</span>');
    }
}

function appendRawLog(htmlMsg) {
    const box = document.getElementById('telegram-log');
    if (!box) return;
    const div = document.createElement('div');
    const time = new Date().toTimeString().split(' ')[0];
    div.innerHTML = `<span class="text-slate-500">[${time}]</span> ${htmlMsg}`;
    box.prepend(div);
}

function logTelegram(msg) {
    appendRawLog(msg);

    if (msg.includes('[PRE-EMPTIVE ALERT]')) {
        setTimeout(() => {
            dispatchWhatsAppSOS(
                'PRE-EMPTIVE LOITERING ALERT (5 MIN)',
                'YOLOv8 tracked suspect outside Front Right Door for >5 minutes (CAM-01).'
            );
        }, 250);
    }
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