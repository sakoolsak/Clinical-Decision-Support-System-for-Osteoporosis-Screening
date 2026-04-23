"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  imageUrl?: string | null;
  patientHN?: string;
  patientName?: string;
  study?: string;
  uploadedAt?: string | null;
  onUpload?: (file: File) => void;
};

export default function XrayViewer({
  imageUrl,
  patientHN,
  patientName,
  study = "Lumbar Spine AP/Lateral",
  uploadedAt,
  onUpload,
}: Props) {
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(110);
  const [invert, setInvert] = useState(false);
  const [showROI, setShowROI] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setBrightness(100);
    setContrast(110);
    setInvert(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [imageUrl]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (!imageUrl) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -0.2 : 0.2;
      setZoom((prev) => {
        const next = Math.max(0.5, Math.min(6, prev + dir));
        const rect = el.getBoundingClientRect();
        const offsetX = e.clientX - rect.left - rect.width / 2;
        const offsetY = e.clientY - rect.top - rect.height / 2;
        setPan((p) => ({
          x: p.x - offsetX * (next / prev - 1),
          y: p.y - offsetY * (next / prev - 1),
        }));
        return next;
      });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [imageUrl]);

  const filterCSS = `brightness(${brightness}%) contrast(${contrast}%) ${
    invert ? "invert(1)" : ""
  }`.trim();

  const handleFile = (file?: File | null) => {
    if (file && onUpload) onUpload(file);
  };

  const clampZoom = (v: number) => Math.max(0.5, Math.min(6, v));

  const zoomBy = (delta: number, cx?: number, cy?: number) => {
    setZoom((prev) => {
      const next = clampZoom(prev + delta);
      if (stageRef.current && cx != null && cy != null) {
        const rect = stageRef.current.getBoundingClientRect();
        const offsetX = cx - rect.left - rect.width / 2;
        const offsetY = cy - rect.top - rect.height / 2;
        setPan((p) => ({
          x: p.x - offsetX * (next / prev - 1),
          y: p.y - offsetY * (next / prev - 1),
        }));
      }
      return next;
    });
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toggleFullscreen = async () => {
    const el = viewerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const startPan = (e: React.MouseEvent) => {
    if (!imageUrl || zoom <= 1) return;
    setPanning(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const movePan = (e: React.MouseEvent) => {
    if (!panning) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const endPan = () => setPanning(false);

  return (
    <div
      ref={viewerRef}
      className={`xray-viewer ${isFullscreen ? "fullscreen" : ""}`}
    >
      <div className="xray-topbar">
        <div className="xray-meta">
          <div className="meta-title">DICOM VIEWER · SPINE OSTEOPOROSIS</div>
          <div className="meta-sub">
            <span>HN: {patientHN || "—"}</span>
            <span>Patient: {patientName || "—"}</span>
            <span>Study: {study}</span>
            {uploadedAt && <span>Acquired: {new Date(uploadedAt).toLocaleString()}</span>}
          </div>
        </div>
        <div className="xray-badges">
          <span className="badge badge-live">● LIVE</span>
          <span className="badge badge-ai">AI-ASSISTED</span>
          {onUpload && (
            <button
              className="badge badge-upload"
              onClick={() => fileRef.current?.click()}
              title="Upload / Replace X-ray"
            >
              ⬆ UPLOAD
            </button>
          )}
          <button
            className="badge badge-fullscreen"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? "⤢ EXIT FULL" : "⛶ FULLSCREEN"}
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`xray-stage ${dragOver ? "drag-over" : ""} ${
          panning ? "panning" : zoom > 1 ? "pannable" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onMouseDown={startPan}
        onMouseMove={movePan}
        onMouseUp={endPan}
        onMouseLeave={endPan}
      >
        {imageUrl ? (
          <div
            className="xray-image-wrap"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: panning ? "none" : "transform 0.15s ease",
            }}
          >
            <img
              src={imageUrl}
              alt="X-ray"
              className="xray-image"
              draggable={false}
              style={{ filter: filterCSS }}
            />
            {showROI && (
              <div className="roi-overlay" aria-hidden>
                <div className="roi-box">
                  <span className="roi-label">ROI · Spine (L1–L4)</span>
                  <span className="roi-corner tl" />
                  <span className="roi-corner tr" />
                  <span className="roi-corner bl" />
                  <span className="roi-corner br" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="xray-empty"
            role={onUpload ? "button" : undefined}
            onClick={() => onUpload && fileRef.current?.click()}
            style={{ cursor: onUpload ? "pointer" : "default" }}
          >
            <div className="pulse-dot" />
            <p>Drop X-ray here or click to upload</p>
            <small>Supported: PNG, JPG · AP / Lateral spine · DICOM preview</small>
            {onUpload && (
              <span className="btn btn-primary" style={{ marginTop: 14 }}>
                Browse File
              </span>
            )}
          </div>
        )}

        {imageUrl && (
          <div className="hud-layer" aria-hidden>
            <div className="hud hud-tl">WL 40 / WW 400</div>
            <div className="hud hud-tr">Zoom {(zoom * 100).toFixed(0)}%</div>
            <div className="hud hud-bl">MODEL: hybrid-v1</div>
            <div className="hud hud-br">AP · Lumbar</div>
          </div>
        )}

        {imageUrl && (
          <div className="zoom-controls" aria-label="zoom controls">
            <button className="zoom-btn" onClick={() => zoomBy(0.25)} title="Zoom In">
              +
            </button>
            <button className="zoom-btn" onClick={() => zoomBy(-0.25)} title="Zoom Out">
              −
            </button>
            <button className="zoom-btn" onClick={resetZoom} title="Reset">
              ⟳
            </button>
            <button className="zoom-btn" onClick={toggleFullscreen} title="Fullscreen">
              {isFullscreen ? "⤢" : "⛶"}
            </button>
            <div className="zoom-indicator">{(zoom * 100).toFixed(0)}%</div>
          </div>
        )}

        {onUpload && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        )}
      </div>

      <div className="xray-toolbar">
        <label>
          <span>Brightness</span>
          <input
            type="range"
            min={50}
            max={150}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
          />
          <em>{brightness}%</em>
        </label>
        <label>
          <span>Contrast</span>
          <input
            type="range"
            min={50}
            max={200}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
          />
          <em>{contrast}%</em>
        </label>
        <button
          className={`tool-btn ${invert ? "active" : ""}`}
          onClick={() => setInvert((v) => !v)}
        >
          Invert
        </button>
        <button
          className={`tool-btn ${showROI ? "active" : ""}`}
          onClick={() => setShowROI((v) => !v)}
        >
          ROI Overlay
        </button>
        <button className="tool-btn" onClick={() => zoomBy(0.25)}>
          Zoom +
        </button>
        <button className="tool-btn" onClick={() => zoomBy(-0.25)}>
          Zoom −
        </button>
        <button className="tool-btn" onClick={resetZoom}>
          Reset
        </button>
        <button className="tool-btn" onClick={toggleFullscreen}>
          {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
        {onUpload && (
          <button className="tool-btn" onClick={() => fileRef.current?.click()}>
            ⬆ Upload X-ray
          </button>
        )}
      </div>
    </div>
  );
}
