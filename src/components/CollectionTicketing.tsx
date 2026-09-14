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
    // Prefer the browser's previous page, but fall back to a real route when the
    // ticketing screen was opened directly (no history) -- otherwise Back does nothing.
    if (window.history.length > 1) {
      rawNavigate(-1);
    } else {
      navigate('/customers');
    }
  };

  return (
    <UnifiedTicketingSystem
      showOnlyAssigned={false}
      onBack={handleBack}
      title="Ticketing System"
    />
  );
}
