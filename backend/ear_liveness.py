import os
import cv2
import base64
import numpy as np

OWNER_IMG_PATH = os.path.join(os.path.dirname(__file__), "owner_face.jpg")

# Try loading MediaPipe FaceMesh if available; otherwise use built-in OpenCV Face + Eye Cascades
USE_MEDIAPIPE = False
face_mesh = None

try:
    import mediapipe as mp
    from mediapipe.python.solutions import face_mesh as mp_fm
    face_mesh = mp_fm.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6
    )
    USE_MEDIAPIPE = True
    print("[LIVENESS ENGINE] Using MediaPipe 468-Landmark EAR Engine.")
except Exception:
    USE_MEDIAPIPE = False
    print("[LIVENESS ENGINE] Using Built-in OpenCV Haar Face + Eye-Blink Engine (Zero-Crash Mode).")

# Built-in OpenCV Detectors (Always pre-installed inside cv2.data.haarcascades)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye_tree_eyeglasses.xml")

LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

blink_state = {
    "blink_count": 0,
    "eyes_open_seen": False,
    "eyes_closed": False
}


def decode_base64_frame(image_base64):
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]
    img_bytes = base64.b64decode(image_base64)
    np_arr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)


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
    is_owner = combined >= 0.46
    return is_owner, round(combined * 100, 1)


def detect_face_and_ear(frame):
    """
    Returns (face_crop, avg_ear, eyes_ currently_closed) using either MediaPipe or OpenCV Cascades.
    """
    h, w, _ = frame.shape

    if USE_MEDIAPIPE and face_mesh is not None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)
        if not results.multi_face_landmarks:
            return None, 0.0, False

        landmarks = results.multi_face_landmarks[0].landmark
        xs = [int(lm.x * w) for lm in landmarks]
        ys = [int(lm.y * h) for lm in landmarks]
        x1, x2 = max(0, min(xs) - 15), min(w, max(xs) + 15)
        y1, y2 = max(0, min(ys) - 15), min(h, max(ys) + 15)
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None, 0.0, False

        def calc_ear(indices):
            pts = [np.array([landmarks[i].x * w, landmarks[i].y * h]) for i in indices]
            v1 = np.linalg.norm(pts[1] - pts[5])
            v2 = np.linalg.norm(pts[2] - pts[4])
            horiz = np.linalg.norm(pts[0] - pts[3])
            return float((v1 + v2) / (2.0 * horiz)) if horiz > 0 else 0.30

        avg_ear = round((calc_ear(LEFT_EYE) + calc_ear(RIGHT_EYE)) / 2.0, 3)
        return cv2.resize(crop, (128, 128)), avg_ear, (avg_ear < 0.215)

    # OpenCV Haar Cascade Engine (Works on ALL Python versions without MediaPipe solutions)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(70, 70))

    if len(faces) == 0:
        return None, 0.0, False

    # Pick largest face in frame
    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    fx, fy, fw, fh = faces[0]
    face_crop = frame[fy:fy + fh, fx:fx + fw]

    # Detect open eyes inside the upper half of the face
    upper_face_gray = gray[fy:fy + int(fh * 0.62), fx:fx + fw]
    eyes = eye_cascade.detectMultiScale(upper_face_gray, scaleFactor=1.1, minNeighbors=4, minSize=(18, 18))

    if len(eyes) >= 1:
        simulated_ear = 0.31
        is_closed = False
    else:
        simulated_ear = 0.16
        is_closed = True

    return cv2.resize(face_crop, (128, 128)), simulated_ear, is_closed


def enroll_owner_face(image_base64):
    frame = decode_base64_frame(image_base64)
    if frame is None:
        return {"ok": False, "message": "Invalid webcam frame."}

    crop, _, _ = detect_face_and_ear(frame)
    if crop is None:
        return {"ok": False, "message": "No face detected! Look straight into laptop camera."}

    cv2.imwrite(OWNER_IMG_PATH, crop)
    reset_liveness_session()
    return {"ok": True, "message": "Owner Face (Amit) registered & locked in backend/owner_face.jpg!"}


def reset_liveness_session():
    blink_state["blink_count"] = 0
    blink_state["eyes_open_seen"] = False
    blink_state["eyes_closed"] = False


def process_liveness_frame(image_base64):
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

    # Auto-save first face as Owner if owner_face.jpg does not exist yet
    if not os.path.exists(OWNER_IMG_PATH):
        cv2.imwrite(OWNER_IMG_PATH, crop)

    is_owner, match_confidence = compare_with_owner(crop)

    # Track Open -> Closed -> Open blink transition ONLY for the verified Owner
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