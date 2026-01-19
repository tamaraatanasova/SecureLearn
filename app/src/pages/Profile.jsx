import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { createDetectorOptions, ensureFaceModelsLoaded, getFaceApi } from "../lib/faceApi.js";

export default function Profile() {
  const { t } = useTranslation();
  const { profile, session } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceApiRef = useRef(null);
  const detectorOptionsRef = useRef(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [embeddings, setEmbeddings] = useState([]);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [error, setError] = useState("");
  const [hasActiveEmbedding, setHasActiveEmbedding] = useState(false);
  const [faceEnabled, setFaceEnabled] = useState(Boolean(profile?.is_face_login_enabled));
  const targetSamples = 3;

  const roleLabel = useMemo(() => {
    const role = profile?.role || "student";
    if (role === "admin") return t("roleAdmin");
    if (role === "teacher") return t("roleTeacher");
    return t("roleStudent");
  }, [profile?.role, t]);

  useEffect(() => {
    setFaceEnabled(Boolean(profile?.is_face_login_enabled));
  }, [profile?.is_face_login_enabled]);

  useEffect(() => {
    let isMounted = true;
    const loadModels = async () => {
      try {
        await ensureFaceModelsLoaded({ modelUrl: "/models" });
        faceApiRef.current = await getFaceApi();
        detectorOptionsRef.current = await createDetectorOptions();
        if (isMounted) setIsModelLoading(false);
      } catch (_err) {
        if (isMounted) {
          setError(t("faceModelError"));
          setIsModelLoading(false);
        }
      }
    };

    loadModels();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [t]);

  useEffect(() => {
    const loadStatus = async () => {
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from("face_embeddings")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .limit(1);
      setHasActiveEmbedding(Boolean(data?.length));
    };

    loadStatus();
  }, [session?.user?.id]);

  const startCamera = async () => {
    setError("");
    if (isCameraOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraOn(true);
    } catch (_err) {
      setError(t("cameraError"));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause?.();
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
  };

  const runLivenessCheck = async () => {
    setError("");
    setStatus("");
    if (!videoRef.current) return;
    setIsBusy(true);

    const faceapi = faceApiRef.current;
    const detectorOptions = detectorOptionsRef.current;
    if (!faceapi || !detectorOptions) {
      setError(t("faceModelError"));
      setIsBusy(false);
      return;
    }

    const getEar = (landmarks) => {
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();
      const ear = (eye) => {
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const v1 = dist(eye[1], eye[5]);
        const v2 = dist(eye[2], eye[4]);
        const h = dist(eye[0], eye[3]);
        return (v1 + v2) / (2 * h);
      };
      return (ear(leftEye) + ear(rightEye)) / 2;
    };

    let blinkDetected = false;
    let samples = 0;
    while (samples < 25) {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, detectorOptions)
        .withFaceLandmarks(true);

      if (detection) {
        const ear = getEar(detection.landmarks);
        if (ear < 0.19) {
          blinkDetected = true;
          break;
        }
      }

      samples += 1;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    setLivenessPassed(blinkDetected);
    setStatus(blinkDetected ? t("livenessPassed") : t("livenessFailed"));
    setIsBusy(false);
  };

  const captureEmbedding = async () => {
    setError("");
    setStatus("");
    if (!videoRef.current) return;
    // Liveness check temporarily disabled.
    setIsBusy(true);
    try {
      const faceapi = faceApiRef.current;
      const detectorOptions = detectorOptionsRef.current;
      if (!faceapi || !detectorOptions) {
        setError(t("faceModelError"));
        setIsBusy(false);
        return;
      }

      const detection = await faceapi
        .detectSingleFace(videoRef.current, detectorOptions)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        setError(t("faceNotFound"));
        setIsBusy(false);
        return;
      }

      const descriptor = Array.from(detection.descriptor);
      setEmbeddings((prev) => [...prev, descriptor]);
      setStatus(t("embeddingReady"));
    } catch (_err) {
      setError(t("faceCaptureError"));
    } finally {
      setIsBusy(false);
    }
  };

  const averageEmbedding = useMemo(() => {
    if (embeddings.length === 0) return null;
    const length = embeddings[0].length;
    const sums = new Array(length).fill(0);
    embeddings.forEach((vector) => {
      vector.forEach((value, index) => {
        sums[index] += value;
      });
    });
    return sums.map((sum) => sum / embeddings.length);
  }, [embeddings]);

  const saveEmbedding = async () => {
    if (!averageEmbedding || !session?.user?.id) {
      setError(t("embeddingMissing"));
      return;
    }
    setError("");
    setStatus("");
    setIsBusy(true);

    await supabase
      .from("face_embeddings")
      .update({ is_active: false })
      .eq("user_id", session.user.id)
      .eq("is_active", true);

    const { error: insertError } = await supabase
      .from("face_embeddings")
      .insert({
        user_id: session.user.id,
        embedding: averageEmbedding,
        model_name: "face-api.js",
        is_active: true,
      });

    if (insertError) {
      setError(insertError.message);
      setIsBusy(false);
      return;
    }

    await supabase
      .from("profiles")
      .update({ is_face_login_enabled: true })
      .eq("id", session.user.id);

    setFaceEnabled(true);
    setHasActiveEmbedding(true);
    setStatus(t("embeddingSaved"));
    setIsBusy(false);
  };

  const resetEmbeddings = () => {
    setEmbeddings([]);
    setLivenessPassed(false);
    setStatus("");
    setError("");
  };

  const progress = Math.min(1, embeddings.length / targetSamples);

  return (
    <div className="container page">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">{t("profile")}</h1>
          <p className="pageSubtitle">{t("profileSubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="card cardPad">
            <div className="flex items-center gap-4">
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  border: "1px solid var(--border)",
                  background: "rgba(37, 99, 235, 0.08)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                }}
              >
                {(profile?.full_name || "U").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  {profile?.full_name || session?.user?.email || t("profile")}
                </div>
                {session?.user?.email && <div className="small">{session.user.email}</div>}
              </div>
            </div>

            <div className="kv">
              <div className="kvRow">
                <div className="kvLabel">{t("role")}</div>
                <div className="kvValue">{roleLabel}</div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">{t("faceId")}</div>
                <div className="kvValue">{faceEnabled ? t("faceEnabled") : t("faceDisabled")}</div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">{t("samples")}</div>
                <div className="kvValue">{embeddings.length}</div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap mt-4">
              <span className="pill">{t("roleBadge", { role: roleLabel })}</span>
              {hasActiveEmbedding && <span className="pill">{t("faceSampleReady")}</span>}
              {livenessPassed && <span className="pill">{t("livenessPassed")}</span>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="card cardPad">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-lg font-extrabold">{t("faceSetup")}</div>
                <div className="small mt-1.5">{t("faceRegisterHint")}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className="btn btnPrimary" onClick={startCamera} disabled={isModelLoading || isBusy || isCameraOn}>
                  {isModelLoading ? t("loadingModels") : t("startCamera")}
                </button>
                <button className="btn" onClick={stopCamera} disabled={!isCameraOn || isBusy}>
                  {t("stopCamera")}
                </button>
              </div>
            </div>

            <div className="auth-camera mt-4">
              <video ref={videoRef} className="rounded-xl w-full h-full object-cover" />
              {!isCameraOn && (
                <div className="text-center">
                  <div className="text-4xl">📷</div>
                  <div className="font-extrabold mt-1.5">{t("cameraPreview")}</div>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="small">{t("samplesGoal", { count: targetSamples })}</div>
                <div className="small">{t("samplesCaptured", { count: embeddings.length })}</div>
              </div>
              <div className="progress mt-2" aria-label="Capture progress">
                <div className="progressFill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>

            <div className="grid gap-2 mt-4 sm:grid-cols-2">
              <button className="btn" onClick={runLivenessCheck} disabled={!isCameraOn || isBusy}>
                {t("runLiveness")}
              </button>
              <button className="btn" onClick={captureEmbedding} disabled={!isCameraOn || isBusy}>
                {isBusy ? t("working") : t("captureEmbedding")}
              </button>
              <button className="btn" onClick={resetEmbeddings} disabled={embeddings.length === 0 || isBusy}>
                {t("resetSamples")}
              </button>
              <button className="btn btnPrimary" onClick={saveEmbedding} disabled={!averageEmbedding || isBusy}>
                {t("saveEmbedding")}
              </button>
            </div>

            {status && <div className="small mt-3">{status}</div>}
            {error && <div className="small mt-3 text-[color:var(--primary)]">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
