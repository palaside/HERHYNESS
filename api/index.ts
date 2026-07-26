import express from "express";
import path from "path";
import fs from "fs/promises";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Initialize express app
const app = express();
const PORT = 3000;

// Set up JSON body limits to support base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Path to the database file (use /tmp in Vercel for write access)
const PRODUCTS_FILE_PATH = process.env.VERCEL 
  ? path.join("/tmp", "products.json") 
  : path.join(process.cwd(), "products.json");

// Helper to calculate Levenshtein distance between two strings
function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Helper to read the database products
async function readProducts(): Promise<any[]> {
  // 1. Try Supabase first if configured
  if (supabase) {
    const { data, error } = await supabase.from('products').select('*');
    if (!error && data) {
      return data;
    }
    if (error) {
      console.error("Supabase read error:", error);
    }
  }

  // 2. Fallback to local JSON files
  const defaultPath = path.join(process.cwd(), "products.json");
  const excelPath = path.join(process.cwd(), "products_from_excel.json");
  
  // In Vercel, check /tmp first
  const pathsToTry = process.env.VERCEL 
    ? [path.join("/tmp", "products.json"), defaultPath, excelPath]
    : [defaultPath, excelPath];

  for (const filePath of pathsToTry) {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      // Continue to next path
    }
  }
  return [];
}

