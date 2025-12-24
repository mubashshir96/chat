// WebRTC Configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

// Global Variables
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;
let callDataRef = null;
let isCaller = false;
let callType = null; // 'audio' or 'video'
let isScreenSharing = false;
let screenStream = null;

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const videoContainer = document.getElementById('videoContainer');
const incomingCallAlert = document.getElementById('incomingCallAlert');
const callerInfo = document.getElementById('callerInfo');
const callStatus = document.getElementById('callStatus');
const endCallBtn = document.querySelector('.btn-call.end');

// Initialize WebRTC
function initializeWebRTC() {
  // Listen for incoming calls
  db.ref('calls').on('child_added', handleIncomingCall);
  db.ref('calls').on('child_changed', handleCallUpdate);
  db.ref('calls').on('child_removed', handleCallEnded);
}

// SCREEN SHARING FUNCTION
window.toggleScreenShare = async function() {
  try {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
      }
      
      // Revert to camera
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          const senders = peerConnection.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          
          if (videoSender) {
            videoSender.replaceTrack(videoTrack);
          }
        }
      }
      
      isScreenSharing = false;
      updateScreenShareButton();
      return;
    }
    
    // Start screen sharing
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: false
    });
    
    // Replace video track with screen track
    const screenTrack = screenStream.getVideoTracks()[0];
    const senders = peerConnection.getSenders();
    const videoSender = senders.find(s => s.track?.kind === 'video');
    
    if (videoSender) {
      videoSender.replaceTrack(screenTrack);
    }
    
    // Update local video
    if (localVideo) {
      const combinedStream = new MediaStream();
      const audioTrack = localStream?.getAudioTracks()[0];
      if (audioTrack) combinedStream.addTrack(audioTrack);
      combinedStream.addTrack(screenTrack);
      localVideo.srcObject = combinedStream;
    }
    
    isScreenSharing = true;
    updateScreenShareButton();
    
    // Handle when user stops screen sharing from browser
    screenTrack.onended = () => {
      toggleScreenShare();
    };
    
  } catch (error) {
    console.error('Error toggling screen share:', error);
    if (error.name !== 'NotAllowedError') {
      alert('Failed to share screen: ' + error.message);
    }
  }
};

// Update screen share button state
function updateScreenShareButton() {
  const screenShareBtn = document.querySelector('.btn-screen-share');
  const videoControlBtn = document.getElementById('screenShareBtn');
  
  if (screenShareBtn) {
    if (isScreenSharing) {
      screenShareBtn.classList.add('active');
      screenShareBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Share';
    } else {
      screenShareBtn.classList.remove('active');
      screenShareBtn.innerHTML = '<i class="fas fa-desktop"></i> Share Screen';
    }
  }
  
  if (videoControlBtn) {
    if (isScreenSharing) {
      videoControlBtn.classList.add('active');
      videoControlBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
    } else {
      videoControlBtn.classList.remove('active');
      videoControlBtn.innerHTML = '<i class="fas fa-desktop"></i>';
    }
  }
}

// Start Audio Call
window.startAudioCall = async function() {
  try {
    callType = 'audio';
    isCaller = true;
    isScreenSharing = false;
    
    // Get audio stream
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    
    // Create peer connection
    createPeerConnection();
    
    // Show local audio (no video)
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
    
    // Show video container
    showVideoContainer();
    callStatus.textContent = 'Starting audio call...';
    updateScreenShareButton();
    
    // Create call in database
    createCallInDatabase();
    
  } catch (error) {
    console.error('Error starting audio call:', error);
    alert('Failed to start audio call: ' + error.message);
    resetCall();
  }
};

// Start Video Call
window.startVideoCall = async function() {
  try {
    callType = 'video';
    isCaller = true;
    isScreenSharing = false;
    
    // Get video stream
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      }
    });
    
    // Create peer connection
    createPeerConnection();
    
    // Show local video
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
    
    // Show video container
    showVideoContainer();
    callStatus.textContent = 'Starting video call...';
    updateScreenShareButton();
    
    // Create call in database
    createCallInDatabase();
    
  } catch (error) {
    console.error('Error starting video call:', error);
    alert('Failed to start video call: ' + error.message);
    resetCall();
  }
};

// Create Peer Connection
function createPeerConnection() {
  try {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    
    // Handle remote stream
    peerConnection.ontrack = event => {
      remoteStream = event.streams[0];
      if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        callStatus.textContent = 'Connected';
        updateCallStatus(true);
      }
    };
    
    // ICE candidate handling
    peerConnection.onicecandidate = event => {
      if (event.candidate && currentCallId) {
        db.ref(`calls/${currentCallId}/candidates/${auth.currentUser.uid}`)
          .push(event.candidate.toJSON());
      }
    };
    
    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed') {
        endCall();
      }
    };
    
  } catch (error) {
    console.error('Error creating peer connection:', error);
    throw error;
  }
}

// Create Call in Database
function createCallInDatabase() {
  const user = auth.currentUser;
  if (!user) return;
  
  currentCallId = db.ref('calls').push().key;
  
  const callData = {
    caller: user.uid,
    callerEmail: user.email,
    type: callType,
    offer: null,
    answer: null,
    status: 'ringing',
    timestamp: Date.now(),
    candidates: {}
  };
  
  db.ref(`calls/${currentCallId}`).set(callData);
  
  // Create offer
  createOffer();
}

// Create Offer
async function createOffer() {
  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: callType === 'video'
    });
    
    await peerConnection.setLocalDescription(offer);
    
    // Send offer to database
    await db.ref(`calls/${currentCallId}`).update({
      offer: offer,
      status: 'offered'
    });
    
  } catch (error) {
    console.error('Error creating offer:', error);
    alert('Failed to create call offer: ' + error.message);
    endCall();
  }
}

