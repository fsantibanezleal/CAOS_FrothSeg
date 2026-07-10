import { Component, type ReactNode } from 'react';

/** Per-panel error boundary: a single panel that throws (a bad selector, a NaN, a missing field) renders an
 *  honest inline message instead of blanking the whole app. Every tab panel is wrapped in one. */
export class PanelBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { children: ReactNode; label?: string }) {
    if (this.state.error && prev.children !== this.props.children) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fs-panel" role="alert" style={{ borderColor: '#f85149' }}>
          <div className="fs-panel-t" style={{ color: '#f85149' }}>{this.props.label ?? 'This panel could not render'}</div>
          <p className="fs-hint small">
            This view hit an error for the current selection and was isolated so the rest of the app keeps working.
            Try another sample or re-run.
          </p>
          <p className="fs-hint small mono" style={{ opacity: 0.7 }}>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
