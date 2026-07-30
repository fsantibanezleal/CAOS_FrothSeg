import { Component, type ReactNode } from 'react';
import { useShellLang } from '@fasl-work/caos-app-shell';

/** Per-panel error boundary: a single panel that throws (a bad selector, a NaN, a missing field) renders an
 *  honest inline message instead of blanking the whole app. Every tab panel is wrapped in one.
 *  The copy is bilingual: the class holds the boundary, the exported wrapper reads the shell language. */
class PanelBoundaryInner extends Component<
  { children: ReactNode; label?: string; es: boolean },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { children: ReactNode; label?: string; es: boolean }) {
    if (this.state.error && prev.children !== this.props.children) this.setState({ error: null });
  }

  render() {
    const { es } = this.props;
    if (this.state.error) {
      return (
        <div className="fs-panel" role="alert" style={{ borderColor: '#f85149' }}>
          <div className="fs-panel-t" style={{ color: '#f85149' }}>
            {this.props.label ?? (es ? 'Este panel no pudo renderizarse' : 'This panel could not render')}
          </div>
          <p className="fs-hint small">
            {es
              ? 'Esta vista encontró un error con la selección actual y quedó aislada para que el resto de la aplicación siga funcionando. Prueba otra muestra o vuelve a ejecutar.'
              : 'This view hit an error for the current selection and was isolated so the rest of the app keeps working. Try another sample or re-run.'}
          </p>
          <p className="fs-hint small mono" style={{ opacity: 0.7 }}>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PanelBoundary({ children, label }: { children: ReactNode; label?: string }) {
  const es = useShellLang() === 'es';
  return <PanelBoundaryInner es={es} label={label}>{children}</PanelBoundaryInner>;
}
