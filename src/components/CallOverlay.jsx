import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
function VideoElement({stream, muted=false, className=''}) { const ref=useRef(null); useEffect(()=>{ if(ref.current) ref.current.srcObject=stream||null; },[stream]); return <video ref={ref} autoPlay playsInline muted={muted} className={className}/>; }
function AudioElement({stream}) { const ref=useRef(null); useEffect(()=>{if(ref.current)ref.current.srcObject=stream||null;},[stream]);return <audio ref={ref} autoPlay/>; }
export default function CallOverlay({call,localStream,remoteStream,elapsed,onAccept,onReject,onEnd,onToggle}) {
 const [mic,setMic]=useState(true),[camera,setCamera]=useState(true); if(!call)return null;
 const clock=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
 return <div className="call-backdrop"><section className="call-card"><header><div><small>ORBIT SECURE CALL</small><h2>{call.incoming?'Incoming call':call.status==='calling'?'Calling…':call.status==='connecting'?'Connecting…':'In call'}</h2><p>{call.kind==='video'?'Video call':'Voice call'} · {call.status==='connecting'?clock:'Waiting for connection'}</p></div><button className="icon-btn" onClick={onEnd} aria-label="Close call"><X/></button></header>
 {call.kind!=='video'&&remoteStream&&<AudioElement stream={remoteStream}/>}
 {call.kind==='video'&&<div className="call-videos">{remoteStream&&<VideoElement stream={remoteStream} className="remote-video"/>}<VideoElement stream={localStream} muted className="local-video"/></div>}
 {call.kind!=='video'&&<div className="call-avatar"><Phone size={34}/></div>}
 {call.incoming?<div className="call-controls"><button className="call-accept" onClick={onAccept}><Phone/> Accept</button><button className="call-reject" onClick={onReject}><PhoneOff/> Decline</button></div>:<div className="call-controls"><button className={mic?'call-control':'call-control active'} onClick={()=>setMic(Boolean(onToggle('audio')))}>{mic?<Mic/>:<MicOff/>}<span>Mic</span></button>{call.kind==='video'&&<button className={camera?'call-control':'call-control active'} onClick={()=>setCamera(Boolean(onToggle('video')))}>{camera?<Video/>:<VideoOff/>}<span>Camera</span></button>}<button className="call-reject" onClick={onEnd}><PhoneOff/> End call</button></div>}
 <small className="call-note">Calls use peer-to-peer WebRTC. Network traversal may require configured TURN credentials.</small></section></div>
}
