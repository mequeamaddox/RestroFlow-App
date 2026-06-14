import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, CheckCircle } from "lucide-react";
import BarcodeScanner from "@/components/barcode/barcode-scanner";
import BarcodeInput from "@/components/barcode/barcode-input";

export default function BarcodeTest() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [inputBarcode, setInputBarcode] = useState("");

  const handleBarcodeScanned = (barcode: string) => {
    setScannedBarcode(barcode);
    setIsScannerOpen(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Barcode Scanner Test
        </h1>
        <p className="text-gray-600">Test the barcode scanning functionality</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner Component Test */}
        <Card>
          <CardHeader>
            <CardTitle>Direct Scanner Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => setIsScannerOpen(true)} className="w-full">
              <Camera className="h-4 w-4 mr-2" />
              Open Camera Scanner
            </Button>

            {scannedBarcode && (
              <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-green-300">
                      Scanned Successfully!
                    </p>
                    <p className="text-sm text-green-400 font-mono">
                      {scannedBarcode}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Input Component Test */}
        <Card>
          <CardHeader>
            <CardTitle>Barcode Input Component</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Product Barcode
              </label>
              <BarcodeInput
                value={inputBarcode}
                onChange={setInputBarcode}
                placeholder="Enter or scan product barcode"
              />
            </div>

            {inputBarcode && (
              <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <p className="text-sm font-medium text-blue-300">
                  Current Value:
                </p>
                <p className="text-sm text-blue-400 font-mono">
                  {inputBarcode}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use Barcode Scanner</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900">For Mobile Devices:</h4>
              <ul className="text-sm text-gray-600 list-disc list-inside mt-2 space-y-1">
                <li>Tap the camera button to open the scanner</li>
                <li>Allow camera permissions when prompted</li>
                <li>Point your camera at a barcode</li>
                <li>Keep the barcode within the scanning frame</li>
                <li>
                  The scanner will automatically detect and read the barcode
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-gray-900">
                Supported Barcode Types:
              </h4>
              <ul className="text-sm text-gray-600 list-disc list-inside mt-2 space-y-1">
                <li>UPC-A and UPC-E (most common grocery items)</li>
                <li>EAN-8 and EAN-13 (international products)</li>
                <li>Code 128 (general purpose)</li>
                <li>Code 39 (alphanumeric)</li>
                <li>QR Codes</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
}
