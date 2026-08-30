import { FeedbackSummary } from '@/components/dashboard/feedback/feedback-summary';

export const metadata = {
  title: 'Opiniones - ANYTIMEBOT',
  description: 'Encuestas post-cita y retroalimentación de clientes',
};

export default function FeedbackPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Opiniones de clientes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Calificaciones y comentarios que tus clientes dejan después de cada cita.
        </p>
      </div>
      <FeedbackSummary />
    </div>
  );
}
