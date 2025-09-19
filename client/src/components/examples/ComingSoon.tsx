import ComingSoon from '../ComingSoon';
import { FileText } from 'lucide-react';

export default function ComingSoonExample() {
  return (
    <ComingSoon
      title="Messages"
      description="Team communication and project discussions will be available here. Stay tuned for updates!"
      estimatedDate="Q2 2024"
      icon={<FileText className="h-12 w-12" />}
    />
  );
}