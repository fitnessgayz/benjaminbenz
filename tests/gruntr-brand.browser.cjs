const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createServer } = require("node:http");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const routes = ["client-dashboard.html","client-login.html","client-signup.html","client-invite.html",
  "client-access-request.html","fwb-training-privacy.html","fwb-training-support.html"];
const iconPath = "/images/gruntr/icons/v1/";
const types = { ".webmanifest":"application/manifest+json", ".png":"image/png", ".ico":"image/x-icon", ".html":"text/html; charset=utf-8" };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (!(routes.includes(url.pathname.slice(1)) || url.pathname === "/client.webmanifest" ||
        /^\/images\/gruntr\/icons\/v1\/gruntr(?:-maskable)?(?:-\d+\.png|\.ico)$/.test(url.pathname))) {
    response.writeHead(404).end(); return;
  }
  try {
    const bytes = await fs.readFile(path.join(root, url.pathname));
    response.writeHead(200, { "Content-Type": types[path.extname(url.pathname)], "Content-Length": bytes.length }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
async function check(engine, width, height, origin) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport:{width,height}, isMobile:true, hasTouch:true });
    // In this metadata fixture never execute account scripts or call production endpoints.
    await page.route("**/*", route => route.request().url().startsWith(origin + "/") && route.request().resourceType() !== "script"
      ? route.continue() : route.abort());
    for (const file of routes) {
      await page.goto(origin + "/" + file, {waitUntil:"domcontentloaded"});
      assert.match(await page.title(), /GRUNTR/);
      assert.equal(await page.locator('meta[name="application-name"]').getAttribute("content"),"GRUNTR");
      assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content"),"GRUNTR");
      assert.equal(await page.locator('link[rel="manifest"]').getAttribute("href"),"/client.webmanifest");
      assert.equal(await page.locator('link[rel="icon"][sizes="16x16"]').getAttribute("href"),iconPath+"gruntr-16.png");
      assert.equal(await page.locator('link[rel="apple-touch-icon"][sizes="180x180"]').getAttribute("href"),iconPath+"gruntr-180.png");
    }
    await page.goto(origin + "/client-dashboard.html", {waitUntil:"domcontentloaded"});
    const manifest = await page.evaluate(async () => {
      const response = await fetch(document.querySelector('link[rel="manifest"]').href);
      if (!response.ok || !response.headers.get("content-type").includes("manifest+json")) throw Error("Manifest isn't properly served");
      return response.json();
    });
    assert.equal(manifest.name,"GRUNTR");
    assert.equal(manifest.short_name,"GRUNTR");
    assert.equal(manifest.display,"standalone");
    assert.deepEqual([manifest.id,manifest.start_url,manifest.scope],["/client-dashboard.html","/client-dashboard.html","/"]);
    const images = await page.evaluate(async (icons) => Promise.all(icons.map(async icon => {
      const image = new Image();
      image.src = icon.src;
      await image.decode();
      return [image.naturalWidth,image.naturalHeight];
    })), manifest.icons);
    assert.deepEqual(images,manifest.icons.map(i=>i.sizes.split("x").map(Number)));
    for (const filename of ["gruntr.ico","gruntr-16.png","gruntr-32.png","gruntr-120.png","gruntr-152.png","gruntr-167.png","gruntr-180.png"]) {
      const response=await page.request.get(origin+iconPath+filename);
      assert.ok(response.ok(),filename);
      assert.equal(response.headers()["content-type"],filename.endsWith(".ico")?"image/x-icon":"image/png");
    }
    if (engine.name() === "chromium") {
      const cdp=await page.context().newCDPSession(page);
      const parsed=await cdp.send("Page.getAppManifest");
      assert.equal(JSON.parse(parsed.data).name,"GRUNTR");
      assert.doesNotMatch(JSON.stringify(parsed.errors), /critical.*true/);
    }
    console.log(engine.name(), width, "GRUNTR regular/standalone app metadata and served icons passed");
  } finally { await browser.close(); }
}

(async () => {
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    await check(chromium,393,873,origin);
    await check(webkit,390,844,origin);
  } finally { server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
