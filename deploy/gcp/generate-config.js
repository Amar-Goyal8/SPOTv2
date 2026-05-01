/**
 * Runs at container startup.
 * Reads config.template.json and overlays environment variables,
 * writing the result to config/config.json so the app can boot normally.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env vars (all have template defaults):
 *   TBA_API_KEY, TBA_EVENT_KEY, ACCESS_CODE,
 *   GEMINI_API_KEY, GEMINI_MODEL,
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *   FMS_API_USERNAME, FMS_API_KEY,
 *   DEMO, SWAP_ZONE_BUTTON_LOCATIONS, VERSION
 */

const fs   = require("fs");
const path = require("path");

// In the container, generate-config.js lives at /app/ alongside config/
const appRoot      = path.join(__dirname);
const templatePath = path.join(appRoot, "config", "config.template.json");
const outputPath   = path.join(appRoot, "config", "config.json");

const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
const e = process.env;

const config = {
  ...template,

  VERSION:                   e.VERSION                   || template.VERSION || "2.0.0",
  TBA_EVENT_KEY:             e.TBA_EVENT_KEY             || template.TBA_EVENT_KEY || "",
  DEMO:                      e.DEMO === "true"           || template.DEMO || false,
  SWAP_ZONE_BUTTON_LOCATIONS: e.SWAP_ZONE_BUTTON_LOCATIONS === "true" || template.SWAP_ZONE_BUTTON_LOCATIONS || false,

  secrets: {
    DATABASE_PROVIDER:       "supabase",
    SUPABASE_URL:            e.SUPABASE_URL             || "",
    SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY || "",
    TBA_API_KEY:             e.TBA_API_KEY              || template.secrets?.TBA_API_KEY              || "",
    GEMINI_API_KEY:          e.GEMINI_API_KEY           || template.secrets?.GEMINI_API_KEY           || "",
    GEMINI_MODEL:            e.GEMINI_MODEL             || template.secrets?.GEMINI_MODEL             || "gemini-1.5-flash",
    ACCESS_CODE:             e.ACCESS_CODE              || template.secrets?.ACCESS_CODE              || "",
    FMS_API_USERNAME:        e.FMS_API_USERNAME         || template.secrets?.FMS_API_USERNAME         || "",
    FMS_API_KEY:             e.FMS_API_KEY              || template.secrets?.FMS_API_KEY              || "",
    GOOGLE_AUTH: {
      CLIENT_ID:     e.GOOGLE_CLIENT_ID     || template.secrets?.GOOGLE_AUTH?.CLIENT_ID     || "",
      CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET || template.secrets?.GOOGLE_AUTH?.CLIENT_SECRET || "",
    },
  },
};

if (!config.secrets.SUPABASE_URL || !config.secrets.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required.");
  process.exit(1);
}

fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
console.log("Config generated from environment variables.");
