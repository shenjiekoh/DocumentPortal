import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Document } from "@shared/schema";
import { Download, AlertCircle } from "lucide-react";
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
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      onSuccess('Document downloaded successfully!');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  };

  const isPdf = document.mimeType === 'application/pdf';
  const isImage = document.mimeType.startsWith('image/');

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <div className="bg-white p-6">
          <div className="flex items-start justify-between">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {document.name}
              </h3>
              <div className="mt-2 flex justify-between items-center text-sm text-gray-500">
                <div>
                  <span>{formatSize(document.size)}</span> • 
                  <span>{formatDate(document.uploadedAt)}</span>
                </div>
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
            {isPdf && (
              <iframe
                src={`/api/documents/${document.id}/preview`}
                className="w-full h-full"
                title={document.name}
              />
            )}
            
            {isImage && (
              <img
                src={`/api/documents/${document.id}/preview`}
                alt={document.name}
                className="max-w-full max-h-full object-contain"
              />
            )}
            
            {!isPdf && !isImage && (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <AlertCircle className="h-16 w-16 text-gray-400" />
                <span className="mt-2 text-sm text-gray-600">
                  Preview not available. Please download the document to view it.
                </span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
