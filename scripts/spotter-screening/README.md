# Spotter photo screening

The Coach Approvals page loads the classifier only when screening is requested.
The browser bundle includes the MobileNetV2 image model and weights from the
pinned NSFWJS distribution. Photo decoding and model inference happen in the
Coach browser. The model provides advisory flags for human review.

Run the following from this directory to rebuild the browser bundle.

```sh
npm ci
npm run build
```

The output is `js/vendor/spotter-screening/runtime-v1.js` at the repository root.
Keep its license file alongside it. If the runtime changes, increment its
filename version and update the loader in `js/coach-spotter-screening.js`.
