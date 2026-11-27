import { ready } from "@tensorflow/tfjs";
import { NSFWJS } from "nsfwjs/core";
import { MobileNetV2Model } from "nsfwjs/models/mobilenet_v2";

const imageSize = 224;
let classifier;

async function createClassifier() {
  const [{ default: graph }, { default: weightShard }] = await Promise.all([
    MobileNetV2Model.modelJson(),
    MobileNetV2Model.weightBundles[0](),
    ready(),
  ]);
  // This model has one shard. Supplying it in memory prevents a network fallback.
  const [manifest] = graph.weightsManifest;
  if (graph.weightsManifest.length !== 1 || manifest.paths.length !== 1) {
    throw new Error("Unexpected Spotter screening model");
  }

  const binary = atob(weightShard);
  const weights = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    weights[index] = binary.charCodeAt(index);
  }

  const model = new NSFWJS({
    async load() {
      return {
        modelTopology: graph.modelTopology,
        weightSpecs: manifest.weights,
        weightData: weights.buffer,
      };
    },
  }, { size: imageSize });
  try {
    await model.load();
    return model;
  } catch (error) {
    model.dispose();
    throw error;
  }
}

export async function screen(image) {
  classifier ??= createClassifier().catch((error) => {
    classifier = undefined;
    throw error;
  });
  const model = await classifier;

  // Keep the full picture in view and cap the tensor size before running inference.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = imageSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo screening needs canvas support");
  context.drawImage(image, 0, 0, imageSize, imageSize);
  const predictions = await model.classify(canvas);
  const probabilities = new Map(predictions.map(({ className, probability }) => [className, probability]));
  const [porn, hentai, sexy] = ["Porn", "Hentai", "Sexy"].map((label) => probabilities.get(label));
  if (![porn, hentai, sexy].every((score) => Number.isFinite(score) && score >= 0 && score <= 1)) {
    throw new Error("Unexpected photo screening result");
  }

  // These routing thresholds prioritize review. The scores are not proof of nudity.
  const explicit = porn + hentai;
  if (explicit >= 0.60) return "flagged";
  if (explicit + sexy >= 0.20) return "uncertain";
  return "no_signal";
}
