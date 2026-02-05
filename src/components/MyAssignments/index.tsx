import UnifiedTicketingSystem from '../UnifiedTicketingSystem';

interface MyAssignmentsProps {
  onBack?: () => void;
}

export default function MyAssignments({ onBack }: MyAssignmentsProps) {
  return (
    <UnifiedTicketingSystem
      showOnlyAssigned={true}
      onBack={onBack}
      title="My Assignments"
    />
  );
}