// Robust wrapper to retry Gemini API calls on transient errors with exponential backoff and jitter
async function callGeminiWithRetry(ai: any, params: any, maxRetries = 4, initialDelayMs = 1500) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      attempt++;
      console.error(`Gemini API call failed (attempt ${attempt}/${maxRetries}):`, error);
      
      let errorStr = "";
      try {
        errorStr = JSON.stringify(error).toLowerCase();
      } catch (e) {
        errorStr = "";
      }
      const errorMsg = (
        (error?.message || "") + " " + 
        (error?.status || "") + " " + 
        (error?.statusText || "") + " " + 
        (error?.code || "") + " " + 
        String(error) + " " + 
        errorStr
      ).toLowerCase();
      
      const isTransient = 
        errorMsg.includes("503") || 
        errorMsg.includes("unavailable") || 
        errorMsg.includes("demand") || 
        errorMsg.includes("limit") || 
        errorMsg.includes("resource_exhausted") ||
        errorMsg.includes("429") ||
        errorMsg.includes("overloaded") ||
        errorMsg.includes("rate") ||
        errorMsg.includes("temp");

      if (isTransient && attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4);
        console.warn(`Transient Gemini error detected. Retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Gemini API call failed after max retries.");
}

// API: Get products list
app.get("/api/products", async (req, res) => {
  try {
    const products = await readProducts();
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to retrieve products: " + error.message });
  }
});

// API: Upload/Save products list
app.post("/api/products", async (req, res) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: "Invalid data format. Expected a JSON array." });
    }

    if (supabase) {
      // Upsert to Supabase
      const { error } = await supabase
        .from('products')
        .upsert(products, { onConflict: 'plu' });
      
      if (error) throw error;
    } else {
      // Fallback to local write
      await fs.writeFile(PRODUCTS_FILE_PATH, JSON.stringify(products, null, 2), "utf-8");
    }

    res.json({ message: "Product database updated successfully!", count: products.length });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to save products: " + error.message });
  }
});

// API: Migrate local JSON products to Supabase
app.post("/api/migrate-to-supabase", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(400).json({ error: "Supabase credentials are not configured in environment variables." });
    }
    
    // Read from local JSON files specifically
    const defaultPath = path.join(process.cwd(), "products.json");
    const excelPath = path.join(process.cwd(), "products_from_excel.json");
    let localProducts = [];
    
    for (const filePath of [defaultPath, excelPath]) {
      try {
        const data = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localProducts = parsed;
          break;
        }
      } catch (err) {
        // Ignore
      }
    }
    
    if (localProducts.length === 0) {
      return res.status(404).json({ error: "No local products found in products.json or products_from_excel.json" });
    }

    // Insert into Supabase
    const { error } = await supabase
      .from('products')
      .upsert(localProducts, { onConflict: 'plu' });
      
    if (error) throw error;
    
    res.json({ message: "Successfully migrated products to Supabase!", count: localProducts.length });
  } catch (error: any) {
    res.status(500).json({ error: "Migration failed: " + error.message });
  }
});

// API: Process inputs of 3 different formats: POS Receipt, Barcode photo, and typed Text/Barcode numbers.
// Maps each to the products database with typo-correction where appropriate.
app.post("/api/parse-receipt", async (req, res) => {
  const { format, imageBase64, mimeType, textInput } = req.body;

  try {
    // 1. Read product database
    const databaseProducts = await readProducts();

    // Determine the format mode.
    // If format is not specified:
    // - if textInput is present, use "text"
    // - otherwise, use "receipt" (Format A)
    let activeFormat = format;
    if (!activeFormat) {
      if (textInput && textInput.trim()) {
        activeFormat = "text";
      } else {
        activeFormat = "receipt";
      }
    }

    // Initialize Gemini API client if using image formats
    let ai: any = null;
    try {
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "missing" });
    } catch (e) {
      console.error("Failed to initialize Gemini:", e);
    }
    
    if (activeFormat === "receipt" || activeFormat === "barcode") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not set. Please add it in the Secrets panel."
        });
      }
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }

    // ==========================================
    // FORMAT A: POS Receipt/Slip image
    // ==========================================
    if (activeFormat === "receipt") {
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing image base64 data for POS receipt." });
      }

      const dbSummary = databaseProducts
        .map((p) => `- PLU: "${p.plu}", Thai Name: "${p.name_th}", Price: ฿${p.price}`)
        .join("\n");

      const prompt = `You are an intelligent POS receipt parser. Your task is to extract product sales data from the provided image of a "PLU Sales Report" and map the extracted items against the reference database.

Here is the reference products database:
${dbSummary}

INSTRUCTIONS:
1. SCAN: Find all 6-digit PLUs (under the "PLU No." column) and their exact sales quantities (under the "Qty" column inside the "Sales" section). Do not limit the quantity to a specific number of digits (extract the full integer value).
2. MATCH: Perform a strict lookup for each extracted PLU inside the reference database.
3. AUTO-CORRECTION: If a PLU in the receipt has a minor OCR reading mistake (e.g., "324785" instead of "324755"), map it to the closest matching PLU in the database.
4. CLEANUP: Retrieve the "name_th" and "price" from the database. Clean the product names by stripping out any prices, quantities, or department numbers that might have been accidentally attached during OCR.
5. RESPONSE: Calculate the total price (price * qty) for each item. 

STRICT RULE: You must NEVER swap or mix up image URLs between different products. The "image_url" in your output must correspond EXACTLY to the "image_url" mapped to that specific PLU in the database.

Return the result EXACTLY as a JSON array of objects with keys: "plu", "name_th", "price", "qty", "total", "image_url". Do NOT wrap the output in \`\`\`json markdown blocks. Return only the raw JSON.`;

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const response = await callGeminiWithRetry(ai, {
        model: "gemini-flash-latest",
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || "image/jpeg"
              }
            },
            { text: prompt }
          ]
        },
        config: {
          systemInstruction: "You are a specialized POS receipt data extractor and database matching assistant. Scan the image, locate 6-digit PLUs, find quantities in Column 5, correct typos to the closest database PLUs, and output a structured JSON array.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                plu: {
                  type: Type.STRING,
                  description: "The 6-digit PLU code (OCR-extracted, corrected if typo exists)."
                },
                qty: {
                  type: Type.INTEGER,
                  description: "The sales quantity (Qty) from Column 5."
                },
                ocr_desc: {
                  type: Type.STRING,
                  description: "The original text/description seen on the receipt for verification."
                }
              },
              required: ["plu", "qty"]
            }
          }
        }
      });

      const textOutput = response.text;
      if (!textOutput) {
        throw new Error("No response text received from the Gemini model.");
      }

      const extractedRows: any[] = JSON.parse(textOutput.trim());

      const finalResults = extractedRows
        .filter((item) => {
          const rawPlu = String(item.plu || "").trim();
          const digitsOnly = rawPlu.replace(/\D/g, "");
          return digitsOnly.length === 6;
        })
        .map((item) => {
          const extractedPlu = String(item.plu || "").trim();
          const cleanExtractedPlu = extractedPlu.replace(/\D/g, "");

          let bestMatch: any = null;
          let minDistance = Infinity;

          for (const dbProd of databaseProducts) {
            const dbPlu = String(dbProd.plu || "").trim();
            const cleanDbPlu = dbPlu.replace(/\D/g, "");

            if (cleanExtractedPlu === cleanDbPlu) {
              bestMatch = dbProd;
              minDistance = 0;
              break;
            }

            const distance = getLevenshteinDistance(cleanExtractedPlu, cleanDbPlu);
            if (distance < minDistance) {
              minDistance = distance;
              bestMatch = dbProd;
            }
          }

          const quantity = Number(item.qty || 0);

          if (bestMatch && minDistance === 0) {
            return {
              plu: bestMatch.plu,
              name_th: bestMatch.name_th,
              price: Number(bestMatch.price),
              qty: quantity,
              total: Number(bestMatch.price) * quantity,
              image_url: bestMatch.image_url,
              matchType: "exact",
              levenshteinDistance: 0
            };
          } else if (bestMatch && minDistance <= 2) {
            return {
              plu: bestMatch.plu,
              name_th: bestMatch.name_th,
              price: Number(bestMatch.price),
              qty: quantity,
              total: Number(bestMatch.price) * quantity,
              image_url: bestMatch.image_url,
              originalPlu: extractedPlu,
              matchType: "typo",
              levenshteinDistance: minDistance
            };
          } else {
            return {
              plu: extractedPlu,
              name_th: item.ocr_desc ? `[UNMATCHED] ${item.ocr_desc}` : `[UNMATCHED] PLU ${extractedPlu}`,
              price: 0,
              qty: quantity,
              total: 0,
              image_url: "",
              matchType: "none",
              levenshteinDistance: minDistance === Infinity ? undefined : minDistance
            };
          }
        });

      return res.json(finalResults);
    }

    // ==========================================
    // FORMAT B: Barcode photo
    // ==========================================
    if (activeFormat === "barcode") {
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing image base64 data for Barcode photo." });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const response = await callGeminiWithRetry(ai, {
        model: "gemini-flash-latest",
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || "image/jpeg"
              }
            },
            { text: "Locate and extract the barcode number from this photo. It is typically a 13-digit number (EAN) or other numerical sequence of numbers underneath or encoded by the barcode lines. Return a JSON object with a single key 'barcode' whose value is the extracted string of barcode digits." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              barcode: {
                type: Type.STRING,
                description: "The extracted barcode number."
              }
            },
            required: ["barcode"]
          }
        }
      });

      const textOutput = response.text;
      if (!textOutput) {
        throw new Error("No response text received from the Gemini model.");
      }

      const parsedJson = JSON.parse(textOutput.trim());
      const extractedBarcode = String(parsedJson.barcode || "").trim().replace(/\s/g, "");

      if (!extractedBarcode) {
        return res.json([
          {
            plu: "",
            name_th: "[OCR ERROR] No barcode digits could be read from photo",
            price: 0,
            qty: 1,
            total: 0,
            image_url: "",
            matchType: "none"
          }
        ]);
      }

      // Look up the barcode in the database under the "barcode" key
      const matchedProd = databaseProducts.find(
        (p) => String(p.barcode || "").trim() === extractedBarcode
      );

      if (matchedProd) {
        return res.json([
          {
            plu: matchedProd.plu,
            name_th: matchedProd.name_th,
            price: Number(matchedProd.price),
            qty: 1,
            total: Number(matchedProd.price),
            image_url: matchedProd.image_url,
            matchType: "exact",
            barcode: extractedBarcode
          }
        ]);
      } else {
        return res.json([
          {
            plu: "",
            name_th: `[UNMATCHED BARCODE] Barcode: ${extractedBarcode}`,
            price: 0,
            qty: 1,
            total: 0,
            image_url: "",
            matchType: "none",
            barcode: extractedBarcode
          }
        ]);
      }
    }

    // ==========================================
    // FORMAT C: Typed PLU or Barcode number (text)
    // ==========================================
    if (activeFormat === "text") {
      if (!textInput || !textInput.trim()) {
        return res.status(400).json({ error: "Missing input text number." });
      }

      const rawInput = String(textInput).trim();
      const cleanDigits = rawInput.replace(/\D/g, "");

      // 1. Try exact match against "plu" or "barcode"
      let exactMatch = databaseProducts.find(
        (p) => String(p.plu || "").trim() === rawInput || String(p.barcode || "").trim() === rawInput
      );

      if (exactMatch) {
        return res.json([
          {
            plu: exactMatch.plu,
            name_th: exactMatch.name_th,
            price: Number(exactMatch.price),
            qty: 1,
            total: Number(exactMatch.price),
            image_url: exactMatch.image_url,
            matchType: "exact",
            barcode: exactMatch.barcode
          }
        ]);
      }

      // 2. If it is 6 digits long, support auto-correction for minor OCR mistake in PLU
      if (cleanDigits.length === 6) {
        let bestMatch: any = null;
        let minDistance = Infinity;

        for (const dbProd of databaseProducts) {
          const dbPlu = String(dbProd.plu || "").trim();
          const cleanDbPlu = dbPlu.replace(/\D/g, "");

          const distance = getLevenshteinDistance(cleanDigits, cleanDbPlu);
          if (distance < minDistance) {
            minDistance = distance;
            bestMatch = dbProd;
          }
        }

        if (bestMatch && minDistance <= 2) {
          // Typo detected and auto-corrected to closest match
          return res.json([
            {
              plu: bestMatch.plu,
              name_th: bestMatch.name_th,
              price: Number(bestMatch.price),
              qty: 1,
              total: Number(bestMatch.price),
              image_url: bestMatch.image_url,
              originalPlu: rawInput,
              matchType: "typo",
              levenshteinDistance: minDistance,
              barcode: bestMatch.barcode
            }
          ]);
        }
      }

      // 3. Otherwise, return unmatched
      return res.json([
        {
          plu: rawInput.length === 6 ? rawInput : "",
          name_th: `[UNMATCHED TEXT] PLU/Barcode: ${rawInput}`,
          price: 0,
          qty: 1,
          total: 0,
          image_url: "",
          matchType: "none"
        }
      ]);
    }

    return res.status(400).json({ error: `Unsupported processing format: ${activeFormat}` });

  } catch (error: any) {
    console.error("Error processing input:", error);
    let errorMessage = "Failed to process the input.";
    if (error && error.message) {
      errorMessage = error.message;
      try {
        const parsed = JSON.parse(error.message);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
        } else if (parsed?.message) {
          errorMessage = parsed.message;
        }
      } catch (e) {
        // Fallback to error.message
      }
    } else if (typeof error === "string") {
      errorMessage = error;
    }
    res.status(500).json({ error: errorMessage });
  }
});

export default app;
