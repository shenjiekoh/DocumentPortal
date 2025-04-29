import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Create a variable to track active user sessions
let activeConnections = 0;

// Add connection counting middleware
app.use((req, res, next) => {
  // Only count real page requests, not API and resource requests
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    activeConnections++;
    console.log(`New connection, active connections: ${activeConnections}`);
    
    // Decrease count when connection closes
    res.on('close', () => {
      activeConnections--;
      console.log(`Connection closed, active connections: ${activeConnections}`);
      
      // If no active connections, clear files from memory
      if (activeConnections <= 0) {
        console.log('No active connections, clearing memory...');
        storage.clearInputAndOutputDirectories().catch(err => {
          console.error('Error clearing memory:', err);
        });
      }
    });
  }
  
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Clear input and output directories on server startup
  try {
    log('Initializing server, clearing input and output directories...');
    await storage.clearInputAndOutputDirectories();
    log('Directories cleared successfully.');
  } catch (error) {
    log(`Error clearing directories: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
