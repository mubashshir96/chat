// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDArQkJaFoPMQeOoHi1LQPB2Umm4LS8oK8",
  authDomain: "to-1-chat-a9582.firebaseapp.com",
  databaseURL: "https://to-1-chat-a9582-default-rtdb.firebaseio.com",
  projectId: "to-1-chat-a9582",
  storageBucket: "to-1-chat-a9582.appspot.com",
  messagingSenderId: "382335872296",
  appId: "1:382335872296:web:7f7d13223f1787118df41d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// DOM Elements
const loginBox = document.getElementById('loginBox');
const chatBox = document.getElementById('chatBox');
const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const onlineUsersList = document.getElementById('onlineUsersList');
const currentUserEmail = document.getElementById('currentUserEmail');

// Login Function
window.login = async function() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    alert('Please enter both email and password');
    return;
  }
  
  try {
    await auth.signInWithEmailAndPassword(email, password);
    // Request notification permission
    requestNotificationPermission();
  } catch (error) {
    alert('Login failed: ' + error.message);
  }
};

// Logout Function
window.logout = function() {
  if (confirm('Are you sure you want to logout?')) {
    // End call if active
    if (window.isInCall) {
      endCall();
    }
    
    // Update online status
    if (auth.currentUser) {
      db.ref('onlineUsers/' + auth.currentUser.uid).remove();
      db.ref('userProfiles/' + auth.currentUser.uid).update({
        lastSeen: Date.now(),
        isOnline: false
      });
    }
    
    // Sign out
    auth.signOut();
  }
};

// DARK MODE FUNCTION
window.toggleTheme = function() {
  document.body.classList.toggle('dark-mode');
  const themeIcon = document.querySelector('.theme-toggle i');
  const isDark = document.body.classList.contains('dark-mode');
  
  themeIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  localStorage.setItem('darkMode', isDark);
  
  // Show notification
  showNotification('Theme Changed', isDark ? 'Dark mode enabled' : 'Light mode enabled');
};

// Initialize theme from localStorage
function initializeTheme() {
  const darkMode = localStorage.getItem('darkMode') === 'true';
  if (darkMode) {
    document.body.classList.add('dark-mode');
    const themeIcon = document.querySelector('.theme-toggle i');
    if (themeIcon) {
      themeIcon.className = 'fas fa-sun';
    }
  }
}

// FILE SHARING FUNCTION
window.sendFile = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size too large. Maximum size is 10MB.');
      return;
    }
    
    try {
      // Show uploading indicator
      const loadingMsg = createFileMessageElement({
        name: file.name,
        size: file.size,
        status: 'uploading',
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        timestamp: Date.now()
      });
      messagesDiv.appendChild(loadingMsg);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      
      // Upload to Firebase Storage
      const storageRef = storage.ref();
      const fileRef = storageRef.child(`files/${Date.now()}_${file.name}`);
      const uploadTask = fileRef.put(file);
      
      uploadTask.on('state_changed',
        (snapshot) => {
          // Progress monitoring
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress);
        },
        (error) => {
          console.error('Upload error:', error);
          alert('Failed to upload file: ' + error.message);
          loadingMsg.remove();
        },
        async () => {
          // Upload completed
          const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
          
          // Save file info to database
          const fileData = {
            name: file.name,
            type: file.type,
            size: file.size,
            url: downloadURL,
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            timestamp: Date.now(),
            messageType: 'file'
          };
          
          await db.ref('messages').push(fileData);
          
          // Remove loading message
          loadingMsg.remove();
          
          // Show notification
          showNotification('File Sent', `Sent: ${file.name}`);
        }
      );
      
    } catch (error) {
      console.error('Error sending file:', error);
      alert('Failed to send file: ' + error.message);
    }
  };
  
  input.click();
};

