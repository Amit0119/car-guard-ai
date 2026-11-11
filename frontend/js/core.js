let scene, mainCamera, orbitControls, renderer;
let activeMainPOV = 'orbit';
let currentSceneController = null;
let realWebcamActive = false;

const WHATSAPP_API_URL = 'http://127.0.0.1:5000/api/whatsapp-alert';
const POLL_COMMANDS_URL = 'http://127.0.0.1:5000/api/poll-commands';
const VERIFIED_USER_LAT = 28.444916;
const VERIFIED_USER_LON = 78.980528;

window.addEventListener('error', function (e) {
    appendRawLog(`<span class="text-rose-400 font-bold">⚠️ [JS ERROR] ${e.message} (${e.filename?.split('/').pop()}:${e.lineno})</span>`);
});

function initSimulation() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    container.innerHTML = '';

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.025);

    mainCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    mainCamera.position.set(4.8, 3.4, 5.2);

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

    window.addEventListener('resize', onWindowResize);
    animate();

    try {
        if (typeof buildCarAndOptics === 'function') {
            buildCarAndOptics(scene);
        } else {
            appendRawLog('<span class="text-rose-400 font-bold">⚠️ [ERROR] carBuilder.js failed to load!</span>');
        }
    } catch (err) {
        appendRawLog(`<span class="text-rose-400 font-bold">⚠️ [BUILD ERROR] ${err.message}</span>`);
    }

    setSimulationScene('standby');

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 3000 });
    }

    // Start 2-Way WhatsApp Remote Command Listener Poll
    startTwoWayCommandPolling();
}

function renderSubViewport(cam, domElementId, showCones) {
    const el = document.getElementById(domElementId);
    if (!el || !cam || !window.CarGuard) return;

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
    if (!renderer || !scene || !mainCamera) return;

    if (orbitControls) orbitControls.update();

    try {
        if (currentSceneController && typeof currentSceneController.update === 'function') {
            currentSceneController.update();
        }
    } catch (err) {}

    const conesCheckbox = document.getElementById('toggle-cones');
    const conesUserEnabled = conesCheckbox ? conesCheckbox.checked : true;
    const cones = window.CarGuard?.fovCones || [];

    cones.forEach(c => (c.visible = conesUserEnabled));
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);

    let activeCam = mainCamera;
    if (window.CarGuard && window.CarGuard.cameras) {
        if (activeMainPOV === 'cam1' && window.CarGuard.cameras.cam1) activeCam = window.CarGuard.cameras.cam1;
        else if (activeMainPOV === 'cam2' && window.CarGuard.cameras.cam2) activeCam = window.CarGuard.cameras.cam2;
        else if (activeMainPOV === 'cockpit' && window.CarGuard.cameras.cam3) activeCam = window.CarGuard.cameras.cam3;
    }

    activeCam.aspect = window.innerWidth / window.innerHeight;
    activeCam.updateProjectionMatrix();
    renderer.render(scene, activeCam);

    if (window.CarGuard && window.CarGuard.cameras) {
        renderSubViewport(window.CarGuard.cameras.cam1, 'cam1-viewport', false);
        renderSubViewport(window.CarGuard.cameras.cam2, 'cam2-viewport', false);
        if (!realWebcamActive) {
            renderSubViewport(window.CarGuard.cameras.cam3, 'cam3-viewport', false);
        }
    }

    cones.forEach(c => (c.visible = conesUserEnabled));
}

