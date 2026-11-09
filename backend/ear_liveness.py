import os
import cv2
import base64
import numpy as np
import mediapipe as mp

OWNER_IMG_PATH = os.path.join(os.path.dirname(__file__), "owner_face.jpg")

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

# MediaPipe Left & Right Eye Landmark Indices for EAR Calculation
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

# State memory for blink counter
blink_state = {
    "blink_count": 0,
    "eyes_closed": False,
    "verified_owner": False
}


def decode_base64_frame(image_base64):
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]
    img_bytes = base64.b64decode(image_base64)
    np_arr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)


def calculate_ear(landmarks, eye_indices, w, h):
    pts = [np.array([landmarks[i].x * w, landmarks[i].y * h]) for i in eye_indices]
    # Vertical distances
    v1 = np.linalg.norm(pts[1] - pts[5])
    v2 = np.linalg.norm(pts[2] - pts[4])
    # Horizontal distance
    horiz = np.linalg.norm(pts[0] - pts[3])
    if horiz == 0:
        return 0.30
    return float((v1 + v2) / (2.0 * horiz))


def extract_face_crop(frame, landmarks, w, h):
    xs = [int(lm.x * w) for lm in landmarks]
    ys = [int(lm.y * h) for lm in landmarks]
    x1, x2 = max(0, min(xs) - 15), min(w, max(xs) + 15)
    y1, y2 = max(0, min(ys) - 15), min(h, max(ys) + 15)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    return cv2.resize(crop, (128, 128))


def compare_with_owner(face_crop):
    """
    Compares current webcam face with saved owner_face.jpg using HSV Histogram + Structural Template Match.
    """
    if not os.path.exists(OWNER_IMG_PATH):
        return False, 0.0

    owner_img = cv2.imread(OWNER_IMG_PATH)
    if owner_img is None:
        return False, 0.0

    owner_img = cv2.resize(owner_img, (128, 128))

    # 1. Grayscale Normalized Cross-Correlation (Facial Structure Match)
    g1 = cv2.equalizeHist(cv2.cvtColor(owner_img, cv2.COLOR_BGR2GRAY))
    g2 = cv2.equalizeHist(cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY))
    res = cv2.matchTemplate(g1, g2, cv2.TM_CCOEFF_NORMED)
    struct_score = float(res[0][0])

    # 2. HSV Color/Skin-Tone Histogram Correlation
    hsv1 = cv2.cvtColor(owner_img, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(face_crop, cv2.COLOR_BGR2HSV)
    hist1 = cv2.calcHist([hsv1], [0, 1], None, [30, 32], [0, 180, 0, 256])
    hist2 = cv2.calcHist([hsv2], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
    hist_score = float(cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL))

    combined_confidence = (struct_score * 0.65) + (max(0.0, hist_score) * 0.35)
    is_owner = combined_confidence >= 0.48
    return is_owner, round(combined_confidence * 100, 1)


def enroll_owner_face(image_base64):
    frame = decode_base64_frame(image_base64)
    if frame is None:
        return {"ok": False, "message": "Invalid webcam frame."}

    h, w, _ = frame.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    if not results.multi_face_landmarks:
        return {"ok": False, "message": "No face detected! Look straight into the camera."}

    landmarks = results.multi_face_landmarks[0].landmark
    crop = extract_face_crop(frame, landmarks, w, h)
    if crop is None:
        return {"ok": False, "message": "Could not crop face clearly."}

    cv2.imwrite(OWNER_IMG_PATH, crop)
    reset_liveness_session()
    return {"ok": True, "message": "Owner Face (Amit) registered & locked in backend/owner_face.jpg!"}


def reset_liveness_session():
    blink_state["blink_count"] = 0
    blink_state["eyes_closed"] = False
    blink_state["verified_owner"] = False


def process_liveness_frame(image_base64):
    frame = decode_base64_frame(image_base64)
    if frame is None:
        return {"ok": False, "error": "Empty frame"}

    h, w, _ = frame.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    if not results.multi_face_landmarks:
        return {
            "ok": True,
            "face_detected": False,
            "is_owner": False,
            "owner_enrolled": os.path.exists(OWNER_IMG_PATH),
            "ear": 0.0,
            "blink_count": blink_state["blink_count"],
            "liveness_passed": False,
            "status_text": "NO FACE IN CAM-03"
        }

    landmarks = results.multi_face_landmarks[0].landmark

    # 1. Calculate Real-Time EAR (Eye Aspect Ratio)
    left_ear = calculate_ear(landmarks, LEFT_EYE, w, h)
    right_ear = calculate_ear(landmarks, RIGHT_EYE, w, h)
    avg_ear = round((left_ear + right_ear) / 2.0, 3)

    # 2. Check Owner Face Identity
    owner_enrolled = os.path.exists(OWNER_IMG_PATH)
    if not owner_enrolled:
        # Auto-enroll first detected face as Owner if owner_face.jpg doesn't exist yet
        crop = extract_face_crop(frame, landmarks, w, h)
        if crop is not None:
            cv2.imwrite(OWNER_IMG_PATH, crop)
            owner_enrolled = True

    crop = extract_face_crop(frame, landmarks, w, h)
    is_owner, match_Lists = compare_with_owner(crop) if crop is not None else (False, 0.0)

    # 3. Count Eye-Blink ONLY if Face matches Owner!
    EAR_BLINK_THRESHOLD = 0.215
    if is_owner:
        if avg_ear < EAR_BLINK_THRESHOLD:
            blink_state["eyes_closed"] = True
        else:
            if blink_state["eyes_closed"]:
                blink_state["blink_count"] += 1
                blink_state["eyes_closed"] = False

    liveness_passed = is_owner and (blink_state["blink_count"] >= 1)

    if not is_owner:
        status_text = f"UNAUTHORIZED FACE ({match_Lists}% MATCH) - BLINK LOCKED!"
    elif liveness_passed:
        status_text = f"OWNER VERIFIED (AMIT) + BLINK CONFIRMED (EAR: {avg_ear})"
    else:
        status_text = f"OWNER MATCHED ({match_Lists}%) — BLINK NOW (EAR: {avg_ear})"

    return {
        "ok": True,
        "face_detected": True,
        "is_owner": is_owner,
        "match_confidence": match_Lists,
        "ear": avg_ear,
        "blink_count": blink_state["blink_count"],
        "liveness_passed": liveness_passed,
        "status_text": status_text
    }