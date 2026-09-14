import { supabase } from './supabase';
import { ActiveCallInfo, CallType, User } from '../types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

type CallStateListener = (
  info: ActiveCallInfo | null,
  localStream: MediaStream | null,
  remoteStream: MediaStream | null
) => void;

type ErrorListener = (message: string) => void;

class WebRTCCallService {
  private currentUser: User | null = null;
  private signalChannel: any = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private activeCall: ActiveCallInfo | null = null;
  private pendingOffer: any = null;
  private queuedCandidates: RTCIceCandidateInit[] = [];

  private stateListeners: Set<CallStateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();

  public subscribe(listener: CallStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.activeCall, this.localStream, this.remoteStream);
    return () => this.stateListeners.delete(listener);
  }

  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private notify() {
    this.stateListeners.forEach((l) =>
      l(
        this.activeCall ? { ...this.activeCall } : null,
        this.localStream,
        this.remoteStream
      )
    );
  }

  private notifyError(msg: string) {
    this.errorListeners.forEach((l) => l(msg));
  }

  public init(user: User) {
    if (this.currentUser?.id === user.id && this.signalChannel) {
      return;
    }
    this.cleanup();
    this.currentUser = user;

    // Listen on personal signaling channel
    this.signalChannel = supabase.channel(`call_signals_${user.id}`, {
      config: { broadcast: { self: false } },
    });

    this.signalChannel
      .on('broadcast', { event: 'call_offer' }, (payload: any) => this.handleIncomingOffer(payload.payload))
      .on('broadcast', { event: 'call_answer' }, (payload: any) => this.handleCallAnswer(payload.payload))
      .on('broadcast', { event: 'ice_candidate' }, (payload: any) => this.handleRemoteCandidate(payload.payload))
      .on('broadcast', { event: 'call_rejected' }, (payload: any) => this.handleCallRejected(payload.payload))
      .on('broadcast', { event: 'call_ended' }, (payload: any) => this.handleCallEnded(payload.payload))
      .on('broadcast', { event: 'call_busy' }, (payload: any) => this.handleCallBusy(payload.payload))
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Ready to receive signals
        }
      });
  }

  private async sendSignal(targetUserId: string, event: string, payload: any) {
    const channel = supabase.channel(`call_signals_${targetUserId}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event,
      payload,
    });
    // Remove temporary channel instance after sending
    setTimeout(() => {
      supabase.removeChannel(channel);
    }, 5000);
  }

  private stopMediaStream(stream: MediaStream | null) {
    if (!stream) return;
    try {
      stream.getTracks().forEach((t) => {
        t.stop();
      });
    } catch (e) {
      console.warn('Error stopping stream tracks:', e);
    }
  }

  private resetCallState() {
    this.stopMediaStream(this.localStream);
    this.stopMediaStream(this.remoteStream);
    this.localStream = null;
    this.remoteStream = null;

    if (this.pc) {
      try {
        this.pc.onicecandidate = null;
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.close();
      } catch (e) {
        // ignore
      }
      this.pc = null;
    }

    this.pendingOffer = null;
    this.queuedCandidates = [];
    this.activeCall = null;
    this.notify();
  }

  private async requestMedia(callType: CallType): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support audio/video calling.');
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error(
          `Permission denied: Please allow ${callType === 'video' ? 'camera and microphone' : 'microphone'} access in your browser settings.`
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error(
          `Required device not found: No ${callType === 'video' ? 'camera/microphone' : 'microphone'} detected on your device.`
        );
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('Your camera or microphone is already in use by another application.');
      }
      throw new Error(`Could not access media devices: ${err.message || err.name}`);
    }
  }

  private setupPeerConnection(peerId: string, callId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.pc = pc;

    this.remoteStream = new MediaStream();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, 'ice_candidate', {
          callId,
          candidate: event.candidate.toJSON(),
          senderId: this.currentUser?.id,
        }).catch((err) => console.warn('Signal send error:', err));
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        event.track && this.remoteStream?.addTrack(event.track);
      }
      this.notify();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (this.activeCall) {
          this.activeCall.state = 'connected';
          if (!this.activeCall.startedAt) {
            this.activeCall.startedAt = Date.now();
          }
          this.notify();
        }
      } else if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'closed'
      ) {
        if (this.activeCall && this.activeCall.state === 'connected') {
          this.endCall();
        }
      }
    };

    return pc;
  }

  // --- INCOMING HANDLERS ---

  private handleIncomingOffer(payload: any) {
    const { callId, callerId, callerName, callerAvatar, callType, sdp } = payload;
    if (!callId || !callerId) return;

    if (this.activeCall && this.activeCall.state !== 'ended') {
      // User is busy in another call
      this.sendSignal(callerId, 'call_busy', { callId, targetId: callerId }).catch(() => {});
      return;
    }

    this.pendingOffer = sdp;
    this.activeCall = {
      callId,
      type: callType || 'audio',
      peerId: callerId,
      peerName: callerName || 'Caller',
      peerAvatar: callerAvatar || '',
      isInitiator: false,
      state: 'incoming',
    };
    this.notify();
  }

  private async handleCallAnswer(payload: any) {
    const { callId, sdp } = payload;
    if (!this.activeCall || this.activeCall.callId !== callId || !this.pc) return;

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.activeCall.state = 'connected';
      this.activeCall.startedAt = Date.now();
      this.notify();

      // Drain queued ICE candidates
      while (this.queuedCandidates.length > 0) {
        const cand = this.queuedCandidates.shift();
        if (cand) {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      }
    } catch (err: any) {
      console.error('Failed to set remote answer:', err);
      this.notifyError(`Failed to establish connection: ${err.message}`);
      this.endCall();
    }
  }

  private async handleRemoteCandidate(payload: any) {
    const { callId, candidate } = payload;
    if (!this.activeCall || this.activeCall.callId !== callId || !candidate) return;

    if (this.pc && this.pc.remoteDescription) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Error adding received ice candidate:', err);
      }
    } else {
      this.queuedCandidates.push(candidate);
    }
  }

  private handleCallRejected(payload: any) {
    const { callId } = payload;
    if (this.activeCall && this.activeCall.callId === callId) {
      this.notifyError(`${this.activeCall.peerName} declined the call.`);
      this.resetCallState();
    }
  }

  private handleCallBusy(payload: any) {
    const { callId } = payload;
    if (this.activeCall && this.activeCall.callId === callId) {
      this.notifyError(`${this.activeCall.peerName} is busy in another call.`);
      this.resetCallState();
    }
  }

  private handleCallEnded(payload: any) {
    const { callId } = payload;
    if (this.activeCall && this.activeCall.callId === callId) {
      this.notifyError('Call ended.');
      this.resetCallState();
    }
  }

  // --- OUTGOING CALL ACTIONS ---

  public async startCall(
    targetUser: { id: string; name: string; avatar?: string },
    type: CallType
  ): Promise<void> {
    if (!this.currentUser) {
      this.notifyError('You must be signed in to place a call.');
      return;
    }
    if (this.activeCall && this.activeCall.state !== 'ended') {
      this.notifyError('A call is already active or in progress.');
      return;
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      this.activeCall = {
        callId,
        type,
        peerId: targetUser.id,
        peerName: targetUser.name,
        peerAvatar: targetUser.avatar || '',
        isInitiator: true,
        state: 'calling',
      };
      this.notify();

      // Acquire media
      this.localStream = await this.requestMedia(type);

      // Create Peer Connection
      const pc = this.setupPeerConnection(targetUser.id, callId);
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Broadcast Offer
      await this.sendSignal(targetUser.id, 'call_offer', {
        callId,
        callerId: this.currentUser.id,
        callerName: this.currentUser.name,
        callerAvatar: this.currentUser.avatar,
        callType: type,
        sdp: offer,
      });

      this.notify();
    } catch (err: any) {
      this.notifyError(err.message || 'Failed to initiate call.');
      this.resetCallState();
    }
  }

  public async acceptCall(): Promise<void> {
    if (!this.activeCall || this.activeCall.state !== 'incoming' || !this.pendingOffer) {
      return;
    }

    const { callId, peerId, type } = this.activeCall;

    try {
      // Acquire media
      this.localStream = await this.requestMedia(type);

      // Setup Peer Connection
      const pc = this.setupPeerConnection(peerId, callId);
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));

      // Drain any queued candidates
      while (this.queuedCandidates.length > 0) {
        const cand = this.queuedCandidates.shift();
        if (cand) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      }

      // Create Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send Answer
      await this.sendSignal(peerId, 'call_answer', {
        callId,
        sdp: answer,
      });

      this.activeCall.state = 'connected';
      this.activeCall.startedAt = Date.now();
      this.notify();
    } catch (err: any) {
      this.notifyError(err.message || 'Failed to accept call.');
      this.rejectCall();
    }
  }

  public async rejectCall(): Promise<void> {
    if (!this.activeCall) return;
    const { callId, peerId } = this.activeCall;
    try {
      await this.sendSignal(peerId, 'call_rejected', { callId });
    } catch (e) {
      // ignore
    }
    this.resetCallState();
  }

  public async endCall(): Promise<void> {
    if (!this.activeCall) return;
    const { callId, peerId } = this.activeCall;
    try {
      await this.sendSignal(peerId, 'call_ended', { callId });
    } catch (e) {
      // ignore
    }
    this.resetCallState();
  }

  public toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return false;

    audioTrack.enabled = !audioTrack.enabled;
    const isMuted = !audioTrack.enabled;
    if (this.activeCall) {
      this.activeCall.isMuted = isMuted;
    }
    this.notify();
    return isMuted;
  }

  public toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;

    videoTrack.enabled = !videoTrack.enabled;
    const isVideoOff = !videoTrack.enabled;
    if (this.activeCall) {
      this.activeCall.isVideoOff = isVideoOff;
    }
    this.notify();
    return isVideoOff;
  }

  public cleanup() {
    this.resetCallState();
    if (this.signalChannel) {
      try {
        supabase.removeChannel(this.signalChannel);
      } catch (e) {
        // ignore
      }
      this.signalChannel = null;
    }
    this.currentUser = null;
  }
}

export const webrtcCallService = new WebRTCCallService();
