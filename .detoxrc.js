/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: { $0: "jest", config: "e2e/jest.config.js" },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    "android.debug": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/debug/app-debug.apk",
      build: "cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug",
    },
    "ios.debug": {
      type: "ios.app",
      binaryPath: "ios/build/Build/Products/Debug-iphonesimulator/TheVoteApp.app",
      build:
        "xcodebuild -workspace ios/TheVoteApp.xcworkspace -scheme TheVoteApp -configuration Debug " +
        "-sdk iphonesimulator -derivedDataPath ios/build",
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: { type: "iPhone 16" },
    },
    emulator: {
      type: "android.emulator",
      device: { avdName: "Pixel_8_API_34" },
    },
  },
  configurations: {
    "ios.sim.debug": { device: "simulator", app: "ios.debug" },
    "android.emu.debug": { device: "emulator", app: "android.debug" },
  },
};