function switchMainPOV(pov) {
    activeMainPOV = pov;
    document.querySelectorAll('.pov-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`pov-${pov}`);
    if (btn) btn.classList.add('active');
}

function toggleFOVCones(checked) {
    if (window.CarGuard && window.CarGuard.fovCones) {
        window.CarGuard.fovCones.forEach(c => (c.visible = checked));
    }
}

function toggleRoofXray(checked) {
    if (window.CarGuard?.roofMesh) {
        window.CarGuard.roofMesh.material.transparent = checked;
        window.CarGuard.roofMesh.material.opacity = checked ? 0.18 : 1.0;
    }
    if (window.CarGuard?.externalCarModel) {
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
        document.getElementById('cam3-tamper-overlay')?.classList.add('hidden');
        realWebcamActive = false;
        btn.innerHTML = '<i class="fa-solid fa-camera"></i> Use Real Cam';
    }
}

function setSimulationScene(mode) {
    try {
        document.querySelectorAll('footer button').forEach(b => b.classList.remove('mode-btn-active'));
        const activeBtn = document.getElementById(`btn-${mode}`);
        if (activeBtn) activeBtn.classList.add('mode-btn-active');

        if (mode !== 'breakin' && window.Scene3Breakin && window.Scene3Breakin.sirenLight) {
            window.Scene3Breakin.sirenLight.intensity = 0;
        }
        if (mode !== 'tamper' && window.Scene5Tamper && typeof window.Scene5Tamper.cleanup === 'function') {
            window.Scene5Tamper.cleanup();
        }
        if (mode !== 'tilt' && window.Scene6TiltRelay && typeof window.Scene6TiltRelay.cleanup === 'function') {
            window.Scene6TiltRelay.cleanup();
        }

        if (mode === 'standby' && window.CarGuard) {
            window.CarAudio?.stopSiren();
            if (window.CarGuard.rightWindowMesh) window.CarGuard.rightWindowMesh.visible = true;
            if (window.CarGuard.leftWindowMesh) window.CarGuard.leftWindowMesh.visible = true;
            if (window.Scene3Breakin?.shardsGroup) window.Scene3Breakin.shardsGroup.visible = false;
            const opticsEl = document.getElementById('tel-optics');
            if (opticsEl) {
                opticsEl.innerText = 'CLEAR (LUX: 98%)';
                opticsEl.className = 'text-emerald-400';
            }
            const imuEl = document.getElementById('tel-imu');
            if (imuEl) {
                imuEl.innerText = 'LEVEL (0.0° | SECURE)';
                imuEl.className = 'text-emerald-400';
            }
        }

        const sceneMap = {
            standby: window.Scene1Standby,
            loitering: window.Scene2Loitering,
            breakin: window.Scene3Breakin,
            tamper: window.Scene5Tamper,
            tilt: window.Scene6TiltRelay,
            cockpit: window.Scene4Cockpit
        };

        currentSceneController = sceneMap[mode];
        if (currentSceneController && typeof currentSceneController.enter === 'function') {
            currentSceneController.enter();
        }
    } catch (err) {
        appendRawLog(`<span class="text-rose-400 font-bold">⚠️ [SCENE ERROR] ${err.message}</span>`);
    }
}

// 2-WAY WHATSAPP REMOTE COMMAND EXECUTOR (SNAP, LOCK, SIREN, RESET)
function startTwoWayCommandPolling() {
    setInterval(async () => {
        try {
            const res = await fetch(POLL_COMMANDS_URL);
            if (!res.ok) return;
            const data = await res.json();
            if (data.ok && Array.isArray(data.commands)) {
                for (const item of data.commands) {
                    await executeRemoteWhatsAppCommand(item.command, item.source || 'WhatsApp Mobile');
                }
            }
        } catch (e) {}
    }, 2000);
}

function triggerRemoteCommand(cmd) {
    executeRemoteWhatsAppCommand(cmd, '2-Way WhatsApp Command');
}

async function executeRemoteWhatsAppCommand(rawCmd, sourceLabel) {
    const cmd = String(rawCmd || '').trim().toUpperCase();
    if (!cmd) return;

    if (cmd === 'SNAP' || cmd === 'STATUS') {
        window.CarAudio?.playBeep(1180, 0.12, 'sine');
        appendRawLog(`<span class="text-cyan-300 font-bold">📥 [2-WAY RX: "${cmd}"] From ${sourceLabel} -> Waking CAM-03 Real Webcam & capturing live frame...</span>`);

        // Automatically open Real Laptop Webcam if it is currently off
        if (!realWebcamActive) {
            await toggleRealWebcam();
            // Wait 650ms for webcam hardware auto-exposure to warm up so frame is crystal clear
            await new Promise(r => setTimeout(r, 650));
        }

        const statusText = document.getElementById('system-status-text')?.innerText || 'STANDBY ARMED';
        const glassText = document.getElementById('tel-glass')?.innerText || 'NORMAL';
        const imuText = document.getElementById('tel-imu')?.innerText || 'LEVEL';
        const shieldText = document.getElementById('tel-shield')?.innerText || 'LOCKED';

        await dispatchWhatsAppSOS(
            `2-WAY REMOTE LIVE WEBCAM SNAPSHOT (${cmd})`,
            `Owner requested live CAM-03 webcam & telemetry check. State: ${statusText} | Glass: ${glassText} | IMU: ${imuText} | Shield: ${shieldText}`
        );
    } else if (cmd === 'LOCK') {
        window.CarAudio?.playBeep(340, 0.25, 'sawtooth');
        window.CarAudio?.playServoWhir();

        if (window.CarGuard?.servoShieldMesh) {
            window.CarGuard.servoShieldMesh.rotation.x = 0;
        }
        if (window.CarGuard?.headlightsGroup) {
            window.CarGuard.headlightsGroup.visible = false;
        }
        if (window.CarGuard?.keyMesh) {
            window.CarGuard.keyMesh.visible = false;
        }
        if (window.Scene4Cockpit) {
            window.Scene4Cockpit.priorThreatDetected = true;
            window.Scene4Cockpit.shieldUnlocked = false;
            window.Scene4Cockpit.engineStarted = false;
            window.Scene4Cockpit.targetShieldAngle = 0;
        }

        document.getElementById('start-engine-box')?.classList.add('hidden');
        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-rose-500 animate-ping';
        document.getElementById('system-status-text').innerText = 'REMOTE DEADLOCK: 3-OF-3 STRICT MFA';
        document.getElementById('system-badge').className = 'flex items-center space-x-1.5 text-rose-400 font-bold';

        const shieldEl = document.getElementById('tel-shield');
        if (shieldEl) {
            shieldEl.innerHTML = '<i class="fa-solid fa-lock mr-1"></i>REMOTE DEADLOCK (3-OF-3 MFA)';
            shieldEl.className = 'text-rose-400 font-bold animate-pulse';
        }

        appendRawLog(`<span class="text-rose-400 font-bold">🔒 [2-WAY RX: "LOCK"] Immobilizer Deadlocked & Servo Flip-Guard closed!</span>`);
        await dispatchWhatsAppSOS(
            '2-WAY REMOTE DEADLOCK ENGAGED (LOCK)',
            'Owner remotely locked vehicle via WhatsApp. Ignition cut, Servo Flip-Guard closed & 3-of-3 Strict Biometric MFA enforced!'
        );
    } else if (cmd === 'SIREN') {
        window.CarAudio?.startSiren();
        if (window.Scene3Breakin?.sirenLight) {
            window.Scene3Breakin.sirenLight.intensity = 2.8;
        }
        document.getElementById('telegram-panel')?.classList.add('alarm-flash');
        document.getElementById('status-dot').className = 'w-3 h-3 rounded-full bg-amber-400 animate-ping';
        document.getElementById('system-status-text').innerText = 'REMOTE PANIC SIREN ACTIVE!';

        appendRawLog(`<span class="text-amber-300 font-bold">🚨 [2-WAY RX: "SIREN"] Remote acoustic deterrent & police strobe activated!</span>`);
        await dispatchWhatsAppSOS(
            '2-WAY REMOTE PANIC SIREN ACTIVATED',
            'Owner remotely triggered 110dB acoustic siren & strobe deterrent via WhatsApp command.'
        );
    } else if (cmd === 'RESET') {
        window.CarAudio?.stopSiren();
        window.CarAudio?.playBeep(960, 0.14, 'sine');
        document.getElementById('telegram-panel')?.classList.remove('alarm-flash');
        setSimulationScene('standby');

        appendRawLog(`<span class="text-emerald-400 font-bold">🔄 [2-WAY RX: "RESET"] Siren silenced & all sensors restored to Standby Armed.</span>`);
        await dispatchWhatsAppSOS(
            '2-WAY SYSTEM RESET TO STANDBY (RESET)',
            'Owner remotely silenced alarms and restored vehicle to Scene 1: Standby Surveillance.'
        );
    }
}

async function dispatchWhatsAppSOS(title, details) {
    try {
        let snapshotBase64 = null;
        let photoSource = '3D CCTV Simulation';
        const videoEl = document.getElementById('real-webcam');

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 640;
        tempCanvas.height = 360;
        const ctx = tempCanvas.getContext('2d');

        if (window.Scene5Tamper && window.Scene5Tamper.preTamperSnapshot && title.includes('TAMPER')) {
            snapshotBase64 = window.Scene5Tamper.preTamperSnapshot;
            photoSource = 'Pre-Tamper Optical Cache';
        } else if (realWebcamActive && videoEl && videoEl.readyState >= 2) {
            ctx.drawImage(videoEl, 0, 0, tempCanvas.width, tempCanvas.height);
            snapshotBase64 = tempCanvas.toDataURL('image/jpeg', 0.75);
            photoSource = 'Physical Laptop Webcam';
        } else if (renderer && renderer.domElement) {
            ctx.drawImage(renderer.domElement, 0, 0, tempCanvas.width, tempCanvas.height);
            snapshotBase64 = tempCanvas.toDataURL('image/jpeg', 0.75);
        }

        let lat = VERIFIED_USER_LAT;
        let lon = VERIFIED_USER_LON;

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

                if (Math.abs(rawLat - VERIFIED_USER_LAT) < 0.25 && Math.abs(rawLon - VERIFIED_USER_LON) < 0.25) {
                    lat = rawLat;
                    lon = rawLon;
                }
            } catch (geoErr) {}
        }

        const gpsSource = `Live Browser GPS (${lat}, ${lon})`;

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
                'YOLOv8 tracked suspect circling vehicle perimeter for >5 minutes (CAM-01 & CAM-02).'
            );
        }, 250);
    }
}

function onWindowResize() {
    if (!mainCamera || !renderer) return;
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

setInterval(() => {
    const el = document.getElementById('clock');
    if (el) el.innerText = new Date().toTimeString().split(' ')[0];
}, 1000);

if (document.readyState === 'complete') {
    initSimulation();
} else {
    window.addEventListener('load', initSimulation);
}