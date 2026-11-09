const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "app.json");
const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
const parts = app.expo.version.split(".").map(Number);
if (parts.length !== 3 || parts.some(n => !Number.isInteger(n) || n < 0)) throw new Error("Expected a numeric major.minor.patch version");
if (!Number.isInteger(app.expo.android.versionCode)) throw new Error("Missing Android version code");
parts[2]++;
app.expo.version = parts.join(".");
app.expo.android.versionCode++;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + "\n");
for (const filename of ["package.json", "package-lock.json"]) {
  const file = path.join(root, filename);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = app.expo.version;
  if (pkg.packages) pkg.packages[""].version = app.expo.version;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
const readme = path.join(root, "README.md");
if (fs.existsSync(readme)) fs.writeFileSync(readme, fs.readFileSync(readme, "utf8")
  .replace(/Version: \d+\.\d+\.\d+ \(\d+\)\./, `Version: ${app.expo.version} (${app.expo.android.versionCode}).`));
console.log(`New Google Play build: ${app.expo.version} (${app.expo.android.versionCode})`);
