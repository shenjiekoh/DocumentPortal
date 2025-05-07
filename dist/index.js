// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import fs from "fs";
import path from "path";
import { promisify } from "util";
var mkdir = promisify(fs.mkdir);
var writeFile = promisify(fs.writeFile);
var readFile = promisify(fs.readFile);
var unlink = promisify(fs.unlink);
var readdir = promisify(fs.readdir);
var MemStorage = class {
  users;
  documents;
  fileContents;
  // Memory mapping to store file contents
  uploadsDir;
  documentsDir;
  inputDir;
  outputDir;
  resultsDir;
  // Add Results directory path
  currentUserId;
  currentDocumentId;
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.documents = /* @__PURE__ */ new Map();
    this.fileContents = /* @__PURE__ */ new Map();
    this.currentUserId = 1;
    this.currentDocumentId = 1;
    this.documentsDir = path.resolve(process.cwd(), "documents");
    this.inputDir = path.resolve(this.documentsDir, "input");
    this.outputDir = path.resolve(this.documentsDir, "output");
    this.uploadsDir = path.resolve(process.cwd(), "uploads");
    this.resultsDir = path.resolve(process.cwd(), "..", "Results");
    this.ensureDirectoriesExist();
  }
  async ensureDirectoriesExist() {
    for (const dir of [this.documentsDir, this.inputDir, this.outputDir, this.uploadsDir, this.resultsDir]) {
      if (!fs.existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  async createUser(insertUser) {
    const id = this.currentUserId++;
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  async getAllDocuments() {
    return Array.from(this.documents.values()).sort((a, b) => {
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    });
  }
  async getDocument(id) {
    return this.documents.get(id);
  }
  async createDocument(insertDocument) {
    const id = this.currentDocumentId++;
    const uploadedAt = /* @__PURE__ */ new Date();
    const document = { ...insertDocument, id, uploadedAt };
    this.documents.set(id, document);
    return document;
  }
  async deleteDocument(id) {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    try {
      if (this.fileContents.has(document.path)) {
        this.fileContents.delete(document.path);
      }
      if (document.processedPath && this.fileContents.has(document.processedPath)) {
        this.fileContents.delete(document.processedPath);
      }
      this.documents.delete(id);
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      return false;
    }
  }
  async saveFile(originalName, fileBuffer) {
    try {
      const isFormDocument = originalName.includes("-form.docx");
      const isProcessedTemplate = originalName.includes("template_processed");
      let fileName;
      let targetDir;
      if (isFormDocument || isProcessedTemplate) {
        fileName = originalName;
        targetDir = this.resultsDir;
      } else {
        fileName = originalName;
        targetDir = this.inputDir;
      }
      let virtualPath;
      if (isFormDocument || isProcessedTemplate) {
        virtualPath = `Results/${fileName}`;
      } else {
        virtualPath = `documents/input/${fileName}`;
      }
      console.log(`Saving file "${fileName}" to memory with virtual path: ${virtualPath}`);
      this.fileContents.set(virtualPath, fileBuffer);
      if (isFormDocument || isProcessedTemplate) {
        const absolutePath = path.join(targetDir, fileName);
        console.log(`Also saving file to disk at: ${absolutePath}`);
        if (!fs.existsSync(targetDir)) {
          await mkdir(targetDir, { recursive: true });
        }
        await writeFile(absolutePath, fileBuffer);
        console.log(`File saved to disk: ${absolutePath}`);
      }
      return virtualPath;
    } catch (error) {
      console.error("Error saving file:", error);
      throw error;
    }
  }
  async getFile(filePath) {
    try {
      console.log(`Attempting to get file: ${filePath}`);
      if (!filePath) {
        console.error("File path is empty or undefined");
        return void 0;
      }
      let normalizedPath = filePath;
      if (path.isAbsolute(filePath)) {
        normalizedPath = path.relative(process.cwd(), filePath);
      }
      console.log(`Normalized path: ${normalizedPath}`);
      if (this.fileContents.has(normalizedPath)) {
        console.log(`File found in memory at normalized path: ${normalizedPath}`);
        return this.fileContents.get(normalizedPath);
      }
      if (normalizedPath.startsWith("Results/")) {
        const resultsFilePath = path.join(this.resultsDir, path.basename(normalizedPath));
        console.log(`Checking for file on disk in Results directory: ${resultsFilePath}`);
        if (fs.existsSync(resultsFilePath)) {
          console.log(`File found on disk at: ${resultsFilePath}`);
          const fileBuffer = await readFile(resultsFilePath);
          this.fileContents.set(normalizedPath, fileBuffer);
          return fileBuffer;
        }
      }
      if (normalizedPath.includes("_processed") || normalizedPath.includes("-form.docx")) {
        console.log("Looking for processed file in memory or Results directory");
        for (const [storedPath, buffer] of this.fileContents.entries()) {
          if (storedPath.includes("_processed") || storedPath.includes("-form.docx")) {
            console.log(`Found processed file in memory: ${storedPath}`);
            return buffer;
          }
        }
        const resultsFiles = fs.readdirSync(this.resultsDir);
        for (const fileName of resultsFiles) {
          if (fileName.includes("_processed") || fileName.includes("-form.docx")) {
            const filePath2 = path.join(this.resultsDir, fileName);
            console.log(`Found processed file in Results directory: ${filePath2}`);
            const fileBuffer = await readFile(filePath2);
            this.fileContents.set(`Results/${fileName}`, fileBuffer);
            return fileBuffer;
          }
        }
      }
      console.log(`File not found in memory or on disk. Original path: ${filePath}`);
      return void 0;
    } catch (error) {
      console.error(`Error getting file ${filePath}:`, error);
      return void 0;
    }
  }
  async updateDocumentStatus(id, status) {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    const updatedDocument = { ...document, status };
    this.documents.set(id, updatedDocument);
    return true;
  }
  async updateProcessedDocument(id, updates) {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    const updatedDocument = { ...document, ...updates };
    this.documents.set(id, updatedDocument);
    return true;
  }
  // Clear input and output directories
  async clearInputAndOutputDirectories() {
    try {
      console.log("Clearing input and output directories...");
      for (const filePath of Array.from(this.fileContents.keys())) {
        if (filePath.startsWith(this.inputDir)) {
          this.fileContents.delete(filePath);
          console.log(`Deleted input file from memory: ${filePath}`);
        }
      }
      for (const filePath of Array.from(this.fileContents.keys())) {
        if (filePath.startsWith(this.outputDir)) {
          this.fileContents.delete(filePath);
          console.log(`Deleted output file from memory: ${filePath}`);
        }
      }
      this.documents.clear();
      this.currentDocumentId = 1;
      console.log("Input and output directories cleared successfully");
    } catch (error) {
      console.error("Error clearing directories:", error);
    }
  }
  // Get all file names in memory storage (with complete relative paths)
  async getAllFileNames() {
    try {
      const allPaths = Array.from(this.fileContents.keys());
      return allPaths.map((filePath) => {
        if (path.isAbsolute(filePath)) {
          return path.relative(process.cwd(), filePath);
        }
        return filePath;
      });
    } catch (error) {
      console.error("Error getting all file names:", error);
      return [];
    }
  }
  // Get the path to the output directory
  getOutputDir() {
    return this.outputDir;
  }
  // Get the path to the input directory
  getInputDir() {
    return this.inputDir;
  }
  // Get the path to the Results directory
  getResultsDir() {
    return this.resultsDir;
  }
};
var storage = new MemStorage();

// server/routes.ts
import multer from "multer";

// shared/schema.ts
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  originalName: text("originalName").notNull(),
  mimeType: text("mimeType").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  status: text("status").default("uploaded"),
  processedPath: text("processedPath")
});
var insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true
}).extend({
  status: z.string().optional(),
  processedPath: z.string().nullable().optional()
});
var SUPPORTED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/jpeg",
  "image/png"
];
var MAX_FILE_SIZE = 10 * 1024 * 1024;

