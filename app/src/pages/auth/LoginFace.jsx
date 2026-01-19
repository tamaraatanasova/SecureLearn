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

  // NEW: prevent duplicate frames (single-image bypass)
  const lastFrameRef = useRef(null);

  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [embeddings, setEmbeddings] = useState([]);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [error, setError] = useState("");

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

  const startCamera = async () => {
    setError("");
    if (isCameraOn) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // wait a bit so videoWidth/videoHeight becomes available
        await new Promise((r) => setTimeout(r, 200));
      }

      setIsCameraOn(true);
    } catch (_err) {
      setError(t("cameraError"));
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return null;

    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) return null;

    const canvas = document.createElement("canvas");

    const maxWidth = 320;
    const scale = Math.min(1, maxWidth / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // reduce size + stabilize; also makes backend faster
    const dataUrl = canvas.toDataURL("image/jpeg", 0.75);

    // NEW: duplicate guard (prevents 8 identical frames)
    if (lastFrameRef.current === dataUrl) return null;
    lastFrameRef.current = dataUrl;

    return dataUrl;
  };

  const runRemoteLiveness = async (challenge) => {
    setError("");
    setStatus("");
    setLivenessPassed(false);

    // collect 8 VALID frames with a small timeout
    const frames = [];
    const deadline = Date.now() + 2500;

    while (frames.length < 8 && Date.now() < deadline) {
      const frame = captureFrame();
      if (frame) frames.push({ image_base64: frame });
      // slower capture helps temporal checks & reduces duplicates
      // (your backend now checks motion/static)
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 120));
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
        body: JSON.stringify({ frames, challenge, debug: false }),
      });

      if (!response.ok) {
        setError(t("livenessServiceUnavailable"));
        return false;
      }

      const data = await response.json();
      const isLive = data?.status === "live";

      setLivenessPassed(isLive);

      if (isLive) {
        setError("");
        setStatus(data?.message || t("livenessPassed"));
      } else {
        setStatus("");
        setError(data?.message || t("livenessFailed"));
      }

      return isLive;
    } catch (_err) {
      setError(t("livenessServiceUnavailable"));
      return false;
    }
  };

  const captureDescriptor = async () => {
    const faceapi = faceApiRef.current;
    const detectorOptions = detectorOptionsRef.current;
    const video = videoRef.current;

    if (!faceapi || !detectorOptions || !video) return null;

    let detection = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      detection = await faceapi
        .detectSingleFace(video, detectorOptions)
        .withFaceLandmarks(false)
        .withFaceDescriptor();

      if (detection) break;

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    if (!detection) return null;
    return Array.from(detection.descriptor);
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

  const handleFaceLogin = async () => {
    setError("");
    setStatus("");
    if (isBusy) return;

    setIsBusy(true);

    try {
      if (!isCameraOn) await startCamera();
      if (!videoRef.current) {
        setError(t("cameraError"));
        setIsBusy(false);
        return;
      }

      // IMPORTANT: reset duplicate guard each attempt
      lastFrameRef.current = null;

      // 1) Liveness first
      let isLive = await runRemoteLiveness("head_turn");
      if (!isLive) isLive = await runRemoteLiveness("mouth_open");
      if (!isLive) {
        setIsBusy(false);
        return;
      }

      // 2) Descriptor after liveness (so photos don't get here)
      let nextAverage = averageEmbedding;

      if (!nextAverage) {
        const descriptor = await captureDescriptor();
        if (!descriptor) {
          setError(t("faceNotFound"));
          setIsBusy(false);
          return;
        }
        const nextEmbeddings = [...embeddings, descriptor];
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

      // 3) Match face
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
