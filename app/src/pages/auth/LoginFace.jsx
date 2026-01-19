import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabaseClient.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { createDetectorOptions, ensureFaceModelsLoaded, getFaceApi } from "../../lib/faceApi.js";

export default function LoginFace() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceApiRef = useRef(null);
  const detectorOptionsRef = useRef(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [embeddings, setEmbeddings] = useState([]);
  const [livenessPassed, setLivenessPassed] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadModels = async () => {
      try {
        await ensureFaceModelsLoaded({ modelUrl: "/models" });
        faceApiRef.current = await getFaceApi();
        detectorOptionsRef.current = await createDetectorOptions();
        if (isMounted) setIsModelLoading(false);
      } catch (err) {
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
    } catch (err) {
      setError(t("cameraError"));
    }
  };

  const captureFrame = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    const vw = videoRef.current.videoWidth || 0;
    const vh = videoRef.current.videoHeight || 0;
    if (!vw || !vh) return null;

    const maxWidth = 320;
    const scale = Math.min(1, maxWidth / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg");
  };

  const runRemoteLiveness = async (challenge) => {
    const frames = [];
    for (let i = 0; i < 8; i += 1) {
      const frame = captureFrame();
      if (frame) frames.push({ image_base64: frame });
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    if (frames.length < 8) {
      setError(t("faceNotFound"));
      return false;
    }

    try {
      const url = import.meta.env.VITE_LIVENESS_URL || "http://localhost:8001/liveness";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, challenge }),
      });
      if (!response.ok) {
        setError(t("livenessServiceUnavailable"));
        return false;
      }
      const data = await response.json();
      const isLive = data?.status === "live";
      setLivenessPassed(isLive);
      setStatus(isLive ? t("livenessPassed") : t("livenessFailed"));
      return isLive;
    } catch (_err) {
      setError(t("livenessServiceUnavailable"));
      return false;
    }
  };

  const captureDescriptor = async () => {
    const faceapi = faceApiRef.current;
    const detectorOptions = detectorOptionsRef.current;
    if (!faceapi || !detectorOptions) return null;
    if (!videoRef.current) return null;

    const detection = await faceapi
      .detectSingleFace(videoRef.current, detectorOptions)
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      return null;
    }

    return Array.from(detection.descriptor);
  };

  const captureEmbedding = async () => {
    setError("");
    setStatus("");
    if (!videoRef.current) return;
    // Liveness check temporarily disabled.
    setIsBusy(true);
    try {
      const descriptor = await captureDescriptor();
      if (!descriptor) {
        setError(t("faceNotFound"));
        setIsBusy(false);
        return;
      }
      setEmbeddings((prev) => [...prev, descriptor]);
      setStatus(t("embeddingReady"));
    } catch (err) {
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

    setStatus(t("embeddingSaved"));
    setIsBusy(false);
  };

  const matchEmbedding = async () => {
    if (!averageEmbedding) {
      setError(t("embeddingMissing"));
      return;
    }
    setError("");
    setStatus("");
    setIsBusy(true);

    const { data, error: invokeError } = await supabase.functions.invoke("match-face", {
      body: {
        embedding: averageEmbedding,
        claimed_user_id: session?.user?.id || null,
        redirect_to: `${window.location.origin}/profile`,
      },
    });

    if (invokeError) {
      setError(t("matchUnavailable"));
      setIsBusy(false);
      return;
    }

    if (data?.matched && data?.token_hash) {
      const { error: authError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.token_hash,
      });
      if (!authError) {
        navigate("/profile");
        return;
      }
    }

    if (data?.matched && data?.action_link) {
      window.location.href = data.action_link;
      return;
    }

    if (data?.matched) {
      setStatus(t("matchSuccess"));
    } else {
      setStatus(t("matchFailed"));
    }
    setIsBusy(false);
  };

  const handleFaceLogin = async () => {
    setError("");
    setStatus("");
    if (isBusy) return;
    setIsBusy(true);

    try {
      if (!isCameraOn) {
        await startCamera();
      }

      if (!videoRef.current) {
        setError(t("cameraError"));
        setIsBusy(false);
        return;
      }

      let isLive = await runRemoteLiveness("head_turn");
      if (!isLive) {
        isLive = await runRemoteLiveness("mouth_open");
      }
      if (!isLive) {
        setIsBusy(false);
        return;
      }

      let nextEmbeddings = embeddings;
      let nextAverage = averageEmbedding;

      if (!nextAverage) {
        const descriptor = await captureDescriptor();
        if (!descriptor) {
          setError(t("faceNotFound"));
          setIsBusy(false);
          return;
        }
        nextEmbeddings = [...embeddings, descriptor];
        setEmbeddings(nextEmbeddings);
        const length = descriptor.length;
        const sums = new Array(length).fill(0);
        nextEmbeddings.forEach((vector) => {
          vector.forEach((value, index) => {
            sums[index] += value;
          });
        });
        nextAverage = sums.map((sum) => sum / nextEmbeddings.length);
      }

      const { data, error: invokeError } = await supabase.functions.invoke("match-face", {
        body: {
          embedding: nextAverage,
          claimed_user_id: session?.user?.id || null,
          redirect_to: `${window.location.origin}/profile`,
        },
      });

      if (invokeError) {
        setError(t("matchUnavailable"));
        setIsBusy(false);
        return;
      }

      if (data?.matched && data?.token_hash) {
        const { error: authError } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: data.token_hash,
        });
        if (!authError) {
          navigate("/profile");
          return;
        }
      }

      if (data?.matched && data?.action_link) {
        window.location.href = data.action_link;
        return;
      }

      setStatus(data?.matched ? t("matchSuccess") : t("matchFailed"));
    } catch (_err) {
      setError(t("matchUnavailable"));
    } finally {
      setIsBusy(false);
    }
  };

  const resetEmbeddings = () => {
    setEmbeddings([]);
    setLivenessPassed(false);
    setStatus("");
    setError("");
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

  return (
    <>
      <div className="auth-title">{t("faceLogin")}</div>
      <div className="small mt-1.5">{t("faceHint")}</div>

      <div className="auth-camera mt-4">
        <video ref={videoRef} className="rounded-xl w-full h-full object-cover" />
        {!isCameraOn && (
          <div className="text-center">
            <div className="text-4xl">📷</div>
            <div className="font-extrabold mt-1.5">{t("cameraPreview")}</div>
          </div>
        )}
      </div>

      <div className="grid gap-2 mt-3">
        <button className="btn btnPrimary" onClick={handleFaceLogin} disabled={isModelLoading || isBusy}>
          {isModelLoading ? t("loadingModels") : t("faceLogin")}
        </button>
      </div>

      {embeddings.length > 0 && (
        <div className="small mt-2">
          {t("samplesCaptured", { count: embeddings.length })}
        </div>
      )}
      {status && <div className="small mt-2.5">{status}</div>}
      {error && <div className="small mt-2.5 text-[color:var(--primary)]">{error}</div>}

      <div className="small mt-3">
        {t("or")}{" "}
        <Link to="/auth/login" className="text-[color:var(--primary)] font-semibold">
          {t("useEmail")}
        </Link>
      </div>
    </>
  );
}
