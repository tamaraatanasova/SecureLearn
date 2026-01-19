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

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- MediaPipe Setup ----------------
mp_face_mesh = mp.solutions.face_mesh
face_mesh_instance = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7,
)

# Landmark Indices
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
NOSE_TIP = 1
MOUTH_TOP = 13
MOUTH_BOTTOM = 14

# ---------------- Models ----------------
class Frame(BaseModel):
    image_base64: str

class LivenessRequest(BaseModel):
    frames: List[Frame]
    challenge: Optional[str] = "head_turn"

# ---------------- Helper Functions ----------------

def decode_image(b64):
    try:
        data = b64.split(",")[-1]
        image_data = base64.b64decode(data)
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception:
        return None

def analyze_passive_spoof(img):
    """
    Checks for digital screens (FFT) and blur/texture (Laplacian).
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 1. Texture/Sharpness check
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    
    # 2. Frequency check (Detects pixel patterns on screens)
    resized_gray = cv2.resize(gray, (200, 200))
    f = np.fft.fft2(resized_gray)
    fshift = np.fft.fftshift(f)
    mag_spec = 20 * np.log(np.abs(fshift) + 1)
    freq_std = np.std(mag_spec)

    # Thresholds: 
    # lap_var > 80 (Not too blurry)
    # freq_std < 55 (Not a digital screen pattern)
    return lap_var > 70 and freq_std < 55

def get_distance(p1, p2):
    return np.linalg.norm(np.array(p1) - np.array(p2))

def calculate_ear(landmarks, eye_idx, w, h):
    def p(i): return np.array([landmarks[i].x * w, landmarks[i].y * h])
    pts = [p(i) for i in eye_idx]
    v1 = get_distance(pts[1], pts[5])
    v2 = get_distance(pts[2], pts[4])
    h_dist = get_distance(pts[0], pts[3]) + 1e-6
    return (v1 + v2) / (2.0 * h_dist)

# ---------------- Main Endpoint ----------------

@app.post("/liveness")
async def check_liveness(req: LivenessRequest):
    # Requirement: Increase frame count in frontend to 15 for better security
    if len(req.frames) < 8:
        raise HTTPException(status_code=400, detail="Insufficient frames for analysis.")

    ear_hist = []
    mouth_hist = []
    head_yaw_hist = []
    z_hist = []
    raw_landmarks_list = [] # Used to detect "perfectly static" images
    passive_passes = 0
    
    w_ref, h_ref = 640, 480

    for f in req.frames:
        img = decode_image(f.image_base64)
        if img is None: continue
        
        h_ref, w_ref = img.shape[:2]

        # 1. Passive Security (Screen/Blur Detection)
        if analyze_passive_spoof(img):
            passive_passes += 1

        # 2. Landmark Detection
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        res = face_mesh_instance.process(rgb)
        
        if res.multi_face_landmarks:
            lms = res.multi_face_landmarks[0].landmark
            
            # Store landmark positions to check for static image fraud
            # We take a few key points: Nose, Eye corners
            raw_landmarks_list.append([(lms[i].x, lms[i].y) for i in [1, 33, 263, 61, 291]])

            # EAR (Blink detection)
            ear = (calculate_ear(lms, LEFT_EYE, w_ref, h_ref) + calculate_ear(lms, RIGHT_EYE, w_ref, h_ref)) / 2.0
            ear_hist.append(ear)
            
            # Mouth Open detection
            m_dist = get_distance([lms[MOUTH_TOP].x, lms[MOUTH_TOP].y], [lms[MOUTH_BOTTOM].x, lms[MOUTH_BOTTOM].y])
            mouth_hist.append(m_dist)
            
            # Head Yaw (Perspective shift)
            # Ratio of nose-to-left-eye vs nose-to-right-eye
            d_left = abs(lms[NOSE_TIP].x - lms[33].x)
            d_right = abs(lms[NOSE_TIP].x - lms[263].x)
            head_yaw_hist.append(d_left / (d_right + 1e-6))
            
            # Depth check
            z_hist.append(lms[NOSE_TIP].z)

    # ---------------- SECURITY VALIDATION ----------------

    if len(raw_landmarks_list) < 5:
        return {"status": "spoof", "reason": "no_face", "message": "Face not detected clearly."}

    # BLOCKER 1: Static Image Detection
    # If the variance of landmark positions is near zero, it's a static digital image.
    # Real humans always have micro-tremors.
    landmark_variance = np.var(raw_landmarks_list, axis=0).mean()
    if landmark_variance < 0.000005:
        return {"status": "spoof", "reason": "static_image", "message": "Static image detected. Please move naturally."}

    # BLOCKER 2: Screen/Print Detection (Passive check)
    if passive_passes < (len(req.frames) * 0.4):
        return {"status": "spoof", "reason": "digital_spoof", "message": "Possible screen or printed photo detected."}

    # ---------------- CHALLENGE VERIFICATION ----------------

    # Detection flags
    blinked = any(e < 0.19 for e in ear_hist)
    mouth_opened = any(m > 0.05 for m in mouth_hist)
    
    # Head turn verification: Check if the yaw ratio changed significantly
    # (A real head turn causes a massive change in the d_left/d_right ratio)
    yaw_range = max(head_yaw_hist) - min(head_yaw_hist)
    head_turned = yaw_range > 0.4 

    if req.challenge == "head_turn":
        if head_turned:
            return {"status": "live", "reason": "challenge_passed", "message": "Liveness verified!"}
        return {"status": "spoof", "reason": "no_motion", "message": "Please turn your head slowly from left to right."}

    if req.challenge == "mouth_open":
        if mouth_opened:
            return {"status": "live", "reason": "challenge_passed", "message": "Liveness verified!"}
        return {"status": "spoof", "reason": "no_mouth_motion", "message": "Please open your mouth clearly."}

    # Fallback: If no specific challenge but they blinked, we consider it live (Passive)
    if blinked:
        return {"status": "live", "reason": "blink_detected", "message": "Liveness verified!"}

    return {"status": "spoof", "reason": "failed", "message": "Verification failed. Please follow the instructions."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)