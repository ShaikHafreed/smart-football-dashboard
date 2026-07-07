import React from "react";

/**
 * Isolates a single chart from the rest of the page. recharts'
 * ResponsiveContainer (ResizeObserver-driven) can throw internally during
 * rapid layout transitions (e.g. the sidebar collapse animation resizing
 * its container right after mount) — that shouldn't be able to blank out
 * an entire dashboard over one chart card.
 */
export default class ChartErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ChartErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Couldn't render this chart — try reloading.
        </div>
      );
    }

    return this.props.children;
  }
}
