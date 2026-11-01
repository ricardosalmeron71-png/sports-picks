// Configuración dinámica: usa app.json y agrega Firebase (notificaciones Android) solo si
// existe mobile/google-services.json, para que el APK compile también sin él.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const hasFirebase = fs.existsSync(path.join(__dirname, "google-services.json"));
  return {
    ...config,
    android: {
      ...config.android,
      ...(hasFirebase ? { googleServicesFile: "./google-services.json" } : {}),
    },
  };
};
