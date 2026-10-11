import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socketClient.js';
import toast from 'react-hot-toast';

const defaultIceServers = [{ urls: [import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302'] }];
const rtcConfig = () => {
  const servers = [...defaultIceServers];
  const turn = import.meta.env.VITE_TURN_URL;
  if (turn) servers.push({ urls: turn.split(',').map(x => x.trim()).filter(Boolean), username: import.meta.env.VITE_TURN_USERNAME || undefined, credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined });
  return { iceServers: servers };
};

export function useWebRTCCall(conversationId) {
  const pcRef = useRef(null), localRef = useRef(null), pendingCandidates = useRef([]), timerRef = useRef(null), startRef = useRef(0);
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null), [remoteStream, setRemoteStream] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const emit = useCallback((type, extra = {}) => {
    if (!socket.connected) { toast.error('Connect to the chat server before calling.'); return; }
    socket.emit('call:signal', { conversationId, signal: { type, ...extra } }, result => { if (result?.success === false) toast.error(result.message || 'Call signaling failed'); });
  }, [conversationId]);
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current); timerRef.current = null;
    pcRef.current?.getSenders?.().forEach(s => { try { s.track?.stop(); } catch {} });
    pcRef.current?.close(); pcRef.current = null;
    localRef.current?.getTracks?.().forEach(t => t.stop()); localRef.current = null;
    setLocalStream(null); setRemoteStream(null); pendingCandidates.current = []; startRef.current = 0; setElapsed(0);
  }, []);
  const makePeer = useCallback(async (kind) => {
    const pc = new RTCPeerConnection(rtcConfig()); pcRef.current = pc;
    const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' });
    localRef.current = local; setLocalStream(local);
    const remote = new MediaStream(); setRemoteStream(remote);
    local.getTracks().forEach(t => pc.addTrack(t, local));
    pc.ontrack = e => e.streams[0]?.getTracks().forEach(t => { if (!remote.getTracks().some(x => x.id === t.id)) remote.addTrack(t); });
    pc.onicecandidate = e => { if (e.candidate) emit('ice-candidate', { candidate: e.candidate }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && !startRef.current) { startRef.current = Date.now(); timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000); }
      if (['failed', 'closed'].includes(pc.connectionState) && pcRef.current === pc) { cleanup(); setCall(null); }
    };
    return pc;
  }, [cleanup, emit]);
  const start = useCallback(async kind => {
    if (conversationId == null) return;
    if (!socket.connected) { toast.error('Connect to the chat server before calling.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('Calls require HTTPS or localhost and a supported browser.'); return; }
    try { setCall({ status: 'calling', kind, incoming: false }); const pc = await makePeer(kind); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); emit('offer', { sdp: pc.localDescription, kind }); }
    catch (e) { cleanup(); setCall(null); toast.error(e?.name === 'NotAllowedError' ? 'Camera or microphone permission was denied.' : (e?.message || 'Could not start the call.')); }
  }, [conversationId, makePeer, emit, cleanup]);
  const accept = useCallback(async () => {
    if (!call?.offer) return;
    try { const pc = await makePeer(call.kind || 'audio'); await pc.setRemoteDescription(call.offer); for (const c of pendingCandidates.current.splice(0)) await pc.addIceCandidate(c).catch(() => {}); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); emit('answer', { sdp: pc.localDescription, kind: call.kind || 'audio' }); setCall(c => ({ ...c, status: 'connecting', incoming: false })); }
    catch (e) { cleanup(); setCall(null); toast.error(e?.message || 'Could not accept the call.'); }
  }, [call, makePeer, emit, cleanup]);
  const end = useCallback((sendSignal = true) => { if (sendSignal) emit('end'); cleanup(); setCall(null); }, [cleanup, emit]);
  const reject = useCallback(() => { emit('reject'); cleanup(); setCall(null); }, [cleanup, emit]);
  useEffect(() => {
    const onSignal = async p => {
      if (String(p?.conversationId) !== String(conversationId) || !p?.signal) return;
      const s = p.signal;
      try {
        if (s.type === 'offer') {
          if (call) { emit('busy'); return; }
          setCall({ status: 'incoming', incoming: true, from: p.from, kind: s.kind || 'audio', offer: s.sdp });
        } else if (s.type === 'answer' && pcRef.current && s.sdp) {
          await pcRef.current.setRemoteDescription(s.sdp); for (const c of pendingCandidates.current.splice(0)) await pcRef.current.addIceCandidate(c).catch(() => {}); setCall(c => c ? { ...c, status: 'connecting' } : c);
        } else if (s.type === 'ice-candidate' && s.candidate) {
          if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(s.candidate).catch(() => {}); else pendingCandidates.current.push(s.candidate);
        } else if (['reject', 'busy', 'end'].includes(s.type)) {
          cleanup(); setCall(null); if (s.type === 'reject') toast('Call declined'); if (s.type === 'busy') toast('The other user is busy');
        }
      } catch { toast.error('Call signaling could not be processed.'); }
    };
    socket.on('call:signal', onSignal); return () => socket.off('call:signal', onSignal);
  }, [conversationId, call, emit, cleanup]);
  useEffect(() => () => cleanup(), [cleanup]);
  const toggleTrack = useCallback(kind => { const track = localRef.current?.getTracks().find(t => t.kind === kind); if (track) track.enabled = !track.enabled; return track?.enabled; }, []);
  return { call, localStream, remoteStream, elapsed, start, accept, end, reject, toggleTrack };
}
