// Deterministic launcher packaging: preserve the complete source and its spacing.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Jimp = require("jimp-compact");
const root = path.resolve(__dirname, "..");
const assets = path.join(root, "assets/icons");

const artifacts = path.join(root, "artifacts");
const artworkSize = 640;
const paddingSize = (1024 - artworkSize) / 2;

async function main() {
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });
  const source = await Jimp.read(path.join(root, "app_icon.jpg"));
  await source.clone().resize(1024, 1024).writeAsync(path.join(root, "assets/icon.png"));
  assert.equal(
    source.bitmap.width,
    source.bitmap.height,
    "Keep source aspect ratio",
  );
  const bg = source.getPixelColor(0, 0);
  const rgb = Jimp.intToRGBA(bg);
  const foreground = new Jimp(1024, 1024, 0x00000000);
  foreground.composite(
    source.clone().resize(artworkSize, artworkSize),
    paddingSize,
    paddingSize,
  );
  assert.deepEqual(
    foreground.clone().crop(paddingSize, paddingSize, artworkSize, artworkSize).bitmap.data,
    source.clone().resize(artworkSize, artworkSize).bitmap.data,
    "Adaptive foreground preserves the complete source artwork",
  );
  const background = new Jimp(1024, 1024, bg);
  // Extract a themed silhouette without trimming or changing source spacing.
  const monoArt = source.clone();
  monoArt.scan(
    0,
    0,
    monoArt.bitmap.width,
    monoArt.bitmap.height,
    function (x, y, i) {
      const d = this.bitmap.data;
      const delta = Math.max(
        Math.abs(d[i] - rgb.r),
        Math.abs(d[i + 1] - rgb.g),
        Math.abs(d[i + 2] - rgb.b),
      );
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (delta - 35) / 35)));
    },
  );
  const monochrome = new Jimp(1024, 1024, 0x00000000);
  monochrome.composite(
    monoArt.resize(artworkSize, artworkSize),
    paddingSize,
    paddingSize,
  );
  await foreground.writeAsync(path.join(assets, "adaptive-foreground.png"));
  await foreground.writeAsync(path.join(root, "assets/adaptive-icon.png"));
  await background.writeAsync(path.join(assets, "adaptive-background.png"));
  await monochrome.writeAsync(path.join(assets, "adaptive-monochrome.png"));
  const composed = background.clone().composite(foreground, 0, 0);
  await source
    .clone()
    .resize(1024, 1024)
    .writeAsync(path.join(assets, "app-icon.png"));
  const themed = new Jimp(1024, 1024, 0xdce8ffff);
  const tint = monochrome.clone();
  tint.scan(0, 0, 1024, 1024, function (x, y, i) {
    this.bitmap.data[i] = 23;
    this.bitmap.data[i + 1] = 50;
    this.bitmap.data[i + 2] = 81;
  });
  themed.composite(tint, 0, 0);
  const preview = new Jimp(1140, 850, 0x202938ff);
  for (const [row, input] of [composed, themed].entries()) {
    const y0 = row === 0 ? 55 : 455;
    for (let n = 0; n < 3; n++) {
      // Resting adaptive viewport is the central 72 dp of each 108 dp layer.
      const tile = input.clone().crop(171, 171, 682, 682).resize(280, 280);
      tile.scan(0, 0, 280, 280, function (x, y, i) {
        const a = Math.abs((x + 0.5 - 140) / 140),
          b = Math.abs((y + 0.5 - 140) / 140);
        const inside =
          n === 0
            ? a * a + b * b <= 1
            : n === 1
              ? a ** 4 + b ** 4 <= 1
              : Math.max(0, Math.abs(x + 0.5 - 140) - 90) ** 2 +
                  Math.max(0, Math.abs(y + 0.5 - 140) - 90) ** 2 <=
                50 ** 2;
        if (!inside) this.bitmap.data[i + 3] = 0;
      });
      preview.composite(tile, 50 + n * 380, y0);
    }
  }
  await preview.writeAsync(path.join(artifacts, "adaptive-icon-previews.png"));
  const padding = new Jimp(1024, 1024, 0x000000ff);
  padding.scan(0, 0, 1024, 1024, function (x, y, i) {
    const v = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? 215 : 241;
    this.bitmap.data[i] = this.bitmap.data[i + 1] = this.bitmap.data[i + 2] = v;
  });
  padding.composite(foreground, 0, 0);
  await padding.writeAsync(path.join(artifacts, "adaptive-icon-padding.png"));
  // Verify exact geometry and transparency of both masters.
  for (const layer of [foreground, monochrome]) {
    layer.scan(0, 0, 1024, 1024, function (x, y, i) {
      if (
        x < paddingSize ||
        x >= 1024 - paddingSize ||
        y < paddingSize ||
        y >= 1024 - paddingSize
      )
        assert.equal(this.bitmap.data[i + 3], 0);
    });
  }
  const color = `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const appPath = path.join(root, "app.json");
  const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
  app.expo.icon = "./assets/icons/app-icon.png";
  app.expo.web.favicon = "./assets/icons/app-icon.png";
  app.expo.android.adaptiveIcon = {
    foregroundImage: "./assets/icons/adaptive-foreground.png",
    backgroundImage: "./assets/icons/adaptive-background.png",
    backgroundColor: color,
    monochromeImage: "./assets/icons/adaptive-monochrome.png",
  };
  fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + "\n");
  console.log(
    `Generated app icon, adaptive + monochrome layers and previews. Background: ${color}. Verified ${paddingSize} px padding on every side.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

