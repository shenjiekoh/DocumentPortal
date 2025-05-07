import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { SUPPORTED_FILE_TYPES, MAX_FILE_SIZE, insertDocumentSchema } from "@shared/schema";
import path from "path";
import fs from "fs";
import os from "os";
import { exec, spawn } from "child_process";
import util from "util";

// Promisify exec
const execPromise = util.promisify(exec);

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE // Now using the increased 100MB limit
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
      
      // Filter out template files and automatically generated output files
      const filteredDocuments = documents.filter(doc => {
        // Exclude template files (starting with DO_UW WS TEMPLATE or containing template_processed)
        const isTemplateFile = doc.name.includes('TEMPLATE') || 
                              doc.originalName.includes('TEMPLATE');
        
        // Exclude automatically generated output files (starting with DO)
        const isGeneratedOutput = doc.name.startsWith('DO') || 
                                 doc.originalName.startsWith('DO');
        
        // Return files that don't belong to either category
        return !isTemplateFile && !isGeneratedOutput;
      });
      
      res.status(200).json(filteredDocuments);
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
      console.log("File upload request received:", req.file?.originalname);
      
      // Validate file
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
  
      // Ensure upload directory exists
      const uploadDir = path.join(process.cwd(), 'documents/input');
      if (!fs.existsSync(uploadDir)) {
        console.log("Creating upload directory:", uploadDir);
        fs.mkdirSync(uploadDir, { recursive: true });
      }
  
      // Custom filename to avoid conflicts
      const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileName = uniquePrefix + '-' + req.file.originalname;
      const virtualPath = `documents/input/${fileName}`;
      
      // Save file to memory instead of disk
      const savedPath = await storage.saveFile(fileName, req.file.buffer);
      console.log("File saved in memory with virtual path:", savedPath);
      
      // Prepare document data
      const documentData = {
        name: req.file.originalname,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: savedPath,
        status: 'pending', // Ensure status is set to pending
        processedPath: null
      };
      
      console.log("Preparing document data:", documentData);
      
      // Validate document data
      const parsedData = insertDocumentSchema.safeParse(documentData);
      if (!parsedData.success) {
        console.error("Schema validation failed:", parsedData.error.errors);
        return res.status(400).json({ 
          message: "Invalid document data", 
          errors: parsedData.error.errors 
        });
      }
  
      // Create document record
      try {
        console.log("Creating document record...");
        const document = await storage.createDocument(parsedData.data);
        console.log("Document created successfully:", document);
        
        res.status(201).json({
          message: "Document uploaded successfully",
          document: document
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

  // Process a document with main.py
  app.post('/api/documents/:id/process', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
  
      // Get document status
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
  
      // Ensure only pending documents can be processed
      if (document.status !== 'pending') {
        return res.status(400).json({ 
          message: `Document cannot be processed because its status is '${document.status}' instead of 'pending' or 'uploaded'` 
        });
      }
  
      console.log(`Processing document ID: ${id}, filename: ${document.originalName}`);
      
      try {
        // 1. Update status to "processing"
        await storage.updateDocumentStatus(id, 'processing');
        
        // 2. Send request to process the document to the Python server
        // The Python server is running on port 8000 and listening for document processing requests
        const pythonServerResponse = await fetch('http://localhost:8000/process-document', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ document_id: id }),
        });
        
        if (!pythonServerResponse.ok) {
          const errorData = await pythonServerResponse.json();
          console.error(`Python server returned error: ${JSON.stringify(errorData)}`);
          throw new Error(`Python server error: ${errorData.error || 'Unknown error'}`);
        }
        
        const responseData = await pythonServerResponse.json();
        console.log(`Python server response: ${JSON.stringify(responseData)}`);
        
        // 3. Return success result
        res.status(200).json({
          success: true,
          message: "Document processing started successfully",
        });
        
      } catch (error) {
        console.error(`Error processing document: ${error.message}`);
        
        // Update document status to error
        await storage.updateDocumentStatus(id, 'error');
        
        // Check if the error is due to Python server not running
        if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
          return res.status(500).json({
            success: false,
            message: "Failed to connect to processing service. Make sure main.py is running.",
            error: error.message
          });
        }
        
        throw error; // Re-throw for the outer catch block
      }
    } catch (error) {
      console.error("Unhandled error in document processing:", error);
      
      // Try to update document status to error if not already done
      try {
        await storage.updateDocumentStatus(Number(req.params.id), 'error');
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

  // Download a processed document
  app.get('/api/documents/:id/download-processed', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      console.log(`Request to download processed document with ID: ${id}`);
      let document = await storage.getDocument(id);
      
      // Special case: Server restart causing memory data loss or processing template generated files
      if (!document) {
        console.log(`Document record with ID ${id} not found, trying to find file directly...`);
        
        // Check if it's a virtual ID (from output-files endpoint)
        if (id >= 1000) {
          // First check Results directory for processed files
          const resultsDir = storage.getResultsDir();
          if (fs.existsSync(resultsDir)) {
            const resultsFiles = fs.readdirSync(resultsDir);
            
            // For IDs 1000-1999: template_processed files
            if (id < 2000) {
              const fileIndex = id - 1000;
              const processedFiles = resultsFiles.filter(file => file.includes('template_processed'));
              
              if (fileIndex >= 0 && fileIndex < processedFiles.length) {
                const fileName = processedFiles[fileIndex];
                const filePath = path.join(resultsDir, fileName);
                
                if (fs.existsSync(filePath)) {
                  console.log(`File found for virtual ID ${id}: ${filePath}`);
                  // Create temporary document object
                  document = {
                    id: id,
                    name: fileName,
                    originalName: fileName,
                    description: "Processed template document",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    size: fs.statSync(filePath).size,
                    path: `Results/${fileName}`,
                    processedPath: `Results/${fileName}`,
                    status: 'processed',
                    uploadedAt: new Date()
                  };
                }
              }
            }
            // For IDs 2000+: form documents (-form.docx files)
            else if (id >= 2000) {
              const fileIndex = id - 2000;
              const formFiles = resultsFiles.filter(file => file.endsWith('-form.docx'));
              
              if (fileIndex >= 0 && fileIndex < formFiles.length) {
                const fileName = formFiles[fileIndex];
                const filePath = path.join(resultsDir, fileName);
                
                if (fs.existsSync(filePath)) {
                  console.log(`Form file found for virtual ID ${id}: ${filePath}`);
                  // Create temporary document object
                  document = {
                    id: id,
                    name: fileName,
                    originalName: fileName,
                    description: "Processed form document",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    size: fs.statSync(filePath).size,
                    path: `Results/${fileName}`,
                    processedPath: `Results/${fileName}`,
                    status: 'processed',
                    uploadedAt: new Date()
                  };
                }
              }
            }
          }
          
          // If still can't find in Results dir, check output directory as fallback
          if (!document) {
            const outputDir = storage.getOutputDir();
            const files = fs.readdirSync(outputDir);
            
            // Index should be offset relative to 1000
            const fileIndex = id - 1000;
            const processedFiles = files.filter(file => file.includes('template_processed'));
            
            if (fileIndex >= 0 && fileIndex < processedFiles.length) {
              const fileName = processedFiles[fileIndex];
              const filePath = path.join(outputDir, fileName);
              
              if (fs.existsSync(filePath)) {
                console.log(`File found for virtual ID ${id}: ${filePath}`);
                // Create temporary document object
                document = {
                  id: id,
                  name: fileName,
                  originalName: fileName,
                  description: "Processed template document",
                  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  size: fs.statSync(filePath).size,
                  path: `documents/output/${fileName}`,
                  processedPath: `documents/output/${fileName}`,
                  status: 'processed',
                  uploadedAt: new Date()
                };
              }
            }
          }
        }
        
        // If document still not found, return error
        if (!document) {
          console.log(`Document with ID ${id} not found in memory or on disk`);
          return res.status(404).json({ 
            message: "Document not found", 
            detail: "The document record could not be found in the database."
          });
        }
      }

      // If processedPath is in old documents/output format, check if file exists in Results dir instead
      if (document.processedPath && document.processedPath.startsWith('documents/output/')) {
        const filename = path.basename(document.processedPath);
        const resultsPath = `Results/${filename}`;
        const resultsDir = storage.getResultsDir();
        const fullResultsPath = path.join(resultsDir, filename);
        
        console.log(`Checking if processed file exists in Results directory: ${fullResultsPath}`);
        if (fs.existsSync(fullResultsPath)) {
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

      // Set appropriate MIME type, always use correct Word document MIME type
      const mimeType = document.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(document.processedPath)}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading processed document:", error);
      res.status(500).json({ 
        message: "Failed to download processed document",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Download a document
  app.get('/api/documents/:id/download', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      console.log(`Request to download document with ID: ${id}`);
      let document = await storage.getDocument(id);
      
      // If document doesn't exist, try to find the file
      if (!document) {
        console.log(`Document record with ID ${id} not found, trying to find file directly...`);
        // Check special case: if ID is generated through template processing special ID
        if (id >= 1000) {  // These are IDs used by the output-files endpoint
          const outputDir = storage.getOutputDir();
          const files = fs.readdirSync(outputDir);
          
          // Index should be offset relative to 1000
          const fileIndex = id - 1000;
          const processedFiles = files.filter(file => file.includes('template_processed'));
          
          if (fileIndex >= 0 && fileIndex < processedFiles.length) {
            const fileName = processedFiles[fileIndex];
            const filePath = path.join(outputDir, fileName);
            
            if (fs.existsSync(filePath)) {
              console.log(`File found for virtual ID ${id}: ${filePath}`);
              // Create temporary document object
              document = {
                id: id,
                name: fileName,
                originalName: fileName,
                description: "Processed template document",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                size: fs.statSync(filePath).size,
                path: `documents/output/${fileName}`,
                processedPath: `documents/output/${fileName}`,
                status: 'processed',
                uploadedAt: new Date()
              };
            }
          }
        }
        
        // If still can't find document, return error
        if (!document) {
          return res.status(404).json({ 
            message: "Document not found", 
            detail: "The document record could not be found in the database." 
          });
        }
      }

      // Check file existence
      const fileBuffer = await storage.getFile(document.path);
      if (!fileBuffer) {
        console.log(`File not found at path: ${document.path}`);
        return res.status(404).json({ 
          message: "File not found", 
          detail: "The physical file could not be found on the server." 
        });
      }

      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ 
        message: "Failed to download document",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
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

  // Update a document's status directly
  app.post('/api/documents/:id/set-status', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // Validate if the status is valid
      const validStatuses = ['pending', 'processing', 'processed', 'error'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: "Invalid status. Valid values are: pending, processing, processed, error" 
        });
      }

      // Check if the document exists
      const document = await storage.getDocument(id);
      if (!document) {
        // For status updates, if the document doesn't exist, return 404 without trying to create a new document
        return res.status(404).json({ message: "Document not found" });
      }

      // Update document status directly
      await storage.updateDocumentStatus(id, status);
      
      res.status(200).json({ 
        message: `Document status updated to '${status}' successfully`,
        documentId: id,
        status: status
      });
    } catch (error) {
      console.error("Error updating document status:", error);
      res.status(500).json({ 
        message: "Failed to update document status",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add new process-template and download-template routes
  app.post('/api/process-template', async (req: Request, res: Response) => {
    try {
      console.log("Processing template request received");
      
      // 1. Set paths
      const currentDir = process.cwd();
      const scriptPath = path.join(process.cwd(), 'table_filler.py');
      const templateDir = path.join(currentDir, 'template');
      const templateName = 'DO_UW WS TEMPLATE_May 2022_use this.docx';
      const templatePath = path.join(templateDir, templateName);
      const uniqueId = Date.now().toString();
      const outputFilename = `${uniqueId}-form.docx`;
      
      const tempDir = path.join(os.tmpdir(), 'labuan-temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempOutputPath = path.join(tempDir, outputFilename);
      
      const memoryPath = `documents/output/${outputFilename}`;
      
      console.log("Script path:", scriptPath);
      console.log("Template path:", templatePath);
      console.log("Temp output path:", tempOutputPath);
      console.log("Memory path:", memoryPath);
      
      // 2. Check file existence
      if (!fs.existsSync(scriptPath)) {
        console.error(`table_filler.py not found at ${scriptPath}`);
        return res.status(500).json({ 
          success: false, 
          message: "Processing script not found"
        });
      }
      
      if (!fs.existsSync(templatePath)) {
        console.error(`Template file not found at ${templatePath}`);
        return res.status(500).json({ 
          success: false, 
          message: "Template file not found"
        });
      }
      
      // 3. Build command and execute
      const cmd = `python3 "${scriptPath}" --input "${templatePath}" --output "${tempOutputPath}"`;
      console.log("Executing command:", cmd);
      
      const result = await execPromise(cmd, {
        env: process.env,
        timeout: 300000 // 5 minute timeout
      });
      
      console.log("Command output:", result.stdout);
      if (result.stderr) {
        console.warn("Command stderr:", result.stderr);
      }
      
      // 4. Check result and read into memory
      if (!fs.existsSync(tempOutputPath)) {
        console.error("Output file was not created");
        return res.status(500).json({ 
          success: false, 
          message: "Processing failed - output file not created"
        });
      }
      
      // 读取文件内容到内存
      const fileBuffer = fs.readFileSync(tempOutputPath);
      const size = fileBuffer.length;
      
      // 存储文件内容到内存
      await storage.saveFile(outputFilename, fileBuffer);
      
      // 5. Remove temporary file
      try {
        fs.unlinkSync(tempOutputPath);
        console.log(`Removed temporary file: ${tempOutputPath}`);
      } catch (err) {
        console.warn("Failed to remove temporary file:", err);
      }
      
      // 6. Create record
      const documentData = {
        name: "Processed Form",
        originalName: outputFilename,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: size,
        path: memoryPath,
        status: 'processed',
        processedPath: memoryPath
      };
      
      // 7. Validate data and save
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
      
      // 8. Return response
      res.status(200).json({ 
        success: true, 
        message: "Template processed successfully",
        processedPath: memoryPath,
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

  // Add endpoint to download template by path
  app.get('/api/download-template', async (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string;
      
      if (!filePath) {
        return res.status(400).json({ message: "File path is required" });
      }
      
      console.log(`Attempting to download file from path: ${filePath}`);
      
      let fileBuffer = await storage.getFile(filePath);
      
      if (!fileBuffer) {
        const fileName = path.basename(filePath);
        console.log(`File not found at ${filePath}, trying with just filename: ${fileName}`);
        fileBuffer = await storage.getFile(fileName);
      }
      
      if (!fileBuffer) {
        const outputPath = `documents/output/${path.basename(filePath)}`;
        console.log(`Still not found, trying in output directory: ${outputPath}`);
        fileBuffer = await storage.getFile(outputPath);
      }
      
      if (!fileBuffer) {
        console.error(`File not found in any location: ${filePath}`);
        return res.status(404).json({ message: "File not found in storage" });
      }
      
      // Get the file's MIME type
      const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      
      // Set appropriate headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      
      // Send file buffer
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading template:", error);
      res.status(500).json({ message: "Failed to download template" });
    }
  });

  // Get all files from API instead of file system
  app.get('/api/output-files', async (req: Request, res: Response) => {
    try {
      console.log("API request received for processed template files");
      
      const allFileNames = await storage.getAllFileNames();
      console.log("All file names in storage:", allFileNames);
      
      const outputFiles = allFileNames.filter(fileName => {
        const basename = path.basename(fileName);
        return basename.startsWith('DO');
      });
      console.log(`Found ${outputFiles.length} output files in memory storage`);
      
      const outputDocuments = await Promise.all(outputFiles.map(async (fileName, index) => {
        try {
          const fileBuffer = await storage.getFile(fileName);
          if (!fileBuffer) {
            console.log(`No buffer found for file: ${fileName}`);
            return null;
          }
          
          const fileSize = fileBuffer.length;
          const baseName = path.basename(fileName);
          
          console.log(`Output file ${index}: ${baseName}, size: ${fileSize} bytes`);
          
          return {
            id: 3000 + index, 
            name: baseName,
            originalName: baseName,
            description: "Processed document from memory storage",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: fileSize,
            path: fileName,
            processedPath: fileName,
            status: "processed",
            uploadedAt: new Date().toISOString()
          };
        } catch (error) {
          console.error(`Error processing output file ${fileName}:`, error);
          return null;
        }
      }));
      
      const validDocuments = outputDocuments.filter(doc => doc !== null);
      console.log(`Returning ${validDocuments.length} valid output documents`);
      
      res.status(200).json(validDocuments);
    } catch (error) {
      console.error("Error fetching output files:", error);
      res.status(500).json({ message: "Failed to fetch output files" });
    }
  });

  // Add endpoint to clear files in memory
  app.post('/api/clear-memory', async (req: Request, res: Response) => {
    try {
      console.log('API request to clear memory received');
      await storage.clearInputAndOutputDirectories();
      console.log('Memory cleared via API request');
      res.status(200).json({ message: "Memory cleared successfully" });
    } catch (error) {
      console.error("Error clearing memory:", error);
      res.status(500).json({ message: "Failed to clear memory" });
    }
  });

  // Process template in memory without saving to disk
  app.post('/api/process-template-in-memory', async (req: Request, res: Response) => {
    try {
      console.log("Processing template in-memory request received");
      
      // 1. Set paths
      const currentDir = process.cwd();
      const scriptPath = path.join(process.cwd(), 'main.py');
      const templateDir = path.join(currentDir, 'template');
      const templateName = 'DO_UW WS TEMPLATE_May 2022_use this.docx';
      const templatePath = path.join(templateDir, templateName);
      const uniqueId = Date.now().toString();
      const outputFilename = `${uniqueId}-template_processed.docx`;
      const processedPath = `documents/output/${outputFilename}`;
      
      console.log("Main script path:", scriptPath);
      console.log("Template path:", templatePath);
      
      // 2. Check file existence
      if (!fs.existsSync(scriptPath)) {
        console.error(`main.py not found at ${scriptPath}`);
        return res.status(500).json({ 
          success: false, 
          message: "Processing script not found"
        });
      }
      
      if (!fs.existsSync(templatePath)) {
        console.error(`Template file not found at ${templatePath}`);
        return res.status(500).json({ 
          success: false, 
          message: "Template file not found"
        });
      }
      
      // 3. Call Python script with special "--memory" flag to use new get_docx_bytes() function
      const pythonProcess = spawn('python3', [
        scriptPath,
        '--template',
        templatePath,
        '--memory'  // Signal to use memory mode instead of file output
      ]);
      
      let stdoutData = '';
      let stderrData = '';
      let docxBase64 = '';
      let processingOutput = '';
      let inBase64Section = false;
      
      // Process standard output
      pythonProcess.stdout.on('data', (data) => {
        const textChunk = data.toString();
        stdoutData += textChunk;
        
        // Parse output lines to capture base64 docx data
        for (const line of textChunk.split('\n')) {
          if (line.includes('BEGIN_DOCX_BASE64')) {
            inBase64Section = true;
            continue;
          } else if (line.includes('END_DOCX_BASE64')) {
            inBase64Section = false;
            continue;
          }
          
          if (inBase64Section) {
            docxBase64 += line.trim();
          } else if (line.trim()) {
            processingOutput += line + '\n';
          }
        }
      });
      
      // Handle errors
      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        console.error(`Python error: ${data.toString()}`);
      });
      
      // Wait for the process to complete
      await new Promise((resolve, reject) => {
        pythonProcess.on('close', (code) => {
          console.log(`Python process exited with code ${code}`);
          if (code === 0) {
            resolve(true);
          } else {
            reject(new Error(`Python process failed with code ${code}`));
          }
        });
        
        // Set a timeout to prevent hanging forever
        setTimeout(() => {
          pythonProcess.kill();
          reject(new Error('Python processing timed out after 5 minutes'));
        }, 300000); // 5 minute timeout
      });
      
      // Check if we got the docx data
      if (!docxBase64) {
        console.error("No DOCX data received from Python script");
        return res.status(500).json({ 
          success: false, 
          message: "Processing failed - no document data received"
        });
      }
      
      // Convert base64 to buffer
      const fileBuffer = Buffer.from(docxBase64, 'base64');
      const size = fileBuffer.length;
      
      console.log(`Received document data: ${size} bytes`);
      
      // Store file content in memory
      await storage.saveFile(outputFilename, fileBuffer);
      
      // Create document record
      const documentData = {
        name: "Processed Template",
        originalName: templateName,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: size,
        path: `template/${templateName}`,
        status: 'processed',
        processedPath: processedPath
      };
      
      // Validate data and save
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
      
      // Return success response with document data
      res.status(200).json({ 
        success: true, 
        message: "Template processed successfully in memory",
        processedPath: processedPath,
        documentId: document.id,
        processingOutput: processingOutput
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

  // List all processed documents with -form.docx suffix
  app.get('/api/form-documents', async (req, res) => {
    try {
      console.log('Fetching form documents from memory storage...');
      const allFileNames = await storage.getAllFileNames();
      console.log('All file names in storage:', allFileNames);
      
      const formDocFiles = allFileNames.filter(fileName => 
        fileName.endsWith('-form.docx') || fileName.startsWith('DO_UW WS_') || 
        path.basename(fileName).startsWith('DO_UW WS_')
      );
      
      console.log(`Found ${formDocFiles.length} form documents in memory:`);
      formDocFiles.forEach(file => console.log(`- ${file}`));
      
      const formDocuments = await Promise.all(formDocFiles.map(async (filePath, index) => {
        try {
          const fileBuffer = await storage.getFile(filePath);
          if (!fileBuffer) {
            console.log(`No buffer found for file: ${filePath}`);
            return null;
          }
          
          const fileSize = fileBuffer.length;
          const fileName = path.basename(filePath);
          
          console.log(`Form document ${index}: ${fileName}, size: ${fileSize} bytes`);
          
          return {
            id: 2000 + index,
            name: fileName,
            originalName: fileName,
            description: "Processed form document",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: fileSize,
            path: filePath,
            processedPath: filePath,
            status: "processed",
            uploadedAt: new Date().toISOString()
          };
        } catch (error) {
          console.error(`Error processing form document ${filePath}:`, error);
          return null;
        }
      }));
      
      const validFormDocuments = formDocuments.filter(doc => doc !== null);
      console.log(`Returning ${validFormDocuments.length} valid form documents`);
      
      if (validFormDocuments.length === 0) {
        console.log('No form documents found, checking recently created documents');
        const recentDocuments = await storage.getAllDocuments();
        const processedDocs = recentDocuments.filter(doc => 
          doc.status === 'processed' && doc.processedPath
        ).slice(0, 5); 
        
        if (processedDocs.length > 0) {
          console.log(`Found ${processedDocs.length} recently processed documents as fallback`);
          processedDocs.forEach((doc, i) => {
            doc.id = 2000 + i; 
            doc.description = "Recently processed document";
          });
          
          return res.json(processedDocs);
        }
      }
      
      res.json(validFormDocuments);
    } catch (error) {
      console.error('Error fetching form documents:', error);
      res.status(500).json({ message: 'Failed to fetch form documents' });
    }
  });

  // Receive form documents from main.py
  app.post('/api/form-document-upload', async (req: Request, res: Response) => {
    try {
      const { name, content, type } = req.body;
      
      if (!name || !content || !type) {
        return res.status(400).json({ 
          success: false,
          message: "Missing required fields: name, content, and type are required" 
        });
      }
      
      console.log(`Receiving form document upload: ${name}`);
      
      const allFileNames = await storage.getAllFileNames();
      const baseName = name.includes('/') ? name.split('/').pop() : name;
      const fileExists = allFileNames.some(fileName => 
        fileName === name || 
        fileName === `Results/${name}` ||
        fileName === baseName ||
        fileName.endsWith(`/${baseName}`)
      );
      
      if (fileExists) {
        console.log(`File ${name} already exists in storage, skipping upload`);
        return res.status(200).json({
          success: true,
          message: "File already exists in system",
          documentId: -1,
          duplicateFile: true
        });
      }
      
      // Decode base64 content to buffer
      const fileBuffer = Buffer.from(content, 'base64');
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid file content" 
        });
      }
      
      const storageName = name;
      
      // Save file to memory storage (just store in memory, don't create a document record)
      await storage.saveFile(storageName, fileBuffer);
      
      const isProcessedOutput = name.endsWith('-form.docx');
      
      if (isProcessedOutput) {
        console.log(`File ${name} is a processed output file, storing without creating document record`);
        
        res.status(200).json({
          success: true,
          message: "Processed file saved successfully",
          documentId: -1,
          filePath: storageName
        });
      } else {
        // Create document record
        const documentData = {
          name: storageName,
          originalName: storageName,
          mimeType: type,
          size: fileBuffer.length,
          path: storageName,
          status: 'processed',
          processedPath: storageName
        };
        
        // Validate data and save
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
        
        // Log successful upload
        console.log(`Successfully saved document: ${name}, size: ${fileBuffer.length} bytes`);
        
        res.status(201).json({
          success: true,
          message: "Document uploaded successfully",
          documentId: document.id
        });
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to upload document", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
