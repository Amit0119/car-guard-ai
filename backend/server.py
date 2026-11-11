import base64
import threading
import time
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from telegram_bot import (
    send_whatsapp_alert,
    poll_whatsapp_incoming_command,
    configure_greenapi_webhooks
)
from ear_liveness import process_liveness_frame, enroll_owner_face, reset_liveness_session

app = Flask(__name__)
CORS(app)

# Stores the last clear webcam frame before a cloth/hand covers the camera
LAST_CLEAR_FRAME = None
TAMPER_STREAK = 0

# Queue of 2-Way WhatsApp Remote Commands waiting for the 3D frontend to execute
COMMAND_QUEUE = []
QUEUE_LOCK = threading.Lock()
POLL_THREAD_STARTED = False


def background_whatsapp_listener():
    """Continuously checks Green-API for incoming WhatsApp commands from the owner's phone."""
    configure_greenapi_webhooks()
    while True:
        cmd = poll_whatsapp_incoming_command()
        if cmd:
            with QUEUE_LOCK:
                COMMAND_QUEUE.append({
                    "command": cmd,
                    "source": "WhatsApp Mobile Chat"
                })
        time.sleep(2.8)


def ensure_listener_started():
    global POLL_THREAD_STARTED
    if not POLL_THREAD_STARTED:
        POLL_THREAD_STARTED = True
        t = threading.Thread(target=background_whatsapp_listener, daemon=True)
        t.start()


def analyze_optical_tamper(image_base64):
    """Detects if a cloth, hand, or tape is covering the camera lens using pixel brightness & variance."""
    global LAST_CLEAR_FRAME, TAMPER_STREAK
    try:
        raw = image_base64.split(",")[1] if "," in image_base64 else image_base64
        np_arr = np.frombuffer(base64.b64decode(raw), np.uint8)
        bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if bgr is None:
            return False, 0.0, 0.0

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        mean_lux = float(np.mean(gray))
        pixel_std = float(np.std(gray))
        edge_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        is_occluded = (mean_lux < 34.0) or (pixel_std < 18.0 and edge_var < 14.0)

        if is_occluded:
            TAMPER_STREAK += 1
        else:
            TAMPER_STREAK = 0
            LAST_CLEAR_FRAME = image_base64

        return (TAMPER_STREAK >= 3), round(mean_lux, 1), round(pixel_std, 1)
    except Exception:
        return False, 100.0, 45.0


@app.route("/", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    ensure_listener_started()
    return jsonify({
        "status": "online",
        "service": "Car-Guard-AI Telemetry, Biometric & 2-Way WhatsApp Command Server"
    })


@app.route("/api/whatsapp-alert", methods=["POST"])
def trigger_alert():
    ensure_listener_started()
    data = request.get_json(force=True) or {}
    event_title = data.get("title", "SECURITY BREACH DETECTED")
    details = data.get("details", "Suspicious activity detected around vehicle perimeter.")
    image_base64 = data.get("image", None)
    lat = data.get("lat", 28.444916)
    lon = data.get("lon", 78.980528)

    thread = threading.Thread(
        target=send_whatsapp_alert,
        args=(event_title, details, image_base64, lat, lon),
        daemon=True
    )
    thread.start()

    return jsonify({
        "ok": True,
        "message": "WhatsApp Cloud SOS, Snapshot & GPS telemetry dispatched."
    })


@app.route("/api/poll-commands", methods=["GET"])
def get_pending_commands():
    """Frontend polls this endpoint every 2s to execute any queued 2-Way WhatsApp commands."""
    ensure_listener_started()
    with QUEUE_LOCK:
        items = list(COMMAND_QUEUE)
        COMMAND_QUEUE.clear()
    return jsonify({"ok": True, "commands": items})


@app.route("/api/remote-command", methods=["POST"])
def trigger_remote_command():
    """Allows triggering a 2-Way WhatsApp Command from the HUD or an external webhook."""
    ensure_listener_started()
    data = request.get_json(force=True) or {}
    cmd = str(data.get("command", "")).strip().upper()
    source = data.get("source", "2-Way WhatsApp Cloud")
    if not cmd:
        return jsonify({"ok": False, "error": "No command specified"}), 400

    with QUEUE_LOCK:
        COMMAND_QUEUE.append({"command": cmd, "source": source})

    return jsonify({"ok": True, "command": cmd})


@app.route("/api/liveness-check", methods=["POST"])
def liveness_check():
    data = request.get_json(force=True) or {}
    image_base64 = data.get("image", None)
    if not image_base64:
        return jsonify({"ok": False, "error": "No video frame provided"}), 400

    is_tampered, mean_lux, pixel_std = analyze_optical_tamper(image_base64)
    result = process_liveness_frame(image_base64)

    result["camera_tampered"] = is_tampered
    result["mean_lux"] = mean_lux
    result["pixel_std"] = pixel_std
    result["pre_tamper_frame"] = LAST_CLEAR_FRAME or image_base64

    if is_tampered:
        result["status_text"] = f"OPTICAL TAMPER! Lens covered (Lux: {mean_lux} | Var: {pixel_std})"

    return jsonify(result)


@app.route("/api/enroll-owner", methods=["POST"])
def enroll_owner():
    data = request.get_json(force=True) or {}
    image_base64 = data.get("image", None)
    auth_pin = data.get("pin", "")
    if not image_base64:
        return jsonify({"ok": False, "message": "No video frame provided"}), 400

    result = enroll_owner_face(image_base64, auth_pin=auth_pin)
    return jsonify(result)


@app.route("/api/reset-liveness", methods=["POST"])
def reset_liveness():
    global TAMPER_STREAK
    TAMPER_STREAK = 0
    reset_liveness_session()
    return jsonify({"ok": True})


if __name__ == "__main__":
    ensure_listener_started()
    print("CAR-GUARD-AI Telemetry, Biometric & 2-Way WhatsApp Server running on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False)