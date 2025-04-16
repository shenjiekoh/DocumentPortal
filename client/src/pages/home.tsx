import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FileUpload } from "@/components/ui/file-upload";
import DocumentCard from "@/components/DocumentCard";
import PreviewModal from "@/components/PreviewModal";
import { Notification } from "@/components/ui/notification";
import { useDocuments } from "@/hooks/use-documents";
import { Document } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { FileText, Grid, List } from "lucide-react";

export default function Home() {
  const { documents, isLoading, uploadDocument } = useDocuments();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent');
  const [showModal, setShowModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    show: false,
    message: '',
    type: 'success',
  });

  // Show notification
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({
      show: true,
      message,
      type,
    });
    
    // Hide notification after 3 seconds
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, show: false }));
    }, 3000);
  };

  // Preview document
  const previewDocument = (document: Document) => {
    setSelectedDocument(document);
    setShowModal(true);
  };

  // Close preview modal
  const closePreviewModal = () => {
    setShowModal(false);
  };

  // Handle file upload
  const handleUpload = async (file: File) => {
    try {
      await uploadDocument(file);
      showNotification('Document uploaded successfully!');
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : 'Failed to upload document',
        'error'
      );
    }
  };

  // Sort documents based on current sort option
  const sortedDocuments = [...(documents || [])].sort((a, b) => {
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
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-800 mb-4">Upload Document</h2>
              <p className="text-gray-500 mb-4">
                Upload your documents to preview and share them. Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG.
              </p>
              
              <FileUpload onUpload={handleUpload} />
            </div>
          </div>
          
          {/* Preview Section */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-800">My Documents</h2>
                <div className="flex items-center">
                  <div className="relative inline-block text-left mr-3">
                    <select
                      className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'recent' | 'name' | 'size')}
                    >
                      <option value="recent">Sort by: Recent</option>
                      <option value="name">Sort by: Name</option>
                      <option value="size">Sort by: Size</option>
                    </select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className="p-2 text-gray-500 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary rounded-md"
                  >
                    {viewMode === 'grid' ? <List size={20} /> : <Grid size={20} />}
                  </Button>
                </div>
              </div>

              {/* Document list (empty state) */}
              {(!documents || documents.length === 0) && !isLoading && (
                <div className="py-12 text-center">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No documents</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by uploading a document.</p>
                </div>
              )}

              {/* Loading state */}
              {isLoading && (
                <div className="py-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-sm text-gray-500">Loading documents...</p>
                </div>
              )}

              {/* Document list */}
              {documents && documents.length > 0 && (
                <div className={`grid ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-6`}>
                  {sortedDocuments.map((document) => (
                    <DocumentCard
                      key={document.id}
                      document={document}
                      onPreview={() => previewDocument(document)}
                      onSuccess={showNotification}
                      onError={(message) => showNotification(message, 'error')}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
      
      {/* Preview Modal */}
      {showModal && selectedDocument && (
        <PreviewModal
          document={selectedDocument}
          onClose={closePreviewModal}
          onSuccess={showNotification}
          onError={(message) => showNotification(message, 'error')}
        />
      )}
      
      {/* Notification */}
      <Notification
        show={notification.show}
        message={notification.message}
        type={notification.type}
        onDismiss={() => setNotification((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
}
