# Remigo — proyecto y fases de desarrollo
Descripción del producto, su estado funcional y las fases previstas para su desarrollo.

## Proyecto
Remigo es una aplicación web bilingüe (español e inglés) para organizar sorteos de Amigo Invisible. El alcance contempla dos modalidades: sorteos sin cuenta y grupos privados con cuentas de usuario. El producto está orientado inicialmente a España y EUR.

El MVP será gratuito, sin anuncios, afiliación/comisiones, patrocinios ni funciones premium. Ko-fi voluntario es la única fuente de ingresos contemplada a futuro. El catálogo y las recomendaciones de productos externos están pospuestos; se mantienen las listas y enlaces añadidos por los propios usuarios.

## Estado actual
- Landing bilingüe con la marca Remigo.
- Registro, inicio y cierre de sesión mediante Supabase Auth con email y contraseña; la confirmación del correo depende de la configuración de Supabase.
- Sorteo invitado en `/guest-draw`, con fecha opcional, participantes con nombre y correo, exclusiones dirigidas y validación. Admite entre 2 y 50 participantes.
- Asignación en el backend: cada participante da y recibe una vez, nadie se asigna a sí mismo y se respetan las exclusiones. El sorteo se rechaza si no existe una asignación completa válida.
- Resultado privado en `/guest-result`, consultado mediante un token personal. El organizador no recibe la lista completa de asignaciones; cada participante puede pedir el reenvío de su correo.
- Funciones de backend para crear sorteos, consultar y reenviar resultados, reintentar correos pendientes y eliminar datos expirados. El límite operativo previsto es de 400 mensajes diarios para los sorteos invitados.
- La migración SQL configura RLS y contiene tablas fundacionales para grupos, membresías, invitaciones, exclusiones, asignaciones, ideas de regalo y notificaciones. Las tablas de grupos aún no tienen un flujo de interfaz.

## Arquitectura y funcionamiento
El frontend utiliza React, TypeScript, Vite, React Router y Tailwind CSS. La autenticación, la base de datos PostgreSQL y las funciones de servidor usan Supabase; las Edge Functions están escritas en TypeScript/Deno. Las traducciones y modelos compartidos se encuentran en `src/i18n/` y `src/models.ts`.

En el flujo invitado, `guest-draw` valida la solicitud, calcula y guarda una asignación válida y gestiona el envío del correo. Cada participante recibe un enlace privado; `guest-result` solo devuelve el resultado asociado a ese token y `guest-resend` permite reenviar el mensaje. Los datos se conservan hasta 30 días después de la fecha del evento o, si no hay fecha, 30 días después del sorteo. El outbox permite reintentar entregas; estas son de tipo “al menos una vez”, por lo que puede haber un correo duplicado si falla la confirmación posterior a la aceptación por Gmail.

Las rutas de la aplicación son `/`, `/register`, `/login`, `/guest-draw` y `/guest-result`. El código de autenticación actual usa email y contraseña; la decisión inicial del producto contemplaba también el acceso mediante magic link, por lo que ambos puntos aún deben alinearse.

## Fases de desarrollo

### Fase 0 — Validación y especificación
La especificación funcional y las decisiones de permisos, conservación, presupuesto e ingresos están documentadas. La comparación de fuentes para catálogos está cerrada para el MVP. En el roadmap siguen pendientes la validación cualitativa con uno o dos grupos y una prueba real de Gmail OAuth y entregabilidad.

### Fase 1 — Base backend segura
La aplicación ya dispone de Supabase Auth, migración SQL, políticas RLS y tipos compartidos. También existe el backend del sorteo invitado. La gestión autenticada de grupos, invitaciones, membresías y permisos asociados todavía no está implementada como funcionalidad de producto.

### Fase 2 — Sorteo invitado
El flujo sin cuenta está implementado en frontend y funciones de servidor: participantes, exclusiones, cálculo, resultados privados, reenvíos, límites y cola de correos. El comportamiento en producción depende de la configuración efectiva de Supabase y Gmail, así como de la programación de las funciones de reintento y limpieza.

### Fase 3 — Cuentas y grupos
Fase pendiente. Incluye creación y gestión de grupos, invitaciones por email con tokens de 14 días, aceptación o rechazo, reenvío de invitaciones con enlace nuevo y cambios de membresía. El sorteo requiere al menos tres miembros, se inicia manualmente y congela participantes y reglas. Antes del sorteo, cada miembro puede configurar su exclusión y quien organiza puede editar cualquiera; los cambios son visibles para el grupo. No se permiten reasignaciones parciales después de iniciar: cualquier cambio exige cancelar el sorteo completo y crear uno nuevo. Cada miembro ve solo su asignación en la app y por correo.

### Fase 4 — Presupuesto y listas de regalos
Fase pendiente. Contempla presupuesto mínimo y máximo en EUR e ideas de regalo por participante. La lista de cada persona solo será visible para quien tenga que hacerle el regalo. Reservar o marcar regalos como comprados queda para una iteración posterior si se valida su necesidad.

### Fase 5 — Catálogo y recomendaciones
Fase expresamente pospuesta y fuera del MVP aprobado. Solo se reconsiderará una fuente autorizada, sin coste recurrente, compatible con España/EUR y con enlaces no monetizados. No se compartirán nombres ni correos de participantes con un catálogo externo; no se contemplan afiliación ni comisiones.

### Fase 6 — Lanzamiento
Fase pendiente de cierre. Incluye pruebas de casos límite, RLS y accesos cruzados; accesibilidad y los dos idiomas; registros, alertas y copias de seguridad; revisión de proveedores; y documentación de privacidad y conservación. Los sorteos invitados se conservan 30 días según la fecha indicada. Para grupos autenticados, el plazo decidido es de 18 meses sin actividad de gestión; una visita pasiva no reinicia el plazo. La funcionalidad de exportación y borrado de cuenta también debe definirse o implementarse. El estado de despliegue, OAuth real y tareas programadas no puede confirmarse únicamente desde el código del repositorio.

## Decisiones de producto
- Español como idioma inicial e inglés disponible; lanzamiento orientado a España y precios en EUR.
- Sorteos invitados sin cuenta y grupos privados asociados a cuentas.
- Privacidad: cada participante accede solo a su resultado; quien organiza nunca recibe el mapa completo.
- Aplicación gratuita, sin anuncios, afiliación/comisiones, patrocinios ni nivel premium; Ko-fi voluntario como única fuente de ingresos futura.
- Sin catálogo ni recomendador externo en el MVP.
