# Remigo — proyecto y roadmap de desarrollo
Este documento reúne la descripción del producto, el inventario de funcionalidades pendientes y un roadmap con dependencias y criterios de cierre.

## Producto y alcance
Remigo es una aplicación web bilingüe (español e inglés) para organizar sorteos de Amigo Invisible. El MVP contempla sorteos sin cuenta y grupos privados con cuentas, orientados inicialmente a España y EUR. La decisión de producto admite autenticación passwordless mediante magic link para los grupos.

El producto será gratuito, sin anuncios, afiliación/comisiones, patrocinios ni funciones premium. Ko-fi voluntario es la única fuente de ingresos prevista a futuro. Los catálogos y recomendaciones de productos externos están pospuestos; las listas y enlaces añadidos por usuarios sí pertenecen al alcance futuro.

## Estado implementado
- Landing bilingüe con marca Remigo.
- Registro e inicio de sesión con email y contraseña, magic link, recuperación/restablecimiento de contraseña, callback de Auth y cierre de sesión. Las rutas privadas conservan el retorno seguro, incluidas las invitaciones.
- Sorteo invitado en `/guest-draw`, con fecha opcional, nombres, correos, exclusiones dirigidas y validación; admite entre 2 y 50 participantes.
- Asignación en backend: cada persona da y recibe una vez, nadie se asigna a sí misma y se respetan exclusiones. Se rechaza el sorteo si no hay una solución completa.
- Resultado privado en `/guest-result`, consultado con un token personal. Quien organiza no recibe el mapa completo; cada participante puede pedir el reenvío de su resultado.
- Edge Functions para crear sorteos, consultar y reenviar resultados, procesar reintentos de correo y limpiar datos expirados. El límite operativo previsto es de 400 mensajes diarios para sorteos invitados.
- Flujo autenticado de grupos en `/groups`, `/groups/:groupId` e `/invitation`: creación y ajustes, membresías, invitaciones de 14 días, aceptación/rechazo con el correo invitado, exclusiones, sorteo manual de 3–50 personas, resultado privado, presupuesto EUR, listas de ideas y actividad en tiempo real.
- `supabase/migrations/202610280001_group_workflow.sql` implementa las funciones SQL y permisos para aislar emails, asignaciones, exclusiones, listas, actividad y notificaciones. Las URLs de ideas se limitan a HTTP(S) tanto en cliente como en la base de datos.
- `group-invite` y `group-draw` validan manualmente la sesión; `verify_jwt = false` permite la previsualización pública de invitaciones. Invitaciones y resultados usan outbox, reclamaciones de entrega y el cupo compartido de 400 correos diarios.
- La actividad del grupo es un registro persistente visible a sus miembros y actualizado con Supabase Realtime. `notifications` mantiene eventos `draw_ready` y `group_update` con RLS por destinatario, pero todavía no hay una bandeja global ni estado leído/no leído.

La aplicación usa React, TypeScript, Vite, React Router y Tailwind CSS; Supabase Auth, PostgreSQL y Edge Functions en TypeScript/Deno forman el backend. El envío de correo es “al menos una vez”: puede duplicarse si Resend acepta un mensaje y falla la confirmación posterior en la base de datos. La cancelación invalida los resultados pendientes o reclamados antes del envío; no puede retirar un correo que Resend ya haya aceptado.

## Pendiente para piloto y producción
### Acceso y cuenta
- Añadir los flujos de exportación y eliminación de cuenta, con sus efectos sobre los datos asociados.

### Validación y despliegue
- La migración `202610280001_group_workflow.sql` no se ha aplicado y las Edge Functions no se han desplegado. No se ha ejecutado ninguna operación en un proyecto remoto.
- `supabase/tests/group_workflow.test.sql` añade cobertura pgTAP de permisos, aislamiento de emails/asignaciones/listas/notificaciones, enlaces HTTP(S), actividad monotónica y cancelación de resultados reclamados; falta ejecutarla en PostgreSQL porque Docker no está disponible.
- No se han compilado las Edge Functions con Deno ni probado invitaciones/correos contra Resend y Supabase reales.
- `npm run lint` pasa; `npm test` pasa con 8 pruebas; `npm run build` pasa con un aviso de bundle JavaScript superior a 500 kB (817.53 kB minificado).
- Antes de producción, configurar SMTP propio para Auth, `RESEND_API_KEY`, un remitente con dominio verificado en Resend y `GROUP_INVITATION_TOKEN_SECRET` (mínimo 32 caracteres); verificar despliegue, entregabilidad, reintentos, programación de las tareas existentes y los límites diarios.
- Completar pruebas end-to-end, accesibilidad, RLS en un entorno local, registros/alertas, copias de seguridad y separación de entornos.
- Decidir si el MVP requiere una bandeja independiente de notificaciones con estado leído/no leído; actualmente la experiencia visible es la actividad persistente y en tiempo real dentro de cada grupo.
- Decidir si se necesita CAPTCHA además de la validación y el rate limiting actuales para los sorteos públicos.
- Validar cualitativamente la propuesta con uno o dos grupos; los resultados son aprendizaje inicial, no validación amplia de mercado.

