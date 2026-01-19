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
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl);
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
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });
};

