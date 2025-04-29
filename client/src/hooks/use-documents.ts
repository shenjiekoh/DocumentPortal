import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Document } from "@shared/schema";

export function useDocuments() {
  // Fetch all documents with auto-refresh
  const { data: documents, isLoading, error, refetch } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
    // Add the missing queryFn to actually fetch the data
    queryFn: async () => {
      try {
        const response = await fetch('/api/documents', {
          method: 'GET',
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch documents');
        }
        
        return response.json();
      } catch (error) {
        console.error('Error fetching documents:', error);
        throw error;
      }
    },
    // Refresh every 2 seconds
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  // Upload a document
  const { mutate: uploadDocument, isPending: isUploading } = useMutation({
    mutationFn: async (file: File) => {
      console.log("Uploading file:", file.name, "Size:", file.size, "Type:", file.type);
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        
        // 获取响应内容(无论成功或失败)
        const responseText = await response.text();
        console.log("Server response status:", response.status);
        console.log("Server response headers:", Object.fromEntries([...response.headers.entries()]));
        console.log("Server response body:", responseText);
        
        if (!response.ok) {
          try {
            // 尝试解析JSON错误消息
            const errorData = JSON.parse(responseText);
            throw new Error(errorData.message || 'Failed to upload document');
          } catch (jsonError) {
            // 如果无法解析JSON，使用原始响应文本
            throw new Error(`Upload failed: Server returned ${response.status}: ${responseText.substring(0, 100)}`);
          }
        }
        
        // 如果响应成功，尝试解析JSON
        try {
          return JSON.parse(responseText);
        } catch (jsonError) {
          console.error("Error parsing successful response:", jsonError);
          throw new Error("Server returned invalid JSON response");
        }
      } catch (networkError) {
        console.error("Network or parsing error:", networkError);
        throw networkError;
      }
    },
    onSuccess: () => {
      // Invalidate documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });

  // Process a document
  const { mutate: processDocument, isPending: isProcessing } = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('POST', `/api/documents/${id}/process`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process document');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });

  // Download a processed document
  const downloadProcessedDocument = async (id: number, filename: string) => {
    try {
      const response = await fetch(`/api/documents/${id}/download-processed`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to download processed document');
      }
      
      // Create a blob from the response
      const blob = await response.blob();
      
      // Create a download link and trigger the download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (error) {
      console.error('Error downloading processed document:', error);
      throw error;
    }
  };

  // Delete a document
  const { mutate: deleteDocument, isPending: isDeleting } = useMutation({
    mutationFn: async (id: number) => {
      // 直接使用fetch而不是apiRequest，以确保请求正确发送
      console.log(`Deleting document with ID: ${id}`);
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      // 更详细的错误处理和日志记录
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error deleting document: Status ${response.status}`, errorText);
        throw new Error(errorText || 'Failed to delete document');
      }
      
      return response.json();
    },
    onSuccess: () => {
      console.log("Document deleted successfully, refreshing document list");
      // Invalidate documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (error) => {
      console.error("Error in delete mutation:", error);
    }
  });

  // 添加手动刷新文档列表的函数
  const refetchDocuments = async () => {
    console.log("Manual refetch of documents initiated");
    return await refetch();
  };

  return {
    documents,
    isLoading,
    isUploading,
    isProcessing,
    isDeleting,
    error,
    uploadDocument,
    processDocument,
    downloadProcessedDocument,
    deleteDocument,
    refetchDocuments, // 导出新添加的函数
  };
}

// New hook for form documents
export function useFormDocuments() {
  // Fetch all form documents
  const { data: formDocuments, isLoading, error, refetch } = useQuery<Document[]>({
    queryKey: ['/api/form-documents'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/form-documents', {
          method: 'GET',
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch form documents');
        }
        
        return response.json();
      } catch (error) {
        console.error('Error fetching form documents:', error);
        throw error;
      }
    },
    // Refresh every 2 seconds to ensure we have the latest files
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  // Download a form document
  const downloadFormDocument = async (id: number, filename: string) => {
    try {
      const response = await fetch(`/api/documents/${id}/download`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to download form document');
      }
      
      // Create a blob from the response
      const blob = await response.blob();
      
      // Create a download link and trigger the download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (error) {
      console.error('Error downloading form document:', error);
      throw error;
    }
  };

  // Manual refresh function
  const refetchFormDocuments = async () => {
    console.log("Manual refetch of form documents initiated");
    return await refetch();
  };

  return {
    formDocuments,
    isLoading,
    error,
    downloadFormDocument,
    refetchFormDocuments,
  };
}
