with course_seed as (
  select *
  from (
    values
      (
        'industrial-automation-fundamentals',
        'Industrial Automation Fundamentals',
        'A beginner-friendly introduction to PLCs, signals, and ladder logic.',
        'Learn the basic building blocks of industrial automation: what PLCs do, how digital inputs and outputs work, and how ladder logic represents machine behavior.',
        'PLC Programming',
        'Beginner',
        0::numeric,
        1
      ),
      (
        'plc-programming-fundamentals',
        'PLC Programming Fundamentals',
        'Start writing and reading PLC logic with confidence.',
        'A structured path through PLC scan cycles, tags, rungs, timers, counters, and practical machine-control patterns.',
        'PLC Programming',
        'Beginner',
        0::numeric,
        2
      ),
      (
        'ladder-logic-for-machine-control',
        'Ladder Logic for Machine Control',
        'Build control sequences that match real machine behavior.',
        'Practice common ladder patterns for interlocks, latches, modes, alarms, and step-based automation.',
        'PLC Programming',
        'Intermediate',
        0::numeric,
        3
      ),
      (
        'plc-troubleshooting-field-signals',
        'PLC Troubleshooting: Field Signals',
        'Diagnose sensors, outputs, wiring, and logic from the PLC outward.',
        'Learn how to reason through digital inputs, outputs, forcing, status bits, and electrical field conditions.',
        'PLC Programming',
        'Intermediate',
        0::numeric,
        4
      ),
      (
        'hmi-and-plc-alarm-design',
        'HMI and PLC Alarm Design',
        'Design clear operator feedback and maintainable alarm logic.',
        'Connect PLC states to HMI messages, priorities, acknowledgements, and troubleshooting guidance.',
        'PLC Programming',
        'Intermediate',
        0::numeric,
        5
      ),
      (
        'advanced-plc-sequencing',
        'Advanced PLC Sequencing',
        'Structure larger automation routines without losing clarity.',
        'Explore reusable sequence patterns, state machines, fault recovery, and production-safe logic organization.',
        'PLC Programming',
        'Advanced',
        0::numeric,
        6
      ),
      (
        'robotics-cell-fundamentals',
        'Robotics Cell Fundamentals',
        'Understand robot cells, fixtures, safety, and production flow.',
        'A practical introduction to robot workcells, industrial layouts, tooling, guarding, and automation objectives.',
        'Robotics',
        'Beginner',
        0::numeric,
        1
      ),
      (
        'robot-motion-and-frames',
        'Robot Motion and Frames',
        'Learn positions, frames, paths, and motion behavior.',
        'Build intuition around joint motion, linear motion, user frames, tool frames, and path quality.',
        'Robotics',
        'Beginner',
        0::numeric,
        2
      ),
      (
        'robot-plc-handshaking',
        'Robot and PLC Handshaking',
        'Connect robot programs with machine control logic.',
        'Study the signals, states, permissions, and recovery logic used between robots and PLCs.',
        'Robotics',
        'Intermediate',
        0::numeric,
        3
      ),
      (
        'robot-safety-and-recovery',
        'Robot Safety and Recovery',
        'Handle stops, faults, and safe restart conditions.',
        'Learn how cell safety, teach modes, stop categories, and fault recovery shape reliable robotic systems.',
        'Robotics',
        'Intermediate',
        0::numeric,
        4
      ),
      (
        'robot-vision-inspection-basics',
        'Robot Vision Inspection Basics',
        'Use vision concepts for detection, guidance, and validation.',
        'An introduction to cameras, part detection, offsets, inspection decisions, and robot guidance workflows.',
        'Robotics',
        'Intermediate',
        0::numeric,
        5
      ),
      (
        'offline-robot-simulation',
        'Offline Robot Simulation',
        'Plan and validate robot cells before deployment.',
        'Learn the core workflow for building simulation studies, checking reach, timing paths, and reviewing layout risks.',
        'Robotics',
        'Advanced',
        0::numeric,
        6
      )
  ) as seed(
    slug,
    title,
    subtitle,
    description,
    category,
    difficulty_level,
    price,
    order_index
  )
),
course_upsert as (
  insert into public.academy_courses (
    slug,
    title,
    subtitle,
    description,
    category,
    difficulty_level,
    thumbnail_url,
    price,
    currency,
    status
  )
  select
    slug,
    title,
    subtitle,
    description,
    category,
    difficulty_level,
    null,
    price,
    'USD',
    'published'
  from course_seed
  on conflict (slug) do update
  set
    title = excluded.title,
    subtitle = excluded.subtitle,
    description = excluded.description,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    price = excluded.price,
    currency = excluded.currency,
    status = excluded.status
  returning id, slug
),
all_courses as (
  select c.id, c.slug, s.category
  from course_upsert c
  join course_seed s on s.slug = c.slug
),
module_upsert as (
  insert into public.academy_course_modules (
    course_id,
    title,
    description,
    order_index
  )
  select
    id,
    'Getting Started',
    'Core concepts and first practical steps for this course.',
    1
  from all_courses
  on conflict (course_id, title) do update
  set
    description = excluded.description,
    order_index = excluded.order_index
  returning id, course_id
),
module_pick as (
  select m.id, m.course_id
  from public.academy_course_modules m
  join all_courses c on c.id = m.course_id
  where m.title = 'Getting Started'
),
lesson_seed as (
  select *
  from (
    values
      (
        null,
        'overview',
        'Course Overview',
        'Understand what this course covers and how to approach the learning path.',
        'dQw4w9WgXcQ',
        180,
        1,
        true
      ),
      (
        null,
        'core-concepts',
        'Core Concepts',
        'Learn the core terms, patterns, and decisions behind this topic.',
        'ysz5S6PUM-U',
        360,
        2,
        false
      ),
      (
        null,
        'practice-lab',
        'Practice Lab',
        'Apply the topic with a practical scenario and review checklist.',
        'jNQXAC9IVRw',
        420,
        3,
        false
      ),
      (
        'industrial-automation-fundamentals',
        'what-is-industrial-automation',
        'What Is Industrial Automation?',
        'See how controllers, sensors, actuators, machines, and operators fit into one production system.',
        'dQw4w9WgXcQ',
        300,
        4,
        false
      ),
      (
        'industrial-automation-fundamentals',
        'plc-role-in-automation',
        'The PLC Role in Automation',
        'Understand why PLCs are used, what they control, and how they coordinate machine behavior.',
        'ysz5S6PUM-U',
        360,
        5,
        false
      ),
      (
        'industrial-automation-fundamentals',
        'digital-inputs-and-outputs',
        'Digital Inputs and Outputs',
        'Learn how push buttons, sensors, solenoids, lamps, and relays appear in automation logic.',
        'jNQXAC9IVRw',
        420,
        6,
        false
      ),
      (
        'industrial-automation-fundamentals',
        'analog-signals-basics',
        'Analog Signals Basics',
        'Build intuition around 4-20 mA, 0-10 V, scaling, and values that change continuously.',
        'dQw4w9WgXcQ',
        390,
        7,
        false
      ),
      (
        'industrial-automation-fundamentals',
        'ladder-logic-first-look',
        'First Look at Ladder Logic',
        'Read simple rungs and connect contacts, coils, and scan behavior to machine states.',
        'ysz5S6PUM-U',
        450,
        8,
        false
      ),
      (
        'industrial-automation-fundamentals',
        'hmi-operator-view',
        'The HMI Operator View',
        'Explore how operators use screens, status, commands, and alarms to run equipment.',
        'jNQXAC9IVRw',
        360,
        9,
        false
      ),
      (
        'industrial-automation-fundamentals',
        'automation-safety-and-next-steps',
        'Automation Safety and Next Steps',
        'Close the path with safety basics, troubleshooting mindset, and where to go after fundamentals.',
        'dQw4w9WgXcQ',
        480,
        10,
        false
      )
  ) as seed(course_slug, slug, title, description, video_id, duration_seconds, order_index, is_preview)
)
insert into public.academy_lessons (
  course_id,
  module_id,
  slug,
  title,
  description,
  lesson_type,
  video_provider,
  video_id,
  video_url,
  duration_seconds,
  order_index,
  is_preview,
  status
)
select
  module_pick.course_id,
  module_pick.id,
  lesson_seed.slug,
  lesson_seed.title,
  lesson_seed.description,
  'video',
  'youtube',
  lesson_seed.video_id,
  null,
  lesson_seed.duration_seconds,
  lesson_seed.order_index,
  lesson_seed.is_preview,
  'published'
