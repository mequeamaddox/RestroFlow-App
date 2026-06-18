import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  Bluetooth, 
  Scale, 
  Wifi, 
  WifiOff, 
  Weight,
  Eye,
  AlertTriangle,
  CheckCircle,
  Loader2
} from "lucide-react";

export default function BluetoothScalePrototype() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [scaleDevice, setScaleDevice] = useState<BluetoothDevice | null>(null);
  const [lastReading, setLastReading] = useState<string | null>(null);
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Owner-only access control
  const isOwner = (user as any)?.role === 'owner' || (user as any)?.role === 'platform_admin';
  
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConnectionLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 9)]);
  };

  const connectToScale = async () => {
    if (!navigator.bluetooth) {
      toast({
        title: "Bluetooth Not Supported",
        description: "Your browser doesn't support Web Bluetooth API. Try Chrome/Edge on desktop.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    addLog("Requesting Bluetooth device...");

    try {
      // Request device with Weight Scale Service UUID
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['weight_scale'] },
          { services: [0x181D] }, // Weight Scale Service UUID
        ],
        optionalServices: ['battery_service', 'device_information']
      });

      addLog(`Found device: ${device.name || 'Unknown Scale'}`);
      setScaleDevice(device);

      // Connect to GATT server
      const server = await device.gatt!.connect();
      addLog("Connected to GATT server");

      // Get Weight Scale service
      const service = await server.getPrimaryService('weight_scale');
      addLog("Found Weight Scale service");

      // Get Weight Measurement characteristic
      const characteristic = await service.getCharacteristic('weight_measurement');
      addLog("Found Weight Measurement characteristic");

      // Start notifications
      await characteristic.startNotifications();
      addLog("Started weight notifications");

      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value!;
        const weight = parseWeightData(value);
        
        if (weight !== null) {
          setCurrentWeight(weight);
          setLastReading(new Date().toLocaleTimeString());
          addLog(`Weight reading: ${weight}g`);
        }
      });

      setIsConnected(true);
      toast({
        title: "Scale Connected",
        description: `Successfully connected to ${device.name || 'Bluetooth Scale'}`,
      });

    } catch (error) {
      console.error('Bluetooth connection error:', error);
      addLog(`Connection error: ${(error as Error).message}`);
      toast({
        title: "Connection Failed",
        description: "Unable to connect to Bluetooth scale. Make sure it's in pairing mode.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const parseWeightData = (dataView: DataView): number | null => {
    try {
      // Basic weight parsing - this varies by scale manufacturer
      // Most scales send weight as a 16-bit or 32-bit value
      if (dataView.byteLength >= 2) {
        const flags = dataView.getUint8(0);
        let weight = dataView.getUint16(1, true); // Little endian
        
        // Check if weight is in kg or grams based on flags
        if (flags & 0x01) {
          weight = weight / 1000; // Convert to kg if flag is set
        }
        
        return weight;
      }
      return null;
    } catch (error) {
      addLog(`Data parsing error: ${(error as Error).message}`);
      return null;
    }
  };

  const disconnectScale = () => {
    if (scaleDevice && scaleDevice.gatt?.connected) {
      scaleDevice.gatt.disconnect();
      addLog("Disconnected from scale");
    }
    setIsConnected(false);
    setScaleDevice(null);
    setCurrentWeight(null);
    setLastReading(null);
  };

  const syncToInventory = () => {
    if (currentWeight === null) return;
    
    toast({
      title: "Weight Synced",
      description: `${currentWeight}g has been logged for inventory testing`,
    });
    addLog(`Synced ${currentWeight}g to inventory system (prototype)`);
  };

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800 border-slate-700 w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Access Restricted</h2>
            <p className="text-slate-400">This prototype feature is only available to system owners.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="h-8 w-8 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Bluetooth Scale Prototype</h1>
              <p className="text-slate-400">Owner-only testing environment</p>
            </div>
          </div>
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            <Eye className="h-3 w-3 mr-1" />
            PROTOTYPE
          </Badge>
        </div>

        {/* Connection Status */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Bluetooth className="h-5 w-5" />
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Wifi className="h-5 w-5 text-green-500" />
                    <span className="text-green-400">Connected to {scaleDevice?.name || 'Bluetooth Scale'}</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-5 w-5 text-slate-500" />
                    <span className="text-slate-400">Not connected</span>
                  </>
                )}
              </div>
              
              {isConnected ? (
                <Button
                  onClick={disconnectScale}
                  variant="outline"
                  size="sm"
                  className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  onClick={connectToScale}
                  disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Bluetooth className="h-4 w-4 mr-2" />
                      Connect Scale
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Weight Display */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Weight className="h-5 w-5" />
              Live Weight Reading
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-8">
              {currentWeight !== null ? (
                <div className="space-y-2">
                  <div className="text-6xl font-bold text-white">
                    {currentWeight.toFixed(1)}
                    <span className="text-2xl text-slate-400 ml-2">g</span>
                  </div>
                  <div className="text-slate-400">
                    Last reading: {lastReading}
                  </div>
                  <Button
                    onClick={syncToInventory}
                    className="bg-green-600 hover:bg-green-700 text-white mt-4"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Sync to Inventory
                  </Button>
                </div>
              ) : (
                <div className="text-slate-500">
                  {isConnected ? "Waiting for weight data..." : "Connect a scale to see weight readings"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Connection Logs */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Connection Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {connectionLogs.length > 0 ? (
                connectionLogs.map((log, index) => (
                  <div key={index} className="text-sm text-slate-400 font-mono">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-sm">No connection activity yet</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Testing Notes */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Testing Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-300 space-y-2">
              <p><strong>Supported Browsers:</strong> Chrome, Edge (desktop versions)</p>
              <p><strong>Compatible Scales:</strong> Any Bluetooth scale using Weight Scale Service</p>
              <p><strong>Recommended for Testing:</strong> INKBIRD IBFS-01, Decent Scale, or similar BLE kitchen scales</p>
              <p><strong>Next Steps:</strong> Once connected successfully, this can integrate with your inventory management</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}