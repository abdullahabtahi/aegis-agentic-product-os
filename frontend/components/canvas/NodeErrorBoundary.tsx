"use client";

import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class NodeErrorBoundary extends React.Component<
  { children: React.ReactNode; nodeId: string },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[NodeErrorBoundary] node=${this.props.nodeId}`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-2 text-xs text-red-400 border border-red-400/20 rounded bg-red-400/5">
          Node error
        </div>
      );
    }
    return this.props.children;
  }
}
