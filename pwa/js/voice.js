/**
 * Voice engine — wraps browser Web Speech API for STT and TTS.
 * Full-duplex: continuous listening with auto-restart.
 * Pauses recognition during TTS to avoid self-interruption.
 * User can interrupt TTS via cancelSpeech() (wired to mic button tap).
 */
class VoiceEngine {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis || null;
    this.isListening = false;
    this.isMuted = false;
    this.isSpeaking = false;
    this._shouldListen = false;
    this._paused = false;
    this.isSupported = !!window.SpeechRecognition || !!window.webkitSpeechRecognition;
    this.onTranscript = null;       // callback(text, isFinal)
    this.onListeningChange = null;  // callback(isListening)

    if (this.isSupported) {
      this._initRecognition();
    }
  }

  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      if (this.onTranscript) this.onTranscript(transcript, isFinal);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this._shouldListen && !this.isMuted && !this._paused) {
        try {
          this.recognition.start();
          this.isListening = true;
        } catch {
          if (this.onListeningChange) this.onListeningChange(false);
        }
        return;
      }
      if (this.onListeningChange) this.onListeningChange(false);
    };

    this.recognition.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      console.warn('[voice] recognition error:', e.error);
    };
  }

  _stopRecognition() {
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch {}
    }
  }

  _startRecognition() {
    if (!this.recognition || this.isListening) return;
    try {
      this.recognition.start();
      this.isListening = true;
      if (this.onListeningChange) this.onListeningChange(true);
    } catch (err) {
      console.warn('[voice] start error:', err);
    }
  }

  startListening() {
    if (!this.recognition) return;
    this._shouldListen = true;
    this.isMuted = false;
    this._paused = false;
    this._startRecognition();
  }

  stopListening() {
    this._shouldListen = false;
    this.isMuted = false;
    this._paused = false;
    this._stopRecognition();
  }

  mute() {
    this.isMuted = true;
    this._stopRecognition();
  }

  unmute() {
    this.isMuted = false;
    if (this._shouldListen && !this._paused) {
      this._startRecognition();
    }
  }

  /** Speak text — pauses recognition to avoid echo, resumes when done. */
  speak(text) {
    if (!this.synthesis) return;
    this.synthesis.cancel();
    this.isSpeaking = true;
    this._paused = true;
    this._stopRecognition();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => {
      this.isSpeaking = false;
      this._paused = false;
      if (this._shouldListen && !this.isMuted) this._startRecognition();
    };
    utterance.onerror = () => {
      this.isSpeaking = false;
      this._paused = false;
      if (this._shouldListen && !this.isMuted) this._startRecognition();
    };
    this.synthesis.speak(utterance);
  }

  /** Cancel TTS and resume listening immediately. */
  cancelSpeech() {
    if (this.synthesis) this.synthesis.cancel();
    this.isSpeaking = false;
    this._paused = false;
    if (this._shouldListen && !this.isMuted) this._startRecognition();
  }
}