// Handle Incoming Call
function handleIncomingCall(snapshot) {
  const call = snapshot.val();
  const user = auth.currentUser;
  
  if (!user || call.caller === user.uid || call.status !== 'ringing') {
    return;
  }
  
  // Show incoming call alert
  callerInfo.textContent = `${call.callerEmail} is calling...`;
  incomingCallAlert.style.display = 'flex';
  currentCallId = snapshot.key;
  
  // Store call data reference
  callDataRef = snapshot.ref;
  
  // Show notification
  showNotification('Incoming Call', `${call.callerEmail} is calling you`);
  
  // Auto reject after 30 seconds
  setTimeout(() => {
    if (incomingCallAlert.style.display === 'flex') {
      rejectCall();
    }
  }, 30000);
}

// Accept Call
window.acceptCall = async function() {
  if (!currentCallId) return;
  
  try {
    isCaller = false;
    isScreenSharing = false;
    incomingCallAlert.style.display = 'none';
    
    // Get call data
    const callSnapshot = await db.ref(`calls/${currentCallId}`).once('value');
    const call = callSnapshot.val();
    
    if (!call) {
      alert('Call no longer exists');
      return;
    }
    
    callType = call.type;
    
    // Get media stream based on call type
    const constraints = {
      audio: true,
      video: call.type === 'video' ? {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      } : false
    };
    
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Create peer connection
    createPeerConnection();
    
    // Show local stream
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
    
    // Show video container
    showVideoContainer();
    callStatus.textContent = 'Connecting...';
    updateScreenShareButton();
    
    // Set remote description from offer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
    
    // Create answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    // Send answer to database
    await db.ref(`calls/${currentCallId}`).update({
      answer: answer,
      status: 'answered',
      answerer: auth.currentUser.uid,
      answererEmail: auth.currentUser.email
    });
    
    // Add existing ICE candidates
    if (call.candidates && call.candidates[call.caller]) {
      const candidates = call.candidates[call.caller];
      Object.values(candidates).forEach(candidateData => {
        const candidate = new RTCIceCandidate(candidateData);
        peerConnection.addIceCandidate(candidate).catch(console.error);
      });
    }
    
  } catch (error) {
    console.error('Error accepting call:', error);
    alert('Failed to accept call: ' + error.message);
    endCall();
  }
};

// Handle Call Update
function handleCallUpdate(snapshot) {
  const call = snapshot.val();
  const user = auth.currentUser;
  
  if (!user || !peerConnection || currentCallId !== snapshot.key) return;
  
  // Handle answer
  if (call.answer && isCaller && !peerConnection.remoteDescription) {
    handleAnswer(call.answer);
  }
  
  // Handle ICE candidates
  if (call.candidates) {
    const otherUserId = isCaller ? call.answerer : call.caller;
    if (otherUserId && call.candidates[otherUserId]) {
      const candidates = call.candidates[otherUserId];
      Object.values(candidates).forEach(candidateData => {
        const candidate = new RTCIceCandidate(candidateData);
        peerConnection.addIceCandidate(candidate).catch(console.error);
      });
    }
  }
}

// Handle Answer
async function handleAnswer(answer) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    callStatus.textContent = 'Connected';
    updateCallStatus(true);
  } catch (error) {
    console.error('Error setting remote description:', error);
  }
}

// Handle Call Ended
function handleCallEnded(snapshot) {
  if (currentCallId === snapshot.key) {
    endCall();
    showNotification('Call Ended', 'The call has ended');
  }
}

// Reject Call
window.rejectCall = function() {
  if (currentCallId) {
    db.ref(`calls/${currentCallId}`).update({
      status: 'rejected'
    });
    setTimeout(() => {
      db.ref(`calls/${currentCallId}`).remove();
    }, 1000);
  }
  incomingCallAlert.style.display = 'none';
  currentCallId = null;
};

// End Call
window.endCall = function() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
    remoteStream = null;
  }
  
  if (currentCallId) {
    db.ref(`calls/${currentCallId}`).remove();
    currentCallId = null;
  }
  
  // Reset UI
  hideVideoContainer();
  updateCallStatus(false);
  incomingCallAlert.style.display = 'none';
  isScreenSharing = false;
  updateScreenShareButton();
  
  // Clear video elements
  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;
};

// Toggle Video
window.toggleVideo = function() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const btn = document.querySelector('.btn-video-control:nth-child(1) i');
      btn.className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash';
    }
  }
};

// Toggle Audio
window.toggleAudio = function() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const btn = document.querySelector('.btn-video-control:nth-child(2) i');
      btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
    }
  }
};

// Show Video Container
function showVideoContainer() {
  if (videoContainer) {
    videoContainer.style.display = 'block';
  }
  if (endCallBtn) {
    endCallBtn.style.display = 'flex';
  }
}

// Hide Video Container
function hideVideoContainer() {
  if (videoContainer) {
    videoContainer.style.display = 'none';
  }
  if (endCallBtn) {
    endCallBtn.style.display = 'none';
  }
}

// Update Call Status
function updateCallStatus(inCall) {
  window.isInCall = inCall;
  const audioBtn = document.querySelector('.btn-call.audio');
  const videoBtn = document.querySelector('.btn-call.video');
  const screenBtn = document.querySelector('.btn-call.screen-share');
  
  if (audioBtn) audioBtn.disabled = inCall;
  if (videoBtn) videoBtn.disabled = inCall;
  if (screenBtn) screenBtn.disabled = inCall;
}

// Reset Call
function resetCall() {
  currentCallId = null;
  isCaller = false;
  callType = null;
  isScreenSharing = false;
  hideVideoContainer();
  updateCallStatus(false);
  updateScreenShareButton();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.isInCall) {
    endCall();
  }
});