import { ApiKeysManager } from '@/components/dashboard/api-keys/api-keys-manager';

export const metadata = {
  title: 'API - ANYTIMEBOT',
  description: 'API keys and developer access',
};

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <ApiKeysManager />
    </div>
  );
}
