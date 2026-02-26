/**
 * Main app controller — full-duplex voice chat.
 * Wires together WebSocket client, voice engine, and UI.
 */
(function () {
  'use strict';

  // --- Init ---

  const relay = new RelayClient();
  const voice = new VoiceEngine();

  const relayUrl = location.origin;
  let agentName = 'Agent';
  let pendingPairCode = null;
  let isMuted = false;

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // --- Auto-pair from URL ?code= parameter ---

  const urlParams = new URLSearchParams(location.search);
  const autoCode = urlParams.get('code');
  if (autoCode && /^\d{6}$/.test(autoCode.trim())) {
    // Clean the URL
    history.replaceState(null, '', location.pathname);
    // Pre-fill and auto-connect
    const codeInput = document.getElementById('code-input');
    codeInput.value = autoCode.trim();
    // Defer to let other scripts initialize
    setTimeout(() => {
      document.getElementById('pair-btn').click();
    }, 0);
  }

  // --- Pairing ---

  const codeInput = document.getElementById('code-input');
  const pairBtn = document.getElementById('pair-btn');
  const endSessionBtn = document.getElementById('end-session-btn');
  const micBtn = document.getElementById('mic-btn');

  pairBtn.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      UI.setPairError('Enter a 6-digit code');
      return;
    }
    UI.setPairError('');
    pairBtn.disabled = true;
    pendingPairCode = code;
    relay.connect(relayUrl);
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pairBtn.click();
  });

  // --- Relay events ---

  relay.on('connected', () => {
    if (pendingPairCode) {
      UI.setStatus('Pairing...', '');
      relay.pair(pendingPairCode);
    }
  });

  relay.on('paired', ({ sessionId, agentName: name }) => {
    pendingPairCode = null;
    agentName = name || 'Agent';
    UI.setStatus(`Connected to ${agentName}`, 'connected');
    UI.showScreen('chat');
    endSessionBtn.classList.remove('hidden');
    UI.setLiveText('Listening...', '');
    // Auto-start listening
    isMuted = false;
    UI.setMicMuted(false);
    voice.startListening();
  });

  let streamHandle = null;

  function clearStream() {
    if (streamHandle) {
      clearInterval(streamHandle.timer);
      streamHandle = null;
    }
  }

  /** Stream text word-by-word into the live text area, then speak it. */
  function streamAgentText(text) {
    clearStream();
    const words = text.split(/\s+/);
    let i = 0;
    UI.setLiveText('', agentName);
    streamHandle = {
      timer: setInterval(() => {
        i++;
        if (i >= words.length) {
          UI.setLiveText(text, agentName);
          clearInterval(streamHandle.timer);
          streamHandle = null;
          return;
        }
        UI.setLiveText(words.slice(0, i + 1).join(' '), agentName);
      }, 60),
    };
    // Start TTS immediately (plays in parallel with text streaming)
    voice.speak(text);
  }

  relay.on('message', ({ text }) => {
    streamAgentText(text);
  });

  relay.on('typing', ({ active }) => {
    if (active) {
      UI.setTypingIndicator(true, agentName);
    }
  });

  relay.on('agent-disconnected', () => {
    UI.setStatus('Agent disconnected', 'error');
    UI.setLiveText('Agent disconnected.', '');
  });

  relay.on('error', ({ error }) => {
    if (!relay.sessionId) {
      UI.setPairError(error);
      pairBtn.disabled = false;
      pendingPairCode = null;
      UI.setStatus('Disconnected', '');
    } else {
      UI.setLiveText(`Error: ${error}`, '');
    }
  });

  relay.on('disconnected', ({ wasPaired }) => {
    if (!relay.sessionId && !wasPaired) {
      pairBtn.disabled = false;
    }
    UI.setStatus('Disconnected', 'error');
  });

  relay.on('reconnecting', ({ attempt }) => {
    UI.setReconnecting(true, attempt);
  });

  relay.on('reconnect-failed', () => {
    UI.setReconnecting(false);
    returnToPairing();
    UI.setPairError('Connection lost. Please try again.');
  });

  relay.on('state', (state) => {
    if (state === 'connected') {
      UI.setReconnecting(false);
    }
  });

  // --- End Session ---

  function returnToPairing() {
    agentName = 'Agent';
    pendingPairCode = null;
    isMuted = false;
    pairBtn.disabled = false;
    codeInput.value = '';
    endSessionBtn.classList.add('hidden');
    clearStream();
    UI.setLiveText('', '');
    UI.setMicMuted(false);
    UI.setStatus('Disconnected', '');
    UI.showScreen('pairing');
    voice.cancelSpeech();
    voice.stopListening();
  }

  endSessionBtn.addEventListener('click', () => {
    relay.disconnect();
    returnToPairing();
  });

  // --- Mic toggle / interrupt ---

  micBtn.addEventListener('click', () => {
    // If agent is speaking, tap interrupts TTS and resumes listening
    if (voice.isSpeaking) {
      clearStream();
      voice.cancelSpeech();
      UI.setLiveText('Listening...', '');
      return;
    }
    // Otherwise toggle mute
    isMuted = !isMuted;
    UI.setMicMuted(isMuted);
    if (isMuted) {
      voice.mute();
    } else {
      voice.unmute();
    }
  });

  // --- Voice callbacks ---

  voice.onListeningChange = (listening) => {
    if (listening && !isMuted) {
      micBtn.classList.add('listening');
    } else {
      micBtn.classList.remove('listening');
    }
  };

  voice.onTranscript = (text, isFinal) => {
    UI.setLiveText(text, 'You');
    if (isFinal && text.trim()) {
      relay.sendMessage(text);
    }
  };

  // --- Voice support check ---

  if (!voice.isSupported) {
    UI.setLiveText('Voice not supported in this browser', '');
    micBtn.style.opacity = '0.3';
    micBtn.style.pointerEvents = 'none';
  }

  // --- iOS viewport handling ---

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      document.documentElement.style.setProperty(
        '--viewport-height', window.visualViewport.height + 'px'
      );
    });
    document.documentElement.style.setProperty(
      '--viewport-height', window.visualViewport.height + 'px'
    );
  }
})();
