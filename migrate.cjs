var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// migrate.ts
var import_supabase_js = require("@supabase/supabase-js");
var import_promises = __toESM(require("fs/promises"), 1);
var import_path = __toESM(require("path"), 1);
async function run() {
  const supabaseUrl = "https://cafrowrcugufmghgeucj.supabase.co";
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZnJvd3JjdWd1Zm1naGdldWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODIyODMsImV4cCI6MjEwMDY1ODI4M30.5MHNAFuX_znOEod4VDklsZ89kQ4icsuFwj_czflAFno";
  const supabase = (0, import_supabase_js.createClient)(supabaseUrl, supabaseKey);
  console.log("Reading local products...");
  const defaultPath = import_path.default.join(process.cwd(), "products.json");
  const excelPath = import_path.default.join(process.cwd(), "products_from_excel.json");
  let localProducts = [];
  for (const filePath of [defaultPath, excelPath]) {
    try {
      const data = await import_promises.default.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localProducts = parsed;
        console.log(`Found ${parsed.length} products in ${import_path.default.basename(filePath)}`);
        break;
      }
    } catch (err) {
    }
  }
  if (localProducts.length === 0) {
    console.log("No local products found. Nothing to migrate.");
    return;
  }
  console.log(`Migrating ${localProducts.length} products to Supabase...`);
  const { error } = await supabase.from("products").upsert(localProducts, { onConflict: "plu" });
  if (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } else {
    console.log("Migration successful!");
  }
}
run();
