import express from "express";
import path from "path";
import apiApp from "./api/index.js"; // Import the API routes (using .js for ESM resolution)

// Initialize express app
const app = express();
const PORT = 3000;

// Mount API routes
app.use(apiApp);

// Setup development or production build pipeline
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    // Only import vite dynamically here so Vercel doesn't bundle it
    const viteModule = "vite";
    const { createServer: createViteServer } = await import(viteModule);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully booted and running on http://localhost:${PORT}`);
  });
}

// Only run bootstrap locally, Vercel doesn't use this file anymore
if (!process.env.VERCEL) {
  bootstrap();
}

export default app;
