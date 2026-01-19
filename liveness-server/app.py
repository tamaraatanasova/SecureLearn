import base64
import io
import cv2
import numpy as np
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
import mediapipe as mp
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MediaPipe Setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh_instance = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.7 # Higher confidence for security
)

# Landmark Indices
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
MOUTH_INNER_TOP = 13
MOUTH_INNER_BOTTOM = 14
FOREHEAD_CENTER = 10 # Used for rPPG/Pulse check

class Frame(BaseModel):
    image_base64: str

class LivenessRequest(BaseModel):
    frames: List[Frame]
    challenge: Optional[str] = "head_turn"
    debug: Optional[bool] = False

# --- RESPONSE MESSAGES ---

LIVE_MESSAGES = {
    "blink_detected": "Liveness verified: blink detected.",
    "head_turn_detected": "Liveness verified: head turn detected.",
    "mouth_open_detected": "Liveness verified: mouth movement detected.",
}

SPOOF_MESSAGES = {
    "no_face_detected": "No face detected consistently. Possible camera obstruction or an attempted spoof.",
    "no_face_landmarks": "Face landmarks could not be extracted reliably.",
    "no_biological_signal": "No biological signal detected. Possible photo replay or deepfake.",
    "passive_check_failed": "Passive anti-spoofing checks failed. Possible replay attack.",
    "no_blink_detected": "Blink challenge failed. Please blink naturally and try again.",
    "head_remained_static": "Head-turn challenge failed. Please turn your head left/right and try again.",
    "mouth_not_opened": "Mouth-open challenge failed. Please open your mouth and try again.",
    "unknown_challenge": "Unknown challenge type.",
}

def build_response(status: str, reason: str, attack_type: Optional[str] = None, message: Optional[str] = None, **extra):
    if message is None:
        if status == "live":
            message = LIVE_MESSAGES.get(reason, "Liveness verified.")
        else:
            message = SPOOF_MESSAGES.get(reason, "Liveness check failed.")
    resp = {"status": status, "reason": reason, "message": message}
    if attack_type is not None:
        resp["attack_type"] = attack_type
    resp.update(extra)
    return resp

# --- DEEPFAKE PROOFING UTILS ---

def analyze_frequency_domain(img):
    """
    Detects if the image is a photo of a screen (Replay Attack).
    Screens have high-frequency periodic noise (Moiré patterns).
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Resize for speed
    gray = cv2.resize(gray, (200, 200))
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    magnitude_spectrum = 20 * np.log(np.abs(fshift) + 1)
    
    # Analyze the distribution of high frequencies
    # Real skin is 'smooth', screens have 'spikes' in frequency
    if np.std(magnitude_spectrum) > 55: # Threshold for digital screen noise
        return False
    return True

def analyze_texture_liveness(img):
    """
    Uses Laplacian variance to detect 'flatness'.
    High variance = Sharp real skin. Low variance = Blurry photo or screen.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    return laplacian_var > 100 # Threshold: photos/screens often < 80

def get_green_mean(img, landmarks, w, h):
    """
    Extracts the average green value of the forehead.
    Used for rPPG (detecting the heartbeat).
    """
    fh = landmarks[FOREHEAD_CENTER]
    cx, cy = int(fh.x * w), int(fh.y * h)
    # Sample a small 10x10 area on the forehead
    roi = img[max(0, cy-5):min(h, cy+5), max(0, cx-5):min(w, cx+5)]
    if roi.size == 0: return 0
    return np.mean(roi[:, :, 1]) # Green Channel

# --- EXISTING CHALLENGE UTILS ---

def get_distance(p1, p2):
    return np.linalg.norm(np.array(p1) - np.array(p2))

def calculate_ear(landmarks, eye_idx, w, h):
    def p(i): return np.array([landmarks[i].x * w, landmarks[i].y * h])
    pts = [p(i) for i in eye_idx]
    v_dist1 = get_distance(pts[1], pts[5])
    v_dist2 = get_distance(pts[2], pts[4])
    h_dist = get_distance(pts[0], pts[3])
    return (v_dist1 + v_dist2) / (2.0 * h_dist)

def get_head_pose(landmarks):
    # Nose to eye distance ratio (Yaw)
    dist_nose_left = abs(landmarks[1].x - landmarks[33].x)
    dist_nose_right = abs(landmarks[1].x - landmarks[263].x)
    if dist_nose_right == 0: return 1.0
    return dist_nose_left / dist_nose_right

