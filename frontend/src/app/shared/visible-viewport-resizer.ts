const VIEWPORT_WIDTH_PROPERTY = '--tank-arena-visible-viewport-width';
const VIEWPORT_HEIGHT_PROPERTY = '--tank-arena-visible-viewport-height';
const LAYOUT_WIDTH_PROPERTY = '--tank-arena-layout-viewport-width';
const LAYOUT_HEIGHT_PROPERTY = '--tank-arena-layout-viewport-height';
const SETTLE_DELAY_MS = 250;

export class VisibleViewportResizer {
  private animationFrame?: number;
  private settleTimer?: number;
  private started = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly container: HTMLElement,
    private readonly resizeGame: (width: number, height: number) => void,
  ) {}

  private readonly onViewportChange = (): void => {
    this.refresh();
    if (this.settleTimer !== undefined) window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.refresh(), SETTLE_DELAY_MS);
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.addEventListener('resize', this.onViewportChange);
    window.visualViewport?.addEventListener('scroll', this.onViewportChange);
    document.addEventListener('fullscreenchange', this.onViewportChange);
    this.refresh();
  }

  refresh(): void {
    const viewport = window.visualViewport;
    const width = Math.round(viewport?.width ?? window.innerWidth);
    const height = Math.round(viewport?.height ?? window.innerHeight);
    const layoutWidth = Math.max(Math.round(window.innerWidth), width);
    const layoutHeight = Math.max(Math.round(window.innerHeight), height);

    this.host.style.setProperty(VIEWPORT_WIDTH_PROPERTY, `${width}px`);
    this.host.style.setProperty(VIEWPORT_HEIGHT_PROPERTY, `${height}px`);
    this.host.style.setProperty(LAYOUT_WIDTH_PROPERTY, `${layoutWidth}px`);
    this.host.style.setProperty(LAYOUT_HEIGHT_PROPERTY, `${layoutHeight}px`);

    if (this.animationFrame !== undefined) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = window.requestAnimationFrame(() => {
      const containerWidth = this.container.clientWidth;
      const containerHeight = this.container.clientHeight;
      if (containerWidth > 0 && containerHeight > 0) {
        this.resizeGame(containerWidth, containerHeight);
      }
    });
  }

  destroy(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.removeEventListener('resize', this.onViewportChange);
    window.visualViewport?.removeEventListener('scroll', this.onViewportChange);
    document.removeEventListener('fullscreenchange', this.onViewportChange);
    if (this.animationFrame !== undefined) window.cancelAnimationFrame(this.animationFrame);
    if (this.settleTimer !== undefined) window.clearTimeout(this.settleTimer);
  }
}
