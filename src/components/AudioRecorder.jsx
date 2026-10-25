import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';

// In-app audio recorder for hui kōrero. Hands back a File; encryption happens when the entry is sealed.
// Opus at 64 kbps is roughly 28 MB an hour, so a long hui still fits under the file cap.

function pickMimeType() {
  const options = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return options.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export default function AudioRecorder({ onRecorded, onClose }) {
  const [state, setState] = useState('idle'); // idle | recording | error
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedRef = useRef(0);

  function cleanup() {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => {
    if (recRef.current?.state === 'recording') {
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    cleanup();
  }, []);

  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setState('error');
      setError("This browser can't record audio. Record with your phone's voice memo app and use “Add from device”.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 64000 });
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        cleanup();
        const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
        const file = new File(chunksRef.current, `hui-recording-${stamp}.${ext}`, { type });
        setState('idle');
        setElapsed(0);
        onRecorded(file);
      };
      rec.start(1000); // collect data every second so a crash doesn't lose everything in memory
      recRef.current = rec;
      startedRef.current = Date.now();
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)), 500);
      setState('recording');
    } catch (e) {
      cleanup();
      setState('error');
      setError(e?.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in your browser settings and try again.'
        : "Couldn't start recording on this device.");
    }
  }

  function stop() {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }

  return (
    <div style={{ background: '#171310', border: '1px solid #3E342A', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {state === 'recording' ? (
          <>
            <span className="rec-dot" aria-hidden="true" />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, flex: 1 }} aria-live="polite">{fmtTime(elapsed)}</span>
            <button type="button" onClick={stop} style={recBtn('#B5503F')}>
              <Square size={14} /> Stop & attach
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: '#B8AC97', flex: 1 }}>Record kōrero from this hui</span>
            <button type="button" onClick={start} style={recBtn('#3E6653')}>
              <Mic size={14} /> Start
            </button>
            <button type="button" onClick={onClose} aria-label="Close recorder" style={{ background: 'none', border: 'none', color: '#7C7263', cursor: 'pointer', display: 'flex' }}>
              <X size={18} />
            </button>
          </>
        )}
      </div>
      {state === 'recording' && (
        <p style={{ fontSize: 12, color: '#7C7263', margin: '8px 0 0' }}>Keep this screen open. Some phones stop recording when the screen locks.</p>
      )}
      {error && <p style={{ fontSize: 12, color: '#D98577', margin: '8px 0 0' }}>{error}</p>}
      <style>{`
        .rec-dot { width: 10px; height: 10px; border-radius: 50%; background: #D9564A; animation: rec-pulse 1.2s ease-in-out infinite; }
        @keyframes rec-pulse { 50% { opacity: 0.35; } }
      `}</style>
    </div>
  );
}

function recBtn(bg) {
  return { display: 'flex', alignItems: 'center', gap: 6, background: bg, color: '#EDE3D3', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
}
