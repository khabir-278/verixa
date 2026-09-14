import React, { useEffect, useRef, useState } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { ActiveCallInfo } from '../types';
import { webrtcCallService } from '../lib/webrtcCallService';

interface CallModalProps {
  activeCall: ActiveCallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  activeCall,
  localStream,
  remoteStream,
  onAccept,
  onReject,
  onEnd,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeCall?.state]);

  // Attach remote stream
  useEffect(() => {
    if (remoteStream) {
      if (activeCall?.type === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      } else if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, activeCall?.type, activeCall?.state]);

  // Call timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeCall?.state === 'connected') {
      const start = activeCall.startedAt || Date.now();
      interval = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeCall?.state, activeCall?.startedAt]);

  if (!activeCall || activeCall.state === 'idle' || activeCall.state === 'ended') {
    return null;
  }

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleMute = () => {
    const muted = webrtcCallService.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleVideo = () => {
    const off = webrtcCallService.toggleVideo();
    setIsVideoOff(off);
  };

  // 1. INCOMING CALL MODAL
  if (activeCall.state === 'incoming') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
        <div className="relative max-w-sm w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-purple-500/40 p-1 bg-slate-950">
                {activeCall.peerAvatar ? (
                  <img
                    src={activeCall.peerAvatar}
                    alt={activeCall.peerName}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full bg-purple-900/40 rounded-full flex items-center justify-center text-purple-300">
                    <UserIcon className="w-10 h-10" />
                  </div>
                )}
              </div>
              <span className="absolute -inset-1 rounded-full border-2 border-purple-500 animate-ping opacity-60" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-white flex items-center justify-center gap-1.5">
              {activeCall.peerName}
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </h3>
            <p className="text-xs text-purple-300 font-semibold mt-1">
              Incoming {activeCall.type === 'video' ? 'Video' : 'Audio'} Call...
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">End-to-end peer encrypted</p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-6 pt-2">
            <button
              onClick={onReject}
              className="flex flex-col items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition"
              title="Decline call"
            >
              <div className="w-14 h-14 rounded-full bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 hover:bg-rose-600 hover:text-white transition shadow-lg shadow-rose-950/50 cursor-pointer">
                <PhoneOff className="w-6 h-6" />
              </div>
              <span>Decline</span>
            </button>

            <button
              onClick={onAccept}
              className="flex flex-col items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition"
              title="Accept call"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 hover:bg-emerald-600 hover:text-white transition shadow-lg shadow-emerald-950/50 animate-bounce cursor-pointer">
                {activeCall.type === 'video' ? (
                  <Video className="w-6 h-6" />
                ) : (
                  <PhoneCall className="w-6 h-6" />
                )}
              </div>
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. ACTIVE / CALLING MODAL
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-purple-500/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[420px] max-h-[85vh]">
        {/* Hidden Audio for Voice calls */}
        <audio ref={remoteAudioRef} autoPlay playsInline />

        {/* Video stream container */}
        {activeCall.type === 'video' ? (
          <div className="relative flex-1 bg-black min-h-[300px] flex items-center justify-center overflow-hidden">
            {/* Remote Video */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* If remote stream not yet delivering video or waiting */}
            {activeCall.state === 'calling' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm space-y-4">
                <div className="relative">
                  <img
                    src={activeCall.peerAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80'}
                    alt={activeCall.peerName}
                    className="w-24 h-24 rounded-full object-cover border-2 border-purple-500/50"
                  />
                  <span className="absolute -inset-1 rounded-full border-2 border-purple-500 animate-ping opacity-70" />
                </div>
                <div className="text-center">
                  <h4 className="text-white font-bold text-lg">{activeCall.peerName}</h4>
                  <p className="text-purple-300 text-xs font-semibold">Calling...</p>
                </div>
              </div>
            )}

            {/* Local Pip Video */}
            <div className="absolute bottom-4 right-4 w-32 h-44 sm:w-36 sm:h-48 bg-slate-950/90 rounded-2xl overflow-hidden border border-purple-500/40 shadow-xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
              {isVideoOff && (
                <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-slate-400">
                  <VideoOff className="w-5 h-5 text-rose-400 mb-1" />
                  <span className="text-[10px]">Camera Off</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Audio Call Visualizer */
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6 bg-gradient-to-b from-slate-900 to-slate-950">
            <div className="relative">
              <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-purple-500/40 p-1 bg-slate-950">
                <img
                  src={activeCall.peerAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80'}
                  alt={activeCall.peerName}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              {activeCall.state === 'connected' ? (
                <span className="absolute -inset-2 rounded-full border-2 border-emerald-500/40 animate-pulse" />
              ) : (
                <span className="absolute -inset-2 rounded-full border-2 border-purple-500 animate-ping opacity-60" />
              )}
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-bold text-white flex items-center justify-center gap-1.5">
                {activeCall.peerName}
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </h3>
              <p className="text-xs text-purple-300 font-semibold">
                {activeCall.state === 'connected'
                  ? `Connected • ${formatDuration(callDuration)}`
                  : 'Calling...'}
              </p>
              <p className="text-[11px] text-slate-500">Encrypted Audio Call</p>
            </div>
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-8">
          <div className="text-xs text-slate-400 font-mono">
            {activeCall.state === 'connected' ? formatDuration(callDuration) : 'Connecting...'}
          </div>

          <div className="flex items-center gap-4">
            {/* Mute Mic */}
            <button
              onClick={handleToggleMute}
              className={`p-3 rounded-full border transition cursor-pointer ${
                isMuted
                  ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Video Toggle (if video call) */}
            {activeCall.type === 'video' && (
              <button
                onClick={handleToggleVideo}
                className={`p-3 rounded-full border transition cursor-pointer ${
                  isVideoOff
                    ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                }`}
                title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            {/* End Call */}
            <button
              onClick={onEnd}
              className="p-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 transition cursor-pointer"
              title="End call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>

          <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Peer-to-Peer
          </div>
        </div>
      </div>
    </div>
  );
};
