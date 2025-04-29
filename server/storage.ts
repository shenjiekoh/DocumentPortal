import { Document, InsertDocument, documents, type User, type InsertUser, users } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);

// Modify the interface with any CRUD methods you might need
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Document methods
  getAllDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<boolean>;
  saveFile(fileName: string, fileBuffer: Buffer): Promise<string>;
  getFile(filePath: string): Promise<Buffer | undefined>;
  updateDocumentStatus(id: number, status: string): Promise<boolean>;
  updateProcessedDocument(id: number, updates: {status: string, processedPath: string}): Promise<boolean>;
  clearInputAndOutputDirectories(): Promise<void>; // Add a cleaning function interface
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private documents: Map<number, Document>;
  private fileContents: Map<string, Buffer>; // Memory mapping to store file contents
  private currentUserId: number;
  private currentDocumentId: number;

  constructor() {
    this.users = new Map();
    this.documents = new Map();
    this.fileContents = new Map();
    this.currentUserId = 1;
    this.currentDocumentId = 1;
    
    // Initialize the memory storage
    this.ensureDirectoriesExist();
  }

  private async ensureDirectoriesExist() {
    // Only initialize memory storage, no physical directories needed
    console.log(`Using memory storage instead of physical file storage`);
  }

  // Get virtual directory paths (not corresponding to physical directories)
  getOutputDir(): string {
    return "memory://output"; // Virtual path, not corresponding to a physical directory
  }

  getInputDir(): string {
    return "memory://input"; // Virtual path, not corresponding to a physical directory
  }

  getResultsDir(): string {
    return "memory://results"; // Virtual path, not corresponding to a physical directory
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values()).sort((a, b) => {
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    });
  }

  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = this.currentDocumentId++;
    const uploadedAt = new Date();
    const document: Document = { ...insertDocument, id, uploadedAt };
    this.documents.set(id, document);
    return document;
  }

  async deleteDocument(id: number): Promise<boolean> {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    
    try {
      // Delete file from memory
      if (this.fileContents.has(document.path)) {
        this.fileContents.delete(document.path);
      }
      
      // Also delete processed file if it exists
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

  async saveFile(originalName: string, fileBuffer: Buffer): Promise<string> {
    try {
      // Check if this is already a form document or processed template
      const isFormDocument = originalName.includes('-form.docx');
      const isProcessedTemplate = originalName.includes('template_processed');
      
      // Set the virtual path for memory storage
      let virtualPath;
      if (isFormDocument || isProcessedTemplate) {
        virtualPath = `memory://results/${originalName}`;
      } else {
        virtualPath = `memory://input/${originalName}`;
      }
      
      console.log(`Saving file "${originalName}" to memory, virtual path: ${virtualPath}`);
      
      // Save file content to memory
      this.fileContents.set(virtualPath, fileBuffer);
      
      // Return virtual path
      return virtualPath;
    } catch (error) {
      console.error("Error saving file:", error);
      throw error;
    }
  }

  async getFile(filePath: string): Promise<Buffer | undefined> {
    try {
      console.log(`Attempting to retrieve file: ${filePath}`);
      
      // Check if file path is empty
      if (!filePath) {
        console.error("File path is empty or undefined");
        return undefined;
      }
      
      // Normalize path - convert to unified format
      let normalizedPath = filePath;
      
      // Convert "documents/output/" to "memory://results/"
      if (normalizedPath.startsWith('documents/output/')) {
        normalizedPath = `memory://results/${path.basename(normalizedPath)}`;
        console.log(`Converting path: ${filePath} -> ${normalizedPath}`);
      }
      
      // Convert "documents/input/" to "memory://input/"
      if (normalizedPath.startsWith('documents/input/')) {
        normalizedPath = `memory://input/${path.basename(normalizedPath)}`;
        console.log(`Converting path: ${filePath} -> ${normalizedPath}`);
      }
      
      // Convert "Results/" to "memory://results/"
      if (normalizedPath.startsWith('Results/')) {
        normalizedPath = `memory://results/${path.basename(normalizedPath)}`;
        console.log(`Converting path: ${filePath} -> ${normalizedPath}`);
      }
      
      // Search by filename directly
      const fileName = path.basename(normalizedPath);
      
      // Check if file exists in memory
      if (this.fileContents.has(normalizedPath)) {
        console.log(`File found in memory: ${normalizedPath}`);
        return this.fileContents.get(normalizedPath);
      }
      
      // Try searching for file by name in memory
      for (const [storedPath, buffer] of this.fileContents.entries()) {
        if (storedPath.endsWith(fileName)) {
          console.log(`File found by filename: ${storedPath}`);
          return buffer;
        }
      }
      
      // Try searching for processed files
      if (fileName.includes("-form.docx") || fileName.includes("_processed")) {
        console.log("Searching for processed files:");
        
        // Search for matching processed files
        for (const [storedPath, buffer] of this.fileContents.entries()) {
          if (storedPath.includes("-form.docx") || storedPath.includes("_processed")) {
            console.log(`Found processed file: ${storedPath}`);
            return buffer;
          }
        }
      }
      
      console.log(`File not found. Original path: ${filePath}`);
      return undefined;
    } catch (error) {
      console.error(`Error retrieving file ${filePath}:`, error);
      return undefined;
    }
  }

  async updateDocumentStatus(id: number, status: string): Promise<boolean> {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    
    const updatedDocument = { ...document, status };
    this.documents.set(id, updatedDocument);
    return true;
  }

  async updateProcessedDocument(id: number, updates: {status: string, processedPath: string}): Promise<boolean> {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    
    // Convert processed path format
    let processedPath = updates.processedPath;
    if (processedPath && processedPath.startsWith('documents/output/')) {
      processedPath = `memory://results/${path.basename(processedPath)}`;
    }
    
    const updatedDocument = { 
      ...document, 
      status: updates.status,
      processedPath: processedPath
    };
    
    this.documents.set(id, updatedDocument);
    return true;
  }

  // Clear input and output files in memory
  async clearInputAndOutputDirectories(): Promise<void> {
    try {
      console.log('Clearing input and output files in memory...');
      
      // Clear input files in memory
      for (const filePath of Array.from(this.fileContents.keys())) {
        if (filePath.startsWith('memory://input/')) {
          this.fileContents.delete(filePath);
          console.log(`Deleted input file from memory: ${filePath}`);
        }
      }
      
      // Clear output files in memory
      for (const filePath of Array.from(this.fileContents.keys())) {
        if (filePath.startsWith('memory://results/')) {
          this.fileContents.delete(filePath);
          console.log(`Deleted output file from memory: ${filePath}`);
        }
      }
      
      // Reset document records
      this.documents.clear();
      this.currentDocumentId = 1;
      
      console.log('Successfully cleared memory storage');
    } catch (error) {
      console.error('Error clearing memory storage:', error);
    }
  }

  // Get all filenames in memory
  async getAllFileNames(): Promise<string[]> {
    try {
      console.log("Getting all file paths stored in memory");
      const memoryPaths = Array.from(this.fileContents.keys());
      console.log(`Memory contains ${memoryPaths.length} files`);
      
      // Convert virtual paths to compatible format
      const result = memoryPaths.map(filePath => {
        // Convert memory://results/ to Results/
        if (filePath.startsWith('memory://results/')) {
          return `Results/${path.basename(filePath)}`;
        }
        
        // Convert memory://input/ to documents/input/
        if (filePath.startsWith('memory://input/')) {
          return `documents/input/${path.basename(filePath)}`;
        }
        
        return filePath;
      });
      
      console.log(`Returning ${result.length} file paths`);
      return result;
    } catch (error) {
      console.error("Error getting all filenames:", error);
      return [];
    }
  }
}

export const storage = new MemStorage();
