// Load project root `.env` before Expo resolves config (dev + EAS: set the same
// `EXPO_PUBLIC_*` in EAS Environment if `.env` is not in the build context).
require("dotenv").config();

module.exports = require("./app.json");
