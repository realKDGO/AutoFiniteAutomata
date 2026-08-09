import { createPortal } from 'react-dom';

/**
 * The browser Fullscreen API only paints the element that requested
 * fullscreen and its DOM descendants — everything else in the page (even
 * `position: fixed` elements) is hidden while it's active.
 *
 * BuilderCanvas's fullscreen root is reported up via `container`. When
 * fullscreen is active and a container is available, this portals its
 * children *into* that root so panels like the Transition Details modal,
 * the mobile Table sheet, and the mobile Simulator sheet keep working
 * exactly as they already do — just rendered inside the fullscreen element
 * instead of outside it. When not fullscreen, children render inline as
 * normal (no portal), so this is a no-op the rest of the time.
 */
export default function FullscreenPortal({ active, container, children }) {
  if (active && container) {
    return createPortal(children, container);
  }
  return children;
}