// Create file message element
function createFileMessageElement(fileData) {
  const isCurrentUser = auth.currentUser && fileData.uid === auth.currentUser.uid;
  
  const div = document.createElement('div');
  div.className = `message ${isCurrentUser ? 'sent' : 'received'} file`;
  div.dataset.fileId = Date.now();
  
  const time = new Date(fileData.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  if (fileData.status === 'uploading') {
    div.innerHTML = `
      ${!isCurrentUser ? `<div class="sender">${fileData.email}</div>` : ''}
      <div class="file-message">
        <i class="fas fa-spinner fa-spin file-icon"></i>
        <div class="file-info">
          <div class="file-name">${fileData.name}</div>
          <div class="file-size">Uploading...</div>
        </div>
      </div>
      <div class="time">${time}</div>
    `;
  } else {
    div.innerHTML = `
      ${!isCurrentUser ? `<div class="sender">${fileData.email}</div>` : ''}
      <div class="file-message">
        <i class="fas ${getFileIcon(fileData.type)} file-icon"></i>
        <div class="file-info">
          <div class="file-name">${fileData.name}</div>
          <div class="file-size">${formatFileSize(fileData.size)}</div>
        </div>
        <button class="download-btn" onclick="downloadFile('${fileData.url}', '${fileData.name}')">
          <i class="fas fa-download"></i>
        </button>
        <button class="download-btn" onclick="previewFile('${fileData.url}', '${fileData.type}', '${fileData.name}')">
          <i class="fas fa-eye"></i>
        </button>
      </div>
      <div class="time">${time}</div>
    `;
  }
  
  return div;
}

// Get file icon based on type
function getFileIcon(fileType) {
  if (fileType.startsWith('image/')) return 'fa-image';
  if (fileType.startsWith('video/')) return 'fa-video';
  if (fileType.startsWith('audio/')) return 'fa-music';
  if (fileType === 'application/pdf') return 'fa-file-pdf';
  if (fileType.includes('word')) return 'fa-file-word';
  if (fileType.includes('excel')) return 'fa-file-excel';
  if (fileType.includes('powerpoint')) return 'fa-file-powerpoint';
  return 'fa-file';
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Download file
window.downloadFile = function(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Preview file
window.previewFile = function(url, type, name) {
  const previewDiv = document.getElementById('filePreview');
  const previewContent = document.getElementById('filePreviewContent');
  const fileName = document.getElementById('fileName');
  
  fileName.textContent = name;
  
  if (type.startsWith('image/')) {
    previewContent.innerHTML = `<img src="${url}" alt="${name}">`;
  } else if (type.startsWith('video/')) {
    previewContent.innerHTML = `
      <video controls style="max-width:100%;">
        <source src="${url}" type="${type}">
        Your browser does not support the video tag.
      </video>
    `;
  } else if (type.startsWith('audio/')) {
    previewContent.innerHTML = `
      <audio controls style="width:100%;">
        <source src="${url}" type="${type}">
        Your browser does not support the audio tag.
      </audio>
    `;
  } else if (type === 'application/pdf') {
    previewContent.innerHTML = `
      <iframe src="${url}" style="width:100%;height:500px;" frameborder="0"></iframe>
    `;
  } else {
    previewContent.innerHTML = `
      <p>Preview not available for this file type.</p>
      <p><a href="${url}" target="_blank">Download ${name}</a></p>
    `;
  }
  
  previewDiv.style.display = 'block';
};

// Close file preview
window.closeFilePreview = function() {
  document.getElementById('filePreview').style.display = 'none';
};

// VOICE MESSAGE FUNCTION
let voiceRecorder;
let voiceChunks = [];

window.startVoiceMessage = function() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Voice messages not supported in this browser');
    return;
  }
  
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      voiceRecorder = new MediaRecorder(stream);
      voiceChunks = [];
      
      voiceRecorder.ondataavailable = event => {
        voiceChunks.push(event.data);
      };
      
      voiceRecorder.onstop = async () => {
        const voiceBlob = new Blob(voiceChunks, { type: 'audio/webm' });
        await sendVoiceMessage(voiceBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      voiceRecorder.start();
      
      // Auto stop after 30 seconds
      setTimeout(() => {
        if (voiceRecorder && voiceRecorder.state === 'recording') {
          voiceRecorder.stop();
        }
      }, 30000);
      
      // Show recording indicator
      showRecordingIndicator();
      
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      alert('Failed to access microphone: ' + error.message);
    });
};

function showRecordingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'recording-indicator';
  indicator.innerHTML = `
    <i class="fas fa-microphone fa-pulse"></i>
    Recording... Click to stop
  `;
  indicator.style.position = 'fixed';
  indicator.style.bottom = '100px';
  indicator.style.left = '50%';
  indicator.style.transform = 'translateX(-50%)';
  indicator.style.background = '#dc3545';
  indicator.style.color = 'white';
  indicator.style.padding = '10px 20px';
  indicator.style.borderRadius = '20px';
  indicator.style.zIndex = '1000';
  indicator.style.cursor = 'pointer';
  indicator.onclick = () => {
    if (voiceRecorder && voiceRecorder.state === 'recording') {
      voiceRecorder.stop();
      indicator.remove();
    }
  };
  
  document.body.appendChild(indicator);
}

