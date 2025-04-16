import React, { useState, useRef } from "react";
import { CloudUpload } from "lucide-react";

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
}

export function FileUpload({ onUpload }: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Open file dialog
  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  // Handle file selection from dialog
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFile(e.target.files[0]);
    }
  };

  // Process the selected file
  const handleFile = async (file: File) => {
    try {
      setUploadStatus('uploading');
      setErrorMessage('');
      
      await onUpload(file);
      
      setUploadStatus('success');
      // Reset status after 3 seconds
      setTimeout(() => {
        setUploadStatus('idle');
      }, 3000);
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to upload file');
    }
  };

  return (
    <div>
      <div 
        className={`file-upload-drop-area rounded-lg p-8 text-center cursor-pointer ${
          isDragActive ? 'border-primary bg-primary/5 drag-active' : 'border-2 border-dashed border-gray-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <CloudUpload className="mx-auto h-12 w-12 text-gray-400" />
        
        <div className="mt-4">
          <span className="text-gray-700 font-medium">Drag and drop your file here</span>
          <span className="block text-sm text-gray-500 mt-1">or click to browse</span>
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <div className={`mt-4 ${uploadStatus === 'idle' ? 'hidden' : ''} text-center py-2`}>
        {uploadStatus === 'uploading' && (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
            <span className="text-gray-700">Uploading document...</span>
          </div>
        )}
        
        {uploadStatus === 'error' && (
          <div className="text-red-500">
            {errorMessage}
          </div>
        )}
        
        {uploadStatus === 'success' && (
          <div className="flex items-center justify-center text-green-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-6 w-6 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Document uploaded successfully!</span>
          </div>
        )}
      </div>
    </div>
  );
}
