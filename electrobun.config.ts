import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Radius",
    identifier: "radius.dipxsy.app",
    version: "1.0.5",
    urlSchemes: ["radius"],
  },
  release: {
    baseUrl:
      
      "https://github.com/DeepanshuMishraa/radius/releases/latest/download",
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
      bundleCEF: true,
      icon: "icon.iconset/icon_256x256.png",
    },
    win: {
      bundleCEF: true,
      icon: "icon.iconset/icon_256x256.png",
    },
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
} satisfies ElectrobunConfig;
