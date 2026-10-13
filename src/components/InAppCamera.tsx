import { useCallback, useEffect, useRef, useState } from "react";
import { X, SwitchCamera, Image as ImageIcon, Loader2 } from "lucide-react";

type Props = {
  onCapture: (file: File, previewUrl: string) => void;
  onClose: () => void;
  onFallbackFileInput?: () => void;
};

export default function InAppCamera({ onCapture, onClose, onFallbackFileInput }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Trigger slide-up on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 20);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300); // match duration-300
  }, [onClose]);

  const stopCurrentTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(
    async (mode: "environment" | "user") => {
      setStarting(true);
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not supported on this browser or device.");
        setStarting(false);
        return;
      }

      try {
        stopCurrentTracks();
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = newStream;
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error("Camera access error:", err);
        setCameraError("Unable to access camera. Please check permissions or use file upload.");
      } finally {
        setStarting(false);
      }
    },
    [stopCurrentTracks],
  );

  useEffect(() => {
    void startStream(facingMode);
    return () => {
      stopCurrentTracks();
    };
  }, [facingMode, startStream, stopCurrentTracks]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);

    try {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");

      if (facingMode === "user") {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, width, height);

      const previewUrl = canvas.toDataURL("image/jpeg", 0.85);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setCapturing(false);
            return;
          }
          const file = new File([blob], `expedition-photo-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });

          // Slide down sheet then send captured photo
          setIsVisible(false);
          setTimeout(() => {
            onCapture(file, previewUrl);
          }, 300);
        },
        "image/jpeg",
        0.9,
      );
    } catch (err) {
      console.error("Failed to capture photo:", err);
      setCapturing(false);
    }
  }, [capturing, facingMode, onCapture]);

  return (
    <div
      className={`pointer-events-auto fixed inset-x-0 bottom-0 z-[600] h-[50vh] w-full transform overflow-hidden rounded-t-[2.5rem] bg-black shadow-2xl transition-transform duration-300 ease-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {cameraError ? (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-foreground">
          <p className="text-sm text-muted-foreground">{cameraError}</p>
          {onFallbackFileInput && (
            <button
              type="button"
              onClick={() => {
                handleClose();
                onFallbackFileInput();
              }}
              className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold tracking-wider text-primary-foreground"
            >
              <ImageIcon className="h-4 w-4" />
              Select Photo File
            </button>
          )}
        </div>
      ) : (
        <div className="relative h-full w-full bg-black">
          {/* Full-bleed Edge-to-Edge Video */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              facingMode === "user" ? "-scale-x-100" : ""
            } ${starting ? "opacity-0" : "opacity-100"}`}
          />

          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}

          {/* Top Controls Overlay */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close camera"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white border border-white/20 backdrop-blur-md active:scale-95 transition-transform"
            >
              <X className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              aria-label="Switch camera"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white border border-white/20 backdrop-blur-md active:scale-95 transition-transform"
            >
              <SwitchCamera className="h-6 w-6" />
            </button>
          </div>

          {/* Bottom Controls Overlay */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-8 pb-8 pt-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
            {/* Gallery / Fallback File Picker Button */}
            {onFallbackFileInput ? (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onFallbackFileInput();
                }}
                aria-label="Pick from gallery"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white border border-white/20 backdrop-blur-md active:scale-95 transition-transform"
              >
                <ImageIcon className="h-6 w-6" />
              </button>
            ) : (
              <div className="h-14 w-14" />
            )}

            {/* Main Shutter Button */}
            <button
              type="button"
              onClick={takePhoto}
              disabled={!!cameraError || starting || capturing}
              aria-label="Take Photo"
              className="group relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white p-1 shadow-2xl active:scale-90 transition-transform disabled:opacity-50"
            >
              <div className="h-full w-full rounded-full bg-white transition-transform group-active:scale-90 flex items-center justify-center">
                {capturing && <Loader2 className="h-7 w-7 animate-spin text-black" />}
              </div>
            </button>

            {/* Bottom-right Camera Flip Button */}
            <button
              type="button"
              onClick={toggleCamera}
              aria-label="Switch camera"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white border border-white/20 backdrop-blur-md active:scale-95 transition-transform"
            >
              <SwitchCamera className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
