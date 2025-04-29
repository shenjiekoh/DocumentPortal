import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Document } from "@shared/schema";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface PreviewModalProps {
  document: Document;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export default function PreviewModal({
  document,
  onClose,
  onSuccess,
  onError
}: PreviewModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  // Format document size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  // Format date in a more readable format
  const formatDate = (date: Date): string => {
    return `Uploaded ${format(new Date(date), 'MMM d, yyyy, h:mm a')}`;
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
      
      // Use the global document object to create a link element
      const a = globalThis.document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      
      // Add to DOM, click and remove
      globalThis.document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        globalThis.document.body.removeChild(a);
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

  // 获取文档类型提示
  const getDocumentTypeLabel = () => {
    if (document.mimeType.includes('pdf')) return 'PDF Document';
    if (document.mimeType.includes('word')) return 'Word Document';
    if (document.mimeType.includes('excel')) return 'Excel Spreadsheet';
    if (document.mimeType.includes('powerpoint')) return 'PowerPoint Presentation';
    if (document.mimeType.startsWith('image/')) return 'Image';
    return 'Document';
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogTitle>{document.name}</DialogTitle>
        <DialogDescription>
          <span className="text-sm text-gray-500">
            {formatSize(document.size)} • {formatDate(document.uploadedAt)}
          </span>
        </DialogDescription>
        <div className="bg-white p-6">
          <div className="flex items-start justify-between">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <div className="flex justify-end">
                <Button
                  onClick={downloadDocument}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <span className="animate-spin h-5 w-5 mr-2 border-2 border-b-transparent rounded-full" />
                  ) : (
                    <Download className="h-5 w-5 mr-2" />
                  )}
                  Download
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-5 bg-gray-50 rounded-lg p-4 flex items-center justify-center" style={{ height: '60vh' }}>
            <div className="flex flex-col items-center justify-center text-center max-w-lg">
              <FileText className="h-24 w-24 text-gray-300 mb-6" />
              <h3 className="text-xl font-medium text-gray-800 mb-2">{getDocumentTypeLabel()}</h3>
              <p className="text-gray-600 mb-6">
                Document previews have been disabled in this application.
                Please download the document to view its contents.
              </p>
              <Button onClick={downloadDocument} className="min-w-[150px]">
                <Download className="h-5 w-5 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
