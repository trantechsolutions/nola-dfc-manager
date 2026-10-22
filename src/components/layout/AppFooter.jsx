import { buildNumber, commitHash } from 'virtual:git-info';
import { PUB_NAME, PUB_URL } from '../../utils/constants';

/**
 * AppFooter — attribution and build stamp, kept quiet at the end of the page.
 * The build stamp comes from the `virtual:git-info` module (see vite.config.js)
 * so it can never drift from the deployed commit. Its bottom padding clears
 * the phone tab bar (see `.app-footer` in index.css).
 */
export default function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-3 text-xs text-muted-foreground md:px-6">
        <span>
          © {new Date().getFullYear()}{' '}
          <a href={PUB_URL} title={`${PUB_NAME} Website`} className="font-semibold text-foreground">
            {PUB_NAME}
          </a>
        </span>
        <span className="tabular-nums">
          build {buildNumber} · {commitHash}
        </span>
      </div>
    </footer>
  );
}
