import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Document as DocumentType } from "@shared/schema";

interface DocumentPreviewProps {
  document: DocumentType;
}

export default function DocumentPreview({ document }: DocumentPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
  }, [document]);

  // Handle loading state for PDF and image files
  const handleLoaded = () => {
    setIsLoading(false);
  };

  // Handle loading errors
  const handleError = () => {
    setIsLoading(false);
    setError("Failed to load document preview");
  };

  // Check document type for preview support
  const isPdf = document.mimeType === "application/pdf";
  const isImage = document.mimeType.startsWith("image/");

  // Render appropriate preview based on document type
  if (isPdf) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {isLoading && (
          <div className="absolute flex items-center justify-center">
            <div className="animate-spin h-10 w-10 border-4 border-primary border-b-transparent rounded-full"></div>
          </div>
        )}
        
        <iframe
          src={`/api/documents/${document.id}/preview`}
          className="w-full h-full border-0"
          onLoad={handleLoaded}
          onError={handleError}
          title={document.name}
        />
        
        {error && (
          <div className="absolute flex flex-col items-center justify-center text-center p-4 bg-white/80 rounded-lg">
            <AlertCircle className="h-10 w-10 text-red-500 mb-2" />
            <span className="text-sm font-medium text-gray-900">{error}</span>
            <span className="text-xs text-gray-600 mt-1">
              Try downloading the document to view it
            </span>
          </div>
        )}
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="w-full h-full flex items-center justify-center relative">
        {isLoading && (
          <div className="absolute flex items-center justify-center">
            <div className="animate-spin h-10 w-10 border-4 border-primary border-b-transparent rounded-full"></div>
          </div>
        )}
        
        <img
          src={`/api/documents/${document.id}/preview`}
          alt={document.name}
          className="max-w-full max-h-full object-contain"
          onLoad={handleLoaded}
          onError={handleError}
        />
        
        {error && (
          <div className="absolute flex flex-col items-center justify-center text-center p-4 bg-white/80 rounded-lg">
            <AlertCircle className="h-10 w-10 text-red-500 mb-2" />
            <span className="text-sm font-medium text-gray-900">{error}</span>
            <span className="text-xs text-gray-600 mt-1">
              Try downloading the document to view it
            </span>
          </div>
        )}
      </div>
    );
  }

  // Fallback for non-previewable documents
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <AlertCircle className="h-16 w-16 text-gray-400" />
      <span className="mt-2 text-sm font-medium text-gray-900">
        Preview not available
      </span>
      <span className="mt-1 text-xs text-gray-600">
        This document type ({document.mimeType}) cannot be previewed in the browser.
        Please download the document to view it.
      </span>
    </div>
  );
}
