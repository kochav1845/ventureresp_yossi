import { useNavigate, useParams } from 'react-router-dom';
import UnifiedTicketingSystem from './UnifiedTicketingSystem';

export default function CollectionTicketing() {
  const rawNavigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = (path: string, options?: any) => {
    if (path.startsWith('/') && orgSlug && !path.startsWith(`/${orgSlug}`)) {
      rawNavigate(`/${orgSlug}${path}`, options);
    } else {
      rawNavigate(path, options);
    }
  };

  const handleBack = () => {
    // /admin-dashboard is not a real route — go to the previous page instead.
    rawNavigate(-1);
  };

  return (
    <UnifiedTicketingSystem
      showOnlyAssigned={false}
      onBack={handleBack}
      title="Ticketing System"
    />
  );
}
