import AutoTicketRulesPage from './AutoTicketRules/index';

interface AutoTicketRulesProps {
  onBack: () => void;
}

export default function AutoTicketRules({ onBack }: AutoTicketRulesProps) {
  return <AutoTicketRulesPage onBack={onBack} />;
}