async function sendVoiceMessage(blob) {
  try {
    // Upload to Firebase Storage
    const storageRef = storage.ref();
    const voiceRef = storageRef.child(`voice/${Date.now()}_voice_message.webm`);
    await voiceRef.put(blob);
    const downloadURL = await voiceRef.getDownloadURL();
    
    // Save voice message to database
    const voiceData = {
      type: 'voice',
      url: downloadURL,
      duration: blob.size / 16000, // Approximate duration
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      timestamp: Date.now()
    };
    
    await db.ref('messages').push(voiceData);
    
  } catch (error) {
    console.error('Error sending voice message:', error);
    alert('Failed to send voice message: ' + error.message);
  }
}

// PROFILE FUNCTIONS
window.showProfileModal = function() {
  document.getElementById('profileModal').style.display = 'flex';
  loadProfile();
};

window.closeProfileModal = function() {
  document.getElementById('profileModal').style.display = 'none';
};

async function loadProfile() {
  const user = auth.currentUser;
  if (!user) return;
  
  const profileRef = db.ref('userProfiles/' + user.uid);
  const snapshot = await profileRef.once('value');
  const profile = snapshot.val() || {};
  
  document.getElementById('profileName').value = profile.name || user.email.split('@')[0];
  document.getElementById('profileStatus').value = profile.status || '';
  document.getElementById('profileAvatarImg').src = profile.avatar || 
    `https://ui-avatars.com/api/?name=${user.email}&background=667eea&color=fff`;
}

