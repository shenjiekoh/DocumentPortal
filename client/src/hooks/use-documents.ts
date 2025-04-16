import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Document } from "@shared/schema";

export function useDocuments() {
  // Fetch all documents
  const { data: documents, isLoading, error } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
  });

  // Upload a document
  const { mutate: uploadDocument, isPending: isUploading } = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload document');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });

  // Delete a document
  const { mutate: deleteDocument, isPending: isDeleting } = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/documents/${id}`);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });

  return {
    documents,
    isLoading,
    isUploading,
    isDeleting,
    error,
    uploadDocument,
    deleteDocument,
  };
}
