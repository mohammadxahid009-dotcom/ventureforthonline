import { useCallback, useEffect, useRef, useState } from "react";
import { X, SwitchCamera, ChevronLeft, Image as ImageIcon, Loader2 } from "lucide-react";

type Props = {
  onCapture: (file: File) => void;
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

  const stopCurrentTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async (mode: "environment" | "user") => {
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
  }, [stopCurrentTracks]);

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

      // Handle user facing camera flip if needed
      if (facingMode === "user") {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setCapturing(false);
            return;
          }
          const file = new File([blob], `expedition-photo-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          onCapture(file);
          onClose();
        },
        "image/jpeg",
        0.9,
      );
    } catch (err) {
      console.error("Failed to capture photo:", err);
      setCapturing(false);
    }
  }, [capturing, facingMode, onCapture, onClose]);

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[600] flex flex-col items-center">
      {/* Bottom Camera Card Container */}
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-[2.25rem] border-t border-x border-border/80 bg-card/95 shadow-2xl backdrop-blur-md">
        {/* Top sheet handle pill */}
        <div className="flex w-full justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Video Viewport Area */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black px-3 py-1">
          <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black">
            {cameraError ? (
              <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-foreground">
                <p className="text-xs text-muted-foreground">{cameraError}</p>
                {onFallbackFileInput && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
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
              <>
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
                    <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  </div>
                )}

                {/* Overlay controls inside camera frame */}
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close camera"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white border border-white/20 backdrop-blur-sm active:scale-95 transition-transform"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={toggleCamera}
                    aria-label="Switch camera"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white border border-white/20 backdrop-blur-sm active:scale-95 transition-transform"
                  >
                    <SwitchCamera className="h-5 w-5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Shutter and Controls Bar */}
        <div className="flex items-center justify-between px-8 py-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/80 text-foreground border border-border/60 active:scale-95 transition-transform"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Shutter Button */}
          <button
            type="button"
            onClick={takePhoto}
            disabled={!!cameraError || starting || capturing}
            aria-label="Take Photo"
            className="group relative flex h-18 w-18 items-center justify-center rounded-full border-4 border-white p-1 shadow-lg active:scale-90 transition-transform disabled:opacity-50"
          >
            <div className="h-full w-full rounded-full bg-white transition-transform group-active:scale-90 flex items-center justify-center">
              {capturing && <Loader2 className="h-6 w-6 animate-spin text-black" />}
            </div>
          </button>

          {/* Right auxiliary slot / file fallback */}
          {onFallbackFileInput ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onFallbackFileInput();
              }}
              aria-label="Pick from gallery"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/80 text-foreground border border-border/60 active:scale-95 transition-transform"
            >
              <ImageIcon className="h-5 w-5" />
            </button>
          ) : (
            <div className="h-12 w-12" />
          )}
        </div>
      </div>
    </div>
  );
}
