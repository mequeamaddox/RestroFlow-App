import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, ScanLine, X, Keyboard } from "lucide-react";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect(image: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
    };
  }
}

export default function BarcodeScanner({ isOpen, onClose, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualValue, setManualValue] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hasNativeDetector] = useState(() => !!window.BarcodeDetector);

  const stopCamera = () => {
    cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        if (hasNativeDetector) startDetectionLoop();
      }
    } catch {
      setCameraError("Camera access denied. Use manual entry below.");
      setMode("manual");
    }
  };

  const startDetectionLoop = () => {
    if (!window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_39", "code_128", "qr_code"] });

    const tick = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          stopCamera();
          onScan(barcodes[0].rawValue);
          return;
        }
      } catch { /* continue scanning */ }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (isOpen && mode === "camera") {
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setManualValue("");
      setCameraError(null);
      setMode("camera");
    }
  }, [isOpen]);

  const handleManualSubmit = () => {
    const trimmed = manualValue.trim();
    if (!trimmed) return;
    onScan(trimmed);
    setManualValue("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary-400" />
            Scan Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "camera" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("camera")}
              className="flex-1"
            >
              <Camera className="h-4 w-4 mr-1" />
              Camera
            </Button>
            <Button
              variant={mode === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("manual")}
              className="flex-1"
            >
              <Keyboard className="h-4 w-4 mr-1" />
              Manual
            </Button>
          </div>

          {mode === "camera" && (
            <div className="relative">
              {cameraError ? (
                <div className="flex flex-col items-center justify-center h-48 bg-slate-800 rounded-lg text-slate-400 text-sm text-center p-4 gap-2">
                  <X className="h-8 w-8 text-red-400" />
                  <p>{cameraError}</p>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-lg bg-black aspect-video">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                  {/* Scanning overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-32 border-2 border-primary-400 rounded-md relative">
                      <span className="absolute -top-px left-4 right-4 h-0.5 bg-primary-400 animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                  </div>
                  {scanning && !hasNativeDetector && (
                    <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/70 bg-black/50 py-1">
                      Camera preview — enter barcode manually below
                    </div>
                  )}
                </div>
              )}
              {!hasNativeDetector && !cameraError && (
                <p className="text-xs text-slate-400 text-center mt-1">
                  Automatic scanning not supported in this browser. Enter the barcode number below.
                </p>
              )}
            </div>
          )}

          {/* Manual entry — always shown in manual mode, also shown as fallback in camera mode when no native detector */}
          {(mode === "manual" || !hasNativeDetector) && (
            <div className="flex gap-2">
              <Input
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                placeholder="Enter barcode number..."
                className="bg-slate-800 border-slate-600 text-white"
                onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
                autoFocus={mode === "manual"}
              />
              <Button onClick={handleManualSubmit} disabled={!manualValue.trim()}>
                Add
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
