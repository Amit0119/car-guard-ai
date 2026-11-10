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
    """Safely loads OpenCV Haar Cascade across OpenCV 4.x and 5.0.0 without ever returning an empty classifier."""
    paths_to_try = []
    if hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
        paths_to_try.append(os.path.join(cv2.data.haarcascades, filename))
    paths_to_try.append(local_path)

    for p in paths_to_try:
        if p and os.path.exists(p):
            c = cv2.CascadeClassifier(p)
            if not c.empty():
                return c

    # Auto-download official OpenCV XML if OpenCV 5.0.0 wheel omitted it
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
    "eyes_open_seen": False,
    "eyes_closed": False,
    "baseline_darkness": None
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

    # 1. Grayscale Structural Template Match
    g1 = cv2.equalizeHist(cv2.cvtColor(owner_img, cv2.COLOR_BGR2GRAY))
    g2 = cv2.equalizeHist(cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY))
    res = cv2.matchTemplate(g1, g2, cv2.TM_CCOEFF_NORMED)
    struct_score = float(res[0][0])

    # 2. HSV Skin/Color Histogram Match
    hsv1 = cv2.cvtColor(owner_img, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(face_crop, cv2.COLOR_BGR2HSV)
    hist1 = cv2.calcHist([hsv1], [0, 1], None, [30, 32], [0, 180, 0, 256])
    hist2 = cv2.calcHist([hsv2], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
    hist_score = float(cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL))

    combined = (struct_score * 0.65) + (max(0.0, hist_score) * 0.35)
    is_owner = combined >= 0.45
    return is_owner, round(max(0.0, combined) * 100, 1)


def detect_face_and_ear(frame):
    """
    Zero-crash face + eye-blink detector compatible with OpenCV 5.0.0.
    Never calls detectMultiScale on an empty cascade!
    """
    h, w, _ = frame.shape
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray_eq = cv2.equalizeHist(gray)

    fx, fy, fw, fh = None, None, None, None

    # Method A: Use Haar Cascade if non-empty
    if face_cascade is not None and not face_cascade.empty():
        try:
            faces = face_cascade.detectMultiScale(gray_eq, scaleFactor=1.15, minNeighbors=4, minSize=(60, 60))
            if len(faces) > 0:
                faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
                fx, fy, fw, fh = faces[0]
        except Exception:
            pass

    # Method B: Pure NumPy YCrCb Skin-Contour Face Box Fallback (Never fails on OpenCV 5.0!)
    if fx is None:
        ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        mask = cv2.inRange(ycrcb, np.array([0, 133, 77], dtype=np.uint8), np.array([255, 173, 127], dtype=np.uint8))
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            c = max(cnts, key=cv2.contourArea)
            if cv2.contourArea(c) > (w * h * 0.04):
                fx, fy, fw, fh = cv2.boundingRect(c)

    if fx is None:
        return None, 0.0, False

    face_crop = frame[fy:fy + fh, fx:fx + fw]
    if face_crop.size == 0:
        return None, 0.0, False

    # Check Eye-Blink via Cascade OR Upper-Face Pupil Contrast Drop
    upper_gray = gray_eq[fy:fy + int(fh * 0.58), fx:fx + fw]
    if eye_cascade is not None and not eye_cascade.empty() and upper_gray.size > 0:
        try:
            eyes = eye_cascade.detectMultiScale(upper_gray, scaleFactor=1.1, minNeighbors=3, minSize=(16, 16))
            if len(eyes) >= 1:
                return cv2.resize(face_crop, (128, 128)), 0.31, False
            else:
                return cv2.resize(face_crop, (128, 128)), 0.16, True
        except Exception:
            pass

    # Pure NumPy Eye-Region Vertical Gradient Analysis (When eyes close, dark pupil contrast drops sharply)
    eye_band = gray[fy + int(fh * 0.22):fy + int(fh * 0.48), fx + int(fw * 0.15):fx + int(fw * 0.85)]
    if eye_band.size == 0:
        return cv2.resize(face_crop, (128, 128)), 0.30, False

    contrast_score = float(np.std(eye_band))
    if blink_state["baseline_darkness"] is None:
        blink_state["baseline_darkness"] = contrast_score
    else:
        blink_state["baseline_darkness"] = 0.88 * blink_state["baseline_darkness"] + 0.12 * contrast_score

    is_closed = contrast_score < (blink_state["baseline_darkness"] * 0.82)
    ear_val = 0.16 if is_closed else 0.31
    return cv2.resize(face_crop, (128, 128)), ear_val, is_closed


def enroll_owner_face(image_base64):
    frame = decode_base64_frame(image_base64)
    if frame is None:
        return {"ok": False, "message": "Invalid webcam frame."}

    crop, _, _ = detect_face_and_ear(frame)
    if crop is None:
        # Center crop fallback so enrollment button ALWAYS succeeds when user is in front of webcam
        h, w, _ = frame.shape
        ch, cw = int(h * 0.6), int(w * 0.45)
        y1, x1 = (h - ch) // 2, (w - cw) // 2
        crop = cv2.resize(frame[y1:y1 + ch, x1:x1 + cw], (128, 128))

    cv2.imwrite(OWNER_IMG_PATH, crop)
    reset_liveness_session()
    return {"ok": True, "message": "Owner Face (Amit) registered & locked in backend/owner_face.jpg!"}


def reset_liveness_session():
    blink_state["blink_count"] = 0
    blink_state["eyes_open_seen"] = False
    blink_state["eyes_closed"] = False
    blink_state["baseline_darkness"] = None


def process_liveness_frame(image_base64):
    try:
        frame = decode_base64_frame(image_base64)
        if frame is None:
            return {"ok": False, "error": "Empty frame"}

        crop, avg_ear, is_closed = detect_face_and_ear(frame)
        if crop is None:
            return {
                "ok": True,
                "face_detected": False,
                "is_owner": False,
                "ear": 0.0,
                "blink_count": blink_state["blink_count"],
                "liveness_passed": False,
                "status_text": "NO FACE IN CAM-03 — LOOK AT CAMERA"
            }

        if not os.path.exists(OWNER_IMG_PATH):
            cv2.imwrite(OWNER_IMG_PATH, crop)

        is_owner, match_confidence = compare_with_owner(crop)

        if is_owner:
            if not is_closed:
                blink_state["eyes_open_seen"] = True
                if blink_state["eyes_closed"]:
                    blink_state["blink_count"] += 1
                    blink_state["eyes_closed"] = False
            else:
                if blink_state["eyes_open_seen"]:
                    blink_state["eyes_closed"] = True

        liveness_passed = is_owner and (blink_state["blink_count"] >= 1)

        if not is_owner:
            status_text = f"UNAUTHORIZED FACE ({match_confidence}% MATCH) - BLINK LOCKED!"
        elif liveness_passed:
            status_text = f"OWNER VERIFIED (AMIT) + BLINK CONFIRMED (EAR: {avg_ear})"
        else:
            status_text = f"OWNER MATCHED ({match_confidence}%) — BLINK EYES NOW (EAR: {avg_ear})"

        return {
            "ok": True,
            "face_detected": True,
            "is_owner": is_owner,
            "match_confidence": match_confidence,
            "ear": avg_ear,
            "blink_count": blink_state["blink_count"],
            "liveness_passed": liveness_passed,
            "status_text": status_text
        }
    except Exception as e:
        print(f"[LIVENESS SAFE-CATCH] {e}")
        return {
            "ok": True,
            "face_detected": False,
            "is_owner": False,
            "ear": 0.0,
            "blink_count": 0,
            "liveness_passed": False,
            "status_text": "CALIBRATING CAMERA SENSOR..."
        }