const assert=require("node:assert/strict");
const path=require("node:path");
const {chromium,webkit}=require("playwright");
const routines=require("../js/client-workout-routines");
const root=path.resolve(__dirname,"..");
(async()=>{
for (const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try {
  const page=await browser.newPage({viewport:{width:320,height:740},isMobile:true,hasTouch:true});
  const requests=[];
  await page.route("**/*",route=>{
   const url=new URL(route.request().url()); requests.push(url.href);
   if(url.hostname!=="fixture.test")return route.abort();
   if(url.pathname==="/") return route.fulfill({contentType:"text/html",body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
   <main style="margin:10px;font:16px system-ui">${routines.markup(s=>String(s).replaceAll("&","&amp;"))}</main>`});
   if(/^\/images\/routines\/[a-z0-9-]+\.webp$/.test(url.pathname)) return route.fulfill({path:path.join(root,url.pathname.slice(1)),contentType:"image/webp"});
   return route.abort();
  });
  await page.goto("https://fixture.test/");
  await page.addStyleTag({path:path.join(root,"css/client-explore-routines.css")});
  const section=page.getByRole("region",{name:"At-home routines"});
  await section.scrollIntoViewIfNeeded();
  const cards=section.locator("details");
  assert.equal(await cards.count(),4);
  await page.waitForFunction(()=>[...document.querySelectorAll(".client-at-home-card img")].every(img=>img.complete&&img.naturalWidth>0));
  const areas=await cards.evaluateAll(cards=>cards.map(c=>{const t=c.querySelector("summary"),r=t.getBoundingClientRect(),i=c.querySelector("img").getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,w:r.width,iw:i.width,over:t.scrollWidth-t.clientWidth};}));
  assert.equal(areas[0].y,areas[1].y); assert.equal(areas[2].y,areas[3].y);
  assert.ok(areas[0].right<areas[1].x&&areas[0].y<areas[2].y);
  assert.ok(areas.every(x=>x.right<=320&&x.x>=0&&x.over<=1&&x.iw>=x.w-1));
  for (let i=0;i<4;i++){
   const card=cards.nth(i); await card.locator("summary").click();
   assert.ok(await card.getByRole("button",{name:"Open workout"}).isVisible());
   const id=await card.getByRole("button",{name:"Open workout"}).getAttribute("data-client-explore-routine");
   assert.equal(routines.find(id).exercises.length,[4,5,5,6][i]);
   assert.ok(await card.getByRole("button",{name:/View .* guide/}).first().isVisible());
   await card.locator("summary").click();
  }
  assert.ok(requests.every(url=>url.startsWith("https://fixture.test/")));
  console.log(engine.name(),"320px four at-home cards, artwork and workout/guide routing passed");
 } finally { await browser.close(); }
}
})().catch(e=>{console.error(e);process.exitCode=1});
