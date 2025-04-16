import { CheckCircle, AlertCircle, X } from "lucide-react";
import { useEffect } from "react";

interface NotificationProps {
  show: boolean;
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}

export function Notification({ show, message, type, onDismiss }: NotificationProps) {
  // Auto dismiss after 3 seconds
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  if (!show) return null;

  return (
    <div 
      className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg transform transition-transform duration-300 flex items-center ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
      } text-white`}
      onClick={onDismiss}
    >
      <span className="mr-2">
        {type === 'success' ? (
          <CheckCircle className="h-5 w-5" />
        ) : (
          <AlertCircle className="h-5 w-5" />
        )}
      </span>
      <span>{message}</span>
      <button 
        className="ml-4 text-white hover:text-gray-200 focus:outline-none" 
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
