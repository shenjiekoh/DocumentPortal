import { useState, useEffect } from "react";
import { useDocuments } from "@/hooks/use-documents";
import { useFormDocuments } from "@/hooks/use-documents"; // Import new form document hook
import { Document } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { FileText, Grid, List, Play } from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
import DocumentCard from "@/components/DocumentCard";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Home() {
  const { documents, isLoading: isLoadingDocs, uploadDocument, refetchDocuments, deleteDocument } = useDocuments();
  const { formDocuments, isLoading: isLoadingFormDocs, refetchFormDocuments } = useFormDocuments(); // Use the new hook
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [outputFiles, setOutputFiles] = useState<Document[]>([]);
  const [showResults, setShowResults] = useState(false);
  const isLoading = isLoadingDocs || isLoadingFormDocs;

  // Fetch document list on initial load
  useEffect(() => {
    refetchDocuments();
    refetchFormDocuments();
  }, []);

  useEffect(() => {
    setOutputFiles([]);
    setShowResults(false);
    setProcessingComplete(false);
    
    const clearMemory = async () => {
      try {
        const response = await fetch('/api/clear-memory', {
          method: 'POST',
        });
        
        if (response.ok) {
          console.log('Memory storage cleared');
        }
      } catch (error) {
        console.error('Error clearing memory storage:', error);
      }
    };
    
    clearMemory();
    
    if (typeof window !== 'undefined') {
      const handleBeforeUnload = () => {
        sessionStorage.removeItem('processingComplete');
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, []);

  useEffect(() => {
    console.log("Component initialized on mount");
    // Fetch all files when component mounts
    fetchOutputFiles();
    refetchDocuments();
    refetchFormDocuments();
    
    // Immediately check if there are already completed files
    const checkForResultFiles = () => {
      console.log("Actively checking result files...");
      fetchOutputFiles();
      refetchFormDocuments();
    };
    
    // Check once after a 2-second delay after component mount
    const initialCheckTimeout = setTimeout(checkForResultFiles, 2000);
    
    // Set up a timer to periodically check for result files
    const interval = setInterval(checkForResultFiles, 5000); // Check every 5 seconds
    
    return () => {
      clearTimeout(initialCheckTimeout);
      clearInterval(interval);
    };
  }, []);

  // Hook function specifically for fetching files from output-files API
  const fetchOutputFiles = async () => {
    try {
      console.log("Fetching output files...");
      
      // Add timeout control
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await fetch('/api/output-files', {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId); // Clear timeout
        
        if (!response.ok) {
          console.error(`Server returned error status: ${response.status}`);
          const errorText = await response.text();
          console.error(`Error details: ${errorText}`);
          throw new Error(`Failed to fetch output files: ${response.status} ${response.statusText}`);
        }
        
        const files = await response.json();
        console.log(`Retrieved ${files.length} output files from API:`, files);
        
        // Set output file list
        setOutputFiles(files);
        
        // Show results area if there are output files
        if (files.length > 0) {
          console.log("Output files available, showing results area");
          setShowResults(true);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('Fetch output files request timed out');
          throw new Error('Request timed out when fetching output files');
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('Error fetching output files:', error);
      
      // Don't show error notification immediately, only after several retry attempts
      if (!window.fetchOutputRetryCount) {
        window.fetchOutputRetryCount = 1;
      } else {
        window.fetchOutputRetryCount++;
      }
      
      // Only show error notification after multiple failed attempts
      if (window.fetchOutputRetryCount > 3) {
        toast({
          title: "Failed to Fetch Result Files",
          description: error instanceof Error ? error.message : 'Unable to fetch output files',
          variant: "destructive",
        });
        // Reset retry count
        window.fetchOutputRetryCount = 0;
      }
      
      // Return empty array instead of throwing error to avoid app crashes
      return [];
    }
  };

  // Check if there are form documents and display results
  useEffect(() => {
    if (formDocuments && formDocuments.length > 0) {
      console.log(`Found ${formDocuments.length} form documents:`, formDocuments);
      setShowResults(true);
    }
  }, [formDocuments]);

  useEffect(() => {
    if (documents && documents.length > 0) {
      const hasProcessedDoc = documents.some(doc => 
        doc.status === 'processed' || doc.processedPath
      );
      
      if (hasProcessedDoc) {
        setProcessingComplete(true);
        fetchOutputFiles();
        setShowResults(true);
      }
    }
  }, [documents]);

  useEffect(() => {
    if (processingComplete) {
      fetchOutputFiles();
      // Actively refresh form document list to ensure getting the latest forms
      refetchFormDocuments();
      setShowResults(true);
    }
  }, [processingComplete]);

  // Actively refresh form documents after processing is complete
  useEffect(() => {
    // Set interval to periodically check for new form documents
    const interval = setInterval(() => {
      refetchFormDocuments();
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [refetchFormDocuments]);

  const handleUpload = async (file: File) => {
    try {
      await uploadDocument(file);
      toast({
        title: "Upload Successful",
        description: "Document has been uploaded successfully",
      });
      refetchDocuments();
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : 'Document upload failed',
        variant: "destructive",
      });
    }
  };

  const startProcessing = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      setProcessingComplete(false);

      toast({
        title: "Processing Started",
        description: "Processing document...",
      });

      console.log("Sending request to process document...");

      // 修改：使用任何状态的文档，不仅仅是 pending 或 uploaded
      // 如果有 pending 或 uploaded 状态的文档，优先处理它们
      let docToProcess = allUploadedDocuments.find(doc => doc.status === 'pending' || doc.status === 'uploaded');
      
      // 如果没有 pending 或 uploaded 状态的文档，则处理第一个文档，无论其状态如何
      if (!docToProcess && allUploadedDocuments.length > 0) {
        docToProcess = allUploadedDocuments[0];
      }
      
      const docId = docToProcess?.id || null;

      if (!docId) {
        throw new Error("No document found to process");
      }

      console.log(`Processing document ID: ${docId}`);

      // 立即在本地更新文档状态为"processing"
      const updatedDocuments = allUploadedDocuments.map(doc => 
        doc.id === docId 
          ? { ...doc, status: 'processing' } 
          : doc
      );
      
      // 直接替换 documents 数组中的内容，确保 UI 立即更新
      if (documents) {
        const documentsArray = [...documents];
        const docIndex = documentsArray.findIndex(doc => doc.id === docId);
        if (docIndex !== -1) {
          documentsArray[docIndex] = { ...documentsArray[docIndex], status: 'processing' };
          // 强制更新 documents 数组
          documents.splice(0, documents.length, ...documentsArray);
        }
      }

      const response = await fetch(`http://localhost:8000/process-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: docId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Document processing failed');
      }

      const result = await response.json();
      console.log("Processing result:", result);

      // Set processing complete status
      setProcessingComplete(true);
      await refetchDocuments();

      toast({
        title: "Processing Complete",
        description: "Document processing completed successfully",
      });

      setTimeout(() => {
        fetchOutputFiles();
        refetchFormDocuments(); // Refresh form documents after processing is complete
        setShowResults(true);
      }, 500);
    } catch (error) {
      console.error("Processing error:", error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : 'Document processing failed',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const downloadProcessedFile = async (fileId: number) => {
    try {
      let response;
      
      if (fileId >= 2000) {
        // This is a file with the -form.docx suffix
        const document = formDocuments.find(doc => doc.id === fileId);
        if (!document || !document.processedPath) {
          throw new Error('Form document not found or has no processed file');
        }
        
        response = await fetch(`/api/download-template?path=${encodeURIComponent(document.processedPath)}`);
      } else if (fileId >= 1000) {
        // This is a regular processed file
        const document = outputFiles.find(doc => doc.id === fileId);
        if (!document || !document.processedPath) {
          throw new Error('Document not found or has no processed file');
        }
        
        response = await fetch(`/api/download-template?path=${encodeURIComponent(document.processedPath)}`);
      } else {
        response = await fetch(`/api/documents/${fileId}/download-processed`);
      }
      
      if (!response.ok) {
        throw new Error('Failed to download file');
      }
      
      let filename = 'processed_document.docx';
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Download Successful",
        description: "Document has been downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : 'Document download failed',
        variant: "destructive",
      });
    }
  };

  const removeDocument = async (id: number) => {
    try {
      if (confirm('Are you sure you want to delete this document?')) {
        await deleteDocument(id);
        toast({
          title: "Deletion Successful",
          description: "Document has been deleted successfully",
        });
        // Refresh document list after successful deletion
        refetchDocuments();
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Deletion Failed",
        description: error instanceof Error ? error.message : 'Document deletion failed',
        variant: "destructive",
      });
    }
  };

  // Show all uploaded documents regardless of processing status
  const allUploadedDocuments = documents ? documents.filter(doc => !doc.name.startsWith('DO')) : [];
  
  // Always allow processing as long as there are any documents
  const hasPendingDocuments = allUploadedDocuments.length > 0;
  
  // Check if there are any uploaded documents at all (for UI display)
  const hasUploadedDocuments = allUploadedDocuments.length > 0;
  
  // Modified to only show files from output-files
  const processedDocuments = (() => {
    // Only use files retrieved from output-files
    if (outputFiles.length > 0) {
      console.log("Using output-files results:", outputFiles.length, "files");
      return outputFiles;
    }
    return [];
  })();

  const sortedDocuments = [...processedDocuments].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    } else if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'size') {
      return b.size - a.size;
    }
    return 0;
  });

  return (
    <div className="space-y-8">
      <Card className="p-6">
        <h2 className="text-xl font-medium text-gray-800 mb-4">Upload Documents</h2>
        <p className="text-gray-500 mb-4">
          Upload your documents here. Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG.
          Maximum file size: 10MB.
        </p>
        
        <FileUpload onUploadSuccess={handleUpload} />
        
        {/* 使用hasUploadedDocuments而不是hasPendingDocuments检查是否有任何上传的文档 */}
        {hasUploadedDocuments && (
          <div className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="text-md font-medium text-gray-700 mb-2">Uploaded Documents</h3>
            <div className="overflow-hidden bg-white rounded-md border border-gray-200">
              <ul className="divide-y divide-gray-200">
                {allUploadedDocuments.map((doc) => (
                  <li key={doc.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center min-w-0">
                      <FileText className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center">
                          <p className="text-sm font-medium text-gray-900 truncate mr-2">
                            {doc.name}
                          </p>
                          {/* Add document status tags */}
                          {doc.status === 'pending' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Pending
                            </span>
                          )}
                          {doc.status === 'processing' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              Processing
                            </span>
                          )}
                          {doc.status === 'processed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Ready
                            </span>
                          )}
                          {doc.status === 'error' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              Error
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {(doc.size / (1024 * 1024)).toFixed(2)} MB • {new Date(doc.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <button 
                        onClick={() => removeDocument(doc.id)}
                        className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                        title="Delete document"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="mt-4">
              <Button
                onClick={startProcessing}
                disabled={isProcessing || !hasPendingDocuments}
                className={`px-4 py-2 rounded-md font-medium ${
                  isProcessing || !hasPendingDocuments
                    ? 'bg-gray-300 cursor-not-allowed text-gray-600' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isProcessing ? (
                  <>
                    <span className="animate-spin h-4 w-4 mr-2 border-2 border-b-transparent rounded-full inline-block" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Processing
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
      
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-medium text-gray-800">Results</h2>
          <div className="flex items-center space-x-2">
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as 'recent' | 'name' | 'size')}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Sort by Recent</SelectItem>
                <SelectItem value="name">Sort by Name</SelectItem>
                <SelectItem value="size">Sort by Size</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-2"
            >
              {viewMode === 'grid' ? <List size={18} /> : <Grid size={18} />}
            </Button>
          </div>
        </div>

        {(!showResults || sortedDocuments.length === 0) && !isLoading && (
          <div className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Completed Forms</h3>
            <p className="mt-1 text-sm text-gray-500">
              Please upload a document and click "Start Processing" to begin.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-sm text-gray-500">Loading results...</p>
          </div>
        )}

        {showResults && sortedDocuments.length > 0 && (
          <div className={`grid ${
            viewMode === 'grid' 
              ? isMobile 
                ? 'grid-cols-1' 
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1'
          } gap-6`}>
            {sortedDocuments.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                onSuccess={(message) => {
                  toast({
                    title: "Success",
                    description: message,
                  });
                }}
                onError={(message) => {
                  toast({
                    title: "Error",
                    description: message,
                    variant: "destructive",
                  });
                }}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
