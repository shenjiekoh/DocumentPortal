import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { SUPPORTED_FILE_TYPES, MAX_FILE_SIZE, insertDocumentSchema } from "@shared/schema";
import path from "path";
import fs from "fs";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (SUPPORTED_FILE_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Unsupported file type. Please upload a supported document."));
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all documents
  app.get('/api/documents', async (req: Request, res: Response) => {
    try {
      const documents = await storage.getAllDocuments();
      res.status(200).json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Get a specific document
  app.get('/api/documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.status(200).json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  // Upload a document
  app.post('/api/documents', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      const filePath = await storage.saveFile(file.originalname, file.buffer);
      
      const documentData = {
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: filePath
      };

      // Parse and validate document data
      const parsedData = insertDocumentSchema.safeParse(documentData);
      if (!parsedData.success) {
        return res.status(400).json({ 
          message: "Invalid document data", 
          errors: parsedData.error.errors 
        });
      }

      const document = await storage.createDocument(parsedData.data);
      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      if (error instanceof Error) {
        res.status(500).json({ message: error.message || "Failed to upload document" });
      } else {
        res.status(500).json({ message: "Failed to upload document" });
      }
    }
  });

  // Download a document
  app.get('/api/documents/:id/download', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const fileBuffer = await storage.getFile(document.path);
      if (!fileBuffer) {
        return res.status(404).json({ message: "File not found" });
      }

      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  // Preview a document
  app.get('/api/documents/:id/preview', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const fileBuffer = await storage.getFile(document.path);
      if (!fileBuffer) {
        return res.status(404).json({ message: "File not found" });
      }

      res.setHeader('Content-Type', document.mimeType);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error previewing document:", error);
      res.status(500).json({ message: "Failed to preview document" });
    }
  });

  // Delete a document
  app.delete('/api/documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const success = await storage.deleteDocument(id);
      if (!success) {
        return res.status(404).json({ message: "Document not found or could not be deleted" });
      }

      res.status(200).json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
