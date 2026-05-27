import UnifiedTicketingSystem from '../UnifiedTicketingSystem';
import CollectorCalendar from './CollectorCalendar';

interface MyAssignmentsProps {
  onBack?: () => void;
}

export default function MyAssignments({ onBack }: MyAssignmentsProps) {
  return (
    <div>
      <CollectorCalendar />
      <UnifiedTicketingSystem
        showOnlyAssigned={true}
        onBack={onBack}
        title="My Assignments"
      />
    </div>
  );
}
