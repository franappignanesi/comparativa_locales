import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/components/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("Términos de uso | BARATEAM", "Condiciones de uso de BARATEAM: comparación de precios, actualización de datos, cuentas, alertas y contacto con Shux.", "/terminos");

export default function TermsPage() {
  return <LegalPage title="Términos de uso">
    <p>Estas condiciones regulan el uso de BARATEAM, herramienta de Shux disponible en shuxteam.com, y de sus notificaciones, incluida la integración con Discord. Shux es el equipo responsable de la plataforma; el contacto para consultas y reclamos es <a href="mailto:shuxteam@gmail.com">shuxteam@gmail.com</a>.</p>
    <section><h2>1. Qué ofrece BARATEAM</h2>
      <p>BARATEAM permite comparar precios de juegos entre tiendas, consultar datos históricos, guardar una lista de deseados y configurar alertas. El acceso actual es gratuito. No vendemos juegos, no cobramos las compras ni emitimos claves: la contratación se realiza con la tienda elegida y bajo sus condiciones.</p>
      <p>Las recomendaciones de Shux son opiniones editoriales. La inclusión de una tienda o un juego no implica una relación oficial, respaldo de sus titulares ni garantía sobre la compra.</p>
    </section>
    <section><h2>2. Precios, monedas e historial</h2>
      <p>Los datos se obtienen de fuentes externas y se actualizan mediante tareas periódicas; no son cotizaciones en tiempo real. Puede haber retrasos, interrupciones, precios faltantes o errores, incluso durante ofertas. Buscamos actualizar a diario, pero no garantizamos que todos los juegos y tiendas se completen cada día.</p>
      <p>El precio final, la edición, la plataforma compatible, la región de activación y la disponibilidad deben verificarse en la tienda antes de comprar. Las conversiones e impuestos estimados son orientativos y pueden diferir del importe que cobre tu banco o medio de pago. Cada indicador debe leerse en la moneda y región seleccionadas.</p>
      <p>Los mínimos históricos representan el menor precio registrado por nuestras fuentes disponibles, no necesariamente el menor precio que existió. Un historial puede estar incompleto. Si detectás una diferencia, podés usar el botón de reportar problema o escribirnos.</p>
    </section>
    <section><h2>3. Cuenta y notificaciones</h2>
      <p>Para funciones personales utilizamos Google Login. Usá tu propia cuenta y protegé su acceso; BARATEAM nunca te pedirá la contraseña de Google. Las funciones vinculadas a Google, Discord u otros proveedores también dependen de sus requisitos de uso y edad.</p>
      <p>Las alertas son opcionales y utilizan la región, tiendas y condiciones que configuraste. No garantizan que una oferta siga vigente al leer el mensaje ni entrega inmediata o sin interrupciones. Los límites de envío, permisos del navegador, ajustes de privacidad de Discord y fallas de proveedores pueden impedir o demorar una notificación.</p>
      <p>Podés desactivar los canales desde <Link href="/perfil">tu perfil</Link> o cambiar las condiciones en <Link href="/wishlist">tu wishlist</Link>. Los resúmenes publicados en el servidor de Shux son información general, no alertas personalizadas.</p>
    </section>
    <section><h2>4. Uso permitido</h2>
      <p>No utilices el servicio para suplantar identidades, acceder a cuentas ajenas, enviar spam o contenido ilícito, evadir controles ni interferir con su funcionamiento. No intentes obtener datos privados de otros usuarios ni realizar consultas automatizadas que saturen la infraestructura.</p>
      <p>Podemos limitar solicitudes, suspender funciones o restringir cuentas ante abuso o riesgos de seguridad. Las medidas deben ser proporcionales al problema; si considerás que hubo un error, podés contactarnos para solicitar revisión.</p>
    </section>
    <section><h2>5. Contenido propio y de terceros</h2>
      <p>Las marcas, portadas, juegos y contenidos de terceros pertenecen a sus respectivos titulares. Los textos y recomendaciones originales de Shux mantienen sus derechos correspondientes. Podés compartir enlaces públicos de BARATEAM; para reutilizar material de Shux más allá de los usos permitidos por la ley, consultanos.</p>
      <p>Al enviar un reporte permitís que el equipo revise su texto y captura para gestionar el problema. Eso no autoriza su publicación indiscriminada ni la venta de tus datos. El tratamiento de información personal se explica en nuestra <Link href="/privacidad">política de privacidad</Link>.</p>
    </section>
    <section><h2>6. Disponibilidad y responsabilidad</h2>
      <p>La plataforma está en evolución y puede tener mantenimiento o fallas. Procuramos corregir errores, pero no prometemos disponibilidad continua ni ausencia total de inexactitudes. Las compras, cobros, licencias y devoluciones corresponden a la tienda que realiza la venta.</p>
      <p>Estas condiciones no excluyen responsabilidades que no puedan excluirse legalmente ni limitan tus derechos como consumidor o titular de datos personales.</p>
    </section>
    <section><h2>7. Cambios y contacto</h2>
      <p>Los cambios se publicarán con su fecha en esta página. Las modificaciones importantes de funciones o condiciones se comunicarán de manera adecuada y no se aplicarán retroactivamente para quitar derechos ya adquiridos.</p>
      <p>Se aplica la normativa argentina, sin perjuicio de los derechos y normas obligatorias que correspondan por tu lugar de residencia. No imponemos un tribunal exclusivo ni renuncia a vías legales de reclamo. Para consultas, privacidad o revisión de una restricción, escribí a <a href="mailto:shuxteam@gmail.com">shuxteam@gmail.com</a>.</p>
    </section>
  </LegalPage>;
}
