// The playground renders documents nobody has seen before through
// renderers that read them, so a render can throw. Without a boundary
// React unmounts the whole tree and the page goes blank, taking the
// editors with it and leaving no way to fix the document that caused it.
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Typography from "@mui/material/Typography";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Changing this resets the boundary: a new build deserves a new try. */
  readonly resetKey: unknown;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[playground] render failed", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <Alert severity="error" variant="outlined">
        <AlertTitle sx={{ mb: 0 }}>Rendering failed</AlertTitle>
        <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
          {error.message}
        </Typography>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>
          The document built successfully; a renderer threw while drawing it. Edit and it will
          try again.
        </Typography>
      </Alert>
    );
  }
}
