import { CustomersList } from '@/components/dashboard/customers/customers-list';
import { CustomersHeader } from '@/components/dashboard/customers/customers-header';

export const metadata = {
  title: 'Customers - ANYTIMEBOT',
  description: 'Customer history, notes and tags',
};

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <CustomersHeader />
      <CustomersList />
    </div>
  );
}
