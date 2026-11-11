import base64
import threading
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from telegram_bot import send_whatsapp_alert
from ear_liveness import process_liveness_frame, enroll_owner_face, reset_liveness_session

app = Flask(__name__)
CORS(app)

# Stores the last clear webcam frame before a cloth/hand covers the camera
LAST_CLEAR_FRAME = None
TAMPER_STREAK = 0


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

        # Covered lens = very dark (mean_lux < 34) OR flat featureless cloth/palm blur (pixel_std < 18 and edge_var < 14)
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
    return jsonify({
        "status": "online",
        "service": "Car-Guard-AI Telemetry & Biometric Security Server"
    })


@app.route("/api/whatsapp-alert", methods=["POST"])
def trigger_alert():
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
    print("CAR-GUARD-AI Telemetry & Biometric Server running on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)