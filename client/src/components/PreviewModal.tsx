import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Document } from "@shared/schema";
import { Download, AlertCircle, File } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set the worker source for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

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

  const isPdf = document.mimeType === 'application/pdf';
  const isImage = document.mimeType.startsWith('image/');
  const isOffice = document.mimeType.includes('word') || 
                  document.mimeType.includes('excel') || 
                  document.mimeType.includes('powerpoint') ||
                  document.mimeType.includes('officedocument');
  const isDocx = document.mimeType.includes('word') || document.mimeType.includes('officedocument.wordprocessingml');

  // For PDF preview
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pdfError, setPdfError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setPdfError(null);
  }

  function onDocumentLoadError(error: Error) {
    console.error('Failed to load PDF:', error);
    setPdfError(error.message);
  }

  function changePage(offset: number) {
    setPageNumber(prevPageNumber => 
      Math.max(1, Math.min(prevPageNumber + offset, numPages || 1))
    );
  }

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
            {isPdf && (
              <div className="flex flex-col w-full h-full">
                <PDFDocument
                  file={`/api/documents/${document.id}/preview`}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  className="flex-grow flex justify-center"
                >
                  {!pdfError ? (
                    <Page 
                      pageNumber={pageNumber} 
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="mx-auto"
                      scale={1}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <AlertCircle className="h-16 w-16 text-gray-400" />
                      <span className="mt-2 text-sm text-gray-600">
                        Unable to display PDF. Please download to view.
                      </span>
                    </div>
                  )}
                </PDFDocument>
                
                {numPages && numPages > 1 && (
                  <div className="mt-2 flex justify-between items-center">
                    <Button 
                      onClick={() => changePage(-1)} 
                      disabled={pageNumber <= 1}
                      variant="outline"
                      size="sm"
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-500">
                      Page {pageNumber} of {numPages}
                    </span>
                    <Button 
                      onClick={() => changePage(1)} 
                      disabled={pageNumber >= (numPages || 1)}
                      variant="outline"
                      size="sm"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {isImage && (
              <img
                src={`/api/documents/${document.id}/preview`}
                alt={document.name}
                className="max-w-full max-h-full object-contain"
              />
            )}
            
            {isDocx && (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <div className="bg-blue-100 p-4 rounded-lg mb-4 max-w-md">
                  <h3 className="text-blue-800 font-medium mb-2">Word Document</h3>
                  <p className="text-blue-700 text-sm">
                    For security reasons, Word documents can't be previewed directly in the browser. 
                    Please download the document to view its contents.
                  </p>
                </div>
                <Button onClick={downloadDocument} variant="outline" className="mt-2">
                  <Download className="h-5 w-5 mr-2" />
                  Download to View
                </Button>
              </div>
            )}
            
            {!isPdf && !isImage && !isDocx && (
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
