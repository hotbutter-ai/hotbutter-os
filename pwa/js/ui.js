/**
 * UI helpers — DOM manipulation for full-duplex voice interface.
 */
const UI = {
  screens: {
    pairing: document.getElementById('pairing-screen'),
    chat: document.getElementById('chat-screen'),
  },

  showScreen(name) {
    Object.values(this.screens).forEach((s) => s.classList.remove('active'));
    this.screens[name].classList.add('active');
  },

  setStatus(text, className) {
    const el = document.getElementById('connection-status');
    el.textContent = text;
    el.className = 'status ' + (className || '');
  },

  setPairError(text) {
    document.getElementById('pair-error').textContent = text || '';
  },

  /** Show live text in the big centered area with a speaker label. */
  setLiveText(text, speaker) {
    document.getElementById('live-text').textContent = text || '';
    document.getElementById('speaker-label').textContent = speaker || '';
  },

  /** Toggle mic button visual state. */
  setMicMuted(muted) {
    const btn = document.getElementById('mic-btn');
    const micIcon = document.getElementById('mic-icon');
    const micOffIcon = document.getElementById('mic-off-icon');

    if (muted) {
      btn.classList.remove('mic-on');
      btn.classList.add('mic-muted');
      micIcon.classList.add('hidden');
      micOffIcon.classList.remove('hidden');
    } else {
      btn.classList.remove('mic-muted');
      btn.classList.add('mic-on');
      micIcon.classList.remove('hidden');
      micOffIcon.classList.add('hidden');
    }
  },

  /** Show typing/thinking indicator in the live text area. */
  setTypingIndicator(active, agentName) {
    if (active) {
      this.setLiveText('thinking...', agentName || 'Agent');
    }
  },

  setReconnecting(show, attempt) {
    let overlay = document.getElementById('reconnecting-overlay');
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'reconnecting-overlay';
        overlay.innerHTML =
          '<div class="reconnecting-content">' +
            '<div class="reconnecting-spinner"></div>' +
            '<div class="reconnecting-text">Reconnecting...</div>' +
          '</div>';
        document.getElementById('app').appendChild(overlay);
      }
      const text = overlay.querySelector('.reconnecting-text');
      text.textContent = attempt
        ? `Reconnecting... (attempt ${attempt})`
        : 'Reconnecting...';
      overlay.classList.add('active');
    } else if (overlay) {
      overlay.classList.remove('active');
    }
  },
};