// server/routes.ts
import path2 from "path";
import fs2 from "fs";
import { exec, spawn } from "child_process";
import util from "util";
var execPromise = util.promisify(exec);
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
    // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (SUPPORTED_FILE_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Unsupported file type. Please upload a supported document."));
  }
});
async function registerRoutes(app2) {
  app2.get("/api/documents", async (req, res) => {
    try {
      const documents2 = await storage.getAllDocuments();
      res.status(200).json(documents2);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });
  app2.get("/api/documents/:id", async (req, res) => {
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
  app2.post("/api/documents", upload.single("file"), async (req, res) => {
    try {
      console.log("File upload request received:", req.file?.originalname);
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const uploadDir = path2.join(process.cwd(), "documents/input");
      if (!fs2.existsSync(uploadDir)) {
        console.log("Creating upload directory:", uploadDir);
        fs2.mkdirSync(uploadDir, { recursive: true });
      }
      const uniquePrefix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const fileName = uniquePrefix + "-" + req.file.originalname;
      const virtualPath = `documents/input/${fileName}`;
      const savedPath = await storage.saveFile(fileName, req.file.buffer);
      console.log("File saved in memory with virtual path:", savedPath);
      const documentData = {
        name: req.file.originalname,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: savedPath,
        status: "pending",
        // Ensure status is set to pending
        processedPath: null
      };
      console.log("Preparing document data:", documentData);
      const parsedData = insertDocumentSchema.safeParse(documentData);
      if (!parsedData.success) {
        console.error("Schema validation failed:", parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid document data",
          errors: parsedData.error.errors
        });
      }
      try {
        console.log("Creating document record...");
        const document = await storage.createDocument(parsedData.data);
        console.log("Document created successfully:", document);
        res.status(201).json({
          message: "Document uploaded successfully",
          document
        });
      } catch (dbError) {
        console.error("Database error creating document:", dbError);
        return res.status(500).json({
          message: "Failed to create document record",
          error: dbError.message
        });
      }
    } catch (error) {
      console.error("Unhandled error in upload handler:", error);
      res.status(500).json({
        message: "Failed to upload document",
        error: error.message
      });
    }
  });
  app2.post("/api/documents/:id/process", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      if (document.status !== "pending" && document.status !== "uploaded") {
        return res.status(400).json({
          message: `Document cannot be processed because its status is '${document.status}' instead of 'pending' or 'uploaded'`
        });
      }
      console.log(`Processing document ID: ${id}, filename: ${document.originalName}`);
      try {
        await storage.updateDocumentStatus(id, "processing");
        const pythonServerResponse = await fetch("http://localhost:8000/process-document", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ document_id: id })
        });
        if (!pythonServerResponse.ok) {
          const errorData = await pythonServerResponse.json();
          console.error(`Python server returned error: ${JSON.stringify(errorData)}`);
          throw new Error(`Python server error: ${errorData.error || "Unknown error"}`);
        }
        const responseData = await pythonServerResponse.json();
        console.log(`Python server response: ${JSON.stringify(responseData)}`);
        res.status(200).json({
          success: true,
          message: "Document processing started successfully"
        });
      } catch (error) {
        console.error(`Error processing document: ${error.message}`);
        await storage.updateDocumentStatus(id, "error");
        if (error.code === "ECONNREFUSED" || error.message.includes("fetch failed")) {
          return res.status(500).json({
            success: false,
            message: "Failed to connect to processing service. Make sure main.py is running.",
            error: error.message
          });
        }
        throw error;
      }
    } catch (error) {
      console.error("Unhandled error in document processing:", error);
      try {
        await storage.updateDocumentStatus(Number(req.params.id), "error");
      } catch (updateErr) {
        console.error("Error updating document status:", updateErr);
      }
      res.status(500).json({
        success: false,
        message: "Failed to process document",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/documents/:id/download-processed", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
      console.log(`Request to download processed document with ID: ${id}`);
      let document = await storage.getDocument(id);
      if (!document) {
        console.log(`Document record with ID ${id} not found, trying to find file directly...`);
        if (id >= 1e3) {
          const resultsDir = storage.getResultsDir();
          if (fs2.existsSync(resultsDir)) {
            const resultsFiles = fs2.readdirSync(resultsDir);
            if (id < 2e3) {
              const fileIndex = id - 1e3;
              const processedFiles = resultsFiles.filter((file) => file.includes("template_processed"));
              if (fileIndex >= 0 && fileIndex < processedFiles.length) {
                const fileName = processedFiles[fileIndex];
                const filePath = path2.join(resultsDir, fileName);
                if (fs2.existsSync(filePath)) {
                  console.log(`File found for virtual ID ${id}: ${filePath}`);
                  document = {
                    id,
                    name: fileName,
                    originalName: fileName,
                    description: "Processed template document",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    size: fs2.statSync(filePath).size,
                    path: `Results/${fileName}`,
                    processedPath: `Results/${fileName}`,
                    status: "processed",
                    uploadedAt: /* @__PURE__ */ new Date()
                  };
                }
              }
            } else if (id >= 2e3) {
              const fileIndex = id - 2e3;
              const formFiles = resultsFiles.filter((file) => file.endsWith("-form.docx"));
              if (fileIndex >= 0 && fileIndex < formFiles.length) {
                const fileName = formFiles[fileIndex];
                const filePath = path2.join(resultsDir, fileName);
                if (fs2.existsSync(filePath)) {
                  console.log(`Form file found for virtual ID ${id}: ${filePath}`);
                  document = {
                    id,
                    name: fileName,
                    originalName: fileName,
                    description: "Processed form document",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    size: fs2.statSync(filePath).size,
                    path: `Results/${fileName}`,
                    processedPath: `Results/${fileName}`,
                    status: "processed",
                    uploadedAt: /* @__PURE__ */ new Date()
                  };
                }
              }
            }
          }
          if (!document) {
            const outputDir = storage.getOutputDir();
            const files = fs2.readdirSync(outputDir);
            const fileIndex = id - 1e3;
            const processedFiles = files.filter((file) => file.includes("template_processed"));
            if (fileIndex >= 0 && fileIndex < processedFiles.length) {
              const fileName = processedFiles[fileIndex];
              const filePath = path2.join(outputDir, fileName);
              if (fs2.existsSync(filePath)) {
                console.log(`File found for virtual ID ${id}: ${filePath}`);
                document = {
                  id,
                  name: fileName,
                  originalName: fileName,
                  description: "Processed template document",
                  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  size: fs2.statSync(filePath).size,
                  path: `documents/output/${fileName}`,
                  processedPath: `documents/output/${fileName}`,
                  status: "processed",
                  uploadedAt: /* @__PURE__ */ new Date()
                };
              }
            }
          }
        }
        if (!document) {
          console.log(`Document with ID ${id} not found in memory or on disk`);
          return res.status(404).json({
            message: "Document not found",
            detail: "The document record could not be found in the database."
          });
        }
      }
      if (document.processedPath && document.processedPath.startsWith("documents/output/")) {
        const filename = path2.basename(document.processedPath);
        const resultsPath = `Results/${filename}`;
        const resultsDir = storage.getResultsDir();
        const fullResultsPath = path2.join(resultsDir, filename);
        console.log(`Checking if processed file exists in Results directory: ${fullResultsPath}`);
        if (fs2.existsSync(fullResultsPath)) {
          console.log(`Found file in Results directory, updating processedPath from ${document.processedPath} to ${resultsPath}`);
          document.processedPath = resultsPath;
        }
      }
      console.log(`Getting file from path: ${document.processedPath}`);
      const fileBuffer = await storage.getFile(document.processedPath);
      if (!fileBuffer) {
        console.log(`File buffer not found for path: ${document.processedPath}`);
        return res.status(404).json({
          message: "Processed file not found",
          detail: "The physical file could not be found on the server."
        });
      }
      const mimeType = document.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${path2.basename(document.processedPath)}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading processed document:", error);
      res.status(500).json({
        message: "Failed to download processed document",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/documents/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
      console.log(`Request to download document with ID: ${id}`);
      let document = await storage.getDocument(id);
      if (!document) {
        console.log(`Document record with ID ${id} not found, trying to find file directly...`);
        if (id >= 1e3) {
          const outputDir = storage.getOutputDir();
          const files = fs2.readdirSync(outputDir);
          const fileIndex = id - 1e3;
          const processedFiles = files.filter((file) => file.includes("template_processed"));
          if (fileIndex >= 0 && fileIndex < processedFiles.length) {
            const fileName = processedFiles[fileIndex];
            const filePath = path2.join(outputDir, fileName);
            if (fs2.existsSync(filePath)) {
              console.log(`File found for virtual ID ${id}: ${filePath}`);
              document = {
                id,
                name: fileName,
                originalName: fileName,
                description: "Processed template document",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                size: fs2.statSync(filePath).size,
                path: `documents/output/${fileName}`,
                processedPath: `documents/output/${fileName}`,
                status: "processed",
                uploadedAt: /* @__PURE__ */ new Date()
              };
            }
          }
        }
        if (!document) {
          return res.status(404).json({
            message: "Document not found",
            detail: "The document record could not be found in the database."
          });
        }
      }
      const fileBuffer = await storage.getFile(document.path);
      if (!fileBuffer) {
        console.log(`File not found at path: ${document.path}`);
        return res.status(404).json({
          message: "File not found",
          detail: "The physical file could not be found on the server."
        });
      }
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${document.originalName}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({
        message: "Failed to download document",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/documents/:id/preview", async (req, res) => {
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
      res.setHeader("Content-Type", document.mimeType);
      if (document.mimeType === "application/pdf") {
        res.setHeader("Content-Disposition", `inline; filename="${document.originalName}"`);
      }
      if (document.mimeType.includes("word") || document.mimeType.includes("excel") || document.mimeType.includes("powerpoint")) {
        res.setHeader("X-Document-Type", "office");
      }
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error previewing document:", error);
      res.status(500).json({ message: "Failed to preview document" });
    }
  });
  app2.delete("/api/documents/:id", async (req, res) => {
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
  app2.post("/api/documents/:id/update-processed", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
      const { processedPath } = req.body;
      if (!processedPath) {
        return res.status(400).json({ message: "Processed path is required" });
      }
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      const fullPath = path2.resolve(process.cwd(), processedPath);
      if (!fs2.existsSync(fullPath)) {
        return res.status(404).json({ message: "Processed file not found at the specified path" });
      }
      await storage.updateProcessedDocument(id, {
        status: "processed",
        processedPath
      });
      res.status(200).json({
        message: "Document processed status updated successfully",
        processedPath
      });
    } catch (error) {
      console.error("Error updating processed document:", error);
      res.status(500).json({ message: "Failed to update processed document" });
    }
  });
  app2.post("/api/documents/:id/update-processed-with-content", upload.single("file"), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file content provided" });
      }
      const { processedPath, status } = req.body;
      if (!processedPath) {
        return res.status(400).json({ message: "Processed path is required" });
      }
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      await storage.saveFile(path2.basename(processedPath), req.file.buffer);
      await storage.updateProcessedDocument(id, {
        status: status || "processed",
        processedPath
      });
      console.log(`Document ${id} updated with processed content and stored in memory at path: ${processedPath}`);
      res.status(200).json({
        message: "Document processed content updated successfully",
        processedPath
      });
    } catch (error) {
      console.error("Error updating processed document with content:", error);
      res.status(500).json({ message: "Failed to update processed document content" });
    }
  });
  app2.post("/api/process-template", async (req, res) => {
    try {
      console.log("Processing template request received");
      const currentDir = process.cwd();
      const scriptPath = path.join(process.cwd(), 'table_filler.py');
      const templateDir = path2.join(currentDir, "template");
      const templateName = "DO_UW WS TEMPLATE_May 2022_use this.docx";
      const templatePath = path2.join(templateDir, templateName);
      const uniqueId = Date.now().toString();
      const outputFilename = `${uniqueId}-form.docx`;
      const outputDir = path2.join(currentDir, "documents", "output");
      const outputPath = path2.join(outputDir, outputFilename);
      const processedPath = `documents/output/${outputFilename}`;
      console.log("Script path:", scriptPath);
      console.log("Template path:", templatePath);
      console.log("Output path:", outputPath);
      if (!fs2.existsSync(scriptPath)) {
        console.error(`table_filler.py not found at ${scriptPath}`);
        return res.status(500).json({
          success: false,
          message: "Processing script not found"
        });
      }
      if (!fs2.existsSync(templatePath)) {
        console.error(`Template file not found at ${templatePath}`);
        return res.status(500).json({
          success: false,
          message: "Template file not found"
        });
      }
      if (!fs2.existsSync(outputDir)) {
        fs2.mkdirSync(outputDir, { recursive: true });
      }
      const resultsDir = path2.join(process.cwd(), "..", "Results");
      if (!fs2.existsSync(resultsDir)) {
        fs2.mkdirSync(resultsDir, { recursive: true });
      }
      const cmd = `python3 "${scriptPath}" --input "${templatePath}" --output "${outputPath}"`;
      console.log("Executing command:", cmd);
      const result = await execPromise(cmd, {
        env: process.env,
        timeout: 3e5
        // 5 minute timeout
      });
      console.log("Command output:", result.stdout);
      if (result.stderr) {
        console.warn("Command stderr:", result.stderr);
      }
      if (!fs2.existsSync(outputPath)) {
        console.error("Output file was not created");
        return res.status(500).json({
          success: false,
          message: "Processing failed - output file not created"
        });
      }
      const fileBuffer = fs2.readFileSync(outputPath);
      const size = fileBuffer.length;
      await storage.saveFile(outputFilename, fileBuffer);
      const documentData = {
        name: "Processed Form",
        originalName: outputFilename,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size,
        path: processedPath,
        status: "processed",
        processedPath
      };
      const parsedData = insertDocumentSchema.safeParse(documentData);
      if (!parsedData.success) {
        console.error("Schema validation failed:", parsedData.error.errors);
        return res.status(400).json({
          success: false,
          message: "Invalid document data"
        });
      }
      const document = await storage.createDocument(parsedData.data);
      console.log("Document created with ID:", document.id);
      try {
        fs2.unlinkSync(outputPath);
        console.log(`Removed temporary file from disk: ${outputPath}`);
      } catch (err) {
        console.warn("Failed to remove temporary file:", err);
      }
      res.status(200).json({
        success: true,
        message: "Template processed successfully",
        processedPath,
        documentId: document.id
      });
    } catch (error) {
      console.error("Error processing template:", error);
      let errorMessage = "Failed to process template";
      if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
      }
      res.status(500).json({
        success: false,
        message: errorMessage
      });
    }
  });
  app2.get("/api/download-template", async (req, res) => {
    try {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).json({ message: "File path is required" });
      }
      if (!filePath.startsWith("documents/output/")) {
        return res.status(400).json({ message: "Invalid file path" });
      }
      const fileBuffer = await storage.getFile(filePath);
      if (!fileBuffer) {
        return res.status(404).json({ message: "File not found in memory storage" });
      }
      const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${path2.basename(filePath)}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading template:", error);
      res.status(500).json({ message: "Failed to download template" });
    }
  });
  app2.get("/api/output-files", async (req, res) => {
    try {
      console.log("API request received for processed template files");
      const allDocuments = await storage.getAllDocuments();
      const processedDocuments = allDocuments.filter(
        (doc) => doc.status === "processed" && doc.processedPath && doc.processedPath.includes("-form.docx")
      );
      console.log(`Found ${processedDocuments.length} processed documents in storage`);
      if (processedDocuments.length === 0) {
        try {
          const resultsDir = path2.join(process.cwd(), "..", "Results");
          if (fs2.existsSync(resultsDir)) {
            const files = fs2.readdirSync(resultsDir);
            console.log(`Found ${files.length} files in Results directory as fallback`);
            const formFiles = files.filter((file) => {
              return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-form\.docx$/i.test(file);
            });
            console.log(`Found ${formFiles.length} form files as fallback`);
            if (formFiles.length > 0) {
              const fallbackDocuments = formFiles.map((fileName, index) => {
                const filePath = path2.join(resultsDir, fileName);
                const stats = fs2.statSync(filePath);
                return {
                  id: 2e3 + index,
                  // 使用2000起始的ID范围，避免与现有文档冲突
                  name: "Processed Template Form",
                  // 修改这里，明确说明这是处理后的模板
                  originalName: "Form Template Result",
                  // 修改这里，明确说明这是处理后的表单
                  description: "AI processed form document based on template",
                  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  size: stats.size,
                  path: `../Results/${fileName}`,
                  // 使用相对路径指向顶层Results目录
                  processedPath: `../Results/${fileName}`,
                  status: "processed",
                  uploadedAt: stats.mtime.toISOString()
                };
              });
              console.log(`Returning ${fallbackDocuments.length} processed documents from fallback`);
              return res.status(200).json(fallbackDocuments);
            }
          }
        } catch (fallbackError) {
          console.error("Error checking fallback directory:", fallbackError);
        }
      }
      console.log(`Returning ${processedDocuments.length} processed documents from API storage`);
      res.status(200).json(processedDocuments);
    } catch (error) {
      console.error("Error fetching output files:", error);
      res.status(500).json({ message: "Failed to fetch output files" });
    }
  });
  app2.post("/api/clear-memory", async (req, res) => {
    try {
      console.log("API request to clear memory received");
      await storage.clearInputAndOutputDirectories();
      console.log("Memory cleared via API request");
      res.status(200).json({ message: "Memory cleared successfully" });
    } catch (error) {
      console.error("Error clearing memory:", error);
      res.status(500).json({ message: "Failed to clear memory" });
    }
  });
  app2.post("/api/process-template-in-memory", async (req, res) => {
    try {
      console.log("Processing template in-memory request received");
      const currentDir = process.cwd();
      const scriptPath = path.join(process.cwd(), 'main.py');
      const templateDir = path2.join(currentDir, "template");
      const templateName = "DO_UW WS TEMPLATE_May 2022_use this.docx";
      const templatePath = path2.join(templateDir, templateName);
      const uniqueId = Date.now().toString();
      const outputFilename = `${uniqueId}-template_processed.docx`;
      const processedPath = `documents/output/${outputFilename}`;
      console.log("Main script path:", scriptPath);
      console.log("Template path:", templatePath);
      if (!fs2.existsSync(scriptPath)) {
        console.error(`main.py not found at ${scriptPath}`);
        return res.status(500).json({
          success: false,
          message: "Processing script not found"
        });
      }
      if (!fs2.existsSync(templatePath)) {
        console.error(`Template file not found at ${templatePath}`);
        return res.status(500).json({
          success: false,
          message: "Template file not found"
        });
      }
      const pythonProcess = spawn("python3", [
        scriptPath,
        "--template",
        templatePath,
        "--memory"
        // Signal to use memory mode instead of file output
      ]);
      let stdoutData = "";
      let stderrData = "";
      let docxBase64 = "";
      let processingOutput = "";
      let inBase64Section = false;
      pythonProcess.stdout.on("data", (data) => {
        const textChunk = data.toString();
        stdoutData += textChunk;
        for (const line of textChunk.split("\n")) {
          if (line.includes("BEGIN_DOCX_BASE64")) {
            inBase64Section = true;
            continue;
          } else if (line.includes("END_DOCX_BASE64")) {
            inBase64Section = false;
            continue;
          }
          if (inBase64Section) {
            docxBase64 += line.trim();
          } else if (line.trim()) {
            processingOutput += line + "\n";
          }
        }
      });
      pythonProcess.stderr.on("data", (data) => {
        stderrData += data.toString();
        console.error(`Python error: ${data.toString()}`);
      });
      await new Promise((resolve, reject) => {
        pythonProcess.on("close", (code) => {
          console.log(`Python process exited with code ${code}`);
          if (code === 0) {
            resolve(true);
          } else {
            reject(new Error(`Python process failed with code ${code}`));
          }
        });
        setTimeout(() => {
          pythonProcess.kill();
          reject(new Error("Python processing timed out after 5 minutes"));
        }, 3e5);
      });
      if (!docxBase64) {
        console.error("No DOCX data received from Python script");
        return res.status(500).json({
          success: false,
          message: "Processing failed - no document data received"
        });
      }
      const fileBuffer = Buffer.from(docxBase64, "base64");
      const size = fileBuffer.length;
      console.log(`Received document data: ${size} bytes`);
      await storage.saveFile(outputFilename, fileBuffer);
      const documentData = {
        name: "Processed Template",
        originalName: templateName,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size,
        path: `template/${templateName}`,
        status: "processed",
        processedPath
      };
      const parsedData = insertDocumentSchema.safeParse(documentData);
      if (!parsedData.success) {
        console.error("Schema validation failed:", parsedData.error.errors);
        return res.status(400).json({
          success: false,
          message: "Invalid document data"
        });
      }
      const document = await storage.createDocument(parsedData.data);
      console.log("Document created with ID:", document.id);
      res.status(200).json({
        success: true,
        message: "Template processed successfully in memory",
        processedPath,
        documentId: document.id,
        processingOutput
      });
    } catch (error) {
      console.error("Error processing template in memory:", error);
      let errorMessage = "Failed to process template in memory";
      if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
      }
      res.status(500).json({
        success: false,
        message: errorMessage
      });
    }
  });
  app2.get("/api/form-documents", async (req, res) => {
    try {
      console.log("Fetching form documents...");
      const allFileNames = await storage.getAllFileNames();
      console.log("All file names:", allFileNames);
      const formDocFiles = allFileNames.filter(
        (fileName) => fileName.endsWith("-form.docx")
      );
      console.log("Form document files:", formDocFiles);
      const formDocuments = await Promise.all(formDocFiles.map(async (filePath, index) => {
        try {
          const fileBuffer = await storage.getFile(filePath);
          const fileSize = fileBuffer ? fileBuffer.length : 0;
          const fileName = path2.basename(filePath);
          console.log(`Form document ${index}: ${fileName}, size: ${fileSize} bytes`);
          return {
            id: 2e3 + index,
            name: fileName,
            originalName: fileName,
            description: "Processed form document",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: fileSize,
            path: filePath,
            processedPath: filePath,
            status: "processed",
            uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        } catch (error) {
          console.error(`Error processing form document ${filePath}:`, error);
          return null;
        }
      }));
      const validFormDocuments = formDocuments.filter((doc) => doc !== null);
      console.log(`Returning ${validFormDocuments.length} valid form documents`);
      res.json(validFormDocuments);
    } catch (error) {
      console.error("Error fetching form documents:", error);
      res.status(500).json({ message: "Failed to fetch form documents" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs3 from "fs";
import path4 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path3 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path3.resolve(__dirname, "client", "src"),
      "@shared": path3.resolve(__dirname, "shared"),
      "@assets": path3.resolve(__dirname, "attached_assets")
    }
  },
  root: path3.resolve(__dirname, "client"),
  build: {
    outDir: path3.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
import { fileURLToPath as fileURLToPath2 } from "url";
var __filename = fileURLToPath2(import.meta.url);
var __dirname2 = path4.dirname(__filename);
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path4.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs3.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path4.resolve(__dirname2, "public");
  if (!fs3.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path4.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
var activeConnections = 0;
app.use((req, res, next) => {
  if (!req.path.startsWith("/api") && !req.path.includes(".")) {
    activeConnections++;
    console.log(`New connection, active connections: ${activeConnections}`);
    res.on("close", () => {
      activeConnections--;
      console.log(`Connection closed, active connections: ${activeConnections}`);
      if (activeConnections <= 0) {
        console.log("No active connections, clearing memory...");
        storage.clearInputAndOutputDirectories().catch((err) => {
          console.error("Error clearing memory:", err);
        });
      }
    });
  }
  next();
});
app.use((req, res, next) => {
  const start = Date.now();
  const path5 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path5.startsWith("/api")) {
      let logLine = `${req.method} ${path5} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  try {
    log("Initializing server, clearing input and output directories...");
    await storage.clearInputAndOutputDirectories();
    log("Directories cleared successfully.");
  } catch (error) {
    log(`Error clearing directories: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
