const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".jpg":"image/jpeg", ".webp":"image/webp" };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const filename = path.join(root, pathname === "/" ? "index.html" : pathname);
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) ||
      !fs.statSync(filename).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("Content-Type", mime[path.extname(filename)] || "application/octet-stream");
  fs.createReadStream(filename).pipe(response);
});

async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const data = JSON.parse(fs.readFileSync(path.join(root,"pyroscale_data.json")));
  const forecast = JSON.parse(fs.readFileSync(path.join(root,"pyroscale_forecast.json")));
  const hasForecast = forecast.status === "evaluated";
  const hasNOAA20 = data.coverage["NOAA-20"].some(m=>m.complete_daily_archive);
  const browser = await chromium.launch({
    executablePath: process.env.PYROSCALE_CHROMIUM || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"]
  });
  const errors = [];
  async function newPage(options={}) {
    const page = await browser.newPage({viewport:{width:1280,height:790}, ...options});
    page.on("pageerror", error => {
      errors.push(error.message);
      console.error(error.stack);
    });
    page.on("response", res => {
      if (res.status() >= 400 && res.url().startsWith(origin)) console.error(res.status(),res.url());
    });
    page.on("console", message => {
      if (message.type() === "warning" && !message.text().includes("ReadPixels"))
        console.error(message.text());
    });
    await page.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    return page;
  }
  const tab = (page,key) => page.locator(`#tabs [data-t="${key}"]`).click();
  const open = async (page, url) => {
    await page.goto(origin+url);
    await page.locator("#globe-picker button").click();
    await page.locator("#gl canvas").waitFor();
  };
  try {
    const page = await newPage();
    await page.goto(origin);
    assert.equal(await page.locator("#team-members h3").count(), 6);
    await page.locator("#launch").click();
    await page.locator("#globe-picker button").click();
    await page.locator("#gl canvas").waitFor();
    await page.waitForFunction(() => document.querySelector("#tg").textContent.includes("NASA FIRMS archive"));
    assert.ok((await page.locator("#gl canvas").getAttribute("aria-label")).includes("arrow keys"));
    await page.locator("#map-legend").click();
    assert.equal(await page.locator("#lgd").isVisible(), false);
    await page.locator("#map-legend").click();
    await page.locator("#map-region").selectOption({label:"Southern Africa"});
    await page.locator("#zoom-in").click();
    await page.locator("#zoom-out").click();
    await page.locator("#gr").click();
    await page.locator(".map-style-menu summary").click();
    await page.locator('input[name="basemap"][value="mono"]').check();
    await page.locator(".map-style-menu summary").click();
    await page.locator("#map-draw").click();
    assert.equal(await page.locator("#map-draw").getAttribute("aria-pressed"),"true");
    await page.locator("#gl canvas").click({position:{x:640,y:395},force:true});
    assert.equal(await page.locator("#pre").inputValue(),"0");
    await page.locator("#panel-draw").click();
    await page.locator("#w").fill("170");
    await page.locator("#w").dispatchEvent("change");
    await page.locator("#e").fill("-170");
    await page.locator("#e").dispatchEvent("change");
    assert.equal(await page.evaluate(()=>centerLon(st.b[2],st.b[3])), -180);
    await page.locator("#pre").selectOption({label:"Global"});
    await tab(page,"x");
    await page.locator('label:has(input[name="dm"][value="m"])').click();
    assert.match(await page.locator("#ct").textContent(), /Terra/);
    await page.locator('label:has(input[name="dm"][value="v"])').click();
    await page.locator('label:has(input[name="cm"][value="a"])').click();
    assert.match(await page.locator("#lg").textContent(), /median/);
    await page.locator("#ex").click();
    const csv = await page.locator("#ta").inputValue();
    assert.match(csv, /month,terra,suomi_npp,noaa20/);
    assert.ok(!csv.includes("NaN"));
    await page.locator("#cl").click();
    await page.locator("#lw").check();
    await page.waitForFunction(()=>document.querySelector("#wn").textContent.includes("Could not reach Open-Meteo"));
    await page.locator("#lw").uncheck();
    await page.locator("#lx").check();
    await page.waitForFunction(()=>document.querySelector("#wdt").textContent.includes("Could not reach Open-Meteo"));
    await page.locator("#lx").uncheck();
    await tab(page,"c");
    await page.locator("#pq").fill("Pakistan");
    await page.locator("#pr li[data-j]").first().click();
    assert.match(await page.locator("#pch").textContent(), /Pakistan/);
    await page.locator("#pcl").click();
    await tab(page,"d");
    const cell = data.cells.find(c=>c.viirs.some(v=>v>0)||c.noaa20.some(v=>v>0));
    await page.locator("#dlf").setInputFiles({name:"validation-fixture.csv",mimeType:"text/csv",
      buffer:Buffer.from(`latitude,longitude,"<test, data>"\n${cell.lat},${cell.lon},42\n`)});
    await page.waitForFunction(()=>document.querySelector("#dlm").textContent.includes("1 cells"));
    assert.ok(await page.getByText("<test, data> (validation-fixture.csv)",{exact:false}).count());
    await page.locator("#aiq").fill("What is the forecast?");
    await page.locator("#ais").click();
    assert.ok(await page.locator("#aic .a").textContent());
    await tab(page,"f");
    await page.locator("#sr").click();
    if (hasNOAA20) {
      await page.locator("#soc svg").waitFor();
      assert.match(await page.locator("#sot").textContent(), /Illustrative sensitivity/);
      await page.locator("#sp").click();
      await page.locator("#sx").click();
      assert.equal(await page.locator("#so").isVisible(),false);
    } else assert.match(await page.locator("#scenario-status").textContent(), /NOAA-20 history/);
    await page.locator("#head-forecast").click();
    if (hasForecast) {
      assert.match(await page.locator("#model-summary").textContent(), /NOAA-20/);
      await page.locator("#fk").press("End");
      const [year,month] = forecast.start.split("-").map(Number);
      const final = new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric",timeZone:"UTC"})
        .format(new Date(Date.UTC(year,month-1+23,1)));
      assert.equal(await page.locator("#fkv").textContent(),final);
      await page.locator("#forecast-play").click();
      await page.locator("#forecast-play").click();
      const forecastExport = await page.evaluate(()=>exportMap().find(r=>r.projected_detections>=0));
      assert.equal(forecastExport.platform,"NOAA-20");
      assert.ok(forecastExport.method);
      await page.evaluate(()=>selectCell(cells.findIndex(c=>c.f&&c.projection.lo.some(Number.isFinite))));
      if (forecast.cells.some(c=>c.lo.some(Number.isFinite))) await page.locator("#ci polygon").first().waitFor();
      assert.equal(await page.locator("#oc polygon").count(),0);
    } else {
      assert.match(await page.locator("#tf").textContent(), /unavailable/);
      assert.equal(await page.locator("#fkl").isVisible(),false);
    }
    await tab(page,"x");
    await page.locator("#ld").setInputFiles({name:"bad.json",mimeType:"application/json",buffer:Buffer.from('{"kind":"forecast"}')});
    await page.waitForFunction(()=>document.querySelector("#tg").textContent.includes("match"));
    assert.equal(await page.evaluate(()=>datasetId),data.dataset_id);
    await page.close();

    const mobile = await newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await open(mobile,"/explore.html?view=places");
    await mobile.locator("#pq").waitFor();
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await mobile.close();

    const missing = await newPage();
    await missing.route("**/pyroscale_data.json",route=>route.fulfill({status:404}));
    await open(missing,"/explore.html?view=forecast");
    await missing.waitForFunction(()=>document.querySelector("#demo-status").textContent.startsWith("Observations unavailable"));
    assert.equal(await missing.evaluate(()=>cells.length),0);
    assert.equal(await missing.evaluate(()=>FC),null);
    await missing.close();

    const noWebGL = await newPage();
    await noWebGL.addInitScript(()=>{
      const context=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,...options){
        return kind.includes("webgl") ? null : context.call(this,kind,...options);
      };
    });
    await noWebGL.goto(origin+"/explore.html?view=calendar");
    await noWebGL.locator("#globe-picker button").click();
    await noWebGL.locator(".globe-unavailable").waitFor();
    await noWebGL.locator("#cal svg").waitFor();
    await noWebGL.close();
    assert.deepEqual(errors,[]);
    console.log("Browser smoke passed: landing, WebGL, map/draw/filters, calendar, JSON/CSV, places, analyst, scenario, forecast, mobile and data failure.");
  } finally {
    await browser.close();
  }
}

main().catch(error=>{ console.error(error); process.exitCode=1; }).finally(()=>server.close());
