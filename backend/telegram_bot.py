import base64
import requests

# --- GREEN-API CONFIGURATION ---
API_HOST = "https://7107.api.greenapi.com"
ID_INSTANCE = "710722796073"
API_TOKEN_INSTANCE = "29922773f8064aff8df339230ca8a0fa4584cfe8165642acb9"
OWNER_WHATSAPP = "919258121879"

DEFAULT_LAT = 28.3670
DEFAULT_LON = 79.4304


def send_whatsapp_alert(event_title, details, image_base64=None, lat=DEFAULT_LAT, lon=DEFAULT_LON):
    chat_id = f"{OWNER_WHATSAPP}@c.us"
    maps_url = f"https://www.google.com/maps?q={lat},{lon}"

    caption = (
        f"🚨 *CAR-GUARD-AI SECURITY ALERT* 🚨\n\n"
        f"📌 *Event:* {event_title}\n"
        f"🛡️ *Telemetry:* {details}\n"
        f"📍 *Live GPS Location:* {maps_url}\n\n"
        f"_Automated Zero-Trust Vehicle Defense System_"
    )

    try:
        if image_base64:
            if "," in image_base64:
                image_base64 = image_base64.split(",")[1]

            img_bytes = base64.b64decode(image_base64)
            url = f"{API_HOST}/waInstance{ID_INSTANCE}/sendFileByUpload/{API_TOKEN_INSTANCE}"

            files = {
                "file": ("carguard_evidence.jpg", img_bytes, "image/jpeg")
            }
            data = {
                "chatId": chat_id,
                "caption": caption
            }

            response = requests.post(url, data=data, files=files, timeout=15)
            print(f"[WHATSAPP PHOTO SENT] GPS: ({lat}, {lon}) | Status: {response.status_code}")
            return response.ok
        else:
            url = f"{API_HOST}/waInstance{ID_INSTANCE}/sendMessage/{API_TOKEN_INSTANCE}"
            payload = {
                "chatId": chat_id,
                "message": caption
            }
            response = requests.post(url, json=payload, timeout=10)
            print(f"[WHATSAPP TEXT SENT] GPS: ({lat}, {lon}) | Status: {response.status_code}")
            return response.ok

    except Exception as e:
        print(f"[WHATSAPP ERROR] Alert failed: {e}")
        return False