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

export function useWebRTCCall(conversationId, conversationType = 'direct', selfUserId = '') {
  const pcRef = useRef(null), localRef = useRef(null), pendingCandidates = useRef([]), timerRef = useRef(null), startRef = useRef(0);
  const groupPeersRef = useRef(new Map()), pendingGroupCandidates = useRef(new Map()), activeCallIdRef = useRef(null);
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null), [remoteStream, setRemoteStream] = useState(null), [remoteStreams, setRemoteStreams] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const emit = useCallback((type, extra = {}) => {
    if (!socket.connected) { toast.error('Connect to the chat server before calling.'); return; }
    socket.emit('call:signal', { conversationId, signal: { type, ...extra } }, result => { if (result?.success === false) toast.error(result.message || 'Call signaling failed'); });
  }, [conversationId]);
  const emitGroup = useCallback((type, callId, extra = {}, toUserId) => {
    if (type !== 'busy' && activeCallIdRef.current !== callId) return;
    if (!socket.connected) { toast.error('Connect to the chat server before calling.'); return; }
    socket.emit('call:signal', { conversationId, ...(toUserId ? { toUserId } : {}), signal: { type, callId, ...extra } }, result => { if (result?.success === false) toast.error(result.message || 'Call signaling failed'); });
  }, [conversationId]);
  const removeGroupPeer = useCallback(userId => {
    const key = String(userId);
    const peer = groupPeersRef.current.get(key);
    if (!peer) return;
    groupPeersRef.current.delete(key);
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    setRemoteStreams([...groupPeersRef.current].map(([id, item]) => ({ userId: id, stream: item.stream })));
  }, []);
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current); timerRef.current = null;
    pcRef.current?.getSenders?.().forEach(s => { try { s.track?.stop(); } catch {} });
    pcRef.current?.close(); pcRef.current = null;
    for (const peer of groupPeersRef.current.values()) {
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();
    }
    groupPeersRef.current.clear();
    localRef.current?.getTracks?.().forEach(t => t.stop()); localRef.current = null;
    setLocalStream(null); setRemoteStream(null); setRemoteStreams([]);
    pendingCandidates.current = []; pendingGroupCandidates.current.clear(); activeCallIdRef.current = null;
    startRef.current = 0; setElapsed(0);
  }, []);
  const makePeer = useCallback(async kind => {
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
  const makeGroupPeer = useCallback(async (remoteUserId, callId, offerer) => {
    const userId = String(remoteUserId);
    let peer = groupPeersRef.current.get(userId);
    if (peer) return peer;
    if (!localRef.current) throw new Error('Accept the group call before connecting.');

    const pc = new RTCPeerConnection(rtcConfig());
    const stream = new MediaStream();
    peer = { pc, stream };
    groupPeersRef.current.set(userId, peer);
    setRemoteStreams([...groupPeersRef.current].map(([id, item]) => ({ userId: id, stream: item.stream })));
    localRef.current.getTracks().forEach(track => pc.addTrack(track, localRef.current));
    pc.ontrack = event => {
      const tracks = event.streams[0]?.getTracks() || [event.track];
      for (const track of tracks) if (!stream.getTracks().some(existing => existing.id === track.id)) stream.addTrack(track);
      setRemoteStreams([...groupPeersRef.current].map(([id, item]) => ({ userId: id, stream: item.stream })));
    };
    pc.onicecandidate = event => {
      if (event.candidate) emitGroup('ice-candidate', callId, { candidate: event.candidate }, userId);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCall(current => current ? { ...current, status: 'connecting' } : current);
        if (!startRef.current) {
          startRef.current = Date.now();
          timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
        }
      }
      if (['failed', 'closed'].includes(pc.connectionState) && groupPeersRef.current.get(userId) === peer) removeGroupPeer(userId);
    };
    if (offerer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emitGroup('offer', callId, { sdp: pc.localDescription }, userId);
    }
    return peer;
  }, [emitGroup, removeGroupPeer]);
  const start = useCallback(async kind => {
    if (conversationId == null) return;
    if (!socket.connected) { toast.error('Connect to the chat server before calling.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('Calls require HTTPS or localhost and a supported browser.'); return; }
    if (conversationType === 'group') {
      const callId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        activeCallIdRef.current = callId;
        setCall({ status: 'calling', kind, incoming: false, callId, group: true });
        const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' });
        if (activeCallIdRef.current !== callId) { local.getTracks().forEach(track => track.stop()); return; }
        localRef.current = local; setLocalStream(local);
        emitGroup('invite', callId, { kind });
      } catch (e) {
        cleanup(); setCall(null);
        toast.error(e?.name === 'NotAllowedError' ? 'Camera or microphone permission was denied.' : (e?.message || 'Could not start the call.'));
      }
      return;
    }
    try { setCall({ status: 'calling', kind, incoming: false }); const pc = await makePeer(kind); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); emit('offer', { sdp: pc.localDescription, kind }); }
    catch (e) { cleanup(); setCall(null); toast.error(e?.name === 'NotAllowedError' ? 'Camera or microphone permission was denied.' : (e?.message || 'Could not start the call.')); }
  }, [conversationId, conversationType, makePeer, emit, emitGroup, cleanup]);
  const accept = useCallback(async () => {
    if (conversationType === 'group') {
      if (!call?.callId || !call.incoming) return;
      try {
        const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.kind === 'video' });
        if (activeCallIdRef.current !== call.callId) { local.getTracks().forEach(track => track.stop()); return; }
        localRef.current = local; setLocalStream(local);
        activeCallIdRef.current = call.callId;
        setCall(current => current ? { ...current, status: 'connecting', incoming: false } : current);
        emitGroup('join', call.callId);
      } catch (e) {
        cleanup(); setCall(null);
        toast.error(e?.name === 'NotAllowedError' ? 'Camera or microphone permission was denied.' : (e?.message || 'Could not accept the call.'));
      }
      return;
    }
    if (!call?.offer) return;
    try { const pc = await makePeer(call.kind || 'audio'); await pc.setRemoteDescription(call.offer); for (const c of pendingCandidates.current.splice(0)) await pc.addIceCandidate(c).catch(() => {}); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); emit('answer', { sdp: pc.localDescription, kind: call.kind || 'audio' }); setCall(c => ({ ...c, status: 'connecting', incoming: false })); }
    catch (e) { cleanup(); setCall(null); toast.error(e?.message || 'Could not accept the call.'); }
  }, [call, conversationType, makePeer, emit, emitGroup, cleanup]);
  const end = useCallback((sendSignal = true) => {
    if (conversationType === 'group') {
      if (sendSignal && activeCallIdRef.current) emitGroup('leave', activeCallIdRef.current);
    } else if (sendSignal) emit('end');
    cleanup(); setCall(null);
  }, [conversationType, cleanup, emit, emitGroup]);
  const reject = useCallback(() => {
    if (conversationType === 'group' && call?.callId) emitGroup('reject', call.callId, {}, call.from);
    else emit('reject');
    cleanup(); setCall(null);
  }, [call, conversationType, cleanup, emit, emitGroup]);
  useEffect(() => {
    const onSignal = async p => {
      if (String(p?.conversationId) !== String(conversationId) || !p?.signal) return;
      const s = p.signal;
      if (conversationType === 'group') {
        const callId = s.callId;
        if (s.type === 'invite') {
          if (activeCallIdRef.current && activeCallIdRef.current !== callId) {
            emitGroup('busy', callId, {}, p.from);
            return;
          }
          if (!activeCallIdRef.current) {
            activeCallIdRef.current = callId;
            setCall({ status: 'incoming', incoming: true, from: p.from, kind: s.kind || 'audio', callId, group: true });
          }
          return;
        }
        if (!callId || activeCallIdRef.current !== callId) return;
        try {
          if (s.type === 'join') {
            if (localRef.current) await makeGroupPeer(p.from, callId, true);
          } else if (s.type === 'offer' && s.sdp) {
            const peer = await makeGroupPeer(p.from, callId, false);
            if (peer.pc.signalingState === 'have-local-offer') {
              if (String(selfUserId) < String(p.from)) return;
              await peer.pc.setLocalDescription({ type: 'rollback' });
            }
            await peer.pc.setRemoteDescription(s.sdp);
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            emitGroup('answer', callId, { sdp: peer.pc.localDescription }, p.from);
            for (const candidate of peer.pendingCandidates?.splice(0) || []) await peer.pc.addIceCandidate(candidate).catch(() => {});
            for (const candidate of pendingGroupCandidates.current.get(String(p.from)) || []) await peer.pc.addIceCandidate(candidate).catch(() => {});
            pendingGroupCandidates.current.delete(String(p.from));
          } else if (s.type === 'answer' && s.sdp) {
            const peer = groupPeersRef.current.get(String(p.from));
            if (peer?.pc.signalingState === 'have-local-offer') {
              await peer.pc.setRemoteDescription(s.sdp);
              for (const candidate of peer.pendingCandidates?.splice(0) || []) await peer.pc.addIceCandidate(candidate).catch(() => {});
              for (const candidate of pendingGroupCandidates.current.get(String(p.from)) || []) await peer.pc.addIceCandidate(candidate).catch(() => {});
              pendingGroupCandidates.current.delete(String(p.from));
            }
          } else if (s.type === 'ice-candidate' && s.candidate) {
            const peer = groupPeersRef.current.get(String(p.from));
            if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(s.candidate).catch(() => {});
            else {
              if (peer) (peer.pendingCandidates ||= []).push(s.candidate);
              else {
                const candidates = pendingGroupCandidates.current.get(String(p.from)) || [];
                candidates.push(s.candidate);
                pendingGroupCandidates.current.set(String(p.from), candidates);
              }
            }
          } else if (s.type === 'leave' || s.type === 'reject') {
            if (call?.incoming && String(call.from) === String(p.from)) { cleanup(); setCall(null); }
            else removeGroupPeer(p.from);
          } else if (s.type === 'busy') {
            toast('A group member is already on another call');
          }
        } catch (e) {
          removeGroupPeer(p.from);
          toast.error(e?.message || 'Group call signaling could not be processed.');
        }
        return;
      }
      if (String(p?.conversationId) !== String(conversationId) || !p?.signal) return;
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
  }, [conversationId, conversationType, call, emit, emitGroup, cleanup, makeGroupPeer, removeGroupPeer, selfUserId]);
  useEffect(() => () => cleanup(), [cleanup, conversationId, conversationType]);
  const toggleTrack = useCallback(kind => { const track = localRef.current?.getTracks().find(t => t.kind === kind); if (track) track.enabled = !track.enabled; return track?.enabled; }, []);
  return { call, localStream, remoteStream, remoteStreams, elapsed, start, accept, end, reject, toggleTrack };
}
