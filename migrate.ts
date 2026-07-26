import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

async function run() {
  const supabaseUrl = "https://cafrowrcugufmghgeucj.supabase.co";
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZnJvd3JjdWd1Zm1naGdldWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODIyODMsImV4cCI6MjEwMDY1ODI4M30.5MHNAFuX_znOEod4VDklsZ89kQ4icsuFwj_czflAFno";
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Reading local products...");
  const defaultPath = path.join(process.cwd(), "products.json");
  const excelPath = path.join(process.cwd(), "products_from_excel.json");
  let localProducts: any[] = [];

  for (const filePath of [defaultPath, excelPath]) {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localProducts = parsed;
        console.log(`Found ${parsed.length} products in ${path.basename(filePath)}`);
        break;
      }
    } catch (err) {
      // Ignore
    }
  }

  if (localProducts.length === 0) {
    console.log("No local products found. Nothing to migrate.");
    return;
  }

  console.log(`Migrating ${localProducts.length} products to Supabase...`);
  const { error } = await supabase
    .from('products')
    .upsert(localProducts, { onConflict: 'plu' });

  if (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } else {
    console.log("Migration successful!");
  }
}

run();
