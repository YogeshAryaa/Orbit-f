import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';

function VideoElement({ stream, muted = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className}/>;
}

function AudioElement({ stream }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <audio ref={ref} autoPlay/>;
}

/**
 * Plays a repeating synthetic ringtone using the Web Audio API while the
 * component is mounted. Stops and cleans up when unmounted.
 */
function IncomingRingtone() {
  const ctxRef = useRef(null);
  const stopRef = useRef(null);
  useEffect(() => {
    let stopped = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;

    // Play a short "dring-dring" pattern: two beep bursts then a pause, loop.
    function playRing() {
      if (stopped) return;
      const now = ctx.currentTime;
      const freqs = [880, 1100];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.18);
        gain.gain.linearRampToValueAtTime(0.35, now + i * 0.18 + 0.02);
        gain.gain.setValueAtTime(0.35, now + i * 0.18 + 0.13);
        gain.gain.linearRampToValueAtTime(0, now + i * 0.18 + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.18);
      });
      // Schedule next ring after 1.2 s
      const timer = setTimeout(() => { if (!stopped) playRing(); }, 1200);
      stopRef.current = timer;
    }

    // Resume context if browser suspended it before user interaction
    ctx.resume().then(() => { if (!stopped) playRing(); });

    return () => {
      stopped = true;
      clearTimeout(stopRef.current);
      try { ctx.close(); } catch {}
    };
  }, []);
  return null;
}

export default function CallOverlay({ call, localStream, remoteStream, remoteStreams = [], elapsed, onAccept, onReject, onEnd, onToggle }) {
  const [mic, setMic] = useState(true), [camera, setCamera] = useState(true);
  if (!call) return null;
  const streams = remoteStreams.length ? remoteStreams : (remoteStream ? [{ userId: 'remote', stream: remoteStream }] : []);
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  // Wrap accept/reject so the ringtone stops (component unmounts) before calling
  const handleAccept = () => { if (onAccept) onAccept(); };
  const handleReject = () => { if (onReject) onReject(); };

  return (
    <div className="call-backdrop">
      {/* Play ringtone only for incoming calls that haven't been answered yet */}
      {call.incoming && <IncomingRingtone />}
      <section className="call-card">
        <header>
          <div>
            <small>ORBIT SECURE CALL</small>
            <h2>{call.incoming ? 'Incoming call' : call.status === 'calling' ? 'Calling…' : call.status === 'connecting' ? 'Connecting…' : 'In call'}</h2>
            <p>{call.kind === 'video' ? 'Video call' : 'Voice call'}{call.group ? ` · ${streams.length + 1} participants` : ''} · {call.status === 'connecting' ? clock : 'Waiting for connection'}</p>
          </div>
          <button className="icon-btn" onClick={onEnd} aria-label="Close call"><X/></button>
        </header>
        {call.kind !== 'video' && streams.map(({ userId, stream }) => <AudioElement key={userId} stream={stream}/>)}
        {call.kind === 'video' && (
          <div className={`call-videos ${call.group ? 'group-call-videos' : ''}`}>
            {streams.map(({ userId, stream }) => <VideoElement key={userId} stream={stream} className="remote-video"/>)}
            <VideoElement stream={localStream} muted className="local-video"/>
          </div>
        )}
        {call.kind !== 'video' && <div className="call-avatar"><Phone size={34}/></div>}
        {call.incoming ? (
          <div className="call-controls">
            <button className="call-accept" onClick={handleAccept}><Phone/> Accept</button>
            <button className="call-reject" onClick={handleReject}><PhoneOff/> Decline</button>
          </div>
        ) : (
          <div className="call-controls">
            <button className={mic ? 'call-control' : 'call-control active'} onClick={() => setMic(Boolean(onToggle('audio')))}>{mic ? <Mic/> : <MicOff/>}<span>Mic</span></button>
            {call.kind === 'video' && <button className={camera ? 'call-control' : 'call-control active'} onClick={() => setCamera(Boolean(onToggle('video')))}>{camera ? <Video/> : <VideoOff/>}<span>Camera</span></button>}
            <button className="call-reject" onClick={onEnd}><PhoneOff/> End call</button>
          </div>
        )}
        <small className="call-note">Calls use peer-to-peer WebRTC. Network traversal may require configured TURN credentials.</small>
      </section>
    </div>
  );
}