### Privacidad y preparación del lanzamiento
- Completar términos de uso, aviso de privacidad y revisión RGPD: finalidad, base jurídica, derechos, proveedores y plazos de conservación.
- Comunicar que los datos de sorteos invitados se eliminan 30 días después del evento o, si no hay fecha, 30 días después del sorteo. Los grupos autenticados se eliminan tras 18 meses sin actividad de gestión; una visita pasiva no reinicia ese plazo.

## Roadmap final

### Fase 0 — Cierre de especificación y validación
**Estado:** decisiones principales documentadas; validación de usuarios y prueba real de correo pendientes según el roadmap.

Alcance: contrastar con uno o dos grupos el flujo gratuito y privado; probar Resend y la entregabilidad con un remitente de dominio verificado; estimar el volumen de temporada; y fijar los criterios de privacidad y lanzamiento. La decisión de no usar catálogo externo en el MVP está cerrada.

**Cierre:** las decisiones restantes quedan probadas o registradas como restricciones explícitas del MVP.

### Fase 1 — Fundamentos de backend y autenticación
**Estado:** implementada en código; migración sin aplicar y pruebas PostgreSQL pendientes.

Alcance: mantener migraciones reproducibles; completar el modelo de datos, tipos y RLS para grupos, invitaciones, membresías, exclusiones, sorteos, asignaciones y notificaciones; separar correctamente sorteos invitados y autenticados; e implementar el acceso passwordless por magic link. Si email y contraseña se conservan como alternativa, añadir recuperación y restablecimiento. Las operaciones de grupo deben ejecutarse con permisos de servidor apropiados y sin exponer el rol de servicio al cliente.

**Cierre:** las políticas y pruebas demuestran aislamiento entre usuarios/grupos y acceso únicamente a los datos permitidos.

### Fase 2 — Sorteo invitado
**Estado:** implementada en el código; despliegue y operación real pendientes de confirmar.

Alcance: creación y validación de participantes, exclusiones, asignación completa, envío individual, enlaces privados, consulta y reenvío; límites antiabuso, outbox, reintentos y limpieza tras 30 días.

**Cierre:** el flujo completo funciona con Supabase y Resend reales, los límites y reintentos están comprobados, y el proceso de limpieza está programado. Se establece un umbral de 400 correos diarios; se evalúa otra solución antes de acercarse al límite del proveedor y no se contratan servicios sin aprobación.

### Fase 3 — Grupos e intercambios con cuenta
**Estado:** implementada en código; migración, pruebas de base de datos y despliegue pendientes.

Alcance: creación y gestión de grupos, invitaciones, aceptación/rechazo, membresías, exclusiones, notificaciones persistentes y en tiempo real, sorteo manual, congelación de reglas, cancelación completa y resultados privados en app y correo.

**Cierre:** un grupo puede recorrer el ciclo completo desde la creación hasta los resultados; las reglas de mínimo de tres personas, exclusiones y cancelación se cumplen y ningún miembro puede consultar resultados ajenos.

### Fase 4 — Presupuesto y listas de regalos
**Estado:** implementada en código; privacidad de listas pendiente de validación PostgreSQL local.

Alcance: presupuestos mínimo/máximo en EUR y listas individuales de ideas y enlaces, visibles solo para quien regala.

**Cierre:** presupuesto y lista se muestran a los participantes autorizados, con pruebas que verifican que otros miembros no pueden consultar la lista privada.

### Fase 5 — Catálogo y recomendaciones externas
**Estado:** pospuesta; no bloquea el MVP ni su lanzamiento.

Solo se reabre si aparece una fuente autorizada, sin coste recurrente, compatible con España/EUR y con enlaces no monetizados. No se enviarán nombres ni correos a proveedores externos. Comparaloo no cumple la política actual; Comparor solo resulta pertinente para precios por EAN; eBay requiere resolver derechos de visualización/caché/enlaces y condiciones de acceso. No se añadirá IA que invente productos o precios.

### Fase 6 — Preparación y lanzamiento
**Estado:** pendiente de cierre.

Alcance: completar documentación legal y privacidad; decidir/implementar exportación y borrado de cuenta; verificar retención y borrados; probar asignaciones, RLS, accesos cruzados, correo, accesibilidad e idiomas; configurar monitorización, alertas, copias y entornos separados; y confirmar los requisitos de producción de Resend y Supabase.

**Cierre:** las pruebas de seguridad y flujos críticos pasan, los plazos y derechos de datos se informan claramente y la infraestructura de producción está verificada. Esta fase no depende de la Fase 5.

## Fuera del MVP
- Catálogo y recomendador de productos externos.
- Afiliación, comisiones, anuncios, patrocinios y funciones premium.
- Reserva o marcado de regalos como comprados, hasta validar que sea necesario.
- Servicios de pago sin aprobación expresa.
