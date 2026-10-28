// Gradle settings for faster Android builds, written into android/gradle.properties
// each time `expo prebuild` makes that folder (so they survive --clean).
// More memory than the 2 GB default, the build cache, and parallel work.

const { withGradleProperties } = require('expo/config-plugins');

const SETTINGS = {
  'org.gradle.jvmargs': '-Xmx4g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8',
  'org.gradle.caching': 'true',
  'org.gradle.parallel': 'true',
};

module.exports = function withFastGradle(config) {
  return withGradleProperties(config, (c) => {
    for (const [key, value] of Object.entries(SETTINGS)) {
      const item = c.modResults.find((i) => i.type === 'property' && i.key === key);
      if (item) item.value = value;
      else c.modResults.push({ type: 'property', key, value });
    }
    return c;
  });
};
