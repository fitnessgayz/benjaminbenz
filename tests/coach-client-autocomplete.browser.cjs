// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/coach-client-autocomplete.browser.cjs
// PLAYWRIGHT_BROWSER=webkit checks iPhone Safari's touch events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../js/coach-admin.js'), 'utf8');
function production(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
const functions = [
  'normalizeEmail', 'programsForCurrentClientView', 'matchingClientSuggestions',
  'activeClientPrograms', 'archivedClientPrograms', 'renderClientSuggestions',
  'closeClientSuggestions', 'selectClientSuggestion', 'handleClientSearch'
].map(production).join('\n');
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:16px sans-serif;padding:30px;background:#071d15;color:white}
#client-autocomplete{position:relative} input{width:100%;height:48px;font-size:16px}
#client-suggestions{position:absolute;top:50px;left:0;right:0;z-index:5;margin:0;padding:0;list-style:none;background:#102b50}
#client-suggestions[hidden]{display:none} #client-suggestions li{display:grid;gap:4px;padding:16px}
</style></head><body><div id="client-autocomplete"><input id="client-search-input" role="combobox" aria-controls="client-suggestions"><ul id="client-suggestions" role="listbox" hidden></ul></div><p id="client-selector-status"></p><h2 id="selected-client-name">Choose a client</h2><script>
let programs = [{id:'one',client_name:'Esmerlin Frias',client_email:'efrias.321@gmail.com',active:true}];
let clientSearchTerm='',clientSuggestionsOpen=false,activeClientSuggestion=-1,showingArchivedClients=false;
let selectedProgramId=''; window.__events=[]; window.__selected='';
function fillForm(program){window.__selected=program.id;document.getElementById('selected-client-name').textContent=program.client_name}
function renderClientList(){} function setAdminTab(tab){window.__tab=tab} function adminStatus(){}
${functions}
handleClientSearch();
['pointerdown','pointerup','click','touchstart','touchend'].forEach(type => document.addEventListener(type,e=>window.__events.push(type+':'+e.target.tagName+':'+(e.target.dataset.programId||'')),true));
</script></body></html>`;
(async()=>{
 const browserName=process.env.PLAYWRIGHT_BROWSER || 'chromium';
 const engine={chromium,webkit}[browserName];
 assert.ok(engine, `Unsupported browser ${browserName}`);
 const browser=await engine.launch({headless:true});
 try {
  for (const interaction of ['touch', 'mouse', 'keyboard']) {
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:interaction==='touch',hasTouch:interaction==='touch',deviceScaleFactor:3});
   await page.setContent(html);
   await page.locator('#client-search-input').fill('Esmerlin');
   if (interaction==='touch') await page.locator('#client-suggestions li').tap();
   else if (interaction==='mouse') await page.locator('#client-suggestions li').click();
   else {
    await page.locator('#client-search-input').press('ArrowDown');
    await page.locator('#client-search-input').press('Enter');
   }
   const result=await page.evaluate(()=>({selected:window.__selected,tab:window.__tab,heading:document.querySelector('#selected-client-name').textContent,events:window.__events}));
   assert.equal(result.selected,'one',`${browserName} ${interaction} selection: ${JSON.stringify(result.events)}`);
   assert.equal(result.heading,'Esmerlin Frias');
   assert.equal(result.tab,'clients');
   await page.close();
   process.stdout.write(`${browserName} ${interaction}: client selected\n`);
  }
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
