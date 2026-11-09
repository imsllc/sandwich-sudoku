const {
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withPlayBilling(config) {
  config = withAppBuildGradle(config, (mod) => {
    let source = mod.modResults.contents;
    if (!source.includes("// sandwich-play-billing")) {
      source +=
        '\n// sandwich-play-billing\ndependencies { implementation("com.android.billingclient:billing:9.1.0") }\n';
    }
    if (!source.includes("// sandwich-upload-signing")) {
      source = source.replace(
        "android {",
        `// sandwich-upload-signing
def sandwichSigningFile = rootProject.file('../.upload-signing/keystore.properties')
def sandwichSigning = new Properties()
if (sandwichSigningFile.exists()) sandwichSigningFile.withInputStream { sandwichSigning.load(it) }
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name == 'bundleRelease' }) {
        if (!sandwichSigningFile.exists() || findProperty('localTestSigning') == 'true') {
            throw new GradleException('Play bundles require the dedicated upload key. Run scripts/create-upload-key.ps1, then build without localTestSigning.')
        }
    }
}
android {`,
      );
      source = source.replace(
        "signingConfigs {",
        `signingConfigs {
        if (sandwichSigningFile.exists()) {
            upload {
                storeFile file(sandwichSigning.getProperty('storeFile'))
                storePassword sandwichSigning.getProperty('storePassword')
                keyAlias sandwichSigning.getProperty('keyAlias')
                keyPassword sandwichSigning.getProperty('keyPassword')
            }
        }`,
      );
      source = source.replace(
        /(release\s*\{[\s\S]*?)signingConfig signingConfigs.debug/,
        "$1signingConfig findProperty('localTestSigning') == 'true' || !sandwichSigningFile.exists() ? signingConfigs.debug : signingConfigs.upload",
      );
    }
    mod.modResults.contents = source;
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (!mod.modResults.contents.includes("add(RemoveAdsBillingPackage())")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        "PackageList(this).packages.apply {",
        "PackageList(this).packages.apply {\n          add(RemoveAdsBillingPackage())",
      );
    }
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const packageName = mod.android.package;
      const target = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/java",
        packageName.replaceAll(".", "/"),
      );
      fs.mkdirSync(target, { recursive: true });
      const source = fs
        .readFileSync(
          path.join(__dirname, "android/RemoveAdsBillingModule.kt"),
          "utf8",
        )
        .replace(
          /^package [\w.]+/m,
          "package " + packageName,
        );
      fs.writeFileSync(path.join(target, "RemoveAdsBillingModule.kt"), source);
      return mod;
    },
  ]);
};