def decode_image(b64):
    try:
        data = b64.split(",")[-1]
        image_data = base64.b64decode(data)
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except:
        return None

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/liveness")
def liveness(req: LivenessRequest):
    if len(req.frames) < 8:
        raise HTTPException(status_code=400, detail="Need at least 8 frames for deepfake analysis")

    ear_history = []
    mouth_ratios = []
    head_pose_ratios = []
    green_signals = [] # For Pulse/rPPG
    passive_scores = [] # Texture/Frequency results
    frequency_scores = []
    texture_scores = []
    processed_frames = 0
    frames_with_face = 0

    for frame_data in req.frames:
        img = decode_image(frame_data.image_base64)
        if img is None: continue

        h, w = img.shape[:2]
        processed_frames += 1
        
        # --- LAYER 1: PASSIVE ANTI-SPOOFING (Frequency & Texture) ---
        freq_ok = analyze_frequency_domain(img)
        tex_ok = analyze_texture_liveness(img)
        frequency_scores.append(freq_ok)
        texture_scores.append(tex_ok)
        passive_scores.append(freq_ok and tex_ok)

        # --- LAYER 2: LANDMARK PROCESSING ---
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        result = face_mesh_instance.process(rgb)

        if not result.multi_face_landmarks:
            continue

        frames_with_face += 1
        landmarks = result.multi_face_landmarks[0].landmark

        # Blink logic
        ear_history.append((calculate_ear(landmarks, LEFT_EYE, w, h) + calculate_ear(landmarks, RIGHT_EYE, w, h)) / 2.0)
        
        # Mouth logic
        eye_dist = get_distance([landmarks[33].x, landmarks[33].y], [landmarks[263].x, landmarks[263].y])
        m_dist = get_distance([landmarks[MOUTH_INNER_TOP].x, landmarks[MOUTH_INNER_TOP].y], 
                              [landmarks[MOUTH_INNER_BOTTOM].x, landmarks[MOUTH_INNER_BOTTOM].y])
        mouth_ratios.append(m_dist / eye_dist)

        # Head Pose logic
        head_pose_ratios.append(get_head_pose(landmarks))

        # Green Signal (Biological rPPG)
        green_signals.append(get_green_mean(img, landmarks, w, h))

    # --- FINAL VALIDATION LOGIC ---

    if processed_frames < 8:
        raise HTTPException(status_code=400, detail="Not enough decodable frames")

    if frames_with_face < 4:
        return build_response(
            status="spoof",
            reason="no_face_detected",
            attack_type="no_face",
            frames_with_face=frames_with_face,
        )

    # 1. Fail if passive checks failed on > 30% of frames
    passive_fail_ratio = passive_scores.count(False) / max(1, len(passive_scores))
    if passive_fail_ratio > 0.3:
        freq_fail_ratio = frequency_scores.count(False) / max(1, len(frequency_scores))
        tex_fail_ratio = texture_scores.count(False) / max(1, len(texture_scores))

        # Heuristic classification for friendlier error messages
        if freq_fail_ratio > tex_fail_ratio and freq_fail_ratio > 0.2:
            attack_type = "replay_screen"
            message = "Possible replay attack detected (screen). Avoid showing a photo/video on another device."
        elif tex_fail_ratio >= freq_fail_ratio and tex_fail_ratio > 0.2:
            attack_type = "replay_photo"
            message = "Possible photo/print replay detected. Please use the live camera feed."
        else:
            attack_type = "passive_spoof"
            message = None

        return build_response(
            status="spoof",
            reason="passive_check_failed",
            attack_type=attack_type,
            message=message,
            passive_fail_ratio=float(passive_fail_ratio),
            frequency_fail_ratio=float(freq_fail_ratio),
            texture_fail_ratio=float(tex_fail_ratio),
        )

    # 2. Biological Check (Pulse/rPPG)
    # Real humans have variance in green channel. Deepfakes/photos are either static or pure noise.
    if len(green_signals) > 0:
        pulse_variance = np.var(green_signals)
        if pulse_variance < 0.001: # Totally static (Photo)
            return build_response(
                status="spoof",
                reason="no_biological_signal",
                attack_type="no_biological_signal",
                pulse_variance=float(pulse_variance),
                message="No liveness signal detected (no pulse/skin variation). Possible photo replay used for authentication.",
            )

    # 3. Active Challenge Logic
    if req.challenge == "blink":
        if not ear_history:
            return build_response(status="spoof", reason="no_face_landmarks", attack_type="no_face_landmarks")
        if (max(ear_history) - min(ear_history)) > 0.07:
            resp = build_response(status="live", reason="blink_detected")
        else:
            resp = build_response(status="spoof", reason="no_blink_detected", attack_type="challenge_failed")
        if req.debug:
            resp["ear_delta"] = float(max(ear_history) - min(ear_history))
        return resp

    if req.challenge == "head_turn":
        if not head_pose_ratios:
            return build_response(status="spoof", reason="no_face_landmarks", attack_type="no_face_landmarks")
        if min(head_pose_ratios) < 0.6 or max(head_pose_ratios) > 1.7:
            resp = build_response(status="live", reason="head_turn_detected")
        else:
            resp = build_response(status="spoof", reason="head_remained_static", attack_type="challenge_failed")
        if req.debug:
            resp["head_pose_min"] = float(min(head_pose_ratios))
            resp["head_pose_max"] = float(max(head_pose_ratios))
        return resp

    if req.challenge == "mouth_open":
        if not mouth_ratios:
            return build_response(status="spoof", reason="no_face_landmarks", attack_type="no_face_landmarks")
        if (max(mouth_ratios) - min(mouth_ratios)) > 0.1:
            resp = build_response(status="live", reason="mouth_open_detected")
        else:
            resp = build_response(status="spoof", reason="mouth_not_opened", attack_type="challenge_failed")
        if req.debug:
            resp["mouth_delta"] = float(max(mouth_ratios) - min(mouth_ratios))
        return resp

    return build_response(status="spoof", reason="unknown_challenge", attack_type="invalid_challenge")
