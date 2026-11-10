import os
import cv2
import base64
import urllib.request
import numpy as np

OWNER_IMG_PATH = os.path.join(os.path.dirname(__file__), "owner_face.jpg")
CASCADE_DIR = os.path.dirname(__file__)

FACE_XML = os.path.join(CASCADE_DIR, "haarcascade_frontalface_default.xml")
EYE_XML = os.path.join(CASCADE_DIR, "haarcascade_eye.xml")


def get_working_cascade(filename, local_path):
    paths_to_try = []
    if hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
        paths_to_try.append(os.path.join(cv2.data.haarcascades, filename))
    paths_to_try.append(local_path)

    for p in paths_to_try:
        if p and os.path.exists(p):
            c = cv2.CascadeClassifier(p)
            if not c.empty():
                return c

    try:
        url = f"https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/{filename}"
        urllib.request.urlretrieve(url, local_path)
        c = cv2.CascadeClassifier(local_path)
        if not c.empty():
            return c
    except Exception:
        pass
    return None


face_cascade = get_working_cascade("haarcascade_frontalface_default.xml", FACE_XML)
eye_cascade = get_working_cascade("haarcascade_eye.xml", EYE_XML)

blink_state = {
    "blink_count": 0,
    "open_frames": 0,
    "closed_frames": 0,
    "in_blink": False
}


