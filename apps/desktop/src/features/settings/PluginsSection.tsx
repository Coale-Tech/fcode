/**
 * Settings section for omp plugin management.
 * Lists/installs/removes/enables omp npm and marketplace plugins via the bundled omp binary.
 * Delegates to OmpExtensionsSection which already handles all plugin operations.
 */
import { OmpExtensionsSection } from "../../components/settings/OmpExtensionsSection";

export function PluginsSection() {
  return <OmpExtensionsSection />;
}
