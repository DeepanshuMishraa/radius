import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Radius",
    identifier: "radius.dipxsy.app",
    version: "0.0.1",
    urlSchemes: ["radius"],
  },
  build: {
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
      icon: "icon.iconset/icon_256x256.png",
    },
    win: {
      bundleCEF: false,
      icon: "icon.iconset/icon_256x256.png",
    },
  },
} satisfies ElectrobunConfig;