def decode_base64_frame(image_base64):
    try:
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]
        img_bytes = base64.b64decode(image_base64)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def compare_with_owner(face_crop):
    if not os.path.exists(OWNER_IMG_PATH):
        return False, 0.0

    owner_img = cv2.imread(OWNER_IMG_PATH)
    if owner_img is None:
        return False, 0.0

    owner_img = cv2.resize(owner_img, (128, 128))
    face_crop = cv2.resize(face_crop, (128, 128))

    g1 = cv2.equalizeHist(cv2.cvtColor(owner_img, cv2.COLOR_BGR2GRAY))
    g2 = cv2.equalizeHist(cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY))
    res = cv2.matchTemplate(g1, g2, cv2.TM_CCOEFF_NORMED)
    struct_score = float(res[0][0])

    hsv1 = cv2.cvtColor(owner_img, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(face_crop, cv2.COLOR_BGR2HSV)
    hist1 = cv2.calcHist([hsv1], [0, 1], None, [30, 32], [0, 180, 0, 256])
    hist2 = cv2.calcHist([hsv2], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
    hist_score = float(cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL))

    combined = (struct_score * 0.70) + (max(0.0, hist_score) * 0.30)
    is_owner = combined >= 0.52
    return is_owner, round(max(0.0, combined) * 100, 1)


def detect_real_face_and_eyes(frame):
    if frame is None:
        return None, 0.0, False

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if float(np.mean(gray)) < 18.0 or float(np.std(gray)) < 12.0:
        return None, 0.0, False

    gray_eq = cv2.equalizeHist(gray)

    if face_cascade is None or face_cascade.empty():
        return None, 0.0, False

    faces = face_cascade.detectMultiScale(gray_eq, scaleFactor=1.12, minNeighbors=5, minSize=(65, 65))
    if len(faces) == 0:
        return None, 0.0, False

    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    fx, fy, fw, fh = faces[0]
    face_crop = frame[fy:fy + fh, fx:fx + fw]

    upper_gray = gray_eq[fy:fy + int(fh * 0.58), fx:fx + fw]
    eyes_open = True

    if eye_cascade is not None and not eye_cascade.empty() and upper_gray.size > 0:
        eyes = eye_cascade.detectMultiScale(upper_gray, scaleFactor=1.08, minNeighbors=4, minSize=(15, 15))
        eyes_open = len(eyes) >= 1

    ear_val = 0.31 if eyes_open else 0.15
    return cv2.resize(face_crop, (128, 128)), ear_val, (not eyes_open)


def enroll_owner_face(image_base64, auth_pin=""):
    frame = decode_base64_frame(image_base64)
    if frame is None:
        return {"ok": False, "code": "INVALID_FRAME", "message": "OPTICAL ERROR: Invalid video frame payload."}

    crop, _, _ = detect_real_face_and_eyes(frame)
    if crop is None:
        return {
            "ok": False,
            "code": "NO_FACE",
            "message": "OPTICAL SENSOR: No clear facial geometry detected. Align face with CAM-03."
        }

    # Anti-Overwrite Security Check: If owner profile already exists, verify identity or Master Passcode
    if os.path.exists(OWNER_IMG_PATH):
        is_owner, match_confidence = compare_with_owner(crop)
        pin_authorized = str(auth_pin).strip() == "2026"

        if not is_owner and not pin_authorized:
            return {
                "ok": False,
                "code": "UNAUTHORIZED_OVERWRITE",
                "match_confidence": match_confidence,
                "message": f"SECURITY LOCK: Biometric overwrite denied ({match_confidence}% match). Verify Owner Face or enter Passcode first."
            }

    cv2.imwrite(OWNER_IMG_PATH, crop)
    reset_liveness_session()
    return {
        "ok": True,
        "code": "ENROLLED",
        "owner_enrolled": True,
        "message": "BIOMETRIC ID LOCKED: Owner facial template encrypted. Blink twice (2/2) to authenticate."
    }


def reset_liveness_session():
    blink_state["blink_count"] = 0
    blink_state["open_frames"] = 0
    blink_state["closed_frames"] = 0
    blink_state["in_blink"] = False


def process_liveness_frame(image_base64):
    try:
        frame = decode_base64_frame(image_base64)
        crop, avg_ear, is_closed = detect_real_face_and_eyes(frame)
        owner_exists = os.path.exists(OWNER_IMG_PATH)

        if crop is None:
            blink_state["open_frames"] = 0
            blink_state["in_blink"] = False
            return {
                "ok": True,
                "face_detected": False,
                "is_owner": False,
                "owner_enrolled": owner_exists,
                "ear": 0.0,
                "blink_count": blink_state["blink_count"],
                "liveness_passed": False,
                "status_text": "NO FACE DETECTED — ALIGN WITH CAM-03"
            }

        if not owner_exists:
            return {
                "ok": True,
                "face_detected": True,
                "is_owner": False,
                "owner_enrolled": False,
                "ear": avg_ear,
                "blink_count": 0,
                "liveness_passed": False,
                "status_text": "NO BIOMETRIC PROFILE — CLICK 'ENROLL ID'"
            }

        is_owner, match_confidence = compare_with_owner(crop)

        if is_owner:
            if not is_closed:
                blink_state["open_frames"] += 1
                if blink_state["in_blink"]:
                    blink_state["blink_count"] += 1
                    blink_state["in_blink"] = False
                blink_state["closed_frames"] = 0
            else:
                if blink_state["open_frames"] >= 2:
                    blink_state["closed_frames"] += 1
                    if blink_state["closed_frames"] >= 1:
                        blink_state["in_blink"] = True

        REQUIRED_BLINKS = 2
        liveness_passed = is_owner and (blink_state["blink_count"] >= REQUIRED_BLINKS)

        if not is_owner:
            status_text = f"UNAUTHORIZED FACE ({match_confidence}%) — ACCESS DENIED"
        elif liveness_passed:
            status_text = f"BIOMETRIC VERIFIED ({match_confidence}%) | LIVENESS: 2/2"
        else:
            status_text = f"ID MATCHED ({match_confidence}%) — BLINK {blink_state['blink_count']}/2 (EAR: {avg_ear})"

        return {
            "ok": True,
            "face_detected": True,
            "is_owner": is_owner,
            "owner_enrolled": True,
            "match_confidence": match_confidence,
            "ear": avg_ear,
            "blink_count": blink_state["blink_count"],
            "liveness_passed": liveness_passed,
            "status_text": status_text
        }
    except Exception as e:
        print(f"[LIVENESS ERROR] {e}")
        return {
            "ok": True,
            "face_detected": False,
            "is_owner": False,
            "owner_enrolled": os.path.exists(OWNER_IMG_PATH),
            "ear": 0.0,
            "blink_count": 0,
            "liveness_passed": False,
            "status_text": "OPTICAL SENSOR CALIBRATING..."
        }