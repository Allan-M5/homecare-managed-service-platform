class SoundManager {
  constructor() {
    this.context = null;
    this.initialized = false;
    this.enabled = true;
  }

  init() {
    if (this.initialized || typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.context = new AudioCtx();
    this.initialized = true;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
  }

  play() {
    if (!this.enabled || typeof window === "undefined") return;
    this.init();
    if (!this.context) return;

    const startTone = () => {
      const oscillator = this.context.createOscillator();
      const gainNode = this.context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(880, this.context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(520, this.context.currentTime + 0.045);
      gainNode.gain.setValueAtTime(0.0001, this.context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.03, this.context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.06);
      oscillator.connect(gainNode);
      gainNode.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + 0.07);
    };

    if (this.context.state === "suspended") {
      this.context.resume().then(startTone).catch(() => {});
      return;
    }

    startTone();
  }
}

const clickSound = new SoundManager();
export default clickSound;
