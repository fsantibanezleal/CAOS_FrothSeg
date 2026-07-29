import { useEffect } from 'react';

/** Publish the real height of the shell chrome as `--fs-chrome` on the document root.
 *
 *  ADR-0071 1 requires `document.scrollHeight === innerHeight` on the App route. That means
 *  the workbench has to be exactly the viewport minus the shell's header and footer, and those
 *  are not constants: the footer is content-driven and changes height with language, with
 *  viewport width as its text wraps, and with any future shell release.
 *
 *  A hard-coded `calc(100dvh - 185px)` was 19px short at every viewport and would have drifted
 *  again on the next shell change. Measuring is self-correcting, so the gate keeps passing
 *  without anyone re-tuning a magic number.
 */
export function useViewportFit(): void {
  useEffect(() => {
    const root = document.documentElement;

    const measure = () => {
      const header = document.querySelector('header');
      const footer = document.querySelector('footer');
      // Margins count. The shell footer carries a 48px margin-top, which is why a
      // height-only sum left the document exactly 18px past the viewport.
      const box = (element: Element | null) => {
        if (!element) return 0;
        const style = getComputedStyle(element);
        return element.getBoundingClientRect().height
          + parseFloat(style.marginTop || '0')
          + parseFloat(style.marginBottom || '0');
      };
      const chrome = box(header) + box(footer);
      root.style.setProperty('--fs-chrome', `${Math.ceil(chrome)}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    if (header) observer.observe(header);
    if (footer) observer.observe(footer);
    window.addEventListener('resize', measure);
    // The footer's height also changes when the language toggle rewrites its text.
    const mutation = new MutationObserver(measure);
    if (footer) mutation.observe(footer, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--fs-chrome');
    };
  }, []);
}
