import "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "weave-input": any;
      "weave-button": any;
      "weave-select": any;
    }
  }
}
