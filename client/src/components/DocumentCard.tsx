import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Clock, Download, FileIcon } from "lucide-react";
import { useState, useMemo } from "react";
import { Document } from "@shared/schema";
import { formatFileSize } from "@/lib/utils";

interface DocumentCardProps {
  document: Document;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  viewMode?: 'grid' | 'list';
}

// Helper function to get the appropriate icon based on document extension
const getDocumentIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) {
    return <FileIcon className="w-16 h-16 text-blue-500" />;
  } else if (mimeType === 'application/pdf') {
    return <FileIcon className="w-16 h-16 text-red-500" />;
  } else if (mimeType.includes('word')) {
    return <FileIcon className="w-16 h-16 text-blue-700" />;
  } else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
    return <FileIcon className="w-16 h-16 text-green-600" />;
  } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
    return <FileIcon className="w-16 h-16 text-orange-500" />;
  } else {
    return <FileIcon className="w-16 h-16 text-gray-500" />;
  }
};

export default function DocumentCard({
  document,
  onSuccess,
  onError,
  viewMode = 'grid'
}: DocumentCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  
  const isProcessed = document.status === 'processed';
  const isError = document.status === 'error';
  const isProcessing = document.status === 'processing';
  const isPending = document.status === 'pending';
  
  // 根据状态确定显示的标签文本
  const statusLabel = isProcessed ? "Ready" : 
                     isProcessing ? "Processing" : 
                     isError ? "Error" : 
                     "Pending";
                     
  // 根据状态确定标签的颜色
  const statusColorClass = isProcessed ? "bg-green-100 text-green-800" : 
                          isProcessing ? "bg-yellow-100 text-yellow-800" : 
                          isError ? "bg-red-100 text-red-800" : 
                          "bg-blue-100 text-blue-800"; // Change back to blue for pending status
  
  // Use useMemo to cache the processed date string to avoid recalculation on each render
  const displayDate = useMemo(() => {
    // 1. Prioritize using timestamp from filename (if exists)
    if (document.name && document.name.startsWith('17')) {
      // Assuming filename format is "1745515397593-form.docx", extract timestamp from filename
      const timestamp = document.name.split('-')[0];
      if (timestamp && !isNaN(Number(timestamp))) {
        const date = new Date(Number(timestamp));
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
    }
    
    // 2. If the file is a processed file, use a fixed processing date
    if (document.status === 'processed' && document.processedPath) {
      // Use current system date as processing date (in a real application, might need to get actual date from server)
      const currentDate = new Date();
      return currentDate.toLocaleString();
    }
    
    // 3. Finally fall back to upload time or creation time
    const fallbackDate = document.uploadedAt || document.createdAt;
    if (!fallbackDate) return "";
    
    return new Date(fallbackDate).toLocaleString();
  }, [document.name, document.status, document.processedPath, document.uploadedAt, document.createdAt]);
  
  // Helper function to handle download response
  const handleDownloadResponse = async (response: Response, filename: string) => {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    window.document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  };
  
  const downloadDocument = async () => {
    try {
      setIsDownloading(true);
      
      // If document is processed, download the processed document
      if (isProcessed && document.processedPath) {
        console.log(`Attempting to download processed document: ID=${document.id}, Path=${document.processedPath}`);
        
        // Check if this is a form/output document
        const isFormDocument = document.name.startsWith('DO') ||
                              (document.processedPath && 
                               document.processedPath.includes('DO'));
        
        // Determine download method based on ID range
        if (document.id >= 2000 || isFormDocument) {
          // Use download-template endpoint to download form document
          console.log(`Using template download API to download form document: ${document.processedPath}`);
          try {
            const response = await fetch(`/api/download-template?path=${encodeURIComponent(document.processedPath)}`);
            
            if (response.ok) {
              // Extract filename
              const fileName = document.name || document.processedPath.split('/').pop() || 'form.docx';
              await handleDownloadResponse(response, fileName);
              onSuccess('Form document downloaded successfully!');
              return;
            } else {
              console.error(`Form download failed: ${response.status}`);
              const errorText = await response.text();
              console.error(`Error details: ${errorText}`);
              throw new Error(`Failed to download form document: ${response.status}`);
            }
          } catch (err) {
            console.error("Form download error:", err);
            throw err;
          }
        } else {
          // For regular processed documents, use standard download endpoint
          try {
            const response = await fetch(`/api/documents/${document.id}/download-processed`);
            
            if (response.ok) {
              // Use original filename as base, but add processed tag
              const baseFileName = document.originalName || document.name;
              const downloadName = `${baseFileName.split('.')[0]}_processed.docx`;
              
              await handleDownloadResponse(response, downloadName);
              onSuccess('Processed document downloaded successfully!');
              return;
            } else {
              console.log(`Standard download path failed (${response.status}), trying fallback path...`);
              const errorText = await response.text();
              console.error(`Error details: ${errorText}`);
            }
          } catch (err) {
            console.error("Processed document download error:", err);
          }
          
          // Try original document download endpoint as fallback
          const fallbackResponse = await fetch(`/api/documents/${document.id}/download`);
          if (fallbackResponse.ok) {
            await handleDownloadResponse(fallbackResponse, document.name);
            onSuccess('Document downloaded successfully!');
          } else {
            throw new Error('Unable to download document, please try again later');
          }
        }
      } else {
        // Download the original document
        console.log(`Downloading original document: ID=${document.id}`);
        const response = await fetch(`/api/documents/${document.id}/download`);
        
        if (!response.ok) {
          console.error(`Failed to download original: status=${response.status}`);
          throw new Error('Failed to download document');
        }
        
        await handleDownloadResponse(response, document.originalName || document.name);
        onSuccess('Document downloaded successfully!');
      }
    } catch (error) {
      console.error('Download error:', error);
      onError(error instanceof Error ? error.message : 'Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className={viewMode === 'grid' ? "w-full" : "w-full flex"}>
      <Card className={`relative h-full overflow-hidden border hover:border-primary transition-colors ${viewMode === 'grid' ? 'flex flex-col' : 'flex-row'}`}>
        <div className={`flex items-center justify-center p-4 bg-muted ${viewMode === 'grid' ? 'h-32' : 'h-full w-24'}`}>
          {getDocumentIcon(document.mimeType)}
        </div>
        
        <div className={`flex flex-col justify-between p-4 ${viewMode === 'grid' ? '' : 'flex-1'}`}>
          <div>
            <h3 className="font-medium line-clamp-1">{document.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{formatFileSize(document.size)}</p>
            <div className="flex items-center mt-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              <span>{displayDate}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={downloadDocument}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <span className="animate-spin h-4 w-4 mr-1 border-2 border-b-transparent rounded-full inline-block" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Download
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
