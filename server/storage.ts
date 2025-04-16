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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private documents: Map<number, Document>;
  private uploadsDir: string;
  private currentUserId: number;
  private currentDocumentId: number;

  constructor() {
    this.users = new Map();
    this.documents = new Map();
    this.currentUserId = 1;
    this.currentDocumentId = 1;
    this.uploadsDir = path.resolve(process.cwd(), "uploads");
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
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
      // Delete file
      await unlink(document.path);
      this.documents.delete(id);
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      return false;
    }
  }

  async saveFile(originalName: string, fileBuffer: Buffer): Promise<string> {
    // Generate a unique filename
    const fileName = `${randomUUID()}-${originalName}`;
    const filePath = path.join(this.uploadsDir, fileName);
    
    await writeFile(filePath, fileBuffer);
    return filePath;
  }

  async getFile(filePath: string): Promise<Buffer | undefined> {
    try {
      return await readFile(filePath);
    } catch (error) {
      console.error("Error reading file:", error);
      return undefined;
    }
  }
}

export const storage = new MemStorage();
