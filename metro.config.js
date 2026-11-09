const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Gradle creates and removes temporary CMake directories during native builds.
// Watching those directories can crash Metro's Windows fallback watcher.
config.resolver.blockList = [
  /[\\/]android[\\/](?:.*[\\/])?(?:build|\.cxx|\.gradle)[\\/].*/,
  /[\\/]ios[\\/]build[\\/].*/,
];
module.exports = config;
