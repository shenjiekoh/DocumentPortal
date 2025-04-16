import { format } from "date-fns";
import { Document } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Eye, Download, FileText, Image } from "lucide-react";
import { useState } from "react";

interface DocumentCardProps {
  document: Document;
  onPreview: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  viewMode: 'grid' | 'list';
}

export default function DocumentCard({
  document,
  onPreview,
  onSuccess,
  onError,
  viewMode
}: DocumentCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Format document size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  // Get document type label from mime type
  const getDocumentTypeLabel = (mimeType: string): string => {
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.includes('word')) return 'DOCX';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'XLSX';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PPTX';
    if (mimeType.includes('text/plain')) return 'TXT';
    if (mimeType.includes('image')) return 'IMAGE';
    return 'DOC';
  };

  // Format date
  const formatDate = (date: Date): string => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const documentDate = new Date(date);
    
    if (documentDate.toDateString() === now.toDateString()) {
      return `Today, ${format(documentDate, 'h:mm a')}`;
    } else if (documentDate.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${format(documentDate, 'h:mm a')}`;
    } else {
      return format(documentDate, 'MMM d, yyyy');
    }
  };

  // Download document
  const downloadDocument = async () => {
    try {
      setIsDownloading(true);
      const response = await fetch(`/api/documents/${document.id}/download`);
      
      if (!response.ok) {
        throw new Error('Failed to download document');
      }
      
      // Get filename from Content-Disposition header if available
      let filename = document.name;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create a link element using the browser's document object, not our document variable
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      // Append to the document body
      window.document.body.appendChild(link);
      
      // Programmatically click the link
      link.click();
      
      // Clean up
      setTimeout(() => {
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      onSuccess('Document downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      onError(error instanceof Error ? error.message : 'Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  };

  // Check document types
  const isImage = document.mimeType.startsWith('image/');
  const isPdf = document.mimeType === 'application/pdf';
  
  // Check if document is previewable in browser
  // PDF and images can be previewed, Office documents will have a special viewer
  const isPreviewable = isPdf || isImage || 
                       document.mimeType.includes('word') || 
                       document.mimeType.includes('excel') || 
                       document.mimeType.includes('powerpoint') ||
                       document.mimeType.includes('officedocument');

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow overflow-hidden hover:shadow-md transition-shadow duration-200 ${viewMode === 'list' ? 'flex' : ''}`}>
      <div className={`relative ${viewMode === 'list' ? 'w-48 min-w-48' : ''}`}>
        <div className="document-preview-container bg-gray-100 p-4 flex items-center justify-center">
          {isImage ? (
            <img 
              src={`/api/documents/${document.id}/preview`} 
              alt={document.name} 
              className="max-w-full max-h-full object-cover rounded shadow" 
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <FileText className="h-16 w-16 text-gray-400" />
              {!isPreviewable && (
                <span className="mt-2 text-sm text-gray-600">Preview not available</span>
              )}
            </div>
          )}
        </div>
        <span className="absolute top-2 left-2 bg-gray-800 bg-opacity-75 text-white text-xs px-2 py-1 rounded">
          {getDocumentTypeLabel(document.mimeType)}
        </span>
      </div>
      <div className={`p-4 ${viewMode === 'list' ? 'flex-grow' : ''}`}>
        <h3 className="text-sm font-medium text-gray-900 truncate">
          {document.name}
        </h3>
        <div className="mt-1 flex justify-between">
          <span className="text-xs text-gray-500">{formatSize(document.size)}</span>
          <span className="text-xs text-gray-500">{formatDate(document.uploadedAt)}</span>
        </div>
        <div className="mt-4 flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={onPreview}
            disabled={!isPreviewable}
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button
            variant="default"
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
    </div>
  );
}
