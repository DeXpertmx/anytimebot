import { ApiKeysManager } from '@/components/dashboard/api-keys/api-keys-manager';
import { WebhooksManager } from '@/components/dashboard/api-keys/webhooks-manager';

export const metadata = {
  title: 'API - ANYTIMEBOT',
  description: 'API keys, outgoing webhooks and developer access',
};

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <WebhooksManager />
      <ApiKeysManager />
    </div>
  );
}
