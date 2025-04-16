import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Header() {
  const [showHelp, setShowHelp] = useState(false);
  
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Document Portal</h1>
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowHelp(true)}
              className="hidden sm:flex bg-white p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Help"
            >
              <InfoIcon className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
      
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document Portal Help</DialogTitle>
            <DialogDescription>
              This application allows you to upload, preview, and download documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">Uploading Documents</h3>
              <p className="text-sm text-muted-foreground">
                Drag and drop files into the upload area or click to browse your files.
                Supported formats include PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, and PNG.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Previewing Documents</h3>
              <p className="text-sm text-muted-foreground">
                Click the "Preview" button on any document card to view the document in a modal.
                Not all document types can be previewed in the browser.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Downloading Documents</h3>
              <p className="text-sm text-muted-foreground">
                Click the "Download" button to save the document to your device.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
