export class Ticker {
  private _tickNumber: number = 0;
  private _accumulator: number = 0;
  private _deltaTimeMs: number = 0;
  private _maxAccumulation: number = 25;

  /**
   * Current tick number.
   * Increased by 1 every time tick() gets called.
   * @readonly
   * @type {number}
   * @memberof Ticker
   */
  get tickNumber(): number {
    return this._tickNumber;
  }

  /**
   * Maximum number of milliseconds that can be accumulated in a single tick.
   * @readonly
   * @type {number}
   * @memberof Ticker
   * @see accumulator
   * @see deltaTimeMs
   * @see deltaTime
   */
  get maxAccumulation(): number {
    return this._maxAccumulation;
  }

  /**
   * Current accumulated frame time, in milliseconds.
   * @readonly
   * @type {number}
   * @memberof Ticker
   * @see maxAccumulation
   * @see deltaTimeMs
   * @see deltaTime
   */
  get accumulator(): number {
    return this._accumulator;
  }

  /**
   * Fixed time between ticks, in seconds.
   * @readonly
   * @type {number}
   * @memberof Ticker
   * @see deltaTimeMs
   */
  get deltaTime(): number {
    return this._deltaTimeMs / 1000;
  }

  /**
   * Fixed time between ticks, in milliseconds.
   * @readonly
   * @type {number}
   * @memberof Ticker
   * @see deltaTime
   */
  get deltaTimeMs(): number {
    return this._deltaTimeMs;
  }

  /**
   * Whether the ticker is running.
   * @readonly
   * @type {boolean}
   * @memberof Ticker
   */
  get isRunning(): boolean {
    return !this._stop;
  }

  /**
   * Whether the ticker is stopped.
   * @readonly
   * @type {boolean}
   * @memberof Ticker
   */
  get isStopped(): boolean {
    return this._stop;
  }

  /**
   * Time since the ticker started, in seconds.
   * @readonly
   * @type {number}
   * @memberof Ticker
   */
  get realtimeSinceStartup(): number {
    return this.tickNumber * this.deltaTime;
  }

  /**
   * Time since the ticker started, in milliseconds.
   * @readonly
   * @type {number}
   * @memberof Ticker
   */
  get realtimeSinceStartupMs(): number {
    return this.tickNumber * this.deltaTimeMs;
  }

  private _stop: boolean = true;
  private _lastTime: number = 0;
  private _tickFn: () => void;

  /**
   * Creates a new Ticker.
   * @param tickFunction Function to be called on each tick.
   * @param tickRate Number of ticks per second.
   * @param maxAccumulation Maximum number of milliseconds that can be
   * accumulated.
   * @param startImmediately Whether to start the ticker immediately.
   */
  constructor(
    tickFunction: () => void,
    tickRate: number = 60,
    maxAccumulation: number = 25,
    startImmediately: boolean = true
  ) {
    this._tickFn = tickFunction;
    this.setTickRate(tickRate);
    this.setMaxAccumulation(maxAccumulation);

    if (startImmediately) this.start();
  }

  /**
   * Starts the ticker.
   */
  start() {
    if (!this._stop) throw new Error('Ticker is already running.');
    this._stop = false;

    this._lastTime = this.getHighResolutionTime();
    this._tick();
  }

  /**
   * Stops the ticker.
   */
  stop() {
    this._stop = true;
    this._accumulator = 0;
    this._tickNumber = 0;
  }

  /**
   * Sets the current tick number.
   * @param tickNumber Tick number.
   * @memberof Ticker
   * @see tickNumber
   */
  setTickNumber(tickNumber: number) {
    this._tickNumber = tickNumber;
  }

  /**
   * Ticks.
   *
   * See {@link https://gafferongames.com/post/fix_your_timestep/} for more
   * info.
   */
  private _tick() {
    const newTime = this.getHighResolutionTime();
    const frameTime = Math.min(this._maxAccumulation, newTime - this._lastTime);

    this._lastTime = newTime;
    this._accumulator += frameTime;

    while (this._accumulator >= this._deltaTimeMs) {
      if (this._stop) return;

      this._tickFn();

      this._accumulator -= this._deltaTimeMs;
      this._tickNumber++;
    }

    setImmediate(() => this._tick());
  }

  /**
   * How many times a second should we tick?
   *
   * Set to 0 if you want to disable the built-in ticker.
   * @param ticksPerSecond Number of ticks per second.
   */
  setTickRate(ticksPerSecond: number) {
    if (ticksPerSecond <= 0)
      throw new Error('Tick rate must be greater than 0.');

    this._deltaTimeMs = 1000 / ticksPerSecond;
  }

  /**
   * Sets the maximum number of milliseconds that can be accumulated in one
   * frame.
   * @param maxAccumulation Maximum number of milliseconds that can be
   * accumulated.
   */
  setMaxAccumulation(maxAccumulation: number) {
    this._maxAccumulation = maxAccumulation;
  }

  /**
   * Returns the current time in milliseconds. High-res if supported.
   * @returns Current time in milliseconds.
   */
  getHighResolutionTime() {
    if (performance !== undefined) {
      return performance.now();
    }
    if (window !== undefined) {
      if (window.performance.now) {
        return window.performance.now();
      }
    }
    return Date.now();
  }
}
