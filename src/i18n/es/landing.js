// Copia de la página pública de presentación (src/views/general/LandingView.jsx).
// Las claves de features/roles/pasos se buscan por id — mantener los ids
// sincronizados con los arreglos declarados en la vista.
export default {
  nav: {
    features: 'Funciones',
    roles: 'Para quién es',
    workflow: 'Cómo funciona',
    tour: 'Día de partido',
    calendar: 'Calendario público',
    signIn: 'Iniciar sesión',
    menu: 'Menú',
  },

  hero: {
    badge: 'Hecho para el fútbol juvenil de EE. UU.',
    title: 'Dirige el club, no la hoja de cálculo.',
    subtitle:
      'Cantera Manager reúne el plantel, el calendario, el chat del equipo, los marcadores en vivo, las cuotas y los documentos en un solo lugar — desde el primer silbatazo de la temporada hasta la última línea de la contabilidad.',
    ctaPrimary: 'Entrar a tu club',
    ctaSecondary: 'Ver un calendario público',
    note: 'Funciona sin conexión · Se instala en tu pantalla de inicio · English & Español',
  },

  scoreboard: {
    label: 'La temporada de un vistazo',
    live: 'Ejemplo',
    balance: 'Saldo del equipo',
    collected: 'Cuotas cobradas',
    nextEvent: 'Próximo evento',
    nextEventValue: 'Sáb · 9:00 AM · Local',
    compliance: 'Plantel al día',
    playersUnit: '{{done}} de {{total}} jugadores',
    caption: 'Datos de ejemplo — tu club ve sus propios números.',
  },

  stats: {
    roles: { value: '8', label: 'niveles de permiso, del administrador del club al padre de familia' },
    languages: { value: '2', label: 'idiomas, que cada persona elige por su cuenta' },
    offline: { value: '0', label: 'barras de señal hacen falta para ver el plantel' },
    spreadsheets: { value: '1', label: 'solo lugar donde realmente vive el dinero' },
  },

  tour: {
    heading: 'Así se ve un sábado en Cantera',
    sub: 'Pantallas reales de la aplicación, en un teléfono, con datos de ejemplo.',
    home: {
      title: 'El próximo partido, a la vista',
      body: 'Hora, cancha, cómo llegar y lo que sigue — lo primero que ve cada familia.',
    },
    schedule: {
      title: 'Asistencia, llegada y uniforme',
      body: 'Las familias responden Va, Quizás o No puede, y saben a qué hora llegar y qué ponerse.',
    },
    live: {
      title: 'El marcador, en vivo desde la banda',
      body: 'El anotador toca la pantalla; los abuelos en casa ven cada gol, tarjeta y atajada al momento.',
    },
    chat: {
      title: 'Un chat para todo el equipo',
      body: 'Chats del equipo, de grupo y uno a uno, con mensajes sin leer — sin repartir números personales en un grupo de texto.',
    },
  },

  features: {
    heading: 'Todo lo que de verdad necesita un equipo de voluntarios',
    sub: 'Años de sábados por la mañana, cadenas de mensajes y recibos en una caja de zapatos — reemplazados por herramientas hechas justo para esto.',
    ledger: {
      title: 'Libro contable y conciliación',
      body: 'Cada dólar que entra y sale, categorizado y ligado a una cuenta. Importa el estado de cuenta, cuadra las líneas y cierra con un saldo que puedes defender en la junta de padres.',
    },
    budget: {
      title: 'Presupuestos que hacen las cuentas',
      body: 'Arma el presupuesto de la temporada una vez. Las cuotas por jugador, las exenciones y los saldos se recalculan solos, y el pronóstico aprende de tus temporadas anteriores.',
    },
    fundraising: {
      title: 'Recaudación y patrocinadores',
      body: 'Registra el cheque de un patrocinador y repártelo en cascada sobre los saldos de los jugadores o en partes iguales. Cada distribución es reversible y muestra su cálculo.',
    },
    schedule: {
      title: 'Lleva el calendario aquí, o sincronízalo',
      body: 'Crea partidos y entrenamientos que se repiten, con hora de llegada, uniforme y confirmación de asistencia — o conserva el feed de Ollie Sports, TeamSnap o Google Calendar. Tú decides si un cambio avisa al equipo.',
    },
    chat: {
      title: 'Chat del equipo',
      body: 'Un chat para cada equipo, más conversaciones privadas y de grupo, con mensajes sin leer en cada teléfono. Los administradores del equipo pueden ver todos los chats, y todos lo saben.',
    },
    live: {
      title: 'Marcador y estadísticas en vivo',
      body: 'Un anotador para la banda que funciona sin señal. Las familias siguen el marcador, el minuto a minuto y las estadísticas — con una celebración en cada gol.',
    },
    film: {
      title: 'Vídeos y jugadas destacadas',
      body: 'El informe y los clips de cada partido, privados para el equipo, junto a los resultados de la temporada en la pestaña de Estadísticas.',
    },
    matchups: {
      title: 'Amistosos sin cadena de mensajes',
      body: 'Guarda los contactos de los rivales, propone una fecha, confirma o reprograma, y comparte un enlace público de disponibilidad en vez de cuarenta respuestas.',
    },
    roster: {
      title: 'Plantel y cumplimiento',
      body: 'Jugadores, tutores, números de camiseta y categorías. Documentos con alertas de vencimiento, y permisos médicos generados en PDF en inglés o español.',
    },
    parents: {
      title: 'Un portal que los padres entienden',
      body: 'Los padres ven una sola cosa: a su hijo. Saldo, lo que se debe, cómo pagar y el horario del sábado. Sin códigos de invitación — los tutores se identifican por correo.',
    },
    evaluations: {
      title: 'Evaluaciones de jugadores',
      body: 'Califica la temporada con una rúbrica que tú controlas. Cada entrenador evalúa por separado y cada jugador se va con algo por escrito.',
    },
    insights: {
      title: 'Análisis que sirven para actuar',
      body: 'Tasa de cobro, tendencias de gastos y consumo del presupuesto — para enterarte en octubre de que las cuotas van atrasadas, no en mayo.',
    },
  },

  roles: {
    heading: 'Cada quien en la banda tiene su propia vista',
    sub: 'Los mismos datos, el mismo acceso. Lo que ves lo decide el trabajo que realmente haces.',
    manager: {
      title: 'Directivos y entrenadores',
      body: 'Todo el equipo en una pantalla: quién está en el plantel, quién está habilitado para jugar y qué hay esta semana.',
      p1: 'Plantel, camisetas y categorías',
      p2: 'Calendario, asistencia y chat del equipo',
      p3: 'Documentos y estado de cumplimiento',
    },
    treasurer: {
      title: 'Tesoreros',
      body: 'Claridad de hoja de cálculo con historial de auditoría, hecha para quien tiene que responder por la cifra.',
      p1: 'Libro contable, categorías y cuentas',
      p2: 'Importación de estados de cuenta y conciliación',
      p3: 'Presupuestos, exenciones y cálculo de cuotas',
    },
    parent: {
      title: 'Familias',
      body: 'Ábrelo camino a la cancha. Un toque para las únicas tres cosas que necesitabas saber.',
      p1: 'Tu saldo y lo que se debe',
      p2: 'Cómo pagar, con código QR',
      p3: 'El horario, el marcador en vivo y los formularios de tu hijo',
    },
  },

  workflow: {
    heading: 'Del primer silbatazo a la última línea de la contabilidad',
    step1: {
      title: 'Arma la temporada',
      body: 'Crea la temporada, importa el plantel desde un CSV y define cuotas y exenciones una sola vez.',
    },
    step2: {
      title: 'Arma el calendario',
      body: 'Créalo en la aplicación o pega el feed de tu liga. Las familias confirman asistencia y reciben la hora de llegada y el uniforme.',
    },
    step3: {
      title: 'Cobra y registra',
      body: 'Anota cuotas, cheques de patrocinadores y gastos del evento. Las familias lo ven en cuanto guardas.',
    },
    step4: {
      title: 'Cierra los libros',
      body: 'Importa el estado de cuenta, concilia y exporta la temporada como un registro limpio.',
    },
  },

  touchline: {
    heading: 'Hecho para la banda, no para la oficina',
    sub: 'En la cancha hay mala señal, traes las manos ocupadas y el partido empieza en cuatro minutos. Se diseñó para eso.',
    offline: {
      title: 'Primero sin conexión',
      body: 'El plantel y el calendario se siguen leyendo sin señal. Los cambios se encolan y se sincronizan al volver.',
    },
    install: {
      title: 'Se instala como una app',
      body: 'Agrégalo a la pantalla de inicio en iPhone o Android y recibe un aviso cuando algo te necesita.',
    },
    bilingual: {
      title: 'English & Español',
      body: 'Todas las pantallas y ambas plantillas de permiso médico están traducidas. Cada familia elige su idioma.',
    },
    secure: {
      title: 'Cerrado por rol',
      body: 'Los permisos se aplican en la base de datos, no solo se esconden en la pantalla. Una familia nunca puede ver el saldo de otra.',
    },
  },

  calendarCta: {
    title: '¿Vas a agendar un amistoso? Manda un enlace, no una cadena.',
    body: 'La disponibilidad de tu equipo, para compartir con cualquier entrenador — sin cuenta, sin sesión y sin revelar los detalles de los eventos.',
    button: 'Abrir el calendario público',
  },

  finalCta: {
    title: 'Saca a tu club de la hoja de cálculo.',
    body: 'Entra con la cuenta que te dio tu club, o crea una cuenta de familia para seguir a tu jugador.',
    primary: 'Iniciar sesión',
    secondary: 'Crear cuenta de familia',
  },

  footer: {
    tagline:
      'Operación de clubes de fútbol juvenil — plantel, calendario, chat, marcadores en vivo, dinero y cumplimiento en un solo lugar.',
    product: 'Producto',
    account: 'Cuenta',
    changelog: 'Novedades',
    rights: 'Todos los derechos reservados.',
  },
};
