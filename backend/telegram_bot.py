import base64
import cv2
import numpy as np
import requests

# --- GREEN-API CONFIGURATION ---
API_HOST = "https://7107.api.greenapi.com"
ID_INSTANCE = "710722796073"
API_TOKEN_INSTANCE = "29922773f8064aff8df339230ca8a0fa4584cfe8165642acb9"
OWNER_WHATSAPP = "919258121879"

DEFAULT_LAT = 28.444916
DEFAULT_LON = 78.980528


def compress_image_for_fast_upload(raw_bytes):
    """Downscales large 4K/1080p snapshots to 640px width (~22 KB) so upload finishes in <1s."""
    try:
        np_arr = np.frombuffer(raw_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            return raw_bytes

        h, w = img.shape[:2]
        max_w = 640
        if w > max_w:
            scale = max_w / float(w)
            img = cv2.resize(img, (max_w, int(h * scale)), interpolation=cv2.INTER_AREA)

        ok, enc = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
        if ok:
            return enc.tobytes()
    except Exception:
        pass
    return raw_bytes


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

    # 1. Try sending compressed snapshot + caption (with automatic 2-attempt retry)
    if image_base64:
        try:
            if "," in image_base64:
                image_base64 = image_base64.split(",")[1]

            raw_bytes = base64.b64decode(image_base64)
            img_bytes = compress_image_for_fast_upload(raw_bytes)
            url = f"{API_HOST}/waInstance{ID_INSTANCE}/sendFileByUpload/{API_TOKEN_INSTANCE}"

            for attempt in range(1, 3):
                try:
                    files = {
                        "file": ("carguard_evidence.jpg", img_bytes, "image/jpeg")
                    }
                    data = {
                        "chatId": chat_id,
                        "caption": caption
                    }
                    response = requests.post(url, data=data, files=files, timeout=(10, 35))
                    if response.ok:
                        kb_size = round(len(img_bytes) / 1024, 1)
                        print(f"[WHATSAPP PHOTO SENT] Size: {kb_size}KB | GPS: ({lat}, {lon}) | Status: {response.status_code}")
                        return True
                except Exception as upload_err:
                    print(f"[WHATSAPP UPLOAD RETRY {attempt}/2] {upload_err}")
        except Exception as e:
            print(f"[WHATSAPP IMAGE PREP ERROR] {e}")

    # 2. Instant Text Alert Fallback (if no image or if image upload timed out on slow network)
    try:
        url = f"{API_HOST}/waInstance{ID_INSTANCE}/sendMessage/{API_TOKEN_INSTANCE}"
        payload = {
            "chatId": chat_id,
            "message": caption
        }
        response = requests.post(url, json=payload, timeout=(10, 20))
        print(f"[WHATSAPP TEXT SENT] GPS: ({lat}, {lon}) | Status: {response.status_code}")
        return response.ok
    except Exception as e:
        print(f"[WHATSAPP ERROR] Alert failed: {e}")
        return False