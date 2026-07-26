import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Tesseract from "tesseract.js";
import { 
  Upload, 
  FileText, 
  Database, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Copy, 
  Check, 
  FileJson, 
  RefreshCw, 
  HelpCircle, 
  ShoppingBag, 
  ChevronRight,
  Info,
  Search,
  Plus,
  Trash2,
  X,
  Eye,
  Save,
  Cpu,
  Barcode,
  Keyboard,
  Camera
} from "lucide-react";
import { SAMPLE_RECEIPTS, SampleReceipt } from "./data/samples";
import { Product, MatchResult } from "./types";
import BarcodeScannerModal from "./components/BarcodeScannerModal";

export default function App() {
  // State for products database
  const [products, setProducts] = useState<Product[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<string>("");

  // State for receipt upload and parsing
  const [inputFormat, setInputFormat] = useState<"receipt" | "barcode" | "text">("receipt");
  const [textInput, setTextInput] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsing result state
  const [results, setResults] = useState<MatchResult[]>([]);
  const [parsedCount, setParsedCount] = useState<number | null>(null);

  // New POS states
  const [ocrProgress, setOcrProgress] = useState<string>("");
  const [previewItem, setPreviewItem] = useState<MatchResult | null>(null);
  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [useLocalOcr, setUseLocalOcr] = useState(false); // Default to false (Gemini AI) as requested

  // Copy state
  const [copied, setCopied] = useState(false);

  // Drag over states
  const [dragOverReceipt, setDragOverReceipt] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<any | null>(null);
  const [dragOverDb, setDragOverDb] = useState(false);

  // Database catalog and custom item state
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [newProductPlu, setNewProductPlu] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductImage, setNewProductImage] = useState("");
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  // Helper to calculate Levenshtein distance between two strings
  const getLevenshteinDistance = (a: string, b: string): number => {
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
  };

  const isQuotaOrLimitError = (errText: string | null) => {
    if (!errText) return false;
    const lower = errText.toLowerCase();
    return (
      lower.includes("quota") ||
      lower.includes("limit") ||
      lower.includes("rate") ||
      lower.includes("demand") ||
      lower.includes("503") ||
      lower.includes("unavailable") ||
      lower.includes("resource_exhausted") ||
      lower.includes("spikes") ||
      lower.includes("overloaded")
    );
  };

  // Helper to extract the brand name from product name
  const getBrandName = (name: string): string => {
    if (!name) return "PRODUCT";
    const clean = name.trim();
    if (clean.includes("_")) {
      return clean.split("_")[0];
    }
    if (clean.includes(" ")) {
      return clean.split(" ")[0];
    }
    // Check if first few chars are English characters (like SEMI, etc.)
    const engPrefixMatch = clean.match(/^[A-Za-z0-9\s-]+/);
    if (engPrefixMatch && engPrefixMatch[0].trim().length > 1) {
      return engPrefixMatch[0].trim().toUpperCase();
    }
    return "PRODUCT";
  };

  const matchPluToDatabase = (extractedPlu: string, databaseProducts: Product[]): {
    plu: string;
    name_th: string;
    price: number;
    image_url: string;
    matchType: "exact" | "typo" | "none";
    levenshteinDistance?: number;
  } => {
    const cleanExtractedPlu = extractedPlu.replace(/\D/g, "");
    if (!cleanExtractedPlu) {
      return {
        plu: extractedPlu,
        name_th: "New Item",
        price: 0,
        image_url: "",
        matchType: "none"
      };
    }

    let bestMatch: Product | null = null;
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

    if (bestMatch && minDistance === 0) {
      return {
        plu: bestMatch.plu,
        name_th: bestMatch.name_th,
        price: Number(bestMatch.price),
        image_url: bestMatch.image_url,
        matchType: "exact",
        levenshteinDistance: 0
      };
    } else if (bestMatch && minDistance <= 2) {
      return {
        plu: bestMatch.plu,
        name_th: bestMatch.name_th,
        price: Number(bestMatch.price),
        image_url: bestMatch.image_url,
        matchType: "typo",
        levenshteinDistance: minDistance
      };
    } else {
      return {
        plu: extractedPlu,
        name_th: `[UNMATCHED] PLU ${extractedPlu}`,
        price: 0,
        image_url: "",
        matchType: "none",
        levenshteinDistance: minDistance === Infinity ? undefined : minDistance
      };
    }
  };

  // Table modification handlers
  const handleUpdatePlu = (index: number, newPlu: string) => {
    const updated = [...results];
    const matched = matchPluToDatabase(newPlu, products);
    updated[index] = {
      ...updated[index],
      plu: matched.plu,
      name_th: matched.name_th,
      price: matched.price,
      image_url: matched.image_url,
      matchType: matched.matchType,
      levenshteinDistance: matched.levenshteinDistance,
      originalPlu: newPlu !== matched.plu ? newPlu : undefined,
      total: matched.price * updated[index].qty
    };
    setResults(updated);
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    const updated = [...results];
    const validQty = isNaN(newQty) ? 0 : Math.max(0, newQty);
    updated[index] = {
      ...updated[index],
      qty: validQty,
      total: updated[index].price * validQty
    };
    setResults(updated);
  };

  const handleUpdatePrice = (index: number, newPrice: number) => {
    const updated = [...results];
    const validPrice = isNaN(newPrice) ? 0 : Math.max(0, newPrice);
    updated[index] = {
      ...updated[index],
      price: validPrice,
      total: validPrice * updated[index].qty
    };
    setResults(updated);
  };

  const handleDeleteRow = (index: number) => {
    const updated = results.filter((_, i) => i !== index);
    setResults(updated);
    setParsedCount(updated.length);
  };

  const handleAddManualRow = () => {
    const newRow: MatchResult = {
      plu: "",
      name_th: "Manual Product Entry",
      price: 0,
      qty: 1,
      total: 0,
      image_url: "",
      matchType: "none"
    };
    const updated = [...results, newRow];
    setResults(updated);
    setParsedCount(updated.length);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductPlu || !newProductName || !newProductPrice) {
      setDbStatus("Error: PLU, Name, and Price are required.");
      return;
    }

    const priceNum = parseFloat(newProductPrice);
    if (isNaN(priceNum)) {
      setDbStatus("Error: Price must be a number.");
      return;
    }

    const newProd: Product = {
      plu: newProductPlu.trim(),
      name_th: newProductName.trim(),
      price: priceNum,
      image_url: newProductImage.trim() || "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?q=80&w=200&auto=format&fit=crop"
    };

    // Check if PLU already exists
    if (products.some(p => p.plu === newProd.plu)) {
      setDbStatus(`Error: Product with PLU ${newProd.plu} already exists.`);
      return;
    }

    const updatedProducts = [...products, newProd];
    setDbLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProducts)
      });

      if (res.ok) {
        setProducts(updatedProducts);
        setDbStatus(`Success! Added product ${newProd.name_th} (${newProd.plu})`);
        // Reset fields
        setNewProductPlu("");
        setNewProductName("");
        setNewProductPrice("");
        setNewProductImage("");
        setIsAddingProduct(false);
      } else {
        setDbStatus("Failed to save the new product on the server.");
      }
    } catch (err: any) {
      setDbStatus("Connection error while saving product.");
    } finally {
      setDbLoading(false);
    }
  };

  const handleDeleteProduct = async (pluToDelete: string) => {
    if (!confirm(`Are you sure you want to delete product PLU ${pluToDelete} from the database?`)) {
      return;
    }
    const updatedProducts = products.filter(p => p.plu !== pluToDelete);
    setDbLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProducts)
      });

      if (res.ok) {
        setProducts(updatedProducts);
        setDbStatus(`Product PLU ${pluToDelete} deleted successfully.`);
      } else {
        setDbStatus("Failed to delete the product from the server.");
      }
    } catch (err: any) {
      setDbStatus("Connection error while deleting product.");
    } finally {
      setDbLoading(false);
    }
  };

  // Load the product database on mount
  useEffect(() => {
    fetchProducts();
  }, []);

  // Load POS sales history on mount
  useEffect(() => {
    const stored = localStorage.getItem("pos_sales_history");
    if (stored) {
      try {
        setSalesHistory(JSON.parse(stored));
      } catch (e) {
        console.error("Error loading sales history:", e);
      }
    }
  }, []);

  // Synchronize previewItem when results change, default to first item
  useEffect(() => {
    if (results.length > 0) {
      if (!previewItem || !results.some(item => item.plu === previewItem.plu)) {
        setPreviewItem(results[0]);
      } else {
        const found = results.find(item => item.plu === previewItem.plu);
        if (found) {
          setPreviewItem(found);
        }
      }
    } else {
      setPreviewItem(null);
    }
  }, [results, previewItem]);

  const fetchProducts = async () => {
    setDbLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        setDbStatus(`Successfully loaded ${data.length} products.`);
      } else {
        setDbStatus("Failed to load products database from server.");
      }
    } catch (err: any) {
      setDbStatus("Connection error to product database.");
    } finally {
      setDbLoading(false);
    }
  };

  // Sound feedback for successful POS scans/lookups
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio feedback is unsupported or blocked", e);
    }
  };

  const extractBrand = (name: string): string => {
    if (!name) return "GENERIC";
    const upper = name.toUpperCase();
    if (upper.startsWith("CONSHINE_") || upper.startsWith("CONSHINE ")) return "CONSHINE";
    if (upper.startsWith("SEMI_") || upper.startsWith("SEMI ")) return "SEMI";
    if (upper.includes("HER HYNESS") || upper.includes("HERHYNESS") || upper.startsWith("HH ")) return "HER HYNESS";
    const parts = name.split("_");
    if (parts.length > 1 && parts[0].length < 15) return parts[0].toUpperCase();
    return "HER HYNESS"; // Default brand
  };

  const cleanProductName = (name: string): string => {
    if (!name) return "";
    const parts = name.split("_");
    if (parts.length > 1) {
      return parts.slice(1).join("_");
    }
    return name;
  };

  const extractQuantity = (lineText: string, plu: string): number => {
    let cleaned = lineText.replace(plu, "");
    
    // Look for multipliers like x2, *3, @1
    const multMatch = cleaned.match(/(?:x|\*|@)\s*([1-9]|10)\b/i);
    if (multMatch) {
      return parseInt(multMatch[1]);
    }

    // Remove price formats (like 1,090.00 or 580) to avoid false matches
    cleaned = cleaned.replace(/\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g, "");

    // Look for isolated numbers like 1, 2, 3
    const numMatch = cleaned.match(/\b([1-9]|10)\b/);
    if (numMatch) {
      return parseInt(numMatch[1]);
    }

    return 1;
  };

  const parseOcrText = (ocrText: string): MatchResult[] => {
    const lines = ocrText.split("\n");
    const foundItems: MatchResult[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Extract 5-7 digit potential PLUs
      const digitMatches = trimmed.match(/\b\d{5,7}\b/g);
      if (!digitMatches) continue;

      for (const candidate of digitMatches) {
        // Match against product DB with Levenshtein-distance support
        const matched = matchPluToDatabase(candidate, products);
        
        // Prevent adding duplicate unmatched items for the same code on the same line
        if (foundItems.some(item => item.plu === matched.plu && matched.plu !== "")) {
          continue;
        }

        const qty = extractQuantity(trimmed, candidate);

        foundItems.push({
          plu: matched.plu,
          name_th: matched.name_th,
          price: matched.price,
          qty: qty,
          total: matched.price * qty,
          image_url: matched.image_url,
          matchType: matched.matchType as "exact" | "typo" | "none",
          levenshteinDistance: matched.levenshteinDistance,
          originalPlu: candidate !== matched.plu ? candidate : undefined
        });
      }
    }

    return foundItems;
  };

  const handleLocalOcrWithTesseract = async () => {
    if (!receiptImage) {
      setError("Please select or drop an image file first.");
      return;
    }

    setParsing(true);
    setError(null);
    setResults([]);
    setOcrProgress("Initializing Local OCR...");

    try {
      const result = await Tesseract.recognize(
        receiptImage,
        "eng+tha",
        {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setOcrProgress(`Scanning Receipt: ${Math.round(m.progress * 100)}%`);
            } else {
              setOcrProgress(`${m.status}`);
            }
          }
        }
      );

      const ocrText = result.data.text;
      const parsed = parseOcrText(ocrText);

      if (parsed.length === 0) {
        setError("Local OCR: No valid PLUs or products were detected on this receipt slip.");
      } else {
        setResults(parsed);
        setParsedCount(parsed.length);
        playBeep();
      }
    } catch (err: any) {
      console.error("Local OCR Error:", err);
      setError("Tesseract OCR Error: " + (err.message || "Could not read receipt image locally. Please try again."));
    } finally {
      setParsing(false);
      setOcrProgress("");
    }
  };

  const handleBarcodeScanned = (barcodeValue: string) => {
    const cleanBarcode = barcodeValue.trim();
    if (!cleanBarcode) return;

    // Find the product by barcode in our database
    const foundProd = products.find(p => p.barcode === cleanBarcode);

    if (foundProd) {
      playBeep();
      
      // Add or update quantity in bill results
      setResults(prev => {
        const existingIdx = prev.findIndex(item => item.plu === foundProd.plu);
        if (existingIdx > -1) {
          const updated = [...prev];
          const newQty = updated[existingIdx].qty + 1;
          updated[existingIdx] = {
            ...updated[existingIdx],
            qty: newQty,
            total: updated[existingIdx].price * newQty
          };
          return updated;
        } else {
          return [
            ...prev,
            {
              plu: foundProd.plu,
              name_th: foundProd.name_th,
              price: foundProd.price,
              qty: 1,
              total: foundProd.price,
              image_url: foundProd.image_url,
              matchType: "exact" as const
            }
          ];
        }
      });
      setError(null);
    } else {
      setError(`Product barcode [${cleanBarcode}] not found in database.`);
    }
    
    // Close camera scanner upon successful barcode query
    setIsBarcodeScanning(false);
  };

  const handleSaveBill = () => {
    if (results.length === 0) {
      setError("Active bill is empty! Scan a barcode or receipt first.");
      return;
    }

    const dateObj = new Date();
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const mins = String(dateObj.getMinutes()).padStart(2, '0');
    
    const timestamp = `${day}/${month}/${year} ${hours}:${mins}`;
    const dateOnly = `${day}/${month}/${year}`;

    const newTx = {
      id: "tx_" + Math.random().toString(36).substring(2, 9),
      timestamp,
      dateOnly,
      totalValue: totalSalesVal,
      totalQty: totalQty,
      itemsCount: totalItems,
      items: results
    };

    const updatedHistory = [newTx, ...salesHistory];
    setSalesHistory(updatedHistory);
    localStorage.setItem("pos_sales_history", JSON.stringify(updatedHistory));

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);

    // Clear active bill on save
    setResults([]);
    setParsedCount(null);
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to clear your entire daily sales history?")) {
      setSalesHistory([]);
      localStorage.removeItem("pos_sales_history");
    }
  };

  const handleDeleteHistoryEntry = (idToDelete: string) => {
    const updated = salesHistory.filter(entry => entry.id !== idToDelete);
    setSalesHistory(updated);
    localStorage.setItem("pos_sales_history", JSON.stringify(updated));
  };

  const handleLoadSavedBill = (savedBill: any) => {
    setResults(savedBill.items || []);
    setParsedCount((savedBill.items || []).length);
    playBeep();
  };

  // Handle receipt image upload
  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processReceiptFile(file);
    }
  };

  const processReceiptFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, or JPEG).");
      return;
    }
    setReceiptName(file.name);
    setError(null);
    setInputFormat("receipt");
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptImage(reader.result as string);
    };
    reader.onerror = () => {
      setError("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  };

  // Handle products.json database upload
  const handleDbFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processDbFile(file);
    }
  };

  const processDbFile = (file: File) => {
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      setDbStatus("Error: File must be a valid .json file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!Array.isArray(parsed)) {
          setDbStatus("Error: JSON must be an array of product objects.");
          return;
        }

        // Validate structure briefly
        const valid = parsed.every(p => p.plu && p.name_th && typeof p.price === "number");
        if (!valid) {
          setDbStatus("Warning: Some products are missing 'plu', 'name_th', or numeric 'price'.");
        }

        // Send to server to write products.json
        setDbLoading(true);
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
          const result = await res.json();
          setProducts(parsed);
          setDbStatus(`Success! Database updated with ${parsed.length} items.`);
        } else {
          setDbStatus("Server failed to save the uploaded product database.");
        }
      } catch (err) {
        setDbStatus("Error parsing products.json file. Invalid JSON structure.");
      } finally {
        setDbLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // Trigger parsing using real server OCR/text processing (Gemini API / matching) or Local OCR
  const handleParseReceipt = async () => {
    if (inputFormat !== "text" && !receiptImage) {
      setError("Please select or drop an image file first.");
      return;
    }
    if (inputFormat === "text" && !textInput.trim()) {
      setError("Please type a valid 6-digit PLU or Barcode number first.");
      return;
    }

    // Route to Local OCR (Tesseract.js) if selected and parsing standard receipt
    if (useLocalOcr && inputFormat === "receipt") {
      handleLocalOcrWithTesseract();
      return;
    }

    setParsing(true);
    setError(null);
    setResults([]);

    try {
      const payload: any = {
        format: inputFormat
      };

      if (inputFormat === "text") {
        payload.textInput = textInput;
      } else if (receiptImage) {
        payload.imageBase64 = receiptImage;
        payload.mimeType = receiptImage.split(";")[0].split(":")[1] || "image/jpeg";
      }

      const res = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        const resultsArray = Array.isArray(data) ? data : (data.results || []);
        setResults(resultsArray);
        setParsedCount(resultsArray.length);
        playBeep(); // Play scan feedback sound!
      } else {
        setError(data.error || "Failed to process the input.");
      }
    } catch (err: any) {
      setError("Server connection error: " + (err.message || "Unknown error"));
    } finally {
      setParsing(false);
    }
  };

  // Load sample pre-computed or live parsed data for prompt images
  const handleLoadSample = (sample: SampleReceipt) => {
    setReceiptImage(null);
    setReceiptName(sample.name);
    setParsing(true);
    setError(null);
    
    // Simulate parse delay for gorgeous UX
    setTimeout(() => {
      setResults(sample.results);
      setParsedCount(sample.results.length);
      setParsing(false);
    }, 800);
  };

  // Copy exactly format-compliant JSON output to clipboard
  const handleCopyJson = () => {
    const formatCompliant = results.map(item => ({
      plu: item.plu,
      name_th: item.name_th,
      price: item.price,
      qty: item.qty,
      total: item.total,
      image_url: item.image_url
    }));

    navigator.clipboard.writeText(JSON.stringify(formatCompliant, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculations
  const totalItems = results.length;
  const totalQty = results.reduce((sum, item) => sum + item.qty, 0);
  const totalSalesVal = results.reduce((sum, item) => sum + item.total, 0);

  const getDailyTotals = () => {
    const totals: { [date: string]: number } = {};
    salesHistory.forEach((entry: any) => {
      totals[entry.dateOnly] = (totals[entry.dateOnly] || 0) + entry.totalValue;
    });
    return Object.entries(totals).map(([date, val]) => ({
      date,
      value: val
    }));
  };

  // Exact JSON output format
  const formattedJsonOutput = JSON.stringify(
    results.map(item => ({
      plu: item.plu,
      name_th: item.name_th,
      price: item.price,
      qty: item.qty,
      total: item.total,
      image_url: item.image_url
    })),
    null,
    2
  );

  return (
    <div id="app-root" className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased selection:bg-rose-500 selection:text-white">
      {/* Decorative top accent */}
      <div className="h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 w-full" />

      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Header Section */}
        <header className="mb-10 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-neutral-800 pb-8">
          <div>
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              <span className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider text-white uppercase font-sans">
                HER HYNESS
              </h1>
            </div>
            <p className="text-neutral-400 text-sm md:text-base font-medium tracking-wide">
              Daily Sales Record
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button 
              onClick={() => setIsCatalogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium rounded-lg transition-all cursor-pointer shadow-md shadow-rose-950/20"
            >
              <Eye className="w-3.5 h-3.5" />
              Browse Catalog
            </button>
            <button 
              onClick={fetchProducts} 
              disabled={dbLoading}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-800 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dbLoading ? 'animate-spin' : ''}`} />
              Sync DB
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Server Ready
            </div>
          </div>
        </header>

        {/* Main Interface Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Data Controllers / Uploaders */}
          <div className="col-span-1 lg:col-span-4 space-y-6">
            
             {/* ACTION CONTROLS: File Uploader, Camera Barcode, Trigger OCR Scan */}
            <div className="bg-neutral-900/50 rounded-2xl border border-neutral-800/80 p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-neutral-800/80 pb-3">
                <Cpu className="w-4 h-4 text-rose-400" />
                <h3 className="font-medium text-white text-sm">Action Controls</h3>
              </div>

              {/* OCR Engine Toggle */}
              <div className="flex items-center justify-between p-1.5 bg-neutral-950 rounded-xl border border-neutral-850 text-xs">
                <span className="text-neutral-400 font-medium pl-1.5 text-[10px] uppercase tracking-wider font-mono">OCR Engine</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUseLocalOcr(true);
                      setError(null);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold tracking-tight transition-all cursor-pointer ${
                      useLocalOcr
                        ? "bg-rose-500 text-white shadow"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Local Tesseract
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseLocalOcr(false);
                      setError(null);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold tracking-tight transition-all cursor-pointer ${
                      !useLocalOcr
                        ? "bg-rose-500 text-white shadow"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Gemini AI
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {/* 1. Upload Receipt File Button */}
                <div className="relative">
                  <input
                    type="file"
                    id="receipt-uploader"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReceiptFileChange}
                  />
                  <label
                    htmlFor="receipt-uploader"
                    className="w-full py-2.5 px-4 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Upload className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Upload Receipt File</span>
                  </label>
                </div>

                {/* 2. Scan Barcode Button */}
                <button
                  type="button"
                  onClick={() => {
                    setInputFormat("barcode");
                    setIsBarcodeScanning(true);
                  }}
                  className="w-full py-2.5 px-4 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Scan Barcode</span>
                </button>

                {/* 3. Scan Receipt Button */}
                <button
                  type="button"
                  onClick={handleParseReceipt}
                  disabled={parsing || !receiptImage}
                  className="w-full py-2.5 px-4 bg-rose-500 hover:bg-rose-600 disabled:bg-neutral-850 disabled:text-neutral-500 text-white font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-950/20"
                >
                  {parsing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                      <span>{ocrProgress || "Processing OCR..."}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>Scan Receipt</span>
                    </>
                  )}
                </button>
              </div>

              {/* Dynamic typed fallback search input (keeps original Keyboard tab feature without clutter) */}
              <div className="pt-2 border-t border-neutral-850 space-y-1.5">
                <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-500 block">
                  Or manual search lookup
                </span>
                <div className="relative">
                  <Keyboard className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Type 6-digit PLU or Barcode..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setInputFormat("text");
                        handleParseReceipt();
                      }
                    }}
                    className="w-full pl-8.5 pr-14 py-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-rose-500 rounded-xl text-[11px] text-white font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      setInputFormat("text");
                      handleParseReceipt();
                    }}
                    disabled={!textInput}
                    className="absolute right-1.5 top-1/2 transform -translate-y-1/2 px-2 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-rose-400 text-[9px] font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    GO
                  </button>
                </div>
              </div>

              {/* Receipt File Preview */}
              {receiptImage && (
                <div className="space-y-2 bg-neutral-950/50 p-3 rounded-xl border border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400 font-mono truncate max-w-[180px]">
                      {receiptName}
                    </span>
                    <button
                      onClick={() => {
                        setReceiptImage(null);
                        setReceiptName("");
                      }}
                      className="text-[10px] text-rose-400 hover:underline"
                    >
                      Clear File
                    </button>
                  </div>
                  <div className="relative aspect-video rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900">
                    <img
                      src={receiptImage}
                      alt="Source preview"
                      className="object-contain w-full h-full"
                    />
                  </div>
                </div>
              )}

              {/* Error box */}
              {error && (
                isQuotaOrLimitError(error) ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3">
                    <div className="flex items-start gap-2.5 text-xs text-amber-400">
                      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-semibold block text-amber-300">Gemini AI Service Busy / Quota Exceeded</span>
                        <p className="text-neutral-300 leading-relaxed text-[11px]">
                          {error}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUseLocalOcr(true);
                          setError(null);
                          if (receiptImage) {
                            setParsing(true);
                            setTimeout(() => {
                              handleLocalOcrWithTesseract();
                            }, 100);
                          }
                        }}
                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 border border-amber-500/20"
                      >
                        <Cpu className="w-3.5 h-3.5" />
                        Switch to Local Tesseract OCR
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          handleParseReceipt();
                        }}
                        className="px-3 py-1.5 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 border border-neutral-800"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry with Gemini AI
                      </button>
                    </div>
                    <p className="text-[10px] text-neutral-500 font-mono leading-normal">
                      * Tip: The shared free tier has a limit of 20 requests/min. Switching to Local Tesseract OCR processes receipts directly on your browser without any network limits!
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-start gap-2 text-xs text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )
              )}
            </div>

            {/* SELECTED PRODUCT CARD (GORGEOUS WHITE CARD FROM MOCKUP) */}
            <AnimatePresence mode="wait">
              {previewItem && (
                <motion.div
                  key={previewItem.plu}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white text-neutral-950 rounded-[32px] p-6 shadow-xl flex flex-col items-center text-center space-y-5 border border-neutral-200"
                >
                  {/* Product Image Frame */}
                  <div className="relative w-full aspect-square max-w-[256px] rounded-[24px] overflow-hidden border border-neutral-900 bg-white shadow-sm flex items-center justify-center p-2 shrink-0">
                    {previewItem.image_url ? (
                      <img
                        src={previewItem.image_url}
                        alt={previewItem.name_th}
                        className="object-contain w-full h-full rounded-[18px]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-neutral-300 gap-2">
                        <ShoppingBag className="w-12 h-12 text-neutral-300" />
                        <span className="text-xs font-semibold text-neutral-400">No Image</span>
                      </div>
                    )}
                  </div>

                  {/* Brand Pill */}
                  <div className="px-5 py-1.5 bg-[#171717] text-white rounded-full font-bold text-xs tracking-wider uppercase font-sans">
                    {getBrandName(previewItem.name_th)}
                  </div>

                  {/* Product Details Name */}
                  <div className="space-y-1">
                    <h3 className="font-bold text-base md:text-lg text-neutral-900 leading-tight tracking-tight px-2">
                      {previewItem.name_th}
                    </h3>
                    <p className="text-[10px] text-neutral-500 font-mono tracking-wider">
                      PLU: {previewItem.plu}
                    </p>
                  </div>

                  {/* Precise Pricing/Quantity Calculation Box */}
                  <div className="w-full py-3 px-5 bg-slate-50 border border-neutral-900 rounded-[14px] flex items-center justify-center shadow-inner">
                    <span className="font-sans font-extrabold text-neutral-800 text-[14px] sm:text-[16px] tracking-tight">
                      {previewItem.price.toFixed(2)} x {previewItem.qty} = {(previewItem.price * previewItem.qty).toFixed(2)} THB
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Daily Sales History Panel */}
            <div className="bg-neutral-900/50 rounded-2xl border border-neutral-800/80 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <Save className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-medium text-white text-sm">Daily Sales History</h3>
                </div>
                {salesHistory.length > 0 && (
                  <button 
                    onClick={handleClearHistory}
                    className="text-[10px] text-rose-400 hover:underline hover:text-rose-300 font-semibold cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Grouped Daily Totals: e.g., 16/07/2026: 7,691.39 THB */}
              <div className="space-y-1.5">
                {getDailyTotals().length > 0 ? (
                  getDailyTotals().map((day) => (
                    <div 
                      key={day.date} 
                      className="flex items-center justify-between p-2.5 bg-neutral-950/45 border border-neutral-850 rounded-xl text-xs"
                    >
                      <span className="font-semibold text-neutral-300 font-mono">{day.date}:</span>
                      <span className="font-mono font-extrabold text-emerald-400">
                        {day.value.toLocaleString("th-TH", { minimumFractionDigits: 2 })} THB
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-neutral-500 text-xs">
                    No sales recorded for today.
                  </div>
                )}
              </div>

              {/* Individual Saved Bills list */}
              {salesHistory.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-neutral-850/60">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">
                    Recent Saved Transactions
                  </span>
                  <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                    {salesHistory.map((tx) => (
                      <div 
                        key={tx.id}
                        className="group flex items-center justify-between p-2 bg-neutral-950/30 hover:bg-neutral-900 border border-neutral-850/65 rounded-xl text-[11px] transition-colors"
                      >
                        <div 
                          className="min-w-0 cursor-pointer flex-1"
                          onClick={() => handleLoadSavedBill(tx)}
                          title="Click to restore this bill"
                        >
                          <span className="text-neutral-400 font-mono font-medium block">
                            {tx.timestamp}
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            {tx.itemsCount} items • {tx.totalQty} units
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-neutral-200">
                            ฿{tx.totalValue.toFixed(0)}
                          </span>
                          <button
                            onClick={() => handleDeleteHistoryEntry(tx.id)}
                            className="p-1 hover:bg-rose-500/20 hover:text-rose-400 text-neutral-500 rounded-lg transition-all cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Results Display Panel */}
          <div className="col-span-1 lg:col-span-8 space-y-6">

            {/* INITIAL BLANK / LOADING STATE */}
            <AnimatePresence mode="wait">
              {parsing ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="bg-neutral-900/30 rounded-2xl border border-neutral-800/80 p-12 text-center flex flex-col items-center justify-center space-y-4"
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-neutral-800 border-t-rose-500 animate-spin" />
                    <Sparkles className="w-5 h-5 text-rose-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-white">Extracting POS Tabular Data</h4>
                    <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                      Gemini is scanning the columns row-by-row to extract PLUs, descriptions, unit costs, and quantity values...
                    </p>
                  </div>
                </motion.div>
              ) : results.length > 0 ? (
                <motion.div
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  {/* METRICS ROW */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider block">
                          Total Items
                        </span>
                        <span className="text-xl font-bold font-mono text-white mt-1">
                          {totalItems}
                        </span>
                      </div>
                      <div className="p-2 bg-neutral-800 rounded-lg text-rose-400">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider block">
                          Total Qty sold
                        </span>
                        <span className="text-xl font-bold font-mono text-white mt-1">
                          {totalQty}
                        </span>
                      </div>
                      <div className="p-2 bg-neutral-800 rounded-lg text-amber-400">
                        <FileText className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider block">
                          Total Sales Value
                        </span>
                        <span className="text-xl font-bold font-mono text-emerald-400 mt-1">
                          ฿{totalSalesVal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="p-2 bg-neutral-800 rounded-lg text-emerald-400">
                        <span className="text-sm font-semibold">฿</span>
                      </div>
                    </div>
                  </div>

                  {/* PARSED RESULTS TABLE */}
                  <div className="bg-neutral-900/50 rounded-2xl border border-neutral-800/80 overflow-hidden">
                    <div className="p-4 border-b border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <h3 className="font-medium text-white text-sm">Matched Sales Data</h3>
                      </div>
                      <span className="text-[10px] text-neutral-500">
                        Calculations based on database pricing.
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-800/80 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 bg-neutral-950/25">
                            <th className="px-4 py-3 text-center">Image</th>
                            <th className="px-4 py-3">PLU & Match Info</th>
                            <th className="px-4 py-3">Thai Product Name</th>
                            <th className="px-4 py-3 text-right">Price (฿)</th>
                            <th className="px-4 py-3 text-center">Qty</th>
                            <th className="px-4 py-3 text-right">Total</th>
                            <th className="px-4 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/40 text-xs">
                          {results.map((item, index) => (
                            <tr 
                              key={`${item.plu}-${index}`} 
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (
                                  target.tagName === "INPUT" || 
                                  target.tagName === "BUTTON" || 
                                  target.closest("button") || 
                                  target.closest("input")
                                ) {
                                  return;
                                }
                                setPreviewItem(item);
                              }}
                              className={`transition-all cursor-pointer group/row ${
                                previewItem && previewItem.plu === item.plu
                                  ? "bg-rose-500/10 text-white font-medium"
                                  : "hover:bg-rose-500/5"
                              }`}
                              title="Click row to view detailed product preview card"
                            >
                              {/* Product Thumbnail (2.5x scaled and styled matching the details card) */}
                              <td className="px-4 py-5 text-center">
                                <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-neutral-900 bg-white shadow-sm flex items-center justify-center p-1.5 shrink-0 mx-auto transition-transform group-hover/row:scale-105">
                                  {item.image_url ? (
                                    <img 
                                      src={item.image_url} 
                                      alt={item.name_th} 
                                      className="object-contain w-full h-full rounded-xl cursor-zoom-in"
                                      referrerPolicy="no-referrer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        console.log("Product clicked:", item);
                                        setExpandedProduct(item);
                                      }}
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center text-neutral-300 gap-1">
                                      <ShoppingBag className="w-6 h-6 text-neutral-300" />
                                      <span className="text-[8px] font-bold text-neutral-400">No Image</span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* PLU Match indicator / Input */}
                              <td className="px-4 py-5 font-mono">
                                <div className="space-y-1.5">
                                  <input 
                                    type="text" 
                                    value={item.plu}
                                    onChange={(e) => handleUpdatePlu(index, e.target.value)}
                                    placeholder="PLU No."
                                    className="w-20 px-2 py-1 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 rounded font-mono text-center text-white text-xs transition-all"
                                  />
                                  <div>
                                    {item.matchType === "exact" && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
                                        Exact match
                                      </span>
                                    )}
                                    {item.matchType === "typo" && (
                                      <div className="space-y-0.5">
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/10 font-sans font-medium">
                                          Typo corrected
                                        </span>
                                        <div className="text-[9px] text-neutral-500">
                                          Original: <span className="line-through">{item.originalPlu}</span>
                                        </div>
                                      </div>
                                    )}
                                    {item.matchType === "none" && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/10">
                                        Unmatched
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Thai name */}
                              <td className="px-4 py-5">
                                <div className="font-semibold text-neutral-100 max-w-[200px] sm:max-w-xs md:max-w-md truncate group-hover/row:text-rose-300 transition-colors">
                                  {item.name_th}
                                </div>
                              </td>

                              {/* DB Unit price / Input */}
                              <td className="px-4 py-5 text-right font-mono">
                                <input 
                                  type="number" 
                                  step="0.01"
                                  min="0"
                                  value={item.price || ""}
                                  onChange={(e) => handleUpdatePrice(index, parseFloat(e.target.value))}
                                  className="w-20 px-2 py-1 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 rounded font-mono text-right text-white text-xs transition-all"
                                />
                              </td>

                              {/* Quantity / Input */}
                              <td className="px-4 py-5 text-center font-mono">
                                <input 
                                  type="number" 
                                  min="0"
                                  value={item.qty || ""}
                                  onChange={(e) => handleUpdateQty(index, parseInt(e.target.value))}
                                  className="w-16 px-2 py-1 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 rounded font-mono text-center text-white text-xs transition-all"
                                />
                              </td>

                              {/* Row total */}
                              <td className="px-4 py-5 text-right font-mono font-semibold text-emerald-400">
                                ฿{item.total.toFixed(2)}
                              </td>

                              {/* Row delete action */}
                              <td className="px-4 py-5 text-center">
                                <button
                                  onClick={() => handleDeleteRow(index)}
                                  className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Table Footer Actions */}
                    <div className="p-4 bg-neutral-950/20 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-4">
                      <button
                        onClick={handleAddManualRow}
                        className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-rose-400" />
                        Add Manual Sale Entry
                      </button>

                      <div className="flex items-center gap-3">
                        {saveSuccess && (
                          <span className="text-[11px] text-emerald-400 font-medium animate-pulse flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" /> Bill Saved!
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveBill}
                          className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-950/25"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Bill</span>
                        </button>
                      </div>
                    </div>
                  </div>

                </motion.div>
              ) : (
                <motion.div
                  key="blank"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-neutral-900/10 rounded-2xl border border-neutral-800/80 p-16 text-center space-y-4"
                >
                  <div className="w-12 h-12 bg-neutral-900 rounded-full border border-neutral-800 flex items-center justify-center mx-auto text-neutral-500">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">No active parse results</h3>
                    <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                      Please upload a POS receipt image using the panel on the left, or select one of our pre-loaded prompt sample receipts to start scanning and database matching instantly!
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </div>

      </div>

      {/* Database Catalog Modal */}
      <AnimatePresence>
        {isCatalogOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm p-4 md:p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-left"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900">
                <div className="flex items-center gap-2.5">
                  <Database className="w-5 h-5 text-rose-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">Product Database Catalog</h2>
                    <p className="text-xs text-neutral-400">Browse, search, and manage product pictures ("รูปสินค้า") & catalog entries.</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsCatalogOpen(false);
                    setIsAddingProduct(false);
                  }}
                  className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content - Scrollable */}
              <div className="p-5 overflow-y-auto space-y-6 flex-1 bg-neutral-950/30">
                {/* Actions Row */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
                  {/* Search bar */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Search PLU or Thai product name..." 
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 rounded-xl text-xs text-white transition-all focus:outline-none"
                    />
                  </div>
                  {/* Add Product Toggle */}
                  <button
                    onClick={() => setIsAddingProduct(!isAddingProduct)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md shadow-rose-950/25"
                  >
                    {isAddingProduct ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {isAddingProduct ? "Cancel Form" : "Add New Product"}
                  </button>
                </div>

                {/* Add New Product Form */}
                <AnimatePresence>
                  {isAddingProduct && (
                    <motion.form 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleCreateProduct}
                      className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl space-y-4 overflow-hidden"
                    >
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">Add Product Form</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-neutral-400 uppercase tracking-wider block font-semibold">PLU Code (6-digit)</label>
                          <input 
                            type="text" 
                            required
                            maxLength={6}
                            placeholder="e.g. 321137"
                            value={newProductPlu}
                            onChange={(e) => setNewProductPlu(e.target.value.replace(/\D/g, ""))}
                            className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-850 focus:border-rose-500 rounded-lg text-xs font-mono text-white focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[10px] text-neutral-400 uppercase tracking-wider block font-semibold">Thai Product Name (name_th)</label>
                          <input 
                            type="text" 
                            required
                            placeholder="ชื่อสินค้าภาษาไทย"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-850 focus:border-rose-500 rounded-lg text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-neutral-400 uppercase tracking-wider block font-semibold">Unit Price (฿)</label>
                          <input 
                            type="number" 
                            required
                            step="0.01"
                            placeholder="395.00"
                            value={newProductPrice}
                            onChange={(e) => setNewProductPrice(e.target.value)}
                            className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-850 focus:border-rose-500 rounded-lg text-xs font-mono text-white focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 uppercase tracking-wider block font-semibold">Product Image URL (รูปสินค้า)</label>
                        <input 
                          type="url" 
                          placeholder="https://api.hynessbeauty.com/uploads/images/..."
                          value={newProductImage}
                          onChange={(e) => setNewProductImage(e.target.value)}
                          className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-850 focus:border-rose-500 rounded-lg text-xs text-white focus:outline-none font-mono"
                        />
                      </div>
                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          disabled={dbLoading}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Save Product
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Catalog Grid View */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {products
                    .filter(p => 
                      p.plu.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                      p.name_th.toLowerCase().includes(catalogSearch.toLowerCase())
                    )
                    .map(p => (
                      <div 
                        key={p.plu}
                        className="bg-neutral-900 border border-neutral-800/85 rounded-xl p-3 flex gap-3 hover:border-neutral-700 transition-all group relative text-left"
                      >
                        {/* Product Image */}
                        <div className="w-16 h-16 rounded-lg bg-neutral-950 border border-neutral-850/80 overflow-hidden shrink-0 flex items-center justify-center">
                          {p.image_url ? (
                            <img 
                              src={p.image_url} 
                              alt={p.name_th} 
                              className="object-cover w-full h-full group-hover:scale-105 transition-all duration-300 cursor-zoom-in"
                              referrerPolicy="no-referrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedProduct(p);
                              }}
                            />
                          ) : (
                            <Database className="w-5 h-5 text-neutral-700" />
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[10px] text-rose-400 font-mono font-semibold tracking-wider">
                                PLU {p.plu}
                              </span>
                              <button
                                onClick={() => handleDeleteProduct(p.plu)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all absolute top-2 right-2 cursor-pointer"
                                title="Delete Product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <h4 className="text-xs font-semibold text-white truncate pr-4" title={p.name_th}>
                              {p.name_th}
                            </h4>
                          </div>
                          <div className="text-xs font-bold font-mono text-emerald-400">
                            ฿{Number(p.price).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  {products.filter(p => 
                    p.plu.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                    p.name_th.toLowerCase().includes(catalogSearch.toLowerCase())
                  ).length === 0 && (
                    <div className="col-span-full py-12 text-center space-y-2">
                      <Database className="w-8 h-8 text-neutral-700 mx-auto" />
                      <p className="text-xs text-neutral-500">No products found matching "{catalogSearch}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-neutral-800 bg-neutral-950/50 flex justify-end">
                <button
                  onClick={() => {
                    setIsCatalogOpen(false);
                    setIsAddingProduct(false);
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Close Catalog
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barcode Scanner Modal */}
      {isBarcodeScanning && (
        <BarcodeScannerModal
          products={products}
          onScan={handleBarcodeScanned}
          onClose={() => setIsBarcodeScanning(false)}
          playBeep={playBeep}
        />
      )}

      {/* Product Modal */}
      {expandedProduct && (
        <div 
          className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setExpandedProduct(null)}
        >
          <div className="relative bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setExpandedProduct(null)}
              className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-800 p-2 rounded-full bg-neutral-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="w-full aspect-square rounded-2xl overflow-hidden mb-6 flex items-center justify-center bg-gray-50 border border-neutral-100">
               <img 
                src={expandedProduct.image_url} 
                alt={expandedProduct.name_th} 
                className="object-contain w-full h-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="text-center">
              <div className="inline-block bg-black text-white text-xs font-semibold px-3 py-1 rounded-full mb-3">SEMI</div>
              <h2 className="text-xl font-bold mb-1 text-gray-900">{expandedProduct.name_th}</h2>
              <p className="text-sm text-gray-500 mb-6">PLU: {expandedProduct.plu}</p>
              <div className="bg-gray-50 rounded-2xl p-4 font-bold text-lg text-gray-900 border border-gray-100">
                {expandedProduct.price.toLocaleString()} THB
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
