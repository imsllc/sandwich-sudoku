const { withAppBuildGradle, withGradleProperties, withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withReleaseConfig(config) {
  config = withGradleProperties(config, mod => {
    const values = {
      "android.enableMinifyInReleaseBuilds": "true",
      "android.enableShrinkResourcesInReleaseBuilds": "true",
      "android.r8.fullMode": "true",
      "android.r8.optimizedResourceShrinking": "true",
    };
    for (const [key, value] of Object.entries(values)) {
      mod.modResults = mod.modResults.filter(item => item.type !== "property" || item.key !== key);
      mod.modResults.push({ type: "property", key, value });
    }
    return mod;
  });
  config = withAppBuildGradle(config, mod => {
    // The non-optimized default contains -dontoptimize, even with minifyEnabled.
    mod.modResults.contents = mod.modResults.contents.replaceAll("proguard-android.txt", "proguard-android-optimize.txt");
    return mod;
  });
  return withAndroidManifest(config, mod => {
    const app = mod.modResults.manifest.application[0];
    app.$["android:usesCleartextTraffic"] = "false";
    return mod;
  });
};
