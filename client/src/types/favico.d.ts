declare module "favico.js" {
  interface FavicoOptions {
    bgColor?: string;
    textColor?: string;
    fontFamily?: string;
    fontStyle?: string;
    type?: string;
    position?: string;
    animation?: string;
    elementId?: string | false;
    dataUrl?: (url: string) => void;
  }

  class Favico {
    constructor(options?: FavicoOptions);
    badge(number: number | string): void;
    reset(): void;
    image(imageElement: HTMLImageElement): void;
    video(videoElement: HTMLVideoElement): void;
    webcam(): void;
  }

  export default Favico;
}