window.uploadAvatar = function() {
  const input = document.getElementById('avatarUpload');
  const file = input.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    alert('Image size too large. Maximum size is 5MB.');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('profileAvatarImg').src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.saveProfile = async function() {
  const user = auth.currentUser;
  if (!user) return;
  
  const name = document.getElementById('profileName').value.trim();
  const status = document.getElementById('profileStatus').value.trim();
  const avatarImg = document.getElementById('profileAvatarImg').src;
  
  try {
    let avatarUrl = avatarImg;
    
    // If avatar is data URL (new upload), upload to storage
    if (avatarImg.startsWith('data:')) {
      const response = await fetch(avatarImg);
      const blob = await response.blob();
      const storageRef = storage.ref();
      const avatarRef = storageRef.child(`avatars/${user.uid}_${Date.now()}.jpg`);
      await avatarRef.put(blob);
      avatarUrl = await avatarRef.getDownloadURL();
    }
    
    const profileData = {
      name: name || user.email.split('@')[0],
      status,
      avatar: avatarUrl,
      lastUpdated: Date.now(),
      isOnline: true
    };
    
    await db.ref('userProfiles/' + user.uid).update(profileData);
    
    // Update current user display
    currentUserEmail.textContent = profileData.name;
    
    closeProfileModal();
    showNotification('Profile Updated', 'Your profile has been saved');
    
  } catch (error) {
    console.error('Error saving profile:', error);
    alert('Failed to save profile: ' + error.message);
  }
};

// EMOJI PICKER
window.toggleEmojiPicker = function() {
  const picker = document.getElementById('emojiPicker');
  if (picker.style.display === 'block') {
    picker.style.display = 'none';
  } else {
    loadEmojis();
    picker.style.display = 'block';
  }
};

function loadEmojis() {
  const picker = document.getElementById('emojiPicker');
  if (picker.innerHTML) return;
  
  const emojis = ['😀', '😂', '🥰', '😎', '🤩', '😍', '🙏', '👍', '👋', '🎉', '🔥', '💯', '❤️', '✨', '🌟', '🙌', '👏', '🤝', '💪', '🧠'];
  
  picker.innerHTML = emojis.map(emoji => `
    <span class="emoji" onclick="addEmoji('${emoji}')">${emoji}</span>
  `).join('');
}

window.addEmoji = function(emoji) {
  const input = document.getElementById('msgInput');
  input.value += emoji;
  input.focus();
  document.getElementById('emojiPicker').style.display = 'none';
};

// NOTIFICATION FUNCTIONS
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    document.getElementById('notificationRequest').style.display = 'block';
  }
}

window.enableNotifications = function() {
  Notification.requestPermission().then(permission => {
    document.getElementById('notificationRequest').style.display = 'none';
    if (permission === "granted") {
      showNotification('Notifications Enabled', 'You will now receive notifications for calls and messages');
      localStorage.setItem('notificationsEnabled', 'true');
    }
  });
};

window.disableNotifications = function() {
  document.getElementById('notificationRequest').style.display = 'none';
  localStorage.setItem('notificationsEnabled', 'false');
};

function showNotification(title, body) {
  if (Notification.permission === "granted" && localStorage.getItem('notificationsEnabled') === 'true') {
    new Notification(title, { 
      body, 
      icon: 'https://ui-avatars.com/api/?name=Chat&background=667eea&color=fff' 
    });
  }
}

// Send Message (Updated)
window.sendMessage = function() {
  const message = msgInput.value.trim();
  const user = auth.currentUser;
  
  if (!message || !user) return;
  
  const messageData = {
    text: message,
    uid: user.uid,
    email: user.email,
    timestamp: Date.now(),
    type: 'text'
  };
  
  db.ref('messages').push(messageData)
    .then(() => {
      msgInput.value = '';
      msgInput.focus();
    })
    .catch(error => {
      console.error('Error sending message:', error);
      alert('Failed to send message: ' + error.message);
    });
};

// Handle Enter Key
window.handleKeyPress = function(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
};

