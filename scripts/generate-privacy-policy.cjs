// The hosted HTML and the offline in-app policy share the same source.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function plain(html) {
  return html.replace(/<br\s*\/?>/gi, "\0").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").replace(/\0/g, "\n").trim();
}
function runs(html) {
  const result = [];
  let cursor = 0;
  for (const match of html.matchAll(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    if (!["https:", "mailto:"].includes(new URL(match[1]).protocol)) throw new Error("Unsupported policy link");
    result.push({ text: plain(html.slice(cursor, match.index)) + " " });
    result.push({ text: plain(match[2]), href: match[1] });
    cursor = match.index + match[0].length;
  }
  const tail = plain(html.slice(cursor));
  if (tail) result.push({ text: (cursor ? " " : "") + tail });
  return result.filter(run => run.text.trim());
}
function paragraphs(html) {
  return [...html.matchAll(/<(p|address)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => runs(match[2]));
}
function generatePolicy(html, publicUrl) {
  if (new URL(publicUrl).protocol !== "https:") throw new Error("Privacy policy URL must use HTTPS");
  const header = html.match(/<header>([\s\S]*?)<\/header>/)[1];
  const date = plain(header.match(/<time[^>]*>([\s\S]*?)<\/time>/)[1]);
  const intro = paragraphs(header.replace(/<p class="date">[\s\S]*?<\/p>/, ""));
  intro.push(runs(html.match(/<p class="summary">([\s\S]*?)<\/p>/)[1]));
  const sections = [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(match => ({
    title: plain(match[1].match(/<h2[^>]*>([\s\S]*?)<\/h2>/)[1]),
    paragraphs: paragraphs(match[1]),
  }));
  if (sections.length !== 11 || sections.some(s => !s.paragraphs.length)) throw new Error("Incomplete privacy policy");
  return { date, publicUrl, intro, sections };
}
function main() {
  const config = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const policy = generatePolicy(fs.readFileSync(path.join(root, "privacy-policy.html"), "utf8"), config.expo.extra.privacyPolicyUrl);
  fs.writeFileSync(path.join(root, "src/data/privacy-policy.json"), JSON.stringify(policy, null, 2) + "\n");
  console.log("Generated complete offline privacy policy from privacy-policy.html.");
}
module.exports = { generatePolicy };
if (require.main === module) main();
