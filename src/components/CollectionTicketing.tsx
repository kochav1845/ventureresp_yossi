import { useNavigate } from 'react-router-dom';
import UnifiedTicketingSystem from './UnifiedTicketingSystem';

export default function CollectionTicketing() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/admin-dashboard');
  };

  return (
    <UnifiedTicketingSystem
      showOnlyAssigned={false}
      onBack={handleBack}
      title="Ticketing System"
    />
  );
}
