/**
 * Evalis AI — Simli Avatar Adapter (Plug-in Architecture)
 * 
 * This adapter provides a standard interface to integrate Simli's
 * real-time avatar rendering with the Evalis interview platform.
 * 
 * Currently: Architecture only (ready to plug in when Simli API key is available)
 * 
 * Integration flow:
 *   1. User selects "Human Avatar (Simli)" in setup screen
 *   2. SimliAdapter.init() loads the Simli SDK dynamically
 *   3. Audio PCM chunks from Gemini are routed to Simli for lip-sync
 *   4. Simli renders a video stream in #simli-video
 *   5. WebGL orb is hidden, video container is shown
 * 
 * Usage:
 *   const simli = new SimliAdapter({ apiKey: '...', faceId: '...' });
 *   await simli.init(document.getElementById('simli-video'));
 *   simli.sendAudio(pcmBase64);  // Route AI audio to Simli
 *   simli.destroy();
 */

class SimliAdapter {
    constructor(options = {}) {
        this.apiKey = options.apiKey || null;
        this.faceId = options.faceId || 'default_female_01';
        this.videoElement = null;
        this.client = null;
        this.ready = false;
        this.fallbackToOrb = true;
    }

    /**
     * Initialize Simli SDK and set up the video stream
     * @param {HTMLVideoElement} videoEl — the <video> element to render into
     * @returns {boolean} — true if Simli initialized, false if fallback to orb
     */
    async init(videoEl) {
        if (!this.apiKey) {
            console.warn('[SimliAdapter] No API key provided. Falling back to WebGL orb.');
            return false;
        }

        this.videoElement = videoEl;

        try {
            // Dynamically load Simli SDK
            if (!window.SimliClient) {
                await this._loadScript('https://cdn.simli.com/sdk/simli-client.min.js');
            }

            if (!window.SimliClient) {
                console.error('[SimliAdapter] Failed to load Simli SDK.');
                return false;
            }

            // Initialize Simli client
            this.client = new window.SimliClient();
            await this.client.Initialize({
                apiKey: this.apiKey,
                faceID: this.faceId,
                handleSilence: true,
                videoElement: this.videoElement,
                audioElement: null, // We handle audio playback ourselves via Gemini
            });

            await this.client.start();
            this.ready = true;

            // Show video, hide orb
            this.videoElement.parentElement.style.display = 'block';
            const orbCanvas = document.getElementById('ai-avatar-canvas');
            if (orbCanvas) orbCanvas.style.display = 'none';

            console.log('[SimliAdapter] Simli avatar initialized successfully.');
            return true;

        } catch (e) {
            console.error('[SimliAdapter] Init failed:', e);
            this.ready = false;
            return false;
        }
    }

    /**
     * Send PCM audio data to Simli for lip-sync rendering
     * @param {string} base64Pcm — base64-encoded PCM audio chunk
     */
    sendAudio(base64Pcm) {
        if (!this.ready || !this.client) return;

        try {
            // Convert base64 to Uint8Array for Simli
            const binaryString = atob(base64Pcm);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            this.client.sendAudioData(bytes);
        } catch (e) {
            console.warn('[SimliAdapter] Audio send failed:', e);
        }
    }

    /**
     * Clear the current lip-sync state (e.g., when AI is interrupted)
     */
    clearBuffer() {
        if (this.client && this.ready) {
            try {
                this.client.ClearBuffer();
            } catch (e) { /* silent */ }
        }
    }

    /**
     * Destroy the Simli session and clean up
     */
    destroy() {
        if (this.client) {
            try {
                this.client.close();
            } catch (e) { /* silent */ }
            this.client = null;
        }
        this.ready = false;

        // Restore orb visibility
        if (this.videoElement) {
            this.videoElement.parentElement.style.display = 'none';
        }
        const orbCanvas = document.getElementById('ai-avatar-canvas');
        if (orbCanvas) orbCanvas.style.display = 'block';
    }

    /**
     * Check if Simli is available and configured
     */
    isAvailable() {
        return !!this.apiKey;
    }

    /**
     * Check if Simli is currently active and rendering
     */
    isActive() {
        return this.ready && !!this.client;
    }

    _loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}

// Export for use in interview pages
window.SimliAdapter = SimliAdapter;
