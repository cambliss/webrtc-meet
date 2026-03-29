/**
 * Noise Suppression Audio Processing
 * Uses Web Audio API to suppress background noise during calls.
 * Techniques: high-pass filter, noise gate, spectral subtraction simulation
 */

export type NoiseSuppressionConfig = {
  enabled: boolean;
  filterFrequency?: number; // Hz - high-pass filter cutoff (default 80Hz)
  noiseGateThreshold?: number; // dB - silence threshold (default -40dB)
  gainReduction?: number; // dB - attenuation for noise (default -12dB)
  smoothing?: number; // Smoothing factor for gate (default 0.98)
};

type BrowserAudioContextGlobal = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export class NoiseSuppressionProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private outputStream: MediaStream | null = null;
  private config: NoiseSuppressionConfig = {
    enabled: true,
    filterFrequency: 80,
    noiseGateThreshold: -40,
    gainReduction: -12,
    smoothing: 0.98,
  };

  private noiseGateActive = false;
  private smoothingFactor = 0.98;

  /**
   * Initialize noise suppression on an audio stream.
   * Returns a new MediaStream with processed audio.
   */
  async initialize(
    inputStream: MediaStream,
    config?: Partial<NoiseSuppressionConfig>,
  ): Promise<MediaStream> {
    this.config = { ...this.config, ...config };

    // Create audio context if not already created
    if (!this.audioContext) {
      const browserGlobal = globalThis as BrowserAudioContextGlobal;
      const AudioContextCtor = browserGlobal.AudioContext || browserGlobal.webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Web Audio API is not supported in this browser");
      }

      this.audioContext = new AudioContextCtor();
    }

    const context = this.audioContext;
    if (!context) {
      throw new Error("Failed to initialize audio context");
    }

    // Ensure context is running
    if (context.state === "suspended") {
      await context.resume();
    }

    // Create source from input stream
    this.sourceNode = context.createMediaStreamSource(inputStream);

    // Create high-pass filter to remove low-frequency rumble
    this.filterNode = context.createBiquadFilter();
    this.filterNode.type = "highpass";
    this.filterNode.frequency.value = this.config.filterFrequency || 80;
    this.filterNode.Q.value = 1;

    // Create gain node for noise gating
    this.gainNode = context.createGain();
    this.gainNode.gain.value = 1;

    // Create analyser for noise detection
    this.analyserNode = context.createAnalyser();
    this.analyserNode.fftSize = 2048;

    // Create script processor for real-time audio processing
    const bufferSize = 4096;
    this.scriptProcessor = context.createScriptProcessor(bufferSize, 1, 1);

    // Connect nodes: input → filter → gain → analyser → scriptProcessor → context destination
    this.sourceNode.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(context.destination);

    // Process audio in real-time
    this.setupAudioProcessing();

    // Capture the processed output stream
    const dest = context.createMediaStreamDestination();
    this.scriptProcessor.connect(dest);
    this.outputStream = dest.stream;

    return this.outputStream;
  }

  /**
   * Setup real-time audio processing with noise gate and spectral analysis.
   */
  private setupAudioProcessing(): void {
    if (!this.scriptProcessor || !this.analyserNode) return;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    const smoothing = this.config.smoothing || 0.98;

    this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.config.enabled) {
        // Copy input to output when processing disabled
        for (let ch = 0; ch < event.inputBuffer.numberOfChannels; ch++) {
          const input = event.inputBuffer.getChannelData(ch);
          const output = event.outputBuffer.getChannelData(ch);
          output.set(input);
        }
        return;
      }

      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);

      // Get frequency data from analyser
      this.analyserNode!.getByteFrequencyData(dataArray);

      // Calculate RMS level from frequency data
      const rmsLevel = calculateRmsLevel(dataArray);
      const rmsDb = 20 * Math.log10(Math.max(rmsLevel, 0.001));

      // Noise gating: suppress when below threshold
      const threshold = this.config.noiseGateThreshold || -40;
      const isNoise = rmsDb < threshold;

      // Smooth the gate transition
      if (isNoise && !this.noiseGateActive) {
        this.noiseGateActive = true;
      } else if (!isNoise && this.noiseGateActive) {
        this.noiseGateActive = false;
      }

      // Apply spectral subtraction-like effect by attenuating noise frequencies
      const gainReduction = this.config.gainReduction || -12;
      const noiseGain = this.noiseGateActive ? Math.pow(10, gainReduction / 20) : 1;

      // Apply gain smoothing
      const targetGain = noiseGain;
      const currentGain = this.gainNode?.gain.value || 1;
      const smoothedGain = currentGain * smoothing + targetGain * (1 - smoothing);

      if (this.gainNode) {
        this.gainNode.gain.value = smoothedGain;
      }

      // Copy input to output (actual processing is done by WebAudio nodes)
      for (let i = 0; i < input.length; i++) {
        output[i] = input[i];
      }
    };
  }

  /**
   * Disable noise suppression and return original stream.
   */
  disable(): void {
    this.config.enabled = false;
    if (this.gainNode) {
      this.gainNode.gain.value = 1;
    }
  }

  /**
   * Enable noise suppression.
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Update configuration parameters dynamically.
   */
  updateConfig(config: Partial<NoiseSuppressionConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.filterNode && config.filterFrequency) {
      this.filterNode.frequency.value = config.filterFrequency;
    }

    if (config.smoothing) {
      this.smoothingFactor = config.smoothing;
    }
  }

  /**
   * Clean up resources and close audio context.
   */
  cleanup(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    if (this.filterNode) {
      this.filterNode.disconnect();
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
    }

    // Don't close context - it may be shared
    this.sourceNode = null;
    this.filterNode = null;
    this.gainNode = null;
    this.analyserNode = null;
    this.scriptProcessor = null;
    this.outputStream = null;
  }

  /**
   * Get the output stream with processed audio.
   */
  getOutputStream(): MediaStream | null {
    return this.outputStream;
  }
}

/**
 * Calculate RMS (Root Mean Square) level from frequency data.
 * Used to detect if audio is noise or speech.
 */
function calculateRmsLevel(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = data[i] / 255;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / data.length);
}

/**
 * Browser noise suppression support detection.
 * Modern browsers support Web Audio API noise suppression.
 */
export function isNoiseSuppressionSupported(): boolean {
  const browserGlobal = globalThis as BrowserAudioContextGlobal;
  return (
    typeof browserGlobal.AudioContext !== "undefined" ||
    typeof browserGlobal.webkitAudioContext !== "undefined"
  );
}

/**
 * Apply noise suppression to a MediaStream.
 * Returns a promise that resolves to the processed stream.
 */
export async function applyNoiseSuppressionToStream(
  inputStream: MediaStream,
  config?: Partial<NoiseSuppressionConfig>,
): Promise<MediaStream | null> {
  if (!isNoiseSuppressionSupported()) {
    return null;
  }

  try {
    const processor = new NoiseSuppressionProcessor();
    return await processor.initialize(inputStream, config);
  } catch (error) {
    console.error("Failed to apply noise suppression:", error);
    return null;
  }
}
