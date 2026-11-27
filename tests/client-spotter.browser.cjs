const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const site = path.resolve(__dirname, "..");
const host = "https://gruntr.example.test";
const user = { id: "web-client", email: "client@example.test" };
const partner = {
  id: "07c11fc1-586c-40dd-944b-ff7792e6640f",
  name: "Taylor <member>",
  goals: ["Build strength"],
  availability: ["Weekday mornings"],
  preferences: ["Accountability"],
  gender: "woman",
  about: "Safety-first gym sessions.",
  portrait_path: null
};
const activeProfile = { active: true, name: "Synthetic client", goals: [], preferences: [], availability: [], zip: "94103" };

async function useFixtures(page, profile, signedIn = true) {
  await page.addInitScript(({ account, partner, profile, signedIn }) => {
    window.spotterFixture = { calls: [], profile, signedIn, members: [partner] };
    const holder = window.spotterFixture;
    const session = { access_token: "synthetic", user: account };
    const auth = {
      getSession: async () => ({ data: { session: holder.signedIn ? session : null }, error: null }),
      refreshSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: holder.signedIn ? account : null }, error: null }),
      onAuthStateChange: fn => { holder.authChange = fn; }
    };
    window.fixtureSupabase = { createClient: () => ({
      auth,
      storage: { from() { return { download: async () => ({ error: { status: 404 } }) }; } },
      async rpc(name, args) {
        holder.calls.push({ name, args });
        switch (name) {
          case "spotter_get_profile": return { data: holder.profile };
          case "spotter_discover_filtered": return { data: holder.members };
          case "spotter_profile_details": return { data: { body_type: "mixed", current_program: "Strength 3× a week", photos: [
            { slot: 1, path: "private/under-review.jpg", status: "pending" }
          ] } };
          case "spotter_connect": holder.members = []; return { data: true };
          case "spotter_connections": return { data: [] };
          case "spotter_group_cities": return { data: { default_city: { id: "sf", name: "San Francisco", region: "CA", country: "US" }, cities: [] } };
          case "spotter_local_clubs": return { data: [{ id: "running", member_count: 2, joined: false }] };
          case "spotter_joined_city_clubs": return { data: [] };
          default: return { error: { message: "Unexpected fixture RPC " + name } };
        }
      }
    }) };
  }, { account: user, partner, profile, signedIn });

  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("supabase")) {
      return route.fulfill({ contentType: "text/javascript", body: "window.supabase = window.fixtureSupabase;" });
    }
    if (url.origin !== host) return route.abort();
    if (url.pathname === "/test-appearance") {
      return route.fulfill({ contentType: "text/html", body: [
        '<script src="/js/client-theme.js"></script>',
        '<label><input type="radio" name="client-theme" value="light">Light</label>',
        '<label><input type="radio" name="client-theme" value="dark">Dark</label>'
      ].join("") });
    }
    if (url.pathname === "/client-login.html") return route.fulfill({ contentType: "text/html", body: "<h1>Sign in</h1>" });
    const file = path.join(site, url.pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
      ".jpg": "image/jpeg", ".png": "image/png", ".webmanifest": "application/manifest+json" };
    return route.fulfill({ path: file, contentType: types[path.extname(file)] || "text/plain" });
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.GRUNTR_BROWSER, headless: true });
  try {
    for (const [width, theme] of [[320, "light"], [1200, "dark"]]) {
      const page = await browser.newPage({ viewport: { width, height: 840 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await useFixtures(page, activeProfile);
      await page.goto(host + "/test-appearance");
      await page.getByLabel(theme === "light" ? "Light" : "Dark").check();
      await page.goto(host + "/client-spotter.html");
      const heading = value => page.getByRole("heading", { name: value, exact: true });
      const button = value => page.getByRole("button", { name: value, exact: true });
      await heading(partner.name).waitFor();
      assert.equal(await page.locator("html").getAttribute("data-client-theme"), theme);
      assert.equal(await page.getByLabel("Light").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await button("View profile").click();
      await page.getByText("Strength 3× a week", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Report photo" }).count(), 0);
      await button("Close").click();
      await button("Next").click();
      await heading("Mateo").waitFor();
      await button("Previous").click();
      await heading(partner.name).waitFor();
      await button("Filters").click();
      await page.getByLabel("Partner gender").selectOption("woman");
      await button("Apply filters").click();
      await button("Next").click();
      await heading("Janelle").waitFor();
      await button("Previous").click();
      await button("Connect").click();
      await page.getByText("Connection request sent.", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => spotterFixture.calls.filter(call => call.name === "spotter_connect").length), 1);
      await button("Groups").click();
      await heading("San Francisco Run Club").waitFor();
      await button("Matches").click();
      await heading("Matches").waitFor();
      await button("Profile").click();
      await heading("Synthetic client").waitFor();
      await button("Discover").click();
      await button("Profile").click();
      await heading("Synthetic client").waitFor();
      await button("Inbox").click();
      await heading("Inbox").waitFor();
      if (width === 320) {
        await page.addStyleTag({ content: "html { font-size: 200%; }" });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.deepEqual(errors, []);
      console.log("PASS Spotter controls, identity, privacy projections and " + theme + " theme at " + width + " px");
      await page.close();
    }

    const welcome = await browser.newPage();
    await useFixtures(welcome, null);
    await welcome.goto(host + "/client-spotter.html#inbox");
    await welcome.getByRole("button", { name: "Sign up for Spotter" }).click();
    assert.equal(await welcome.getByRole("button", { name: "Agree and continue" }).isDisabled(), true);
    assert.deepEqual(await welcome.evaluate(() => spotterFixture.calls.map(call => call.name)), ["spotter_get_profile"]);

    const signedOut = await browser.newPage();
    await useFixtures(signedOut, null, false);
    await signedOut.goto(host + "/client-spotter.html#groups");
    await signedOut.waitForURL("**/client-login.html?return_to=*");
    assert.equal(new URL(signedOut.url()).searchParams.get("return_to"), "/client-spotter.html#groups");
    console.log("PASS Spotter consent gate and login return path");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
