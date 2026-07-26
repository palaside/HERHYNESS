import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { X, Camera, RefreshCw, Sparkles, Check } from "lucide-react";
import { Product } from "../types";

interface BarcodeScannerModalProps {
  products: Product[];
  onScan: (barcodeValue: string) => void;
  onClose: () => void;
  playBeep: () => void;
}

export default function BarcodeScannerModal({
  products,
  onScan,
  onClose,
  playBeep,
}: BarcodeScannerModalProps) {
  console.log("BarcodeScannerModal mounting");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>("");

  // Get a list of camera devices
  useEffect(() => {
    async function getCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        setCameraDevices(videoDevices);
      } catch (e) {
        console.warn("Could not list camera devices:", e);
      }
    }
    getCameras();
  }, []);

  // Initialize camera stream
  useEffect(() => {
    let active = true;

    async function startCamera() {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      setCameraError(null);
      setIsReady(false);

      try {
        let mediaStream;
        try {
          const constraints: MediaStreamConstraints = {
            video: activeDeviceId 
              ? { deviceId: { exact: activeDeviceId } } 
              : { facingMode: { ideal: "environment" } }
          };
          console.log("Requesting camera with constraints:", constraints);
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
          console.warn("Primary camera constraints failed, trying fallback", e);
          // Fallback to basic video access without specific device/facing constraints
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (active) {
          console.log("Camera stream obtained:", mediaStream);
          setStream(mediaStream);
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.onloadedmetadata = () => {
              setIsReady(true);
            };
          }
        }
      } catch (err: any) {
        if (activeDeviceId && (err.name === "NotFoundError" || err.name === "ConstraintNotSatisfiedError")) {
          console.warn("Active device unavailable, clearing and retrying without specific device ID");
          setActiveDeviceId(""); // The useEffect will re-run
          return;
        }
        console.error("Camera startup error:", err);
        setCameraError(
          "Camera access blocked or unavailable. Please ensure you have granted camera permissions."
        );
      }
    }

    startCamera();

    return () => {
      active = false;
    };
  }, [activeDeviceId]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Active scanning loop using native BarcodeDetector if available
  useEffect(() => {
    if (!stream || !isReady) return;
    let active = true;

    let detector: any = null;
    if ("BarcodeDetector" in window) {
      try {
        // @ts-ignore
        detector = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "qr_code", "code_128", "upc_a"],
        });
      } catch (e) {
        console.warn("Native BarcodeDetector initialization failed", e);
      }
    }

    const checkFrame = async () => {
      if (!active || !videoRef.current) return;

      if (detector) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0 && active) {
            const code = barcodes[0].rawValue;
            onScan(code);
            active = false;
            return;
          }
        } catch (err) {
          // Fail silently
        }
      }

      requestAnimationFrame(checkFrame);
    };

    const timer = setTimeout(() => {
      checkFrame();
    }, 800);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [stream, isReady, onScan]);

  // Select some popular sample products with barcodes for direct mock-testing
  const sampleScans = products
    .filter(p => p.barcode && p.barcode.length > 5)
    .slice(0, 5);

  const handleSimulateScan = (barcode: string) => {
    playBeep();
    onScan(barcode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <motion.div
        initial={{ scale: 0.9, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 15 }}
        className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-left"
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/45">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
              <Camera className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Webcam Barcode Scanner</h3>
              <p className="text-[10px] text-neutral-400">Position the barcode inside the camera frame.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scanner Viewfinder / Stream */}
        <div className="relative aspect-video bg-neutral-950 flex items-center justify-center overflow-hidden border-b border-neutral-800">
          {cameraError ? (
            <div className="p-6 text-center space-y-3 max-w-sm">
              <Camera className="w-10 h-10 text-neutral-600 mx-auto" />
              <p className="text-xs text-neutral-400 leading-relaxed">{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              {/* Laser scanning animations */}
              {isReady && (
                <>
                  <div className="absolute inset-x-6 inset-y-4 border border-emerald-500/30 rounded-xl pointer-events-none">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400 rounded-tl-md" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400 rounded-tr-md" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400 rounded-bl-md" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400 rounded-br-md" />
                  </div>
                  {/* Glowing Scanning line */}
                  <div className="absolute left-6 right-6 h-0.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-bounce pointer-events-none top-1/2" />
                </>
              )}

              {!isReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 space-y-3">
                  <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                  <span className="text-xs text-neutral-400 font-mono">Initializing video stream...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Camera Selector */}
        {cameraDevices.length > 1 && !cameraError && (
          <div className="px-4 py-2 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-2">
            <span className="text-[10px] text-neutral-500 font-medium font-mono">Active Camera:</span>
            <select
              value={activeDeviceId}
              onChange={(e) => setActiveDeviceId(e.target.value)}
              className="text-[10px] bg-neutral-900 text-neutral-300 border border-neutral-800 rounded px-2 py-1 max-w-[200px]"
            >
              {cameraDevices.map((device, idx) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* High-Fidelity Barcode Scan Simulator (Mandatory and useful fallback) */}
        <div className="p-4 space-y-3 bg-neutral-950/20">
          <div className="flex items-center gap-1.5 border-b border-neutral-800/60 pb-2">
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
              Quick Scan Simulator (Immediate test)
            </span>
          </div>

          {sampleScans.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {sampleScans.map(p => (
                <button
                  key={p.plu}
                  onClick={() => handleSimulateScan(p.barcode || "")}
                  className="w-full p-2 bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 hover:border-neutral-700 rounded-xl transition-all flex items-center justify-between text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded bg-neutral-900 overflow-hidden border border-neutral-800 shrink-0 flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name_th} className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                      ) : (
                        <Camera className="w-3.5 h-3.5 text-neutral-700" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-white truncate group-hover:text-rose-400 transition-colors">
                        {p.name_th}
                      </div>
                      <div className="text-[9px] font-mono text-neutral-500">
                        PLU {p.plu} • Barcode: {p.barcode}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-400 shrink-0">
                    <span>฿{Number(p.price).toFixed(0)}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 rounded text-[8px] uppercase font-bold tracking-wider">
                      Scan
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-neutral-500 text-center py-2">
              Sync database to load products with scan simulator profiles.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-950/60 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Close Scanner
          </button>
        </div>
      </motion.div>
    </div>
  );
}
