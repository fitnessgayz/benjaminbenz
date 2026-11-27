(() => {
  const runtimeUrl = new URL("./vendor/spotter-screening/runtime-v1.js", document.currentScript.src);
  let runtime;

  async function screen(image) {
    if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth) {
      throw new Error("Photo screening needs a decoded image");
    }

    runtime ??= import(runtimeUrl).catch((error) => {
      runtime = undefined;
      throw error;
    });
    const classifier = await runtime;
    return classifier.screen(image);
  }

  window.FWBSpotterScreening = { screen };
})();