from module_pick
join all_courses on all_courses.id = module_pick.course_id
join lesson_seed on lesson_seed.course_slug is null or lesson_seed.course_slug = all_courses.slug
on conflict (course_id, slug) do update
set
  module_id = excluded.module_id,
  title = excluded.title,
  description = excluded.description,
  lesson_type = excluded.lesson_type,
  video_provider = excluded.video_provider,
  video_id = excluded.video_id,
  video_url = excluded.video_url,
  duration_seconds = excluded.duration_seconds,
  order_index = excluded.order_index,
  is_preview = excluded.is_preview,
  status = excluded.status;

with course_translation_seed as (
  select *
  from (
    values
      (
        'industrial-automation-fundamentals',
        'es',
        U&'Fundamentos de automatizaci\00f3n industrial',
        U&'Una introducci\00f3n amigable para principiantes a PLCs, se\00f1ales y l\00f3gica ladder.',
        U&'Aprende los bloques b\00e1sicos de la automatizaci\00f3n industrial: qu\00e9 hacen los PLCs, c\00f3mo funcionan entradas y salidas digitales, y c\00f3mo la l\00f3gica ladder representa el comportamiento de una m\00e1quina.',
        U&'Programaci\00f3n PLC',
        'Principiante'
      ),
      (
        'plc-programming-fundamentals',
        'es',
        U&'Fundamentos de programaci\00f3n PLC',
        U&'Empieza a escribir y leer l\00f3gica PLC con confianza.',
        U&'Una ruta estructurada por ciclos de scan, tags, rungs, temporizadores, contadores y patrones pr\00e1cticos de control de m\00e1quinas.',
        U&'Programaci\00f3n PLC',
        'Principiante'
      ),
      (
        'ladder-logic-for-machine-control',
        'es',
        U&'L\00f3gica ladder para control de m\00e1quinas',
        U&'Construye secuencias de control que coincidan con el comportamiento real de una m\00e1quina.',
        U&'Practica patrones comunes de ladder para interlocks, latches, modos, alarmas y automatizaci\00f3n por pasos.',
        U&'Programaci\00f3n PLC',
        'Intermedio'
      ),
      (
        'plc-troubleshooting-field-signals',
        'es',
        U&'Diagn\00f3stico PLC: se\00f1ales de campo',
        U&'Diagnostica sensores, salidas, cableado y l\00f3gica desde el PLC hacia afuera.',
        U&'Aprende a razonar sobre entradas digitales, salidas, forzado, bits de estado y condiciones el\00e9ctricas de campo.',
        U&'Programaci\00f3n PLC',
        'Intermedio'
      ),
      (
        'hmi-and-plc-alarm-design',
        'es',
        U&'Dise\00f1o de alarmas HMI y PLC',
        U&'Dise\00f1a retroalimentaci\00f3n clara para operadores y l\00f3gica de alarmas mantenible.',
        U&'Conecta estados del PLC con mensajes HMI, prioridades, reconocimientos y gu\00edas de diagn\00f3stico.',
        U&'Programaci\00f3n PLC',
        'Intermedio'
      ),
      (
        'advanced-plc-sequencing',
        'es',
        U&'Secuenciaci\00f3n PLC avanzada',
        U&'Estructura rutinas de automatizaci\00f3n m\00e1s grandes sin perder claridad.',
        U&'Explora patrones reutilizables de secuencia, m\00e1quinas de estado, recuperaci\00f3n de fallas y organizaci\00f3n de l\00f3gica segura para producci\00f3n.',
        U&'Programaci\00f3n PLC',
        'Avanzado'
      ),
      (
        'robotics-cell-fundamentals',
        'es',
        U&'Fundamentos de celdas rob\00f3ticas',
        U&'Entiende celdas rob\00f3ticas, herramentales, seguridad y flujo de producci\00f3n.',
        U&'Una introducci\00f3n pr\00e1ctica a workcells, layouts industriales, tooling, guardas y objetivos de automatizaci\00f3n.',
        U&'Rob\00f3tica',
        'Principiante'
      ),
      (
        'robot-motion-and-frames',
        'es',
        'Movimiento y frames de robot',
        'Aprende posiciones, frames, trayectorias y comportamiento de movimiento.',
        U&'Desarrolla intuici\00f3n sobre movimiento articular, movimiento lineal, user frames, tool frames y calidad de trayectoria.',
        U&'Rob\00f3tica',
        'Principiante'
      ),
      (
        'robot-plc-handshaking',
        'es',
        'Handshaking entre robot y PLC',
        U&'Conecta programas de robot con l\00f3gica de control de m\00e1quinas.',
        U&'Estudia se\00f1ales, estados, permisos y recuperaci\00f3n usados entre robots y PLCs.',
        U&'Rob\00f3tica',
        'Intermedio'
      ),
      (
        'robot-safety-and-recovery',
        'es',
        U&'Seguridad y recuperaci\00f3n de robots',
        'Maneja paros, fallas y condiciones de reinicio seguro.',
        U&'Aprende c\00f3mo seguridad de celda, modos teach, categor\00edas de paro y recuperaci\00f3n de fallas forman sistemas rob\00f3ticos confiables.',
        U&'Rob\00f3tica',
        'Intermedio'
      ),
      (
        'robot-vision-inspection-basics',
        'es',
        U&'Bases de inspecci\00f3n con visi\00f3n rob\00f3tica',
        U&'Usa conceptos de visi\00f3n para detecci\00f3n, gu\00eda y validaci\00f3n.',
        U&'Introducci\00f3n a c\00e1maras, detecci\00f3n de piezas, offsets, decisiones de inspecci\00f3n y flujos de gu\00eda rob\00f3tica.',
        U&'Rob\00f3tica',
        'Intermedio'
      ),
      (
        'offline-robot-simulation',
        'es',
        U&'Simulaci\00f3n rob\00f3tica offline',
        U&'Planea y valida celdas rob\00f3ticas antes del despliegue.',
        U&'Aprende el flujo base para construir estudios de simulaci\00f3n, revisar alcance, tiempos de trayectoria y riesgos de layout.',
        U&'Rob\00f3tica',
        'Avanzado'
      ),
      (
        'industrial-automation-fundamentals',
        'zh',
        U&'工业自动化基础',
        U&'面向初学者的 PLC、信号和梯形图逻辑入门。',
        U&'学习工业自动化的基本组成：PLC 的作用、数字输入输出的工作方式，以及梯形图逻辑如何表示机器行为。',
        U&'PLC 编程',
        U&'初级'
      ),
      (
        'plc-programming-fundamentals',
        'zh',
        U&'PLC 编程基础',
        U&'自信地开始编写和阅读 PLC 逻辑。',
        U&'按结构学习 PLC 扫描周期、标签、梯级、定时器、计数器和实用的机器控制模式。',
        U&'PLC 编程',
        U&'初级'
      ),
      (
        'ladder-logic-for-machine-control',
        'zh',
        U&'面向机器控制的梯形图逻辑',
        U&'构建符合真实机器行为的控制序列。',
        U&'练习互锁、保持、模式、报警和步进式自动化的常见梯形图模式。',
        U&'PLC 编程',
        U&'中级'
      ),
      (
        'plc-troubleshooting-field-signals',
        'zh',
        U&'PLC 故障排查：现场信号',
        U&'从 PLC 向外诊断传感器、输出、接线和逻辑。',
        U&'学习如何分析数字输入、输出、强制、状态位和现场电气条件。',
        U&'PLC 编程',
        U&'中级'
      ),
      (
        'hmi-and-plc-alarm-design',
        'zh',
        U&'HMI 与 PLC 报警设计',
        U&'设计清晰的操作员反馈和可维护的报警逻辑。',
        U&'将 PLC 状态连接到 HMI 消息、优先级、确认和故障排查指导。',
        U&'PLC 编程',
        U&'中级'
      ),
      (
        'advanced-plc-sequencing',
        'zh',
        U&'高级 PLC 顺序控制',
        U&'在不失清晰度的情况下组织更大的自动化程序。',
        U&'探索可复用的顺序模式、状态机、故障恢复和面向生产安全的逻辑组织。',
        U&'PLC 编程',
        U&'高级'
      ),
      (
        'robotics-cell-fundamentals',
        'zh',
        U&'机器人单元基础',
        U&'理解机器人单元、工装、安全和生产流程。',
        U&'机器人工作站、工业布局、工具、护栏和自动化目标的实践入门。',
        U&'机器人',
        U&'初级'
      ),
      (
        'robot-motion-and-frames',
        'zh',
        U&'机器人运动与坐标系',
        U&'学习位置、坐标系、路径和运动行为。',
        U&'建立对关节运动、直线运动、用户坐标系、工具坐标系和路径质量的直觉。',
        U&'机器人',
        U&'初级'
      ),
      (
        'robot-plc-handshaking',
        'zh',
        U&'机器人与 PLC 握手',
        U&'将机器人程序与机器控制逻辑连接起来。',
        U&'学习机器人与 PLC 之间使用的信号、状态、许可和恢复逻辑。',
        U&'机器人',
        U&'中级'
      ),
      (
        'robot-safety-and-recovery',
        'zh',
        U&'机器人安全与恢复',
        U&'处理停机、故障和安全重启条件。',
        U&'学习单元安全、示教模式、停止类别和故障恢复如何塑造可靠的机器人系统。',
        U&'机器人',
        U&'中级'
      ),
      (
        'robot-vision-inspection-basics',
        'zh',
        U&'机器人视觉检测基础',
        U&'使用视觉概念进行检测、引导和验证。',
        U&'摄像头、零件检测、偏移、检测决策和机器人引导流程的入门。',
        U&'机器人',
        U&'中级'
      ),
      (
        'offline-robot-simulation',
        'zh',
        U&'离线机器人仿真',
        U&'在部署前规划和验证机器人单元。',
        U&'学习建立仿真研究、检查可达性、路径时间和布局风险的核心流程。',
        U&'机器人',
        U&'高级'
      )
  ) as seed(course_slug, language_code, title, subtitle, description, category, difficulty_level)
)
insert into public.academy_course_translations (
  course_id,
  language_code,
  title,
  subtitle,
  description,
  category,
  difficulty_level
)
select
  c.id,
  seed.language_code,
  seed.title,
  seed.subtitle,
  seed.description,
  seed.category,
  seed.difficulty_level
