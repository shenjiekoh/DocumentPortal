import React, { useState, useRef } from "react";
import { CloudUpload, UploadCloud } from "lucide-react";

interface FileUploadProps {
  onUploadSuccess: (file?: File) => void;
  isFullSize?: boolean; // 添加属性控制是否为全尺寸版本
}

export function FileUpload({ onUploadSuccess, isFullSize = false }: FileUploadProps) {
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
      
      // 不再直接上传文件，而是调用成功回调让父组件处理上传
      setUploadStatus('success');
      
      // 调用成功回调
      onUploadSuccess(file);
      
      // Reset status after 3 seconds
      setTimeout(() => {
        setUploadStatus('idle');
      }, 3000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to upload file');
    }
  };

  return (
    <div className={isFullSize ? "w-full max-w-2xl mx-auto" : ""}>
      <div 
        className={`file-upload-drop-area rounded-lg text-center cursor-pointer transition-all duration-200 ${
          isDragActive ? 'border-primary bg-primary/5 drag-active' : 'border-2 border-dashed border-gray-300'
        } ${isFullSize ? 'p-12' : 'p-4'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        {isFullSize ? (
          // 全尺寸版本 - 大图标和更详细的说明
          <>
            <UploadCloud className="mx-auto h-20 w-20 text-gray-400" />
            <div className="mt-6">
              <span className="text-xl font-medium text-gray-700">Upload Document</span>
              <p className="text-gray-500 mt-2">Drag and drop your document here, or click to browse</p>
              <p className="text-sm text-gray-400 mt-1">Supported formats: .docx, .pdf, .doc</p>
            </div>
          </>
        ) : (
          // 紧凑版本 - 用于已经有文件后显示的小控件
          <>
            <CloudUpload className="mx-auto h-8 w-8 text-gray-400" />
            <div className="mt-2">
              <span className="text-gray-700 font-medium text-sm">Upload File</span>
              <span className="block text-xs text-gray-500 mt-1">Drag or click to browse</span>
            </div>
          </>
        )}
        
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept=".docx,.pdf,.doc"
        />
      </div>

      <div className={`mt-2 ${uploadStatus === 'idle' ? 'hidden' : ''} text-center py-1`}>
        {uploadStatus === 'uploading' && (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
            <span className="text-gray-700 text-xs">Uploading...</span>
          </div>
        )}
        
        {uploadStatus === 'error' && (
          <div className="text-red-500 text-xs">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
