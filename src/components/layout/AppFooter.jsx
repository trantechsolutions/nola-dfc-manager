import { buildNumber, commitHash } from 'virtual:git-info';
import { useNavigation } from '../../context/NavigationContext';
import { PUB_NAME, PUB_URL } from '../../utils/constants';

/**
 * AppFooter — AdminLTE `.app-footer`: attribution left, build stamp right.
 * The build stamp comes from the `virtual:git-info` module (see vite.config.js)
 * so it can never drift from the deployed commit.
 */
export default function AppFooter() {
  const { club } = useNavigation();

  return (
    // The extra mobile bottom padding clears the fixed tab bar (and the club
    // strip stacked above it) so the footer is never buried underneath.
    <footer className="app-footer flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 pb-32 pt-3 text-xs text-muted-foreground md:py-3">
      <span>
        © {new Date().getFullYear()}{' '}
        <span className="font-semibold text-foreground">
          <a href={PUB_URL} title={`${PUB_NAME} Website`}>
            {PUB_NAME}
          </a>
        </span>
        . All rights reserved.
      </span>
      <span className="font-mono">
        build {buildNumber} · {commitHash}
      </span>
    </footer>
  );
}
