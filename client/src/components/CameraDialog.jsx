import { useEffect, useRef, useState } from 'react';
import { Dialog } from './ui.jsx';

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow the camera for this site in your browser settings, or use Add photo instead.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Use Add photo instead.';
    case 'NotReadableError':
      return 'The camera is being used by another app. Close it and try again.';
    default:
      return 'The camera could not be started. Use Add photo instead.';
  }
}

/**
 * Shows a live camera preview (laptop webcam or a phone camera) and returns one still photo as a
 * JPEG file through onCapture. The camera is switched off when the dialog closes.
 */
export default function CameraDialog({ onCapture, onClose }) {
  const video = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera here. Use Add photo instead.');
      return undefined;
    }
    let stream = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((err) => !cancelled && setError(cameraErrorMessage(err)));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => blob && onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })),
      'image/jpeg',
      0.9,
    );
  };

  return (
    <Dialog title="Take a photo" onClose={onClose}>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <div className="camera-view">
          <video ref={video} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} aria-label="Camera preview" />
          {!ready && <p className="muted camera-status">Starting the camera…</p>}
        </div>
      )}
      <div className="button-row">
        {!error && (
          <button type="button" className="button button-orange" onClick={capture} disabled={!ready}>
            Capture
          </button>
        )}
        <button type="button" className="button button-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
