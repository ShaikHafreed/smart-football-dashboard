import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
          <p className="text-3xl">⚠️</p>
          <h1 className="font-display text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{this.state.error.message || "Please reload the page."}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Reload
          </button>
          <details className="mt-4 w-full max-w-lg text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">Technical details</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-card p-3 text-[11px] text-muted-foreground">
              {this.state.error.stack}
              {this.state.info?.componentStack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
