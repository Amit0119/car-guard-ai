import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from telegram_bot import send_whatsapp_alert

app = Flask(__name__)
CORS(app)


@app.route("/", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "service": "Car-Guard-AI WhatsApp Engine (Instance 710722796073)",
        "endpoint": "/api/whatsapp-alert"
    })


@app.route("/api/whatsapp-alert", methods=["POST"])
def trigger_alert():
    data = request.get_json(force=True) or {}
    event_title = data.get("title", "SECURITY BREACH DETECTED")
    details = data.get("details", "Suspicious activity around vehicle.")
    image_base64 = data.get("image", None)

    # Receive live browser GPS coordinates from core.js
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


if __name__ == "__main__":
    print("🚀 CAR-GUARD-AI Backend Server running on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)