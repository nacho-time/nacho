// Type declarations for media-chrome and hls-video-element custom elements
declare namespace JSX {
  interface IntrinsicElements {
    "hls-video": React.DetailedHTMLProps<
      React.VideoHTMLAttributes<HTMLVideoElement> & {
        slot?: string;
        crossorigin?: boolean | string;
      },
      HTMLVideoElement
    >;
    "media-controller": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-control-bar": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-play-button": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-seek-backward-button": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-seek-forward-button": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-time-range": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-time-display": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "show-duration"?: boolean;
      },
      HTMLElement
    >;
    "media-mute-button": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-volume-range": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-playback-rate-button": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-pip-button": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "media-fullscreen-button": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}