from course_translation_seed seed
join public.academy_courses c on c.slug = seed.course_slug
on conflict (course_id, language_code) do update
set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description = excluded.description,
  category = excluded.category,
  difficulty_level = excluded.difficulty_level;

with module_translation_seed as (
  select *
  from (
    values
      ('Getting Started', 'es', 'Primeros pasos', U&'Conceptos principales y primeros pasos pr\00e1cticos para este curso.'),
      ('Getting Started', 'zh', U&'入门', U&'本课程的核心概念和第一步实践。')
  ) as seed(module_title, language_code, title, description)
)
insert into public.academy_module_translations (
  module_id,
  language_code,
  title,
  description
)
select
  m.id,
  seed.language_code,
  seed.title,
  seed.description
from module_translation_seed seed
join public.academy_course_modules m on m.title = seed.module_title
join public.academy_courses c on c.id = m.course_id
where c.status = 'published'
on conflict (module_id, language_code) do update
set
  title = excluded.title,
  description = excluded.description;

with lesson_translation_seed as (
  select *
  from (
    values
      ('overview', 'es', 'Resumen del curso', U&'Entiende qu\00e9 cubre este curso y c\00f3mo abordar la ruta de aprendizaje.'),
      ('core-concepts', 'es', 'Conceptos principales', U&'Aprende los t\00e9rminos, patrones y decisiones principales detr\00e1s de este tema.'),
      ('practice-lab', 'es', U&'Laboratorio pr\00e1ctico', U&'Aplica el tema con un escenario pr\00e1ctico y una lista de revisi\00f3n.'),
      ('what-is-industrial-automation', 'es', U&'\00bfQu\00e9 es la automatizaci\00f3n industrial?', U&'Ve c\00f3mo controladores, sensores, actuadores, m\00e1quinas y operadores encajan en un sistema de producci\00f3n.'),
      ('plc-role-in-automation', 'es', U&'El rol del PLC en automatizaci\00f3n', U&'Entiende por qu\00e9 se usan PLCs, qu\00e9 controlan y c\00f3mo coordinan el comportamiento de una m\00e1quina.'),
      ('digital-inputs-and-outputs', 'es', 'Entradas y salidas digitales', U&'Aprende c\00f3mo botones, sensores, solenoides, l\00e1mparas y relevadores aparecen en la l\00f3gica de automatizaci\00f3n.'),
      ('analog-signals-basics', 'es', U&'Bases de se\00f1ales anal\00f3gicas', U&'Construye intuici\00f3n sobre 4-20 mA, 0-10 V, escalamiento y valores que cambian continuamente.'),
      ('ladder-logic-first-look', 'es', U&'Primer vistazo a l\00f3gica ladder', U&'Lee rungs simples y conecta contactos, bobinas y scan con estados de m\00e1quina.'),
      ('hmi-operator-view', 'es', 'Vista HMI del operador', U&'Explora c\00f3mo los operadores usan pantallas, estados, comandos y alarmas para operar equipo.'),
      ('automation-safety-and-next-steps', 'es', U&'Seguridad de automatizaci\00f3n y siguientes pasos', U&'Cierra la ruta con bases de seguridad, mentalidad de diagn\00f3stico y pr\00f3ximos pasos despu\00e9s de fundamentos.'),
      ('overview', 'zh', U&'课程概览', U&'了解本课程涵盖的内容，以及如何学习这条路径。'),
      ('core-concepts', 'zh', U&'核心概念', U&'学习该主题背后的核心术语、模式和决策。'),
      ('practice-lab', 'zh', U&'实践练习', U&'通过实践场景和检查清单应用本主题。'),
      ('what-is-industrial-automation', 'zh', U&'什么是工业自动化？', U&'了解控制器、传感器、执行器、机器和操作员如何组成一个生产系统。'),
      ('plc-role-in-automation', 'zh', U&'PLC 在自动化中的作用', U&'理解为什么使用 PLC、它控制什么，以及如何协调机器行为。'),
      ('digital-inputs-and-outputs', 'zh', U&'数字输入和输出', U&'学习按钮、传感器、电磁阀、指示灯和继电器如何出现在自动化逻辑中。'),
      ('analog-signals-basics', 'zh', U&'模拟信号基础', U&'建立对 4-20 mA、0-10 V、缩放和连续变化数值的直觉。'),
      ('ladder-logic-first-look', 'zh', U&'梯形图逻辑初识', U&'阅读简单梯级，并把触点、线圈和扫描行为与机器状态联系起来。'),
      ('hmi-operator-view', 'zh', U&'操作员 HMI 视图', U&'探索操作员如何使用画面、状态、命令和报警来运行设备。'),
      ('automation-safety-and-next-steps', 'zh', U&'自动化安全与下一步', U&'以安全基础、故障排查思维和后续学习方向完成这条路径。')
  ) as seed(lesson_slug, language_code, title, description)
)
insert into public.academy_lesson_translations (
  lesson_id,
  language_code,
  title,
  description
)
select
  l.id,
  seed.language_code,
  seed.title,
  seed.description
from lesson_translation_seed seed
join public.academy_lessons l on l.slug = seed.lesson_slug
on conflict (lesson_id, language_code) do update
set
  title = excluded.title,
  description = excluded.description;
