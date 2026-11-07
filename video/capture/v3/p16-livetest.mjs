// Phase 16 (film v5): the test-rounds page again, in the current interface (its title says VeriPay now).
import { launch, page, settle, shot, B } from "./lib3.mjs";
const b = await launch(); const lt = await page(b);
await lt.goto(B + "/live-test/", { waitUntil: "networkidle0" }); await lt.addStyleTag({ content: "main > p.lede { display: none !important; }" }); await settle(lt, 1500); await shot(lt, "s11-livetest");
await lt.evaluate(() => { const c = document.querySelector(".panel"); scrollTo(0, c.getBoundingClientRect().top + scrollY - 30); }); await settle(lt, 800); await shot(lt, "s11-livetest-chart");
await b.close();
