let faceApiImportPromise = null;
let modelsPromise = null;

export const getFaceApi = async () => {
  if (!faceApiImportPromise) {
    faceApiImportPromise = import("face-api.js");
  }
  return faceApiImportPromise;
};

export const ensureFaceModelsLoaded = async ({ modelUrl = "/models" } = {}) => {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const faceapi = await getFaceApi();
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
      // Use the full 68-landmark model to match the shipped weights in `public/models`.
      await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
      await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
      return true;
    })();
  }
  return modelsPromise;
};

export const preloadFaceModels = () => {
  ensureFaceModelsLoaded().catch(() => {});
};

export const createDetectorOptions = async () => {
  const faceapi = await getFaceApi();
  // Slightly larger input size and lower threshold reduces false "no face detected" rejects.
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
};
