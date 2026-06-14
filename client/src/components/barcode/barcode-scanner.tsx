import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export default function BarcodeScanner({ isOpen, onClose }: BarcodeScannerProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ScanLine className="h-5 w-5" />
            Barcode Scanner
          </DialogTitle>
        </DialogHeader>
        <div className="py-8 text-center text-slate-400 text-sm">
          Barcode scanning is not available in this version.
        </div>
      </DialogContent>
    </Dialog>
  );
}
