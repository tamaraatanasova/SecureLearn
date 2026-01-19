# 🎓 Secure E-Learning Platform with Face Recognition & Liveness Detection

This repository contains an **academic and practical project** developed in the field of **Machine Learning and Computer Security**.

The project demonstrates a **secure authentication mechanism** for an e-learning platform using **Face Recognition** combined with **Deepfake / Liveness Detection (Presentation Attack Detection – PAD)** to mitigate spoofing and impersonation attacks.

---

## 📌 Project Overview

Traditional password-based authentication is vulnerable to:
- credential stuffing
- password reuse
- phishing
- brute-force attacks

This system replaces password-only login with a **biometric authentication flow**, where access is granted only if:
1. The face matches the registered user (face recognition)
2. The face is **live and physically present** (liveness detection)

---

## 🔐 Security Concept

### Authentication Flow
1. User selects or claims identity (email / account)
2. Webcam captures a sequence of frames
3. Frames are sent to the **FastAPI liveness service**
4. Liveness result (`live / spoof`) is returned
5. If `live`, face embedding is verified
6. Successful authentication session is created

### Threats Addressed
- Photo attacks (printed images)
- Replay attacks (video shown on screen)
- Screen-based impersonation
- Deepfake video attacks
- Credential stuffing (password attacks)

---

## 🧠 Liveness Detection Approach (Hybrid)

The system uses a **multi-layer liveness detection strategy**:

### Passive Anti-Spoofing
- **Frequency domain analysis (FFT)**  
  Detects screen replay artifacts (moiré patterns)
- **Texture analysis (Laplacian variance)**  
  Detects flat or blurred surfaces (photos, screens)

### Biological Signal Check
- **rPPG-inspired green channel variance**  
  Measures subtle physiological color changes related to blood flow

### Active Challenges
- Eye blinking detection
- Head movement (yaw) detection
- Mouth opening detection

This hybrid approach increases resistance against **deepfake and presentation attacks**.

---

## 🏗️ System Architecture

### Tech Stack
- **Frontend:** React (Webcam capture, UI)
- **Backend:** Supabase (PostgreSQL, Auth, RLS)
- **Liveness Service:** FastAPI + OpenCV + MediaPipe
- **Face Recognition:** Face embeddings (face-api.js compatible)

### Components