// Load Messages (Updated)
function loadMessages() {
  db.ref('messages').limitToLast(50).on('child_added', (snapshot) => {
    const message = snapshot.val();
    let messageElement;
    
    if (message.messageType === 'file') {
      messageElement = createFileMessageElement(message);
    } else if (message.type === 'voice') {
      messageElement = createVoiceMessageElement(message);
    } else {
      messageElement = createMessageElement(message);
    }
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// Create voice message element
function createVoiceMessageElement(message) {
  const isCurrentUser = auth.currentUser && message.uid === auth.currentUser.uid;
  
  const div = document.createElement('div');
  div.className = `message ${isCurrentUser ? 'sent' : 'received'}`;
  
  const time = new Date(message.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  div.innerHTML = `
    ${!isCurrentUser ? `<div class="sender">${message.email}</div>` : ''}
    <div class="voice-message">
      <i class="fas fa-microphone"></i>
      <audio controls style="width:200px;height:40px;">
        <source src="${message.url}" type="audio/webm">
        Your browser does not support the audio element.
      </audio>
    </div>
    <div class="time">${time}</div>
  `;
  
  return div;
}

// Create Message Element
function createMessageElement(message) {
  const isCurrentUser = auth.currentUser && message.uid === auth.currentUser.uid;
  
  const div = document.createElement('div');
  div.className = `message ${isCurrentUser ? 'sent' : 'received'}`;
  
  const time = new Date(message.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  div.innerHTML = `
    ${!isCurrentUser ? `<div class="sender">${message.email}</div>` : ''}
    <div class="text">${message.text}</div>
    <div class="time">${time}</div>
  `;
  
  return div;
}

// Online Users Tracking (Updated)
function trackOnlineUsers() {
  const user = auth.currentUser;
  const userRef = db.ref('onlineUsers/' + user.uid);
  const profileRef = db.ref('userProfiles/' + user.uid);
  
  // Load profile
  loadProfile();
  
  // Set user as online
  userRef.set({
    email: user.email,
    lastSeen: Date.now()
  });
  
  profileRef.update({
    isOnline: true,
    lastSeen: Date.now()
  });
  
  // Remove user when they go offline
  userRef.onDisconnect().remove();
  profileRef.onDisconnect().update({
    isOnline: false,
    lastSeen: Date.now()
  });
  
  // Listen for online users
  db.ref('onlineUsers').on('value', (snapshot) => {
    const users = snapshot.val() || {};
    updateOnlineUsersList(users);
  });
}

// Update Online Users List (Updated)
function updateOnlineUsersList(users) {
  const currentUid = auth.currentUser.uid;
  
  const usersArray = Object.entries(users)
    .filter(([uid]) => uid !== currentUid)
    .map(([uid, data]) => ({
      uid,
      email: data.email,
      lastSeen: data.lastSeen
    }));
  
  onlineUsersList.innerHTML = '';
  
  if (usersArray.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No other users online';
    onlineUsersList.appendChild(li);
    return;
  }
  
  usersArray.forEach(user => {
    const li = document.createElement('li');
    li.innerHTML = `
      <i class="fas fa-circle"></i>
      ${user.email}
    `;
    onlineUsersList.appendChild(li);
  });
}

// Auth State Listener (Updated)
auth.onAuthStateChanged((user) => {
  if (user) {
    // User is logged in
    loginBox.style.display = 'none';
    chatBox.style.display = 'block';
    currentUserEmail.textContent = user.email;
    
    // Clear messages
    messagesDiv.innerHTML = '';
    
    // Initialize features
    initializeTheme();
    loadMessages();
    trackOnlineUsers();
    
    // Focus on input
    msgInput.focus();
    
    // Check notification permission
    requestNotificationPermission();
  } else {
    // User is logged out
    loginBox.style.display = 'block';
    chatBox.style.display = 'none';
    
    // Stop listening to messages
    db.ref('messages').off();
    db.ref('onlineUsers').off();
    db.ref('userProfiles').off();
  }
});

// Auto-login for demo (optional)
window.addEventListener('DOMContentLoaded', () => {
  // Pre-fill demo credentials
  document.getElementById('email').value = 'user1@test.com';
  document.getElementById('password').value = '123456';
  
  // Close modals when clicking outside
  window.onclick = function(event) {
    const profileModal = document.getElementById('profileModal');
    const filePreview = document.getElementById('filePreview');
    const emojiPicker = document.getElementById('emojiPicker');
    
    if (event.target === profileModal) {
      closeProfileModal();
    }
    if (event.target === filePreview) {
      closeFilePreview();
    }
    if (!event.target.closest('.emoji-picker') && !event.target.closest('.btn-emoji')) {
      emojiPicker.style.display = 'none';
    }
  };
});

// Initialize WebRTC Handler
initializeWebRTC();