import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Términos del servicio - ANYTIMEBOT',
  description: 'Términos del servicio y condiciones comerciales de ANYTIMEBOT',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white">
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center space-x-3">
            <div className="relative h-10 w-10"><Image src="/Anytimebot-icon.png" alt="ANYTIMEBOT" fill className="object-contain" /></div>
            <span className="text-2xl font-bold text-gray-900">ANYTIMEBOT</span>
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Planes y precios</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <article className="rounded-lg bg-white p-8 shadow-sm md:p-12">
          <h1 className="mb-4 text-4xl font-bold text-gray-900">Términos del servicio</h1>
          <p className="mb-8 text-sm text-gray-500">Última actualización: 31 de agosto de 2026</p>

          <div className="prose prose-indigo max-w-none text-gray-700">
            <p className="text-lg">Te damos la bienvenida a ANYTIMEBOT. Al crear una cuenta o utilizar la plataforma aceptas estos términos y las condiciones comerciales que se indican a continuación.</p>

            <section><h2>1. Descripción del servicio</h2><p>ANYTIMEBOT es una plataforma para crear páginas de reservas, gestionar disponibilidad, organizar citas, administrar clientes y, según el plan contratado, utilizar automatizaciones, mensajería y asistencia basada en inteligencia artificial.</p></section>
            <section><h2>2. Cuenta y uso responsable</h2><p>Debes proporcionar información correcta, proteger tus credenciales y utilizar el servicio de forma legal. Eres responsable de contar con las autorizaciones necesarias para los datos de tus clientes, mensajes, grabaciones, documentos y demás contenido que introduzcas en la plataforma.</p></section>

            <section>
              <h2>3. Planes y condiciones comerciales</h2>
              <ul>
                <li><strong>Básico de fundadores:</strong> pago único de 29 €, para una cuenta de usuario, hasta 5 páginas de reserva y hasta 1.000 clientes, con las funciones descritas en la página de precios.</li>
                <li><strong>Pro:</strong> suscripción mensual de 19 € al mes, con automatización, asistente de IA, WhatsApp y las cuotas indicadas antes de contratar.</li>
                <li><strong>Equipo:</strong> suscripción mensual de 39 € al mes, con funciones de colaboración y límites superiores según la oferta vigente.</li>
              </ul>
              <p>Los precios se muestran en euros salvo que se indique otra moneda antes del pago. Los impuestos aplicables se calcularán cuando corresponda. Las funciones, cuotas y precios vigentes se mostrarán claramente antes de confirmar una compra o cambio de plan.</p>
            </section>

            <section><h2>4. Pagos, renovación y cancelación</h2><p>El plan Básico de fundadores es un pago único y no se renueva automáticamente. Los planes Pro y Equipo son suscripciones mensuales: se renuevan hasta que solicites la cancelación. La cancelación evita cargos futuros y, salvo indicación legal distinta, conserva el acceso hasta el final del periodo ya pagado.</p></section>
            <section><h2>5. Reembolsos</h2><p>Puedes solicitar un reembolso dentro de los 14 días siguientes a la compra, sin perjuicio de los derechos irrenunciables que reconozca la normativa aplicable. Las solicitudes se gestionan mediante un ticket de soporte e indicaremos el resultado y el plazo previsto. Los reembolsos pueden revocar el acceso o las ventajas asociadas al pago reembolsado.</p></section>
            <section><h2>6. Cuotas y límites</h2><p>Cada plan tiene límites de usuarios, páginas de reserva, clientes, documentos, mensajes, interacciones y otras funciones. El sistema puede impedir nuevas operaciones al alcanzar una cuota. Te mostraremos los límites aplicables y, cuando esté disponible, avisos de uso antes de llegar a ellos.</p></section>
            <section><h2>7. Soporte</h2><p>El canal oficial de atención es el sistema de <Link href="/dashboard/support">tickets de soporte</Link> dentro de ANYTIMEBOT. La prioridad y el tiempo de respuesta pueden variar según el plan, la urgencia y la complejidad de la solicitud. No garantizamos atención instantánea ni disponibilidad de soporte fuera de los canales publicados.</p></section>
            <section><h2>8. Contenido y propiedad intelectual</h2><p>Conservas tus derechos sobre el contenido que aportas. Nos concedes únicamente las autorizaciones necesarias para alojarlo, procesarlo y mostrarlo con el fin de prestar el servicio. La plataforma, su código, marca y componentes son propiedad de ANYTIMEBOT o de sus licenciantes.</p></section>
            <section><h2>9. Disponibilidad y responsabilidad</h2><p>Trabajamos para mantener el servicio disponible, pero pueden producirse interrupciones por mantenimiento, proveedores externos, incidencias de red o causas fuera de nuestro control. En la medida permitida por la ley, ANYTIMEBOT no será responsable de daños indirectos ni de decisiones tomadas exclusivamente con base en la información de la plataforma.</p></section>
            <section><h2>10. Privacidad y datos personales</h2><p>El tratamiento de datos personales se describe en nuestra <Link href="/privacy">Política de privacidad</Link>. Si utilizas páginas de reserva para tu negocio, debes informar a tus clientes y utilizar la plataforma conforme a la normativa aplicable.</p></section>
            <section><h2>11. Suspensión y terminación</h2><p>Podemos limitar o suspender una cuenta cuando exista incumplimiento de estos términos, riesgo para la seguridad, impago o uso ilícito. Cuando sea razonablemente posible informaremos del motivo y de las vías disponibles para revisarlo.</p></section>
            <section><h2>12. Cambios y contacto</h2><p>Podemos actualizar estos términos para reflejar cambios legales, técnicos o comerciales. Publicaremos la versión vigente en esta página. Para dudas sobre el servicio o una compra, utiliza un ticket de soporte; para derechos de privacidad, escribe a privacy@anytimebot.app.</p></section>
          </div>
        </article>
      </main>

      <footer className="mt-12 border-t bg-white"><div className="mx-auto max-w-7xl px-4 py-8 text-center text-gray-500 sm:px-6 lg:px-8"><p>&copy; 2026 ANYTIMEBOT. Todos los derechos reservados.</p></div></footer>
    </div>
  );
}
