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
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Labuan RE Form Filling Portal</h1>
          <div>
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
            <DialogTitle>Labuan RE Form Filling Portal Help</DialogTitle>
            <DialogDescription>
              This application allows you to fill the form by uploading documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">Uploading Documents</h3>
              <p className="text-sm text-muted-foreground">
                Drag and drop files into the upload area or click to browse your files.
                Supported formats include PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, and PNG.
                Ensure the file size does not exceed 10MB.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Downloading Forms</h3>
              <p className="text-sm text-muted-foreground">
                Click the "Download" button to save the completed form to your device.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
