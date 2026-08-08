// src/hooks/useViewScope.js
// Reads and persists the signed-in admin's view scope preference.
// See utils/viewScope.js for what the scopes mean.

import { useCallback, useEffect, useState } from 'react';
import { VIEW_SCOPE, readViewScope, writeViewScope } from '../utils/viewScope';

export const useViewScope = (userId) => {
  const [viewScope, setScope] = useState(() => readViewScope(userId));

  // The preference is per account, so re-read it whenever the session changes
  // — otherwise a sign-out/sign-in on the same browser keeps the old scope.
  useEffect(() => {
    setScope(readViewScope(userId));
  }, [userId]);

  const setViewScope = useCallback(
    (next) => {
      const scope = next === VIEW_SCOPE.CLUB ? VIEW_SCOPE.CLUB : VIEW_SCOPE.TEAM;
      writeViewScope(userId, scope);
      setScope(scope);
    },
    [userId],
  );

  return { viewScope, setViewScope, isTeamScope: viewScope === VIEW_SCOPE.TEAM };
};
