// The YouTube description for the film: what is real, and the credits the film no longer carries (the CC BY-SA photos
// need their attribution somewhere the video is published).   node capture/yt-description.mjs → submission/YOUTUBE-DESCRIPTION.md
import fs from "node:fs";
const { photos } = JSON.parse(fs.readFileSync(new URL("../out/credits.json", import.meta.url), "utf8"));
const lines = [...new Set(photos.filter((x) => x.license !== "CC0").map((x) => `- "${decodeURIComponent(x.source.split("File:")[1]).replace(/_/g, " ")}" by ${x.author}, ${x.license} (${x.licenseUrl}): ${x.source}`))];
const txt = `VeriPay: the money waits for the proof.

PayPal holds the money without charging it, our AI checks the finished work, and the pro is paid the moment every condition passes. Built for the PayPal AI Hackathon 2026.

What you see: the VeriPay website on the PayPal sandbox (test money). Demo customers and pros are fictional. The chat scene shows the VeriPay bot's own replies, with demo data. The "vision" scene is not built yet. The test-lab scene replays recorded test runs (Nov 4–6, before the name VeriPay). Model scores come from held-out synthetic test sets.

Models: done-chat and done-audit (Qwen3-0.6B, fine-tuned; teacher Muse Glimmer 30B, open) · done-vlm (SmolVLM2-500M, off the shelf, Apache 2.0) · Done-OCR · Done-Risk. Voice: Kokoro 82M (Apache 2.0).

Credits
Photos from Wikimedia Commons, re-dated to the demo jobs, otherwise unchanged:
${lines.join("\n")}
Music: "House Vibez" by Lily J (Mixkit Stock Music Free License).
Sound effects: Freesound, CC0 (I.fekry, ristooooo1, Pixeliota, jdaniel1999, xkeril, florianreichelt, BeaconStudio, Rizzard, nomiqbomi).
`;
fs.writeFileSync(new URL("../../submission/YOUTUBE-DESCRIPTION.md", import.meta.url), txt);
console.log(lines.length, "photo credits");
