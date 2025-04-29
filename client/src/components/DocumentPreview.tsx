import { AlertCircle, Download } from "lucide-react";
import { Document as DocumentType } from "@shared/schema";
import { Button } from "./ui/button";

interface DocumentPreviewProps {
  document: DocumentType;
}

export default function DocumentPreview({ document }: DocumentPreviewProps) {
  // 移除预览功能，改为提供下载按钮
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <AlertCircle className="h-16 w-16 text-gray-400 mb-4" />
      <span className="mt-2 text-sm font-medium text-gray-900">
        Preview has been disabled
      </span>
      <span className="mt-1 text-xs text-gray-600 mb-4">
        Document previews are no longer available. Please download the document to view it.
      </span>
      <Button asChild className="mt-2">
        <a href={`/api/documents/${document.id}/download`} download>
          <Download className="h-4 w-4 mr-2" />
          Download
        </a>
      </Button>
    </div>
  );
}
