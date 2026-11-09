import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from telegram_bot import send_whatsapp_alert
from ear_liveness import process_liveness_frame, enroll_owner_face, reset_liveness_session

app = Flask(__name__)
CORS(app)


@app.route("/", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "service": "Car-Guard-AI Backend (WhatsApp SOS + MediaPipe Owner Face/EAR Engine)"
    })


@app.route("/api/whatsapp-alert", methods=["POST"])
def trigger_alert():
    data = request.get_json(force=True) or {}
    event_title = data.get("title", "SECURITY BREACH DETECTED")
    details = data.get("details", "Suspicious activity around vehicle.")
    image_base64 = data.get("image", None)
    lat = data.get("lat", 28.3670)
    lon = data.get("lon", 79.4304)

    thread = threading.Thread(
        target=send_whatsapp_alert,
        args=(event_title, details, image_base64, lat, lon),
        daemon=True
    )
    thread.start()

    return jsonify({
        "ok": True,
        "message": "WhatsApp SOS, Snapshot & Live GPS dispatched!"
    })


@app.route("/api/liveness-check", methods=["POST"])
def liveness_check():
    data = request.get_json(force=True) or {}
    image_base64 = data.get("image", None)
    if not image_base64:
        return jsonify({"ok": False, "error": "No webcam frame provided"}), 400

    result = process_liveness_frame(image_base64)
    return jsonify(result)


@app.route("/api/enroll-owner", methods=["POST"])
def enroll_owner():
    data = request.get_json(force=True) or {}
    image_base64 = data.get("image", None)
    if not image_base64:
        return jsonify({"ok": False, "message": "No webcam frame provided"}), 400

    result = enroll_owner_face(image_base64)
    return jsonify(result)


@app.route("/api/reset-liveness", methods=["POST"])
def reset_liveness():
    reset_liveness_session()
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("🚀 CAR-GUARD-AI Backend Server running on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)