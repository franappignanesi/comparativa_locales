import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/components/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("Política de privacidad | BARATEAM", "Cómo BARATEAM utiliza tus datos para la cuenta, lista de deseados y notificaciones, y cómo solicitar acceso o eliminación.", "/privacidad");

export default function PrivacyPage() {
  return <LegalPage title="Política de privacidad">
    <p>Esta política describe el tratamiento de datos en BARATEAM, en shuxteam.com, y en su integración con Discord. Podés consultar precios sin crear una cuenta; iniciar sesión es necesario para guardar tu lista de deseados, configurar alertas y enviar reportes.</p>
    <section><h2>1. Quién está a cargo</h2>
      <p>Shux es el equipo responsable de BARATEAM y de la gestión de los datos descriptos en esta política. Para consultas sobre privacidad o solicitudes sobre tus datos, escribí a <a href="mailto:shuxteam@gmail.com">shuxteam@gmail.com</a> con el asunto «Privacidad BARATEAM».</p>
    </section>
    <section><h2>2. Qué datos usamos y para qué</h2>
      <ul>
        <li><strong>Cuenta de Google:</strong> identificador de usuario, nombre, correo electrónico y, si está disponible, foto de perfil. Los usamos para verificar tu identidad y asociar tus preferencias. No solicitamos tu contraseña de Google ni acceso a Gmail, contactos o archivos.</li>
        <li><strong>Lista de deseados y ajustes:</strong> juegos guardados, fechas de incorporación, tiendas y región elegidas, canales y condiciones de alerta. Sirven para sincronizar tu lista y detectar las ofertas que te interesan. Los rankings públicos de juegos más deseados muestran conteos, no nombres ni listas individuales.</li>
        <li><strong>Votos de ofertas:</strong> guardamos los juegos que elegís y el identificador de tu cuenta para respetar el límite de cinco votos por campaña y permitirte cambiarlos. El ranking de la comunidad muestra juegos y cantidades de votos, no las identidades de quienes votaron.</li>
        <li><strong>Notificaciones:</strong> el correo para enviar alertas por email y, si habilitás push, la dirección de suscripción del navegador, sus claves técnicas y datos del navegador. Estos canales son opcionales.</li>
        <li><strong>Discord:</strong> si conectás tu cuenta, guardamos tu identificador y nombre de usuario de Discord, su relación con BARATEAM y la confirmación del mensaje de prueba. Usamos ese vínculo para enviarte alertas cuando las activás. No guardamos los tokens de acceso o renovación de OAuth ni leemos tus conversaciones, contactos o mensajes de los servidores.</li>
        <li><strong>Reportes de problemas:</strong> texto, categoría, captura si se adjunta, URL de la página, navegador, tamaño de pantalla, usuario y seguimiento del reporte. Los revisa el equipo administrador para corregir errores y responderte; no se publican como un listado abierto.</li>
        <li><strong>Propuestas de juegos:</strong> enlace de la tienda, nombre identificado o aportado, fecha e identificador de la cuenta que lo propone. Los usamos para agrupar pedidos, evitar abuso y revisar incorporaciones al catálogo. La bandeja y los solicitantes solo son visibles para administradores; consultar el enlace puede generar solicitudes a la tienda correspondiente.</li>
        <li><strong>Operación y seguridad:</strong> registros técnicos, estados de entrega y controles de frecuencia para prevenir abuso, investigar fallas y evitar mensajes repetidos. Algunos controles utilizan huellas de identificadores o direcciones IP; eso no equivale a anonimizar todos los datos.</li>
      </ul>
      <p>No pedimos datos de tarjetas ni procesamos compras de juegos. Evitá incluir contraseñas, datos financieros o información sensible en reportes y capturas: revisá lo que vas a enviar.</p>
    </section>
    <section><h2>3. Cookies, almacenamiento local y mediciones</h2>
      <p>Usamos una cookie de sesión firmada, inaccesible a JavaScript y protegida con HTTPS en producción, con una duración máxima de 14 días. La vinculación con Discord usa además una cookie temporal de 10 minutos. El navegador puede guardar localmente datos de presentación del usuario, una copia de la wishlist, región y preferencias; esa copia no otorga permisos sobre la cuenta.</p>
      <p>Vercel Web Analytics proporciona estadísticas de visitas. También medimos el tiempo aproximado con la pestaña visible: nuestra medición propia guarda totales por día y ruta, no una secuencia de acciones asociada a tu cuenta. La infraestructura puede procesar IP, navegador y registros de solicitudes para prestar el servicio y protegerlo.</p>
      <p>Podés borrar el almacenamiento del sitio desde tu navegador. Esto puede cerrar tu sesión o restablecer preferencias, pero no elimina los datos guardados en nuestros servidores.</p>
    </section>
    <section><h2>4. Proveedores y contenido externo</h2>
      <p>Utilizamos Vercel para alojamiento y analítica, Neon para base de datos, Google para inicio de sesión y fuentes tipográficas, Resend para emails, servicios push del navegador y Discord para vinculación y mensajes. GitHub Actions ejecuta las actualizaciones y tareas de notificación. Cada proveedor recibe los datos necesarios para su función y puede tratarlos o almacenarlos fuera de Argentina, conforme a sus condiciones y políticas.</p>
      <p>Las imágenes, videos integrados de Instagram y enlaces a tiendas o redes sociales pueden generar solicitudes a terceros y están sujetos a sus propias políticas. No controlamos las cookies que esos servicios puedan utilizar. No vendemos los datos personales de tu cuenta; las comunicaciones a proveedores tienen las finalidades descriptas en esta política. También podemos comunicar información cuando exista una obligación legal.</p>
    </section>
    <section><h2>5. Notificaciones y tus opciones</h2>
      <p>Podés activar o desactivar email, push y Discord desde <Link href="/perfil">tu perfil</Link>, y ajustar las condiciones de cada juego desde <Link href="/wishlist">tu lista de deseados</Link>. Push requiere además permiso del navegador; Discord requiere conectar tu cuenta, confirmar una prueba y activar expresamente los MD. Conectar Discord por sí solo no activa alertas.</p>
      <p>Podés desconectar Discord desde el perfil y revocar los permisos en Discord o en el navegador. Desactivar un canal detiene futuros envíos, aunque un mensaje ya entregado o en curso puede no retirarse. Revocar permisos en un proveedor no borra automáticamente la cuenta de BARATEAM.</p>
    </section>
    <section><h2>6. Conservación y protección</h2>
      <p>La cuenta, wishlist y preferencias se mantienen para continuar prestando el servicio hasta que solicites su eliminación; no hay un borrado automático por inactividad. Los reportes y propuestas de juegos se conservan para seguimiento de problemas e incorporaciones, y las estadísticas agregadas para comparar el funcionamiento del sitio. Cerrar sesión no borra esos registros.</p>
      <p>Los estados temporales de Discord vencen en 10 minutos y los mensajes pendientes en 48 horas. El mantenimiento periódico elimina registros operativos vencidos y conserva huellas de alertas entregadas hasta 90 días para evitar duplicados. La eliminación efectiva depende de la ejecución de esas tareas. Pueden existir copias de respaldo y registros de proveedores con sus propios ciclos de conservación; una eliminación no implica que desaparezcan instantáneamente de todas las copias.</p>
      <p>Aplicamos controles de sesión, permisos de administrador y restricciones de envío. Ningún servicio puede garantizar seguridad absoluta. Si sospechás una exposición de datos, contactanos por el correo indicado.</p>
    </section>
    <section><h2>7. Acceso, corrección y eliminación</h2>
      <p>Podés pedir acceso, rectificación, actualización o supresión de tus datos escribiendo desde el correo asociado a tu cuenta. Indicá qué querés consultar o eliminar; podemos pedir una verificación razonable de identidad, sin solicitar tu contraseña. Hoy la eliminación completa se gestiona por ese canal, no mediante un botón de la web.</p>
      <p>Atenderemos las solicitudes en los plazos legales aplicables: hasta 10 días corridos para acceso y 5 días hábiles para rectificación, actualización o supresión. Si corresponde conservar información por una obligación legal o un reclamo, te explicaremos el motivo. Los totales agregados que ya no permiten identificarte pueden mantenerse.</p>
      <p>La Agencia de Acceso a la Información Pública es la autoridad argentina de protección de datos personales. Podés consultar <a href="https://www.argentina.gob.ar/aaip/datospersonales/derechos" target="_blank" rel="noopener noreferrer">tus derechos y cómo presentar un reclamo ante la AAIP</a>.</p>
    </section>
    <section><h2>8. Cambios en esta política</h2>
      <p>Publicaremos las actualizaciones en esta página, indicando su fecha. Si cambia sustancialmente la finalidad del tratamiento o se agrega un canal que requiere autorización, lo informaremos y solicitaremos el consentimiento que corresponda; no se activará solo por actualizar este texto.</p>
    </section>
  </LegalPage>;
}
