import { Navigate } from 'react-router-dom';
import { getConnection } from '../api/connections';
import { lastTable } from './lastTable';

/** #/schirm → SL-Schirm der zuletzt geöffneten Kampagne, die man leitet; sonst zur Kampagnenliste */
export function LastTableRedirect() {
  const last = lastTable();
  if (!last || !getConnection(last.conn)) return <Navigate to="/" replace />;
  return <Navigate to={`/v/${last.conn}/k/${last.campaignId}/tisch`} replace />;
}
