import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  ArrowLeft,
  Blocks,
  Cable,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Check,
  CircuitBoard,
  Cloud,
  Code2,
  Cpu,
  Database,
  Factory,
  FileUp,
  GitBranch,
  Gauge,
  GraduationCap,
  Languages,
  LockKeyhole,
  LogIn,
  Mail,
  Menu,
  Network,
  RadioTower,
  Rocket,
  ServerCog,
  ShieldCheck,
  Star,
  TerminalSquare,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import { AcademyCatalogPage, AcademyCertificatesPage, AcademyCoursePage, AcademyHomePage, AcademyLessonPage, AcademyProgressPage, AcademyTrackPage } from './pages/AcademyPages';
import './styles.css';

type BusinessLine = {
  title: string;
  eyebrow: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  points: string[];
  slug: string;
  detail: string;
};

type Solution = {
  title: string;
  tags: Array<{
    name: string;
    color: string;
    tileColor?: string;
    tileSize?: 'square' | 'wide';
    logoWidth?: string;
    logoMaxHeight?: string;
    logoSlug?: string;
    logoSrc?: string;
  }>;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
};

type GatewayFeature = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
};

type ProcessStep = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
};

type ServiceShowcaseItem = {
  title: string;
  eyebrow: string;
  description: string;
  image: string;
};

type LanguageCode = 'en' | 'es' | 'zh';

type Translator = (text: string) => string;

type SubscriptionTier = 'Explorer' | 'Professional' | 'Enterprise';

type UserProfile = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  role: string | null;
  subscription_tier: SubscriptionTier;
  created_at?: string;
  updated_at?: string | null;
};

type AppUser = {
  id: string;
  email: string;
  name: string;
  company?: string;
  subscription: SubscriptionTier;
  avatarUrl?: string;
};

function getProfileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  return initials || 'Y';
}

function getSubscriptionClass(subscription: SubscriptionTier) {
  return `subscription-pill subscription-${subscription.toLowerCase()}`;
}

function profileToAppUser(user: User, profile: UserProfile | null): AppUser {
  const fullName = profile?.full_name?.trim()
    || String(user.user_metadata?.full_name ?? '').trim()
    || user.email?.split('@')[0]
    || 'YVIMO User';

  return {
    id: user.id,
    email: user.email ?? '',
    name: fullName,
    company: profile?.company_name ?? undefined,
    subscription: profile?.subscription_tier ?? 'Explorer',
    avatarUrl: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined,
  };
}

function UserAvatar({ user, className }: { user: AppUser; className: string }) {
  return user.avatarUrl ? (
    <img className={className} src={user.avatarUrl} alt="" aria-hidden="true" />
  ) : (
    <span className={className} aria-hidden="true">
      {getProfileInitials(user.name)}
    </span>
  );
}

type BillingPeriod = 'monthly' | 'three_months' | 'six_months' | 'annual';

type CheckoutPlan = {
  product_key: string;
  plan_key: string;
  billing_period: BillingPeriod;
  price_display: string;
  price_id: string | null;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timeout));
  });
}

function getAuthMessageTone(message: string) {
  const normalized = message.toLowerCase();
  const isPositive = normalized.includes('created')
    || normalized.includes('redirecting')
    || normalized.includes('check your email');

  return isPositive ? 'auth-form-message success' : 'auth-form-message error';
}

const languages: Array<{
  code: LanguageCode;
  label: string;
  flagClass: string;
}> = [
  { code: 'en', label: 'English', flagClass: 'flag-us' },
  { code: 'es', label: 'Español', flagClass: 'flag-mx' },
  { code: 'zh', label: '简体中文', flagClass: 'flag-cn' },
];

const translations: Record<Exclude<LanguageCode, 'en'>, Record<string, string>> = {
  es: {
    'Engineering Automation': 'Ingeniería de automatización',
    'that': 'que',
    'delivers results': 'entrega resultados',
    Services: 'Servicios',
    Gateway: 'Gateway',
    Solutions: 'Soluciones',
    Platform: 'Plataforma',
    'Sign in': 'Iniciar sesión',
    'Open sign in': 'Abrir inicio de sesión',
    'Sign up': 'Registrarse',
    'Create account': 'Crear cuenta',
    'Create your YVIMO account': 'Crea tu cuenta YVIMO',
    'Already have an account?': '¿Ya tienes una cuenta?',
    'Continue with Apple Passkey': 'Continuar con Apple Passkey',
    'Full name': 'Nombre completo',
    Company: 'Empresa',
    Dashboard: 'Dashboard',
    Workspace: 'Espacio de trabajo',
    'YVIMO PORTAL': 'PORTAL YVIMO',
    'Workspace overview': 'Resumen del workspace',
    'Your YVIMO tools, licenses, and learning access in one place.':
      'Tus herramientas YVIMO, licencias y acceso de aprendizaje en un solo lugar.',
    'Welcome back': 'Bienvenido de nuevo',
    'Your YVIMO workspace is ready.': 'Tu espacio YVIMO está listo.',
    'Gateway Online': 'Gateway Online',
    'Design, simulate, and prepare industrial connectivity flows using virtual devices, labs, and Gateway tools.':
      'Diseña, simula y prepara flujos de conectividad industrial usando dispositivos virtuales, laboratorios y herramientas Gateway.',
    'Engineering Tools': 'Herramientas de ingeniería',
    'Licenses': 'Licencias',
    'Orders': 'Órdenes',
    'Quotations': 'Cotizaciones',
    'Academy': 'Academy',
    'Settings': 'Configuración',
    'Sign out': 'Cerrar sesión',
    'Account created. Redirecting to dashboard.': 'Cuenta creada. Redirigiendo al dashboard.',
    'Account created. Check your email to confirm your account.':
      'Cuenta creada. Revisa tu correo para confirmar tu cuenta.',
    'Signed in. Redirecting to dashboard.': 'Sesión iniciada. Redirigiendo al dashboard.',
    'This email is already registered.': 'Este correo ya está registrado.',
    'Invalid email or password.': 'Correo o contraseña inválidos.',
    'Apple account ready. Redirecting to dashboard.': 'Cuenta Apple lista. Redirigiendo al dashboard.',
    'Create a first project, manage access, or review platform modules from the navigation.':
      'Crea un primer proyecto, administra accesos o revisa módulos de plataforma desde la navegación.',
    'Open connected Gateway tools, demos, downloads, and project modules.':
      'Abre herramientas conectadas de Gateway, demos, descargas y módulos de proyecto.',
    'Free access to try YVIMO Academy, explore the platform, and start selected courses before upgrading.':
      'Acceso gratis para probar YVIMO Academy, explorar la plataforma y comenzar cursos seleccionados antes de mejorar tu plan.',
    'Continue courses, guided paths, progress, and professional learning.':
      'Continúa cursos, rutas guiadas, progreso y aprendizaje profesional.',
    'Access templates, calculators, quotation tools, network utilities, and controls resources for real industrial automation projects.':
      'Accede a plantillas, calculadoras, herramientas de cotización, utilidades de red y recursos de control para proyectos reales de automatización industrial.',
    'Review product seats, activations, renewals, and account entitlements.':
      'Revisa puestos de producto, activaciones, renovaciones y permisos de cuenta.',
    'Track quotations, purchase requests, project orders, and follow-up.':
      'Da seguimiento a cotizaciones, solicitudes de compra, órdenes de proyecto y seguimiento.',
    'YVIMO Points': 'Puntos YVIMO',
    'Current Plan': 'Plan actual',
    'Upgrade to this Plan': 'Subir a este plan',
    'Choose your YVIMO membership': 'Elige tu membresía YVIMO',
    'Go to Dashboard': 'Ir al dashboard',
    'Loading workspace...': 'Cargando espacio de trabajo...',
    'Loading dashboard...': 'Cargando dashboard...',
    'Access your YVIMO workspace': 'Accede a tu espacio YVIMO',
    'Sign in to manage Gateway online access, licenses, learning, orders, and quotations as the platform grows.':
      'Inicia sesión para administrar acceso online a Gateway, licencias, aprendizaje, órdenes y cotizaciones conforme crece la plataforma.',
    'Create an account to start using YVIMO platform services as they become available.':
      'Crea una cuenta para comenzar a usar los servicios de la plataforma YVIMO conforme estén disponibles.',
    'Email address': 'Correo electrónico',
    Password: 'Contraseña',
    'Remember me': 'Recordarme',
    'Forgot password?': '¿Olvidaste tu contraseña?',
    'Continue': 'Continuar',
    'Platform preview': 'Vista previa de plataforma',
    'Gateway Online Access': 'Acceso online a Gateway',
    'Use Gateway demos, downloads, connected services, and future web tools from one account.':
      'Usa demos de Gateway, descargas, servicios conectados y futuras herramientas web desde una sola cuenta.',
    'Licensing': 'Licenciamiento',
    'Manage product seats, activations, renewals, and customer entitlements.':
      'Administra puestos de producto, activaciones, renovaciones y permisos de cliente.',
    'Access training, professional guidance, and industrial learning resources.':
      'Accede a capacitación, guía profesional y recursos de aprendizaje industrial.',
    'Orders and Quotation Management': 'Gestión de órdenes y cotizaciones',
    'Track quotations, purchase requests, project orders, and commercial follow-up.':
      'Da seguimiento a cotizaciones, solicitudes de compra, órdenes de proyecto y seguimiento comercial.',
    'Start a project': 'Iniciar un proyecto',
    'Select language': 'Seleccionar idioma',
    'Open navigation': 'Abrir navegación',
    'Close navigation': 'Cerrar navegación',
    'Industrial automation, software services, and connected products':
      'Automatización industrial, servicios de software y productos conectados',
    'Automation systems built beyond the machine.':
      'Sistemas de automatización construidos más allá de la máquina.',
    'We build control systems, industrial software, and connected products that help manufacturers modernize machines, move data reliably, and turn operations into scalable digital systems.':
      'Construimos sistemas de control, software industrial y productos conectados que ayudan a fabricantes a modernizar máquinas, mover datos de forma confiable y convertir operaciones en sistemas digitales escalables.',
    'Explore our solutions': 'Explorar nuestras soluciones',
    'Our services': 'Nuestros servicios',
    'Services for connected manufacturing.': 'Servicios para manufactura conectada.',
    'From controls and software to virtual commissioning, process optimization, manufacturing, and IT/OT integration.':
      'Desde controles y software hasta comisionamiento virtual, optimización de procesos, manufactura e integración IT/OT.',
    'Business lines': 'Líneas de negocio',
    'The four divisions that move YVIMO forward.':
      'Las cuatro divisiones que impulsan a YVIMO.',
    'Industrial automation remains our core. Around it, YVIMO grows through software services, proprietary products, and YVIMO Academy: our learning space for the next generation of industrial talent.':
      'La automatización industrial sigue siendo nuestro núcleo. Alrededor de ella, YVIMO crece mediante servicios de software, productos propios y YVIMO Academy: nuestro espacio de aprendizaje para la siguiente generación de talento industrial.',
    'Compatible & flexible': 'Compatible y flexible',
    'Built to work with the technologies you already use.':
      'Diseñado para trabajar con las tecnologías que ya usas.',
    'YVIMO integrates controls, robotics, software, and data systems across modern industrial environments.':
      'YVIMO integra controles, robótica, software y sistemas de datos en entornos industriales modernos.',
    'How we work': 'Cómo trabajamos',
    'A clear path from concept to working system.':
      'Un camino claro desde el concepto hasta un sistema funcionando.',
    'YVIMO combines industrial experience, software development, and commissioning discipline to move projects from technical need to real operation.':
      'YVIMO combina experiencia industrial, desarrollo de software y disciplina de puesta en marcha para llevar proyectos desde una necesidad técnica hasta la operación real.',
    Result: 'Resultado',
    'A working automation, software, or integration system ready for real operations.':
      'Un sistema de automatización, software o integración funcionando y listo para operaciones reales.',
    'Tell us what you want to connect, automate, or improve.':
      'Cuéntanos qué quieres conectar, automatizar o mejorar.',
    'Share the machine, process, data flow, or operational challenge you have in mind. YVIMO can help define the right path-from controls and software to integration, validation, and deployment.':
      'Comparte la máquina, proceso, flujo de datos o reto operativo que tienes en mente. YVIMO puede ayudar a definir el camino correcto: desde controles y software hasta integración, validación y despliegue.',
    'Explore YVIMO Gateway': 'Explorar YVIMO Gateway',
    'Project input': 'Entrada del proyecto',
    Ready: 'Listo',
    'Machine / process': 'Máquina / proceso',
    'Data / automation need': 'Necesidad de datos / automatización',
    'Expected output': 'Resultado esperado',
    'Working system': 'Sistema funcionando',
    'Featured product': 'Producto destacado',
    'The industrial data layer for turning PLCs, edge devices, and shop-floor tags into clean routes, APIs, dashboards, and outputs.':
      'La capa de datos industriales para convertir PLCs, dispositivos edge y tags de planta en rutas, APIs, dashboards y salidas limpias.',
    'Try Online Demo': 'Probar demo online',
    Discover: 'Descubrir',
    Architect: 'Arquitectar',
    Build: 'Construir',
    Validate: 'Validar',
    'Deploy & Support': 'Desplegar y soportar',
    'We understand the machine, process, data, pain points, and business objective.':
      'Entendemos la máquina, el proceso, los datos, los puntos de dolor y el objetivo de negocio.',
    'We define the controls, software, data flow, hardware, interfaces, and deployment strategy.':
      'Definimos controles, software, flujo de datos, hardware, interfaces y estrategia de despliegue.',
    'We develop the PLC logic, applications, dashboards, integrations, or connected product features.':
      'Desarrollamos lógica PLC, aplicaciones, dashboards, integraciones o funciones de producto conectado.',
    'We test the system through simulation, offline checks, FAT-style reviews, and controlled startup.':
      'Probamos el sistema mediante simulación, revisiones offline, validaciones tipo FAT y arranque controlado.',
    'We commission, train, support, and improve the solution under real production conditions.':
      'Comisionamos, capacitamos, damos soporte y mejoramos la solución bajo condiciones reales de producción.',
    'Controls & PLCs': 'Controles y PLCs',
    'Robotics & Motion': 'Robótica y movimiento',
    'Software Engineering': 'Ingeniería de software',
    'IT/OT & Cloud': 'IT/OT y nube',
    'PLC programming, machine control, field devices, industrial networks, and troubleshooting.':
      'Programación PLC, control de máquinas, dispositivos de campo, redes industriales y diagnóstico.',
    'Robot cells, motion systems, safety integration, simulation, and commissioning.':
      'Celdas robóticas, sistemas de movimiento, integración de seguridad, simulación y comisionamiento.',
    'Web apps, mobile tools, APIs, dashboards, and industrial software platforms.':
      'Apps web, herramientas móviles, APIs, dashboards y plataformas de software industrial.',
    'Secure data routing from machines to databases, cloud systems, and reports.':
      'Ruteo seguro de datos desde máquinas hacia bases de datos, sistemas cloud y reportes.',
    Controls: 'Controles',
    Software: 'Software',
    Products: 'Productos',
    'Virtual Commissioning': 'Comisionamiento virtual',
    'Industrial Engineering': 'Ingeniería industrial',
    Manufacturing: 'Manufactura',
    'IT/OT Integration': 'Integración IT/OT',
    'Digital Manufacturing': 'Manufactura digital',
    'PLC, HMI, SCADA, commissioning, troubleshooting, and plant-floor integration.':
      'PLC, HMI, SCADA, comisionamiento, diagnóstico e integración en planta.',
    'Modern web applications, backend APIs, dashboards, data workflows, and internal platforms.':
      'Aplicaciones web modernas, APIs backend, dashboards, flujos de datos y plataformas internas.',
    'YVIMO Gateway, account services, licensing, and tools for connected operations.':
      'YVIMO Gateway, servicios de cuentas, licenciamiento y herramientas para operaciones conectadas.',
    'Digital manufacturing cells, robot simulations, layout validation, and offline verification.':
      'Celdas de manufactura digital, simulaciones robóticas, validación de layouts y verificación offline.',
    'Process optimization, cycle-time analysis, material flow, bottleneck studies, and improvement roadmaps.':
      'Optimización de procesos, análisis de ciclo, flujo de materiales, estudios de cuellos de botella y planes de mejora.',
    'Production systems, robotic cells, fixtures, line support, and launch-ready execution.':
      'Sistemas de producción, celdas robóticas, herramentales, soporte de línea y ejecución para arranque.',
    'Connect PLCs, edge devices, APIs, databases, MQTT, cloud services, and reporting layers.':
      'Conecta PLCs, dispositivos edge, APIs, bases de datos, MQTT, servicios cloud y capas de reporte.',
    'Tecnomatix, DELMIA, simulation models, line studies, and connected engineering workflows.':
      'Tecnomatix, DELMIA, modelos de simulación, estudios de línea y flujos de ingeniería conectados.',
    'Industrial Automation': 'Automatización industrial',
    'Software Services': 'Servicios de software',
    'YVIMO Products': 'Productos YVIMO',
    'YVIMO Academy': 'YVIMO Academy',
    'Controls and field systems': 'Controles y sistemas de campo',
    'Apps, APIs, and data systems': 'Apps, APIs y sistemas de datos',
    'Physical and digital proprietary products': 'Productos físicos y digitales propios',
    'Online academy and professional guidance': 'Academia online y guía profesional',
    'PLC and HMI engineering': 'Ingeniería PLC y HMI',
    'Machine integration': 'Integración de máquinas',
    'Commissioning and support': 'Comisionamiento y soporte',
    'Web applications': 'Aplicaciones web',
    'Backend APIs': 'APIs backend',
    'Operational dashboards': 'Dashboards operativos',
    'YVIMO Gateway': 'YVIMO Gateway',
    'Industrial tools': 'Herramientas industriales',
    'Digital platforms': 'Plataformas digitales',
    'Automation training': 'Capacitación en automatización',
    'Mentoring and reviews': 'Mentoría y revisiones',
    'Industry updates': 'Actualizaciones de la industria',
    'PLC and edge drivers': 'Drivers PLC y edge',
    'TIA tag import': 'Importación de tags TIA',
    'Flow Builder logic': 'Lógica Flow Builder',
    'Runtime outputs': 'Salidas runtime',
  },
  zh: {
    'Engineering Automation': '自动化工程',
    'that': '交付',
    'delivers results': '真实成果',
    Services: '服务',
    Gateway: 'Gateway',
    Solutions: '解决方案',
    Platform: '平台',
    'Sign in': '登录',
    'Open sign in': '打开登录',
    'Sign up': '注册',
    'Create account': '创建账户',
    'Create your YVIMO account': '创建你的 YVIMO 账户',
    'Already have an account?': '已经有账户？',
    'Continue with Apple Passkey': '使用 Apple Passkey 继续',
    'Full name': '全名',
    Company: '公司',
    Dashboard: '仪表板',
    Workspace: '工作区',
    'YVIMO PORTAL': 'YVIMO 门户',
    'Workspace overview': '工作区概览',
    'Your YVIMO tools, licenses, and learning access in one place.':
      '你的 YVIMO 工具、许可证和学习访问集中在一处。',
    'Welcome back': '欢迎回来',
    'Your YVIMO workspace is ready.': '你的 YVIMO 工作区已准备就绪。',
    'Gateway Online': 'Gateway 在线',
    'Design, simulate, and prepare industrial connectivity flows using virtual devices, labs, and Gateway tools.':
      '使用虚拟设备、实验室和 Gateway 工具设计、模拟并准备工业连接流程。',
    'Engineering Tools': '工程工具',
    'Licenses': '许可证',
    'Orders': '订单',
    'Quotations': '报价',
    'Academy': '学院',
    'Settings': '设置',
    'Sign out': '退出登录',
    'Account created. Redirecting to dashboard.': '账户已创建，正在跳转到仪表板。',
    'Account created. Check your email to confirm your account.':
      '账户已创建。请检查邮箱以确认账户。',
    'Signed in. Redirecting to dashboard.': '已登录，正在跳转到仪表板。',
    'This email is already registered.': '此邮箱已注册。',
    'Invalid email or password.': '邮箱或密码无效。',
    'Apple account ready. Redirecting to dashboard.': 'Apple 账户已准备就绪，正在跳转到仪表板。',
    'Create a first project, manage access, or review platform modules from the navigation.':
      '从导航中创建第一个项目、管理访问权限或查看平台模块。',
    'Open connected Gateway tools, demos, downloads, and project modules.':
      '打开 Gateway 连接工具、演示、下载和项目模块。',
    'Free access to try YVIMO Academy, explore the platform, and start selected courses before upgrading.':
      '免费试用 YVIMO Academy、探索平台，并在升级前开始部分课程。',
    'Continue courses, guided paths, progress, and professional learning.':
      '继续课程、引导路径、进度和专业学习。',
    'Review product seats, activations, renewals, and account entitlements.':
      '查看产品席位、激活、续订和账户权益。',
    'Track quotations, purchase requests, project orders, and follow-up.':
      '跟踪报价、采购请求、项目订单和后续事项。',
    'YVIMO Points': 'YVIMO 积分',
    'Current Plan': '当前计划',
    'Upgrade to this Plan': '升级到此计划',
    'Choose your YVIMO membership': '选择你的 YVIMO 会员',
    'Go to Dashboard': '前往仪表板',
    'Loading workspace...': '正在加载工作区...',
    'Loading dashboard...': '正在加载仪表板...',
    'Access your YVIMO workspace': '访问你的 YVIMO 工作区',
    'Sign in to manage Gateway online access, licenses, learning, orders, and quotations as the platform grows.':
      '登录后可管理 Gateway 在线访问、许可、学习、订单和报价。',
    'Create an account to start using YVIMO platform services as they become available.':
      '创建账户以开始使用即将推出的 YVIMO 平台服务。',
    'Email address': '电子邮箱',
    Password: '密码',
    'Remember me': '记住我',
    'Forgot password?': '忘记密码？',
    'Continue': '继续',
    'Platform preview': '平台预览',
    'Gateway Online Access': 'Gateway 在线访问',
    'Use Gateway demos, downloads, connected services, and future web tools from one account.':
      '通过一个账户使用 Gateway 演示、下载、连接服务和未来的 Web 工具。',
    'Licensing': '许可',
    'Manage product seats, activations, renewals, and customer entitlements.':
      '管理产品席位、激活、续订和客户权益。',
    'Access training, professional guidance, and industrial learning resources.':
      '访问培训、专业指导和工业学习资源。',
    'Orders and Quotation Management': '订单和报价管理',
    'Track quotations, purchase requests, project orders, and commercial follow-up.':
      '跟踪报价、采购请求、项目订单和商务跟进。',
    'Start a project': '启动项目',
    'Select language': '选择语言',
    'Open navigation': '打开导航',
    'Close navigation': '关闭导航',
    'Industrial automation, software services, and connected products':
      '工业自动化、软件服务与连接产品',
    'Automation systems built beyond the machine.':
      '超越单机的自动化系统。',
    'We build control systems, industrial software, and connected products that help manufacturers modernize machines, move data reliably, and turn operations into scalable digital systems.':
      '我们构建控制系统、工业软件和连接产品，帮助制造团队升级设备、可靠传输数据，并将运营转化为可扩展的数字系统。',
    'Explore our solutions': '探索解决方案',
    'Our services': '我们的服务',
    'Services for connected manufacturing.': '面向连接制造的服务。',
    'From controls and software to virtual commissioning, process optimization, manufacturing, and IT/OT integration.':
      '从控制与软件，到虚拟调试、流程优化、制造支持以及 IT/OT 集成。',
    'Business lines': '业务方向',
    'The four divisions that move YVIMO forward.':
      '推动 YVIMO 前进的四个业务板块。',
    'Industrial automation remains our core. Around it, YVIMO grows through software services, proprietary products, and YVIMO Academy: our learning space for the next generation of industrial talent.':
      '工业自动化始终是我们的核心。在此基础上，YVIMO 通过软件服务、自有产品和 YVIMO Academy 持续发展，培养下一代工业人才。',
    'Compatible & flexible': '兼容且灵活',
    'Built to work with the technologies you already use.':
      '为配合你已在使用的技术而构建。',
    'YVIMO integrates controls, robotics, software, and data systems across modern industrial environments.':
      'YVIMO 在现代工业环境中集成控制、机器人、软件与数据系统。',
    'How we work': '工作方式',
    'A clear path from concept to working system.':
      '从概念到可运行系统的清晰路径。',
    'YVIMO combines industrial experience, software development, and commissioning discipline to move projects from technical need to real operation.':
      'YVIMO 结合工业经验、软件开发与调试纪律，将项目从技术需求推进到真实运行。',
    Result: '结果',
    'A working automation, software, or integration system ready for real operations.':
      '一个可用于真实运营的自动化、软件或集成系统。',
    'Tell us what you want to connect, automate, or improve.':
      '告诉我们你想连接、自动化或改进什么。',
    'Share the machine, process, data flow, or operational challenge you have in mind. YVIMO can help define the right path-from controls and software to integration, validation, and deployment.':
      '分享你正在考虑的设备、流程、数据流或运营挑战。YVIMO 可以帮助定义正确路径：从控制与软件到集成、验证和部署。',
    'Explore YVIMO Gateway': '探索 YVIMO Gateway',
    'Project input': '项目输入',
    Ready: '就绪',
    'Machine / process': '设备 / 流程',
    'Data / automation need': '数据 / 自动化需求',
    'Expected output': '预期输出',
    'Working system': '运行系统',
    'Featured product': '精选产品',
    'The industrial data layer for turning PLCs, edge devices, and shop-floor tags into clean routes, APIs, dashboards, and outputs.':
      '工业数据层，用于将 PLC、边缘设备和车间标签转化为清晰的路由、API、仪表板和输出。',
    'Try Online Demo': '试用在线演示',
    Discover: '发现',
    Architect: '架构',
    Build: '构建',
    Validate: '验证',
    'Deploy & Support': '部署与支持',
    'We understand the machine, process, data, pain points, and business objective.':
      '我们理解设备、流程、数据、痛点和业务目标。',
    'We define the controls, software, data flow, hardware, interfaces, and deployment strategy.':
      '我们定义控制、软件、数据流、硬件、接口和部署策略。',
    'We develop the PLC logic, applications, dashboards, integrations, or connected product features.':
      '我们开发 PLC 逻辑、应用、仪表板、集成或连接产品功能。',
    'We test the system through simulation, offline checks, FAT-style reviews, and controlled startup.':
      '我们通过仿真、离线检查、FAT 式评审和受控启动来测试系统。',
    'We commission, train, support, and improve the solution under real production conditions.':
      '我们在真实生产条件下完成调试、培训、支持并持续改进方案。',
    'Controls & PLCs': '控制与 PLC',
    'Robotics & Motion': '机器人与运动',
    'Software Engineering': '软件工程',
    'IT/OT & Cloud': 'IT/OT 与云',
    'PLC programming, machine control, field devices, industrial networks, and troubleshooting.':
      'PLC 编程、机器控制、现场设备、工业网络和故障排查。',
    'Robot cells, motion systems, safety integration, simulation, and commissioning.':
      '机器人单元、运动系统、安全集成、仿真和调试。',
    'Web apps, mobile tools, APIs, dashboards, and industrial software platforms.':
      'Web 应用、移动工具、API、仪表板和工业软件平台。',
    'Secure data routing from machines to databases, cloud systems, and reports.':
      '将机器数据安全路由到数据库、云系统和报表。',
    Controls: '控制',
    Software: '软件',
    Products: '产品',
    'Virtual Commissioning': '虚拟调试',
    'Industrial Engineering': '工业工程',
    Manufacturing: '制造',
    'IT/OT Integration': 'IT/OT 集成',
    'Digital Manufacturing': '数字化制造',
    'PLC, HMI, SCADA, commissioning, troubleshooting, and plant-floor integration.':
      'PLC、HMI、SCADA、调试、故障排查和车间集成。',
    'Modern web applications, backend APIs, dashboards, data workflows, and internal platforms.':
      '现代 Web 应用、后端 API、仪表板、数据流程和内部平台。',
    'YVIMO Gateway, account services, licensing, and tools for connected operations.':
      'YVIMO Gateway、账户服务、许可和连接运营工具。',
    'Digital manufacturing cells, robot simulations, layout validation, and offline verification.':
      '数字制造单元、机器人仿真、布局验证和离线检查。',
    'Process optimization, cycle-time analysis, material flow, bottleneck studies, and improvement roadmaps.':
      '流程优化、节拍分析、物流、瓶颈研究和改进路线图。',
    'Production systems, robotic cells, fixtures, line support, and launch-ready execution.':
      '生产系统、机器人单元、工装夹具、产线支持和投产执行。',
    'Connect PLCs, edge devices, APIs, databases, MQTT, cloud services, and reporting layers.':
      '连接 PLC、边缘设备、API、数据库、MQTT、云服务和报表层。',
    'Tecnomatix, DELMIA, simulation models, line studies, and connected engineering workflows.':
      'Tecnomatix、DELMIA、仿真模型、产线研究和连接工程流程。',
    'Industrial Automation': '工业自动化',
    'Software Services': '软件服务',
    'YVIMO Products': 'YVIMO 产品',
    'YVIMO Academy': 'YVIMO Academy',
    'Controls and field systems': '控制与现场系统',
    'Apps, APIs, and data systems': '应用、API 与数据系统',
    'Physical and digital proprietary products': '自有实体与数字产品',
    'Online academy and professional guidance': '在线学院与专业指导',
    'PLC and HMI engineering': 'PLC 与 HMI 工程',
    'Machine integration': '机器集成',
    'Commissioning and support': '调试与支持',
    'Web applications': 'Web 应用',
    'Backend APIs': '后端 API',
    'Operational dashboards': '运营仪表板',
    'YVIMO Gateway': 'YVIMO Gateway',
    'Industrial tools': '工业工具',
    'Digital platforms': '数字平台',
    'Automation training': '自动化培训',
    'Mentoring and reviews': '指导与评审',
    'Industry updates': '行业更新',
    'PLC and edge drivers': 'PLC 与边缘驱动',
    'TIA tag import': 'TIA 标签导入',
    'Flow Builder logic': 'Flow Builder 逻辑',
    'Runtime outputs': '运行时输出',
  },
};

Object.assign(translations.es, {
  Courses: 'Cursos',
  'Continue watching': 'Continuar viendo',
  'My progress': 'Mi progreso',
  'My certificates': 'Mis certificados',
  News: 'Noticias',
  Resources: 'Recursos',
  'Industrial learning for connected manufacturing.': 'Aprendizaje industrial para manufactura conectada.',
  'Courses, guided paths, and professional training for people building real automation, robotics, and industrial software systems.':
    'Cursos, rutas guiadas y capacitaciÃ³n profesional para personas que construyen automatizaciÃ³n, robÃ³tica y software industrial real.',
  'PLC Programming': 'ProgramaciÃ³n PLC',
  Robotics: 'RobÃ³tica',
  'Industrial Software': 'Software industrial',
  'Career Growth': 'Crecimiento profesional',
  'Control logic, signals, troubleshooting': 'LÃ³gica de control, seÃ±ales, diagnÃ³stico',
  'Cells, motion, integration, safety': 'Celdas, movimiento, integraciÃ³n, seguridad',
  'Dashboards, APIs, plant-floor data': 'Dashboards, APIs, datos de planta',
  'Guidance, practice, certifications': 'GuÃ­a, prÃ¡ctica, certificaciones',
  'View all courses': 'Ver todos los cursos',
  Featured: 'Destacado',
  FEATURED: 'DESTACADO',
  'Featured courses': 'Cursos destacados',
  'Start with the courses we recommend first for each industrial learning area.':
    'Empieza con los cursos que recomendamos primero para cada area de aprendizaje industrial.',
  'HOW YOU LEARN': 'COMO APRENDES',
  'A clear path from lesson to real industrial skill.': 'Un camino claro desde la leccion hasta una habilidad industrial real.',
  'YVIMO Academy turns industrial automation concepts into structured learning paths, practical exercises, and progress you can track.':
    'YVIMO Academy convierte conceptos de automatizacion industrial en rutas de aprendizaje estructuradas, ejercicios practicos y progreso que puedes medir.',
  'How YVIMO Academy works': 'Como funciona YVIMO Academy',
  Explore: 'Explorar',
  Learn: 'Aprender',
  Practice: 'Practicar',
  'Track progress': 'Medir progreso',
  'Apply at work': 'Aplicar en el trabajo',
  'Explore courses by topic: PLCs, robotics, industrial software, and career growth.':
    'Explora cursos por tema: PLCs, robotica, software industrial y crecimiento profesional.',
  'Follow focused lessons built around real automation and manufacturing scenarios.':
    'Sigue lecciones enfocadas en escenarios reales de automatizacion y manufactura.',
  'Apply concepts through guided examples, troubleshooting cases, simulations, or project-style exercises.':
    'Aplica conceptos con ejemplos guiados, casos de diagnostico, simulaciones o ejercicios tipo proyecto.',
  'Monitor completed lessons, course progress, certificates, and recommended next steps.':
    'Monitorea lecciones completadas, avance del curso, certificados y siguientes pasos recomendados.',
  'Use what you learned in real machines, production systems, projects, or your professional portfolio.':
    'Usa lo aprendido en maquinas reales, sistemas de produccion, proyectos o tu portafolio profesional.',
  RESULT: 'RESULTADO',
  'A structured learning path that turns industrial knowledge into practical automation capability.':
    'Una ruta de aprendizaje estructurada que convierte conocimiento industrial en capacidad practica de automatizacion.',
  'Featured learning paths': 'Rutas de aprendizaje destacadas',
  'Start with the Academy tracks we are prioritizing first.': 'Empieza con las rutas de Academy que estamos priorizando primero.',
  Catalog: 'CatÃ¡logo',
  'Academy home': 'Inicio de Academy',
  'All Academy courses': 'Todos los cursos de Academy',
  'Browse the full published catalog in a compact view.': 'Explora el catÃ¡logo publicado en una vista compacta.',
  course: 'curso',
  courses: 'cursos',
  lesson: 'lecciÃ³n',
  lessons: 'lecciones',
  of: 'de',
  'lesson completed': 'lecciÃ³n completada',
  'lessons completed': 'lecciones completadas',
  Beginner: 'Principiante',
  Intermediate: 'Intermedio',
  Advanced: 'Avanzado',
  Completed: 'Completado',
  'In progress': 'En progreso',
  'Not started': 'Sin iniciar',
  Preview: 'Vista previa',
  Locked: 'Bloqueado',
  Done: 'Hecho',
  'View course': 'Ver curso',
  Course: 'Curso',
  'Loading courses...': 'Cargando cursos...',
  'Unable to load Academy': 'No se pudo cargar Academy',
  'Unable to load catalog': 'No se pudo cargar el catÃ¡logo',
  'No published courses yet.': 'AÃºn no hay cursos publicados.',
  'Loading course...': 'Cargando curso...',
  'Course not found.': 'Curso no encontrado.',
  'Admin access': 'Acceso de administrador',
  Enrolled: 'Inscrito',
  'Course access': 'Acceso al curso',
  'You can access all Academy content.': 'Puedes acceder a todo el contenido de Academy.',
  complete: 'completado',
  'Free course enrollment is available.': 'La inscripciÃ³n gratuita estÃ¡ disponible.',
  'Enrollment required for protected lessons.': 'Se requiere inscripciÃ³n para lecciones protegidas.',
  'View progress route': 'Ver ruta de progreso',
  'Get my certificate': 'Obtener mi certificado',
  'View my certificate': 'Ver mi certificado',
  'Enroll free': 'Inscribirme gratis',
  'Request access': 'Solicitar acceso',
  Overview: 'Resumen',
  'Course description coming soon.': 'DescripciÃ³n del curso prÃ³ximamente.',
  Lessons: 'Lecciones',
  'Loading lesson...': 'Cargando lecciÃ³n...',
  'Lesson not found.': 'LecciÃ³n no encontrada.',
  'Preview lesson': 'LecciÃ³n de vista previa',
  Lesson: 'LecciÃ³n',
  'Marking...': 'Marcando...',
  'Mark complete': 'Marcar completado',
  'Resetting...': 'Reiniciando...',
  'Re-take lesson': 'Retomar lecciÃ³n',
  'Certificate issued': 'Certificado emitido',
  'Lesson notes': 'Notas de la lecciÃ³n',
  'Write your notes for this lesson...': 'Escribe tus notas de esta lecciÃ³n...',
  characters: 'caracteres',
  Save: 'Guardar',
  Saving: 'Guardando',
  Saved: 'Guardado',
  'Lesson locked': 'LecciÃ³n bloqueada',
  'Sign in to access this lesson.': 'Inicia sesiÃ³n para acceder a esta lecciÃ³n.',
  'Enroll in this course to access the lesson.': 'InscrÃ­bete en este curso para acceder a la lecciÃ³n.',
  'View course access': 'Ver acceso del curso',
  'Course routes': 'Rutas de curso',
  'Follow every lesson path and see how far your completed route is glowing behind you.':
    'Sigue la ruta completa de lecciones y mira cuÃ¡nto camino completado queda iluminado detrÃ¡s de ti.',
  'Sign in to view your progress.': 'Inicia sesiÃ³n para ver tu progreso.',
  'Your Academy routes are attached to your account.': 'Tus rutas de Academy estÃ¡n vinculadas a tu cuenta.',
  'Loading progress...': 'Cargando progreso...',
  'Unable to load progress': 'No se pudo cargar el progreso',
  'No course progress yet.': 'AÃºn no hay progreso de cursos.',
  'Open a lesson to start lighting up your route.': 'Abre una lecciÃ³n para empezar a iluminar tu ruta.',
  'Creating...': 'Creando...',
  'View Certificate': 'Ver certificado',
  'Completion inventory': 'Inventario de certificados',
  'Your completed Academy courses and issued certificates stay here.': 'Tus cursos completados y certificados emitidos viven aquÃ­.',
  'Sign in to view your certificates.': 'Inicia sesiÃ³n para ver tus certificados.',
  'Certificates are attached to your Academy account.': 'Los certificados estÃ¡n vinculados a tu cuenta de Academy.',
  'Loading certificates...': 'Cargando certificados...',
  'Unable to load certificates': 'No se pudieron cargar los certificados',
  'No certificates yet.': 'AÃºn no tienes certificados.',
  'Complete a course and claim its certificate to add it here.': 'Completa un curso y reclama su certificado para agregarlo aquÃ­.',
  Issued: 'Emitido',
  'Loading certificate...': 'Cargando certificado...',
  'Unable to load certificate': 'No se pudo cargar el certificado',
  'Certificate of Completion': 'Certificado de finalizaciÃ³n',
  'Presented to': 'Otorgado a',
  'Certificate ID': 'ID del certificado',
  'Lessons completed': 'Lecciones completadas',
  'Completed route': 'Ruta completada',
  'Historical path completed before this certificate was issued.': 'Ruta histÃ³rica completada antes de emitir este certificado.',
});

Object.assign(translations.zh, {
  Courses: '课程',
  'Continue watching': '继续观看',
  'My progress': '我的进度',
  'My certificates': '我的证书',
  News: '新闻',
  Resources: '资源',
  'View all courses': '查看所有课程',
  Featured: '精选',
  'Featured learning paths': '精选学习路径',
  Catalog: '目录',
  'Academy home': 'Academy 首页',
  'All Academy courses': '所有 Academy 课程',
  course: '课程',
  courses: '课程',
  lesson: '课',
  lessons: '课',
  of: '共',
  'lesson completed': '课已完成',
  'lessons completed': '课已完成',
  Beginner: '初级',
  Intermediate: '中级',
  Advanced: '高级',
  Completed: '已完成',
  'In progress': '进行中',
  'Not started': '未开始',
  Preview: '预览',
  Locked: '已锁定',
  Done: '完成',
  'View course': '查看课程',
  Course: '课程',
  'Loading courses...': '正在加载课程...',
  'No published courses yet.': '暂无已发布课程。',
  Enrolled: '已报名',
  complete: '完成',
  'View progress route': '查看进度路线',
  'Get my certificate': '获取我的证书',
  'View my certificate': '查看我的证书',
  Overview: '概览',
  Lesson: '课程',
  'Mark complete': '标记完成',
  'Re-take lesson': '重学课程',
  'Certificate issued': '证书已签发',
  'Lesson notes': '课程笔记',
  Save: '保存',
  'Course routes': '课程路线',
  'Completion inventory': '证书库',
  'Certificate of Completion': '结业证书',
  'Presented to': '颁发给',
  'Certificate ID': '证书 ID',
  Issued: '签发',
  'Lessons completed': '已完成课程',
  'Completed route': '已完成路线',
});

Object.assign(translations.es, {
  'Courses, guided paths, and professional training for people building real automation, robotics, and industrial software systems.':
    'Cursos, rutas guiadas y capacitaci\u00f3n profesional para personas que construyen automatizaci\u00f3n, rob\u00f3tica y software industrial real.',
  'PLC Programming': 'Programaci\u00f3n PLC',
  Robotics: 'Rob\u00f3tica',
  'Control logic, signals, troubleshooting': 'L\u00f3gica de control, se\u00f1ales, diagn\u00f3stico',
  'Cells, motion, integration, safety': 'Celdas, movimiento, integraci\u00f3n, seguridad',
  'Guidance, practice, certifications': 'Gu\u00eda, pr\u00e1ctica, certificaciones',
  Catalog: 'Cat\u00e1logo',
  'Browse the full published catalog in a compact view.': 'Explora el cat\u00e1logo publicado en una vista compacta.',
  lesson: 'lecci\u00f3n',
  'lesson completed': 'lecci\u00f3n completada',
  'Unable to load catalog': 'No se pudo cargar el cat\u00e1logo',
  'No published courses yet.': 'A\u00fan no hay cursos publicados.',
  'Free course enrollment is available.': 'La inscripci\u00f3n gratuita est\u00e1 disponible.',
  'Enrollment required for protected lessons.': 'Se requiere inscripci\u00f3n para lecciones protegidas.',
  'Course description coming soon.': 'Descripci\u00f3n del curso pr\u00f3ximamente.',
  'Loading lesson...': 'Cargando lecci\u00f3n...',
  'Lesson not found.': 'Lecci\u00f3n no encontrada.',
  'Preview lesson': 'Lecci\u00f3n de vista previa',
  Lesson: 'Lecci\u00f3n',
  'Re-take lesson': 'Retomar lecci\u00f3n',
  'Lesson notes': 'Notas de la lecci\u00f3n',
  'Write your notes for this lesson...': 'Escribe tus notas de esta lecci\u00f3n...',
  'Lesson locked': 'Lecci\u00f3n bloqueada',
  'Sign in to access this lesson.': 'Inicia sesi\u00f3n para acceder a esta lecci\u00f3n.',
  'Enroll in this course to access the lesson.': 'Inscr\u00edbete en este curso para acceder a la lecci\u00f3n.',
  'Follow every lesson path and see how far your completed route is glowing behind you.':
    'Sigue la ruta completa de lecciones y mira cu\u00e1nto camino completado queda iluminado detr\u00e1s de ti.',
  'Sign in to view your progress.': 'Inicia sesi\u00f3n para ver tu progreso.',
  'Your Academy routes are attached to your account.': 'Tus rutas de Academy est\u00e1n vinculadas a tu cuenta.',
  'No course progress yet.': 'A\u00fan no hay progreso de cursos.',
  'Open a lesson to start lighting up your route.': 'Abre una lecci\u00f3n para empezar a iluminar tu ruta.',
  'Your completed Academy courses and issued certificates stay here.': 'Tus cursos completados y certificados emitidos viven aqu\u00ed.',
  'Sign in to view your certificates.': 'Inicia sesi\u00f3n para ver tus certificados.',
  'Certificates are attached to your Academy account.': 'Los certificados est\u00e1n vinculados a tu cuenta de Academy.',
  'No certificates yet.': 'A\u00fan no tienes certificados.',
  'Complete a course and claim its certificate to add it here.': 'Completa un curso y reclama su certificado para agregarlo aqu\u00ed.',
  'Certificate of Completion': 'Certificado de finalizaci\u00f3n',
  'Historical path completed before this certificate was issued.': 'Ruta hist\u00f3rica completada antes de emitir este certificado.',
});

function translate(language: LanguageCode, text: string) {
  if (language === 'en') return text;
  return translations[language][text] ?? text;
}

const businessLines: BusinessLine[] = [
  {
    title: 'Industrial Automation',
    eyebrow: 'Controls and field systems',
    description:
      'The core of YVIMO: controls engineering, plant-floor systems, automation design, commissioning, and production support.',
    icon: Factory,
    points: ['PLC and HMI engineering', 'Machine integration', 'Commissioning and support'],
    slug: 'industrial-automation',
    detail:
      'Industrial Automation is the technical core of YVIMO. This division covers PLC and HMI engineering, machine integration, commissioning, troubleshooting, and automation support for production environments that need reliable execution on the plant floor.',
  },
  {
    title: 'Software Services',
    eyebrow: 'Apps, APIs, and data systems',
    description:
      'Custom software for manufacturers and teams that need useful dashboards, reliable APIs, and operational tools.',
    icon: Code2,
    points: ['Web applications', 'Backend APIs', 'Operational dashboards'],
    slug: 'software-services',
    detail:
      'Software Services turns industrial and business workflows into practical digital tools: web apps, APIs, dashboards, internal platforms, and data systems designed around how teams actually operate.',
  },
  {
    title: 'YVIMO Products',
    eyebrow: 'Physical and digital proprietary products',
    description:
      'Physical and digital products created by YVIMO to solve specific problems for industry, operations, and users.',
    icon: Blocks,
    points: ['YVIMO Gateway', 'Industrial tools', 'Digital platforms'],
    slug: 'yvimo-products',
    detail:
      'YVIMO Products is our proprietary product division for physical and digital tools. These products are created to solve specific industry problems, improve user workflows, and package repeatable solutions into scalable offerings.',
  },
  {
    title: 'YVIMO Academy',
    eyebrow: 'Online academy and professional guidance',
    description:
      'An online academy for learning industrial automation, staying current with industry demands, and receiving practical guidance.',
    icon: GraduationCap,
    points: ['Automation training', 'Mentoring and reviews', 'Industry updates'],
    slug: 'yvimo-academy',
    detail:
      'YVIMO Academy is our online learning division. It teaches industrial automation, provides mentoring, reviews work, guides learners through real industry expectations, and helps professionals stay current as technology changes.',
  },
];

const serviceShowcase: ServiceShowcaseItem[] = [
  {
    title: 'Controls',
    eyebrow: '01',
    description: 'PLC, HMI, SCADA, commissioning, troubleshooting, and plant-floor integration.',
    image: '/assets/services/robot-cell-closeup.jpeg',
  },
  {
    title: 'Software',
    eyebrow: '02',
    description: 'Modern web applications, backend APIs, dashboards, data workflows, and internal platforms.',
    image: '/assets/services/software-systems.svg',
  },
  {
    title: 'Products',
    eyebrow: '03',
    description: 'YVIMO Gateway, account services, licensing, and tools for connected operations.',
    image: '/assets/services/yvimo-products.svg',
  },
  {
    title: 'Virtual Commissioning',
    eyebrow: '04',
    description: 'Digital manufacturing cells, robot simulations, layout validation, and offline verification.',
    image: '/assets/services/tx-process-simulate-3.webp',
  },
  {
    title: 'Industrial Engineering',
    eyebrow: '05',
    description: 'Process optimization, cycle-time analysis, material flow, bottleneck studies, and improvement roadmaps.',
    image: '/assets/services/process-manufacturing.jpg',
  },
  {
    title: 'Manufacturing',
    eyebrow: '06',
    description: 'Production systems, robotic cells, fixtures, line support, and launch-ready execution.',
    image: '/assets/services/robot-cell-floor.jpeg',
  },
  {
    title: 'IT/OT Integration',
    eyebrow: '07',
    description: 'Connect PLCs, edge devices, APIs, databases, MQTT, cloud services, and reporting layers.',
    image: '/assets/services/efs1.png',
  },
  {
    title: 'Digital Manufacturing',
    eyebrow: '08',
    description: 'Tecnomatix, DELMIA, simulation models, line studies, and connected engineering workflows.',
    image: '/assets/services/autotech-tecnomatix-11.webp',
  },
];

const solutions: Solution[] = [
  {
    title: 'Controls & PLCs',
    tags: [
      { name: 'Siemens', color: '#009999', logoSlug: 'siemens' },
      {
        name: 'Allen-Bradley',
        color: '#c8102e',
        tileColor: '#284c9b',
        logoSrc: '/assets/logos/ecosystem/allen-bradley.png',
      },
      { name: 'Mitsubishi', color: '#e60012', logoSlug: 'mitsubishi' },
      {
        name: 'Omron',
        color: '#0069b4',
        tileColor: '#0069b4',
        logoSrc: '/assets/logos/ecosystem/omron.svg',
      },
      { name: 'Schneider', color: '#3dcd58', logoSlug: 'schneiderelectric' },
      {
        name: 'Inovance',
        color: '#0088c7',
        tileColor: '#0088c7',
        logoSrc: '/assets/logos/ecosystem/inovance.jpg',
      },
    ],
    description:
      'PLC programming, machine control, field devices, industrial networks, and troubleshooting.',
    icon: CircuitBoard,
  },
  {
    title: 'Robotics & Motion',
    tags: [
      {
        name: 'FANUC',
        color: '#f6d300',
        tileColor: '#f6d300',
        logoSrc: '/assets/logos/ecosystem/fanuc.png',
      },
      { name: 'ABB', color: '#ff0000', logoSlug: 'abb' },
      {
        name: 'Universal Robots',
        color: '#00a6d6',
        logoSrc: '/assets/logos/ecosystem/universal-robots.png',
      },
      {
        name: 'KUKA',
        color: '#ff5800',
        tileSize: 'wide',
        logoWidth: '74px',
        logoMaxHeight: '36px',
        logoSrc: '/assets/logos/ecosystem/kuka.png',
      },
      {
        name: 'Yaskawa',
        color: '#004f9f',
        tileColor: '#004f9f',
        logoSrc: '/assets/logos/ecosystem/yaskawa.jpg',
      },
    ],
    description:
      'Robot cells, motion systems, safety integration, simulation, and commissioning.',
    icon: Workflow,
  },
  {
    title: 'Software Engineering',
    tags: [
      { name: 'React', color: '#149eca', logoSlug: 'react' },
      { name: 'Flutter', color: '#027dfd', logoSlug: 'flutter' },
      { name: 'Python', color: '#3776ab', logoSlug: 'python' },
      { name: 'Node.js', color: '#5fa04e', logoSlug: 'nodedotjs' },
      { name: '.NET', color: '#512bd4', logoSlug: 'dotnet' },
      { name: 'Swift', color: '#f05138', logoSlug: 'swift' },
    ],
    description:
      'Web apps, mobile tools, APIs, dashboards, and industrial software platforms.',
    icon: Code2,
  },
  {
    title: 'IT/OT & Cloud',
    tags: [
      { name: 'MQTT', color: '#660066', logoSlug: 'mqtt' },
      {
        name: 'OPC UA',
        color: '#1f7a8c',
        tileColor: '#1f7a8c',
        tileSize: 'wide',
        logoSrc: '/assets/logos/ecosystem/opc-ua.png',
      },
      {
        name: 'SQL',
        color: '#336791',
        tileColor: '#2b78b8',
        logoSrc: '/assets/logos/ecosystem/sql-server.png',
      },
      {
        name: 'REST APIs',
        color: '#ff8a1f',
        tileColor: '#6aa84f',
        logoSrc: '/assets/logos/ecosystem/openapi.webp',
      },
      {
        name: 'AWS',
        color: '#ff9900',
        tileSize: 'wide',
        logoWidth: '74px',
        logoMaxHeight: '38px',
        logoSrc: '/assets/logos/ecosystem/aws.png',
      },
      {
        name: 'Azure',
        color: '#0078d4',
        logoSrc: '/assets/logos/ecosystem/azure.png',
      },
    ],
    description:
      'Secure data routing from machines to databases, cloud systems, and reports.',
    icon: Cloud,
  },
];

const ecosystemTiles = solutions.flatMap((solution) =>
  solution.tags.map((tag) => ({
    ...tag,
    group: solution.title,
    label: tag.name
      .split(/[\s.-]+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .slice(0, 3)
      .toUpperCase(),
  })),
);

const gatewayFeatures: GatewayFeature[] = [
  {
    title: 'PLC and edge drivers',
    description: 'Siemens S7 first, expanding to Allen Bradley, Mitsubishi, and TCP devices.',
    icon: Cable,
  },
  {
    title: 'TIA tag import',
    description: 'Auto-import tags from TIA Portal into a live gateway catalog.',
    icon: FileUp,
  },
  {
    title: 'Flow Builder logic',
    description: 'Create routes, conditions, branches, transformations, and custom logic.',
    icon: GitBranch,
  },
  {
    title: 'Runtime outputs',
    description: 'Expose data through APIs, MQTT, databases, reports, and PLC writeback.',
    icon: TerminalSquare,
  },
];

const processSteps: ProcessStep[] = [
  {
    title: 'Discover',
    description:
      'We understand the machine, process, data, pain points, and business objective.',
    icon: Gauge,
  },
  {
    title: 'Architect',
    description:
      'We define the controls, software, data flow, hardware, interfaces, and deployment strategy.',
    icon: Network,
  },
  {
    title: 'Build',
    description:
      'We develop the PLC logic, applications, dashboards, integrations, or connected product features.',
    icon: Code2,
  },
  {
    title: 'Validate',
    description:
      'We test the system through simulation, offline checks, FAT-style reviews, and controlled startup.',
    icon: ShieldCheck,
  },
  {
    title: 'Deploy & Support',
    description:
      'We commission, train, support, and improve the solution under real production conditions.',
    icon: Rocket,
  },
];

const repeatedServiceShowcase = [
  ...serviceShowcase,
  ...serviceShowcase,
  ...serviceShowcase,
];

const processParticles = Array.from({ length: 26 }, (_, index) => index);

function ServicesShowcase({ t }: { t: Translator }) {
  const serviceCount = serviceShowcase.length;
  const [servicePosition, setServicePosition] = React.useState(serviceCount);
  const [isPaused, setIsPaused] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const servicePositionRef = React.useRef(serviceCount);
  const resetTimeoutRef = React.useRef<number | null>(null);
  const scrollTimeoutRef = React.useRef<number | null>(null);

  const activeIndex =
    ((servicePosition % serviceCount) + serviceCount) % serviceCount;

  React.useEffect(() => {
    servicePositionRef.current = servicePosition;
  }, [servicePosition]);

  const scrollToPosition = React.useCallback((
    position: number,
    behavior: ScrollBehavior = 'smooth',
  ) => {
    const track = trackRef.current;
    const card = trackRef.current?.querySelector<HTMLElement>(
      `[data-service-position="${position}"]`,
    );

    if (!track || !card) return;

    const targetLeft =
      card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;

    setServicePosition(position);
    track.scrollTo({ left: targetLeft, behavior });
  }, []);

  const normalizePosition = React.useCallback((position: number) => {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
    }

    const normalizedIndex =
      ((position % serviceCount) + serviceCount) % serviceCount;
    const middlePosition = serviceCount + normalizedIndex;

    if (position >= serviceCount && position < serviceCount * 2) return;

    resetTimeoutRef.current = window.setTimeout(() => {
      scrollToPosition(middlePosition, 'auto');
    }, 520);
  }, [scrollToPosition, serviceCount]);

  const moveToPosition = React.useCallback((position: number) => {
    scrollToPosition(position);
    normalizePosition(position);
  }, [normalizePosition, scrollToPosition]);

  const moveToIndex = React.useCallback((index: number) => {
    moveToPosition(serviceCount + index);
  }, [moveToPosition, serviceCount]);

  React.useEffect(() => {
    if (isPaused) return;

    const interval = window.setInterval(() => {
      moveToPosition(servicePosition + 1);
    }, 4200);

    return () => window.clearInterval(interval);
  }, [isPaused, moveToPosition, servicePosition]);

  React.useEffect(() => {
    scrollToPosition(serviceCount, 'auto');

    const handleResize = () => {
      scrollToPosition(servicePositionRef.current, 'auto');
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [scrollToPosition, serviceCount]);

  const handleTrackScroll = () => {
    const track = trackRef.current;
    if (!track) return;

    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      const cards = Array.from(
        track.querySelectorAll<HTMLElement>('[data-service-position]'),
      );
      const trackCenter = track.scrollLeft + track.clientWidth / 2;
      const nearestCard = cards.reduce<HTMLElement | null>((nearest, card) => {
        if (nearest === null) return card;

        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const nearestCenter = nearest.offsetLeft + nearest.offsetWidth / 2;

        return Math.abs(cardCenter - trackCenter) <
          Math.abs(nearestCenter - trackCenter)
          ? card
          : nearest;
      }, null);
      const nearestPosition = Number(
        nearestCard?.dataset.servicePosition ?? serviceCount,
      );

      if (Number.isNaN(nearestPosition)) return;

      setServicePosition(nearestPosition);
      normalizePosition(nearestPosition);
    }, 140);
  };

  return (
    <section className="services-showcase" id="services">
      <div className="services-heading">
        <p className="eyebrow">{t('Our services')}</p>
        <h2>{t('Services for connected manufacturing.')}</h2>
        <p>
          {t('From controls and software to virtual commissioning, process optimization, manufacturing, and IT/OT integration.')}
        </p>
      </div>

      <div
        className="services-carousel"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        <button
          className="service-nav service-nav-left"
          type="button"
          aria-label="Previous service"
          onClick={() => moveToPosition(servicePosition - 1)}
        >
          <ChevronLeft size={24} />
        </button>
        <div className="services-track" ref={trackRef} onScroll={handleTrackScroll}>
          {repeatedServiceShowcase.map((service, index) => (
            <article
              className={
                index % serviceCount === activeIndex
                  ? 'service-panel active'
                  : 'service-panel'
              }
              data-service-position={index}
              key={`${service.title}-${index}`}
              onClick={() => moveToPosition(index)}
            >
              <img src={service.image} alt="" aria-hidden="true" />
              <div className="service-panel-shade" />
              <div className="service-panel-copy">
                <span>{service.eyebrow}</span>
                <h3>{t(service.title)}</h3>
                <p>{t(service.description)}</p>
              </div>
            </article>
          ))}
        </div>
        <button
          className="service-nav service-nav-right"
          type="button"
          aria-label="Next service"
          onClick={() => moveToPosition(servicePosition + 1)}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="service-dots" aria-label="Service carousel position">
        {serviceShowcase.map((service, index) => (
          <button
            className={index === activeIndex ? 'active' : ''}
            type="button"
            key={service.title}
            aria-label={`Show ${t(service.title)}`}
            onClick={() => moveToIndex(index)}
          />
        ))}
      </div>
    </section>
  );
}

function BusinessLinePage({
  line,
  onNavigateHome,
  t,
}: {
  line: BusinessLine;
  onNavigateHome: (hash?: string) => void;
  t: Translator;
}) {
  const Icon = line.icon;

  return (
    <main>
      <section className="business-detail-page">
        <button
          className="business-back-link"
          type="button"
          onClick={() => onNavigateHome('#lines')}
        >
          <ArrowRight size={17} />
          {t('Back to business lines')}
        </button>
        <div className="business-detail-layout">
          <div className="business-detail-copy">
            <p className="eyebrow">{t(line.eyebrow)}</p>
            <h1>{t(line.title)}</h1>
            <p>{t(line.detail)}</p>
          </div>
          <div className="business-detail-card">
            <div className="card-icon"><Icon size={28} /></div>
            <h2>{t('What this division covers')}</h2>
            <ul>
              {line.points.map((point) => (
                <li key={point}><Check size={17} /> {t(point)}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginPage({
  onNavigateSignUp,
  onSignIn,
  onAppleSignIn,
  t,
}: {
  onNavigateSignUp: () => void;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onAppleSignIn: () => Promise<string | null>;
  t: Translator;
}) {
  const [formMessage, setFormMessage] = React.useState<string | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);

  const submitSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    console.log('[auth] signIn start');

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get('email') ?? '');
      const password = String(formData.get('password') ?? '');
      const message = await onSignIn(email, password);
      console.log('[auth] signIn result', message);
      setFormMessage(message);
    } catch (error) {
      console.error('[auth] signIn unexpected error', error);
      setFormMessage(error instanceof Error ? error.message : 'Invalid email or password.');
    } finally {
      console.log('[auth] signIn loading reset');
      setAuthBusy(false);
    }
  };

  return (
    <main>
      <section className="login-page">
        <div className="login-background-grid" aria-hidden="true" />
        <div className="login-orbit login-orbit-a" aria-hidden="true" />
        <div className="login-orbit login-orbit-b" aria-hidden="true" />
        <div className="login-layout">
          <div className="login-copy">
            <p className="eyebrow">{t('Platform preview')}</p>
            <h1>{t('Access your YVIMO workspace')}</h1>
            <p>
              {t('Sign in to manage Gateway online access, licenses, learning, orders, and quotations as the platform grows.')}
            </p>
            <div className="login-feature-list">
              <article>
                <ServerCog size={20} />
                <div>
                  <strong>{t('Gateway Online Access')}</strong>
                  <span>{t('Use Gateway demos, downloads, connected services, and future web tools from one account.')}</span>
                </div>
              </article>
              <article>
                <ShieldCheck size={20} />
                <div>
                  <strong>{t('Licensing')}</strong>
                  <span>{t('Manage product seats, activations, renewals, and customer entitlements.')}</span>
                </div>
              </article>
              <article>
                <GraduationCap size={20} />
                <div>
                  <strong>{t('YVIMO Academy')}</strong>
                  <span>{t('Access training, professional guidance, and industrial learning resources.')}</span>
                </div>
              </article>
              <article>
                <FileUp size={20} />
                <div>
                  <strong>{t('Orders and Quotation Management')}</strong>
                  <span>{t('Track quotations, purchase requests, project orders, and commercial follow-up.')}</span>
                </div>
              </article>
            </div>
          </div>

          <form className="login-card" onSubmit={submitSignIn}>
            <div className="login-card-header">
              <div className="login-card-icon">
                <LockKeyhole size={24} />
              </div>
              <div>
                <p className="eyebrow">{t('Sign in')}</p>
                <h2>YVIMO</h2>
              </div>
            </div>

            <label className="login-field">
              <span>{t('Email address')}</span>
              <div>
                <Mail size={18} />
                <input type="email" name="email" autoComplete="email" placeholder="name@company.com" required />
              </div>
            </label>

            <label className="login-field">
              <span>{t('Password')}</span>
              <div>
                <LockKeyhole size={18} />
                <input type="password" name="password" autoComplete="current-password" placeholder="••••••••" required />
              </div>
            </label>

            <div className="login-options">
              <label>
                <input type="checkbox" name="remember" />
                <span>{t('Remember me')}</span>
              </label>
              <a href="/login">{t('Forgot password?')}</a>
            </div>

            <button className="primary-action login-submit" type="submit" disabled={authBusy}>
              {t('Continue')} <ArrowRight size={18} />
            </button>

            <button
              className="passkey-button"
              type="button"
              disabled={authBusy}
              onClick={async () => {
                setAuthBusy(true);
                console.log('[auth] apple signIn start');

                try {
                  setFormMessage(await onAppleSignIn());
                } catch (error) {
                  console.error('[auth] apple signIn unexpected error', error);
                  setFormMessage(error instanceof Error ? error.message : 'Invalid email or password.');
                } finally {
                  console.log('[auth] apple signIn loading reset');
                  setAuthBusy(false);
                }
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M16.37 1.43c.05 1.06-.31 2.07-1.09 3.02-.84 1.02-1.83 1.6-2.95 1.52-.08-1.03.33-2.08 1.11-2.99.86-.99 1.95-1.55 2.93-1.55ZM20.3 17.44c-.46 1.04-.68 1.51-1.27 2.43-.82 1.25-1.98 2.82-3.42 2.83-1.28.01-1.61-.83-3.35-.82-1.74.01-2.1.84-3.38.83-1.43-.01-2.52-1.43-3.34-2.68-2.3-3.51-2.54-7.64-1.12-9.83 1.01-1.55 2.6-2.46 4.1-2.46 1.53 0 2.49.84 3.75.84 1.22 0 1.97-.84 3.73-.84 1.33 0 2.74.72 3.74 1.96-3.28 1.8-2.75 6.48.56 7.74Z" />
              </svg>
              {t('Continue with Apple Passkey')}
            </button>

            <div className="login-auth-switch">
              <span>{t('Create account')}</span>
              <button type="button" onClick={onNavigateSignUp}>
                {t('Sign up')}
              </button>
            </div>
            {formMessage ? <p className={getAuthMessageTone(formMessage)}>{t(formMessage)}</p> : null}
          </form>
        </div>
      </section>
    </main>
  );
}

function SignUpPage({
  onNavigateLogin,
  onSignUp,
  t,
}: {
  onNavigateLogin: () => void;
  onSignUp: (name: string, company: string, email: string, password: string) => Promise<string | null>;
  t: Translator;
}) {
  const [formMessage, setFormMessage] = React.useState<string | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);

  const submitSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    console.log('[auth] signUp start');

    try {
      const formData = new FormData(event.currentTarget);
      const name = String(formData.get('name') ?? '');
      const company = String(formData.get('company') ?? '');
      const email = String(formData.get('email') ?? '');
      const password = String(formData.get('password') ?? '');
      const message = await onSignUp(name, company, email, password);
      console.log('[auth] signUp result', message);
      setFormMessage(message);
    } catch (error) {
      console.error('[auth] signUp unexpected error', error);
      setFormMessage(error instanceof Error ? error.message : 'Invalid email or password.');
    } finally {
      console.log('[auth] signUp loading reset');
      setAuthBusy(false);
    }
  };

  return (
    <main>
      <section className="login-page signup-page">
        <div className="login-background-grid" aria-hidden="true" />
        <div className="login-orbit login-orbit-a" aria-hidden="true" />
        <div className="login-orbit login-orbit-b" aria-hidden="true" />
        <div className="login-layout">
          <div className="login-copy">
            <p className="eyebrow">{t('Platform preview')}</p>
            <h1>{t('Create your YVIMO account')}</h1>
            <p>{t('Create an account to start using YVIMO platform services as they become available.')}</p>
            <div className="login-feature-list">
              <article>
                <ServerCog size={20} />
                <div>
                  <strong>{t('Gateway Online Access')}</strong>
                  <span>{t('Use Gateway demos, downloads, connected services, and future web tools from one account.')}</span>
                </div>
              </article>
              <article>
                <ShieldCheck size={20} />
                <div>
                  <strong>{t('Licensing')}</strong>
                  <span>{t('Manage product seats, activations, renewals, and customer entitlements.')}</span>
                </div>
              </article>
              <article>
                <GraduationCap size={20} />
                <div>
                  <strong>{t('YVIMO Academy')}</strong>
                  <span>{t('Access training, professional guidance, and industrial learning resources.')}</span>
                </div>
              </article>
              <article>
                <FileUp size={20} />
                <div>
                  <strong>{t('Orders and Quotation Management')}</strong>
                  <span>{t('Track quotations, purchase requests, project orders, and commercial follow-up.')}</span>
                </div>
              </article>
            </div>
          </div>

          <form className="login-card" onSubmit={submitSignUp}>
            <div className="login-card-header">
              <div className="login-card-icon">
                <LogIn size={24} />
              </div>
              <div>
                <p className="eyebrow">{t('Sign up')}</p>
                <h2>YVIMO</h2>
              </div>
            </div>

            <label className="login-field">
              <span>{t('Full name')}</span>
              <div>
                <LogIn size={18} />
                <input type="text" name="name" autoComplete="name" placeholder="Jane Smith" required />
              </div>
            </label>

            <label className="login-field">
              <span>{t('Company')}</span>
              <div>
                <Factory size={18} />
                <input type="text" name="company" autoComplete="organization" placeholder="Company name" />
              </div>
            </label>

            <label className="login-field">
              <span>{t('Email address')}</span>
              <div>
                <Mail size={18} />
                <input type="email" name="email" autoComplete="email" placeholder="name@company.com" required />
              </div>
            </label>

            <label className="login-field">
              <span>{t('Password')}</span>
              <div>
                <LockKeyhole size={18} />
                <input type="password" name="password" autoComplete="new-password" placeholder="••••••••" required />
              </div>
            </label>

            <button className="primary-action login-submit" type="submit" disabled={authBusy}>
              {t('Create account')} <ArrowRight size={18} />
            </button>

            <div className="login-auth-switch">
              <span>{t('Already have an account?')}</span>
              <button type="button" onClick={onNavigateLogin}>
                {t('Sign in')}
              </button>
            </div>
            {formMessage ? <p className={getAuthMessageTone(formMessage)}>{t(formMessage)}</p> : null}
          </form>
        </div>
      </section>
    </main>
  );
}

function LoggedDashboardPage({
  user,
  onSignOut,
  onNavigate,
  activePath,
  t,
}: {
  user: AppUser;
  onSignOut: () => void;
  onNavigate: (path: string) => void;
  activePath: string;
  t: Translator;
}) {
  const [billingPeriod, setBillingPeriod] = React.useState<BillingPeriod>('monthly');
  const [checkoutMessage, setCheckoutMessage] = React.useState<string | null>(null);
  const membershipRank: Record<SubscriptionTier, number> = {
    Explorer: 0,
    Professional: 1,
    Enterprise: 2,
  };
  const profileLevelProgress = 72;
  const profileLevel = 373;
  const yvimoPoints = 1280;
  const academyPlans = [
    {
      name: 'Explorer',
      description: 'Explore the YVIMO portal, preview selected Academy lessons, and experience the platform before upgrading.',
      badge: null,
      monthly: {
        price: 'Free',
        label: '',
        cta: 'Start Free',
        plan_key: 'explorer_free',
        note: null,
      },
      three_months: {
        price: 'Free',
        label: '',
        cta: 'Start Free',
        plan_key: 'explorer_free',
        note: null,
      },
      six_months: {
        price: 'Free',
        label: '',
        cta: 'Start Free',
        plan_key: 'explorer_free',
        note: null,
      },
      annual: {
        price: 'Free',
        label: '',
        cta: 'Start Free',
        plan_key: 'explorer_free',
        note: null,
      },
      features: [
        'Access to selected free lessons',
        'Preview selected Academy tracks',
        'Explore industrial learning paths',
        'Basic progress tracking',
        'Limited portal access',
        'Platform updates',
        'Upgrade anytime',
      ],
    },
    {
      name: 'Professional',
      description: 'For serious learners, technicians, and engineers who want full Academy access, Gateway Online tools, and priority portal benefits.',
      badge: 'Recommended',
      monthly: {
        price: '$1,999 MXN',
        label: '/ month',
        cta: 'Start Professional',
        plan_key: 'professional_monthly',
        note: null,
      },
      three_months: {
        price: '$5,499 MXN',
        label: '/ 3 months',
        cta: 'Start Professional',
        plan_key: 'professional_3_months',
        note: 'Save compared to monthly billing',
      },
      six_months: {
        price: '$9,999 MXN',
        label: '/ 6 months',
        cta: 'Start Professional',
        plan_key: 'professional_6_months',
        note: 'Better value for focused learning blocks',
      },
      annual: {
        price: '$14,999 MXN',
        label: '/ year',
        cta: 'Start Professional',
        plan_key: 'professional_annual',
        note: 'Best value for committed learners',
      },
      features: [
        'Full access to YVIMO Academy',
        'Complete Academy tracks and learning paths',
        'Gateway Online access',
        'Priority handling for orders and quotation requests',
        'Certificates of completion',
        'Downloadable resources and templates',
        'Advanced project files',
        'Early access to new tracks',
        'Professional certificate path',
      ],
    },
    {
      name: 'Enterprise',
      description: 'For companies, universities, and teams that need structured industrial automation training, Gateway Online access, and commercial workflow support.',
      badge: null,
      monthly: {
        price: 'Contact sales',
        label: '',
        cta: 'Contact sales',
        plan_key: 'enterprise_contact',
        note: null,
      },
      three_months: {
        price: 'Custom',
        label: '/ 3 months',
        cta: 'Contact sales',
        plan_key: 'enterprise_contact',
        note: 'Team and institutional pricing',
      },
      six_months: {
        price: 'Custom',
        label: '/ 6 months',
        cta: 'Contact sales',
        plan_key: 'enterprise_contact',
        note: 'Team and institutional pricing',
      },
      annual: {
        price: 'Custom',
        label: '/ year',
        cta: 'Contact sales',
        plan_key: 'enterprise_contact',
        note: 'Team and institutional pricing',
      },
      features: [
        'Team or classroom access',
        'Multiple users or seats',
        'Admin and progress visibility',
        'Custom learning paths',
        'University or company training programs',
        'Gateway Online access for approved users',
        'Priority handling for orders, quotations, and project requests',
        'Invoice and purchase order support',
        'Optional private onboarding',
        'Optional custom training or implementation support',
      ],
    },
  ];
  const quickAccessItems = [
    {
      label: 'Gateway Online',
      description: 'Design, simulate, and prepare industrial connectivity flows using virtual devices, labs, and Gateway tools.',
      icon: ServerCog,
      path: '/portal/gateway-online',
    },
    {
      label: 'YVIMO Academy',
      description: 'Continue courses, guided paths, progress, and professional learning.',
      icon: GraduationCap,
      path: '/academy',
    },
    {
      label: 'Engineering Tools',
      description: 'Access templates, calculators, quotation tools, network utilities, and controls resources for real industrial automation projects.',
      icon: Wrench,
      path: '/portal/engineering-tools',
      featured: true,
    },
    {
      label: 'Licenses',
      description: 'Review product seats, activations, renewals, and account entitlements.',
      icon: ShieldCheck,
      path: '/dashboard/licenses',
    },
    {
      label: 'Orders and Quotation Management',
      description: 'Track quotations, purchase requests, project orders, and follow-up.',
      icon: FileUp,
      path: '/dashboard/orders',
    },
  ];
  const navItems = [
    { label: 'Workspace', icon: Blocks, featured: false, path: '/dashboard' },
    { label: 'Gateway Online', icon: ServerCog, featured: true, path: '/portal/gateway-online' },
    { label: 'Academy', icon: GraduationCap, featured: true, path: '/academy' },
    { label: 'Engineering Tools', icon: Wrench, featured: true, path: '/portal/engineering-tools' },
    { label: 'Licenses', icon: ShieldCheck, featured: false, path: '/dashboard/licenses' },
    { label: 'Orders', icon: FileUp, featured: false, path: '/dashboard/orders' },
    { label: 'Quotations', icon: Database, featured: false, path: '/dashboard/quotations' },
    { label: 'Settings', icon: Gauge, featured: false, path: '/dashboard/settings' },
  ];
  const isLicensesPage = activePath === '/dashboard/licenses';
  const isGatewayOnlinePage =
    activePath === '/portal/gateway-online'
    || activePath.startsWith('/portal/gateway-online/')
    || activePath === '/dashboard/gateway'
    || activePath.startsWith('/dashboard/gateway/');
  const gatewayOnlineFeatures = [
    {
      label: 'Virtual Gateway Sandbox',
      description: 'Build and test industrial data flows using simulated tags, virtual signals, and demo outputs without needing a physical PLC.',
      icon: ServerCog,
      path: '/portal/gateway-online/sandbox',
      badge: 'Preview',
    },
    {
      label: 'Virtual Devices',
      description: 'Use simulated PLCs, Modbus devices, I/O modules, machines, and production systems to practice industrial connectivity.',
      icon: Cpu,
      path: '/portal/gateway-online/virtual-devices',
      badge: 'Coming soon',
    },
    {
      label: 'Gateway Flow Builder',
      description: 'Design connectivity flows with inputs, processing blocks, tag mapping, alarms, and outputs for industrial data routing.',
      icon: Workflow,
      path: '/portal/gateway-online/flow-builder',
      badge: 'Preview',
    },
    {
      label: 'Project Generator',
      description: 'Generate Gateway project packages with configuration files, tag lists, architecture diagrams, and implementation checklists.',
      icon: FileUp,
      path: '/portal/gateway-online/project-generator',
      badge: 'Coming soon',
    },
    {
      label: 'Network Planning Tools',
      description: 'Prepare IT/OT requirements with IP planning, subnet tools, firewall checklists, communication ports, and topology references.',
      icon: Network,
      path: '/portal/gateway-online/network-planning',
      badge: 'Included',
    },
    {
      label: 'Remote Gateway Agent',
      description: 'Prepare for future secure outbound connections between local Gateway installations and the YVIMO Portal for diagnostics and monitoring.',
      icon: RadioTower,
      path: '/portal/gateway-online/remote-agent',
      badge: 'Future module',
    },
    {
      label: 'Gateway Academy Labs',
      description: 'Follow guided labs to read virtual tags, publish data to MQTT, build dashboards, configure alarms, and export Gateway configurations.',
      icon: GraduationCap,
      path: '/portal/gateway-online/labs',
      badge: 'Preview',
    },
    {
      label: 'Demo Dashboards',
      description: 'Explore simulated dashboards for machine status, production counters, downtime, OEE, alarms, energy, and process monitoring.',
      icon: Gauge,
      path: '/portal/gateway-online/demo-dashboards',
      badge: 'Preview',
    },
  ];
  const gatewayRouteSlug = activePath.split('/').filter(Boolean)[2];
  const activeGatewayFeature = gatewayOnlineFeatures.find((item) => item.path.endsWith(`/${gatewayRouteSlug}`));
  const gatewayOverviewItems = activeGatewayFeature ? [activeGatewayFeature] : gatewayOnlineFeatures;
  const isEngineeringToolsPage =
    activePath === '/portal/engineering-tools'
    || activePath.startsWith('/portal/engineering-tools/')
    || activePath === '/dashboard/engineering-tools'
    || activePath.startsWith('/dashboard/engineering-tools/');
  const engineeringCategories = [
    {
      label: 'Industrial Templates',
      description: 'Standards, checklists, FAT/SAT documents, commissioning forms, and project handover templates.',
      examples: [
        'PLC programming standards',
        'HMI design standards',
        'FAT checklist',
        'SAT checklist',
        'I/O checkout sheet',
        'Commissioning checklist',
        'Risk assessment template',
        'Network documentation template',
        'Controls project handover template',
        'Machine troubleshooting report',
        'Customer requirement form',
      ],
      icon: FileUp,
      path: '/portal/engineering-tools/templates',
      badge: 'Coming soon',
    },
    {
      label: 'Quotation Tools',
      description: 'Estimators and calculators to help structure automation projects, service visits, and technical proposals.',
      examples: [
        'Quotation calculator',
        'Labor hour estimator',
        'Controls panel cost estimator',
        'PLC/HMI hardware list builder',
        'Automation cell budget estimator',
        'Service visit cost calculator',
        'Project timeline estimator',
        'ROI calculator for automation projects',
      ],
      icon: Calculator,
      path: '/portal/engineering-tools/quotation-tools',
      badge: 'Coming soon',
    },
    {
      label: 'Controls Utilities',
      description: 'Technical utilities for industrial networks, PLC connectivity, and controls troubleshooting.',
      examples: [
        'IP scanner',
        'Device discovery tool',
        'Subnet calculator',
        'PLC connection tester',
        'Modbus TCP tester',
        'OPC UA endpoint tester',
        'MQTT test client',
        'Port scanner',
        'Ping sweep tool',
        'Network topology helper',
        'Siemens S7 connection validator',
      ],
      icon: Network,
      path: '/portal/engineering-tools/controls-utilities',
      badge: 'Coming soon',
    },
    {
      label: 'Engineering Calculators',
      description: 'Fast calculators for common controls, automation, and industrial engineering tasks.',
      examples: [
        '4-20 mA scaling calculator',
        '0-10 V scaling calculator',
        'Sensor scaling calculator',
        'Gear ratio calculator',
        'Motor speed calculator',
        'Cycle time calculator',
        'OEE calculator',
        'Air consumption calculator',
        'Safety distance calculator',
        'Industrial unit converter',
      ],
      icon: Gauge,
      path: '/portal/engineering-tools/calculators',
      badge: 'Coming soon',
    },
    {
      label: 'Downloads & Resources',
      description: 'Downloadable software tools, reference files, guides, and starter kits for engineering work.',
      examples: [
        'Software utilities',
        'Quick reference guides',
        'Starter project files',
        'Network setup references',
        'Gateway examples',
        'Industrial communication references',
      ],
      icon: Cloud,
      path: '/portal/engineering-tools/downloads',
      badge: 'Coming soon',
    },
  ];
  const engineeringRouteSlug = activePath.split('/').filter(Boolean)[2];
  const activeEngineeringCategory = engineeringCategories.find((item) => item.path.endsWith(`/${engineeringRouteSlug}`));
  const engineeringOverviewItems = activeEngineeringCategory ? [activeEngineeringCategory] : engineeringCategories;
  const foundingMemberRank = membershipRank.Professional;
  const foundingMemberIsCurrent = membershipRank[user.subscription] >= foundingMemberRank;
  const foundingMemberCta = foundingMemberIsCurrent ? 'Current Plan' : 'Become a Founding Member';
  const foundingMemberPricing: Record<BillingPeriod, { price: string; label: string; plan_key: string; price_display: string }> = {
    monthly: {
      price: '$1,000 MXN',
      label: '/ month',
      plan_key: 'founding_member_monthly',
      price_display: '$1,000 MXN / month',
    },
    three_months: {
      price: '$3,000 MXN',
      label: '/ 3 months',
      plan_key: 'founding_member_3_months',
      price_display: '$3,000 MXN / 3 months',
    },
    six_months: {
      price: '$6,000 MXN',
      label: '/ 6 months',
      plan_key: 'founding_member_6_months',
      price_display: '$6,000 MXN / 6 months',
    },
    annual: {
      price: '$12,000 MXN',
      label: '/ year',
      plan_key: 'founding_member_annual',
      price_display: '$12,000 MXN / year',
    },
  };
  const currentFoundingMemberPricing = foundingMemberPricing[billingPeriod];
  const billingOptions: Array<{ label: string; value: BillingPeriod }> = [
    { label: 'Monthly', value: 'monthly' },
    { label: '3 Months', value: 'three_months' },
    { label: '6 Months', value: 'six_months' },
    { label: 'Annual', value: 'annual' },
  ];

  const handleCheckout = (plan: CheckoutPlan) => {
    console.log('Checkout will be connected soon:', plan);
    setCheckoutMessage(`${plan.price_display} selected. Checkout will be connected soon.`);
    window.setTimeout(() => setCheckoutMessage(null), 4200);
  };

  return (
    <main className="logged-shell">
      <aside className="logged-sidebar">
        <div className="logged-sidebar-title">
          <span>YVIMO</span>
          <strong>{t('Dashboard')}</strong>
        </div>
        <nav aria-label="Dashboard navigation">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const active = activePath === item.path
              || (item.path === '/academy' && activePath.startsWith('/academy'))
              || (item.path === '/portal/gateway-online' && (
                activePath.startsWith('/portal/gateway-online')
                || activePath.startsWith('/dashboard/gateway')
              ))
              || (item.path === '/portal/engineering-tools' && (
                activePath.startsWith('/portal/engineering-tools')
                || activePath.startsWith('/dashboard/engineering-tools')
              ));
            return (
              <button
                className={[active || (index === 0 && activePath === '/dashboard') ? 'active' : '', item.featured ? 'featured' : ''].filter(Boolean).join(' ')}
                type="button"
                key={item.label}
                onClick={() => onNavigate(item.path)}
              >
                <Icon size={18} />
                {t(item.label)}
              </button>
            );
          })}
        </nav>
        <button className="logged-signout" type="button" onClick={onSignOut}>
          <LogIn size={18} />
          {t('Sign out')}
        </button>
      </aside>

      <section className="logged-workspace">
        {isLicensesPage ? (
          <div className="license-page">
            <section className="license-pricing-hero">
              <p className="eyebrow">{t('YVIMO MEMBERSHIP')}</p>
              <h1>{t('Choose your YVIMO membership')}</h1>
              <p>
                {t('Access industrial automation training, Gateway Online tools, and priority commercial support through one YVIMO portal.')}
              </p>
              <span>{t('Specialized industrial training, digital tools, and workflow support built for automation professionals.')}</span>
              <div className="billing-toggle" role="tablist" aria-label="Billing period">
                {billingOptions.map((option) => (
                  <button
                    className={billingPeriod === option.value ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={billingPeriod === option.value}
                    key={option.value}
                    onClick={() => setBillingPeriod(option.value)}
                  >
                    {t(option.label)}
                  </button>
                ))}
              </div>
            </section>

            {checkoutMessage ? (
              <div className="license-checkout-message" role="status">
                {checkoutMessage}
              </div>
            ) : null}

            <section className="founding-member-card" aria-label="Founding Member offer">
              <div className="founding-member-copy">
                <span>{t('Limited early access')}</span>
                <h2>{t('Founding Member')}</h2>
                <p>{t('Get Professional-level YVIMO access for $1,000 MXN/month while the platform is being built.')}</p>
                <p>{t('Join early, help shape the platform, and lock in early-access pricing while your subscription stays active.')}</p>
                <strong>{currentFoundingMemberPricing.price} <em>{t(currentFoundingMemberPricing.label)}</em></strong>
              </div>
              <ul>
                {[
                  'Full Academy access',
                  'Professional-level access at early-user pricing',
                  'Gateway Online access',
                  'Priority handling for orders and quotation requests',
                  'Locked-in pricing while subscription stays active',
                  'Access to content as it is released',
                  'Influence future lessons, tools, and tracks',
                  'Founding Member badge',
                  'Early access to new Academy tracks',
                ].map((feature) => (
                  <li key={feature}>
                    <Check size={17} />
                    {t(feature)}
                  </li>
                ))}
              </ul>
              <button
                className={foundingMemberIsCurrent ? 'current-plan' : ''}
                type="button"
                disabled={foundingMemberIsCurrent}
                onClick={() => handleCheckout({
                  product_key: 'yvimo_membership',
                  plan_key: currentFoundingMemberPricing.plan_key,
                  billing_period: billingPeriod,
                  price_display: currentFoundingMemberPricing.price_display,
                  price_id: null,
                })}
              >
                {t(foundingMemberCta)} {!foundingMemberIsCurrent ? <ArrowRight size={17} /> : null}
              </button>
            </section>

            <section className="license-pricing-grid" aria-label="YVIMO membership pricing plans">
              {academyPlans.map((plan) => {
                const pricing = plan[billingPeriod];
                const priceDisplay = `${pricing.price}${pricing.label ? ` ${pricing.label}` : ''}`;
                const planName = plan.name as SubscriptionTier;
                const isCurrentPlan = user.subscription === planName;
                const currentRank = membershipRank[user.subscription];
                const planRank = membershipRank[planName];
                const planCta = isCurrentPlan
                  ? 'Current Plan'
                  : planName === 'Explorer'
                    ? 'Start Free'
                    : planName === 'Enterprise'
                      ? 'Contact sales'
                      : planRank > currentRank
                        ? 'Upgrade to this Plan'
                        : pricing.cta;
                return (
                  <article className={plan.badge ? 'license-plan-card recommended' : 'license-plan-card'} key={plan.name}>
                    <div className="license-plan-top">
                      <div>
                        <h2>
                          <span className={`license-plan-tier subscription-pill subscription-${plan.name.toLowerCase()}`}>
                            {t(plan.name)}
                          </span>
                        </h2>
                        <p>{t(plan.description)}</p>
                      </div>
                      {plan.badge ? <span>{t(plan.badge)}</span> : null}
                    </div>
                    <div className="license-plan-price">
                      <strong>{pricing.price}</strong>
                      {pricing.label ? <span>{t(pricing.label)}</span> : null}
                    </div>
                    {pricing.note ? <p className="license-plan-note">{t(pricing.note)}</p> : null}
                    <ul>
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <Check size={17} />
                          {t(feature)}
                        </li>
                      ))}
                    </ul>
                    <button
                      className={isCurrentPlan ? 'current-plan' : ''}
                      type="button"
                      disabled={isCurrentPlan}
                      onClick={() => handleCheckout({
                        product_key: 'yvimo_membership',
                        plan_key: pricing.plan_key,
                        billing_period: billingPeriod,
                        price_display: priceDisplay,
                        price_id: null,
                      })}
                    >
                      {t(planCta)}
                    </button>
                  </article>
                );
              })}
            </section>
          </div>
        ) : isGatewayOnlinePage ? (
          <div className="engineering-tools-page gateway-online-page">
            <button className="academy-back-button engineering-back-button" type="button" onClick={() => onNavigate('/dashboard')}>
              <ArrowLeft size={16} />
              Go Back
            </button>
            <section className="engineering-tools-hero gateway-online-hero">
              <p className="eyebrow">{t('YVIMO PORTAL')}</p>
              <h1>{t('Gateway Online')}</h1>
              <p>{t('Design, simulate, test, and prepare industrial connectivity flows from your browser.')}</p>
              <span>
                {t('Gateway Online helps users practice with virtual devices, build data-flow concepts, generate project configurations, and prepare real industrial integrations before going onsite.')}
              </span>
            </section>

            {activeGatewayFeature ? (
              <section className="engineering-module-detail gateway-module-detail" aria-live="polite">
                <span className="workspace-access-icon">
                  <activeGatewayFeature.icon size={24} />
                </span>
                <div>
                  <strong>{t(activeGatewayFeature.label)}</strong>
                  <p>{t(activeGatewayFeature.description)}</p>
                  <small>
                    {t('This Gateway Online module is being prepared. It will be connected to the full YVIMO Gateway web app in a future release.')}
                  </small>
                </div>
                <span className="engineering-access-badge">{t(activeGatewayFeature.badge)}</span>
                <button type="button">{t('Access module')}</button>
                <button className="engineering-secondary-action" type="button" onClick={() => onNavigate('/portal/gateway-online')}>
                  {t('All Gateway tools')}
                </button>
              </section>
            ) : (
              <section className="gateway-online-note" aria-label="Gateway Online positioning">
                <strong>{t('Gateway Online = design, simulate, test, prepare, learn, generate')}</strong>
                <span>{t('Gateway Local = execute real industrial connections inside the customer network.')}</span>
              </section>
            )}

            <section className="engineering-category-grid gateway-feature-grid" aria-label="Gateway Online features">
              {gatewayOverviewItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className="engineering-category-card gateway-feature-card"
                    type="button"
                    key={item.label}
                    onClick={() => onNavigate(item.path)}
                  >
                    <span className="gateway-card-top">
                      <span className="engineering-category-icon">
                        <Icon size={22} />
                      </span>
                      <span className="engineering-access-badge">{t(item.badge)}</span>
                    </span>
                    <span className="engineering-category-copy">
                      <strong>{t(item.label)}</strong>
                    </span>
                    <span className="engineering-detail-description">{t(item.description)}</span>
                    <span className="engineering-card-arrow">
                      {activeGatewayFeature ? t('Access module') : t('View details')} <ArrowRight size={17} />
                    </span>
                  </button>
                );
              })}
            </section>
          </div>
        ) : isEngineeringToolsPage ? (
          <div className="engineering-tools-page">
            <button className="academy-back-button engineering-back-button" type="button" onClick={() => onNavigate('/dashboard')}>
              <ArrowLeft size={16} />
              Go Back
            </button>
            <section className="engineering-tools-hero">
              <p className="eyebrow">{t('YVIMO PORTAL')}</p>
              <h1>{t('Engineering Tools')}</h1>
              <p>{t('Practical resources for automation, controls, commissioning, quoting, and troubleshooting.')}</p>
            </section>

            {activeEngineeringCategory ? (
              <section className="engineering-module-detail" aria-live="polite">
                <span className="workspace-access-icon">
                  <activeEngineeringCategory.icon size={24} />
                </span>
                <div>
                  <strong>{t(activeEngineeringCategory.label)}</strong>
                  <p>{t(activeEngineeringCategory.description)}</p>
                </div>
                <span className="engineering-access-badge">{t(activeEngineeringCategory.badge)}</span>
                <button type="button">{t('Access module')}</button>
                <button className="engineering-secondary-action" type="button" onClick={() => onNavigate('/portal/engineering-tools')}>
                  {t('All tools')}
                </button>
              </section>
            ) : null}

            <section className="engineering-category-grid" aria-label="Engineering tool categories">
              {engineeringOverviewItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className="engineering-category-card"
                    type="button"
                    key={item.label}
                    onClick={() => onNavigate(item.path)}
                    >
                    <span className="engineering-category-icon">
                        <Icon size={22} />
                    </span>
                    <span className="engineering-category-copy">
                      <strong>{t(item.label)}</strong>
                    </span>
                    {activeEngineeringCategory ? (
                      <>
                        <span className="engineering-detail-description">{t(item.description)}</span>
                        <span className="engineering-example-list">
                          {item.examples.map((example) => (
                        <em key={example}>{t(example)}</em>
                      ))}
                        </span>
                      </>
                    ) : null}
                    <span className="engineering-card-arrow">
                      {activeEngineeringCategory ? t('Access module') : t('View details')} <ArrowRight size={17} />
                    </span>
                  </button>
                );
              })}
            </section>
          </div>
        ) : (
        <div className="workspace-layout">
          <div className="workspace-main">
            <div className="workspace-heading">
              <p className="eyebrow">{t('YVIMO PORTAL')}</p>
              <h1>{t('Workspace overview')}</h1>
              <p>{t('Your YVIMO tools, licenses, and learning access in one place.')}</p>
            </div>
            <div className="workspace-grid">
              {quickAccessItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className="workspace-access-card"
                    type="button"
                    key={item.label}
                    onClick={() => onNavigate(item.path)}
                  >
                    <span className="workspace-access-icon">
                      <Icon size={22} />
                    </span>
                    <span className="workspace-access-copy">
                      <strong>{t(item.label)}</strong>
                      <span>{t(item.description)}</span>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="workspace-profile-card" aria-label="Workspace profile">
            <div className="workspace-profile-copy">
              <strong>{user.name}</strong>
              <span className={getSubscriptionClass(user.subscription)}>
                {user.subscription}
              </span>
            </div>
            <div
              className="workspace-profile-ring"
              style={{ '--profile-progress': `${profileLevelProgress}%` } as React.CSSProperties}
              aria-label={`${profileLevelProgress}% level progress`}
            >
              <UserAvatar user={user} className="workspace-profile-avatar" />
            </div>
            <div className="workspace-profile-level" aria-label={`Level ${profileLevel}`}>
              <span>LV</span>
              <strong>{profileLevel}</strong>
            </div>
            <div className="workspace-profile-points">
              <Star size={19} fill="currentColor" />
              <strong>{yvimoPoints.toLocaleString()}</strong>
              <span>{t('YVIMO Points')}</span>
            </div>
          </aside>
        </div>
        )}
      </section>
    </main>
  );
}

function DashboardLoadingPage({ t }: { t: Translator }) {
  return (
    <main className="dashboard-loading-page">
      <div className="dashboard-loading-particles" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="dashboard-loading-content">
        <img src="/assets/logos/yvimo-square-logo-2024.png" alt="YVIMO" />
        <strong>{t('Loading dashboard...')}</strong>
        <div className="dashboard-loading-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </main>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = React.useState(false);
  const [language, setLanguage] = React.useState<LanguageCode>('en');
  const [activeSolution, setActiveSolution] = React.useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [currentPath, setCurrentPath] = React.useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  const [authSession, setAuthSession] = React.useState<Session | null>(null);
  const [authUser, setAuthUser] = React.useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [dashboardTransition, setDashboardTransition] = React.useState(false);
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );

  const closeMenu = () => setMenuOpen(false);
  const t = React.useCallback((text: string) => translate(language, text), [language]);
  const currentLanguage = languages.find((item) => item.code === language) ?? languages[0];
  const isLoginPage = currentPath === '/login';
  const isSignUpPage = currentPath === '/signup';
  const isDashboardPage =
    currentPath === '/dashboard'
    || currentPath.startsWith('/dashboard/')
    || currentPath === '/portal/gateway-online'
    || currentPath.startsWith('/portal/gateway-online/')
    || currentPath === '/portal/engineering-tools'
    || currentPath.startsWith('/portal/engineering-tools/');
  const isAcademyPage = currentPath === '/academy' || currentPath.startsWith('/academy/');
  const isAuthPage = isLoginPage || isSignUpPage;
  const headerProgress = isAuthPage || isDashboardPage || isAcademyPage ? 1 : scrollProgress;
  const compactViewport = viewportWidth < 760;
  const tinyViewport = viewportWidth < 480;
  const headerProfileLevelProgress = 72;
  const headerProfileLevel = 373;
  const headerYvimoPoints = 1280;
  const expandedHeaderHeight = compactViewport ? 104 : 128;
  const compactHeaderHeight = compactViewport ? 82 : 94;
  const expandedWaveDepth = compactViewport ? 34 : 48;
  const expandedBrandWidth = tinyViewport ? 82 : compactViewport ? 330 : viewportWidth < 1040 ? 372 : 420;
  const headerHeight =
    expandedHeaderHeight - headerProgress * (expandedHeaderHeight - compactHeaderHeight);
  const waveDepth = expandedWaveDepth * (1 - headerProgress);
  const startBrandCenter = tinyViewport
    ? Math.min(Math.max(viewportWidth * 0.22, 86), 114)
    : compactViewport
      ? Math.min(Math.max(viewportWidth * 0.28, 190), 254)
      : Math.min(Math.max(viewportWidth * 0.2, 305), 370);
  const brandLeft =
    startBrandCenter + (viewportWidth / 2 - startBrandCenter) * headerProgress;
  const expandedBrandTop = expandedHeaderHeight / 2 + expandedWaveDepth * 0.34;
  const brandTop =
    expandedBrandTop + (headerHeight / 2 - expandedBrandTop) * headerProgress;
  const expandedNavTop = expandedHeaderHeight / 2 + expandedWaveDepth * 0.42;
  const navTop = expandedNavTop + (headerHeight / 2 - expandedNavTop) * headerProgress;
  const expandedNavRight = Math.max(viewportWidth * 0.22, 300);
  const compactNavRight = Math.min(Math.max(viewportWidth * 0.04, 18), 54);
  const navRight =
    expandedNavRight + (compactNavRight - expandedNavRight) * headerProgress;
  const expandedSloganCenter = viewportWidth * 0.78;
  const sloganLeft =
    expandedSloganCenter + (viewportWidth - compactNavRight - 260 - expandedSloganCenter) * headerProgress;
  const expandedMenuLeft = Math.min(
    expandedSloganCenter + Math.min(210, viewportWidth * 0.14) + 30,
    viewportWidth - 240,
  );
  const compactMenuLeft = viewportWidth - compactNavRight - 62;
  const expandedMenuLeftPosition =
    expandedMenuLeft + (compactMenuLeft - expandedMenuLeft) * headerProgress;
  const expandedMenuPanelLeft = Math.min(
    expandedMenuLeftPosition,
    viewportWidth - 220 - compactNavRight,
  );
  const navScale = 1.08 - headerProgress * 0.08;
  const navRevealProgress = Math.min(Math.max((headerProgress - 0.34) / 0.42, 0), 1);
  const sloganProgress = 1 - Math.min(Math.max(headerProgress / 0.42, 0), 1);
  const expandedMenuProgress = Math.max(sloganProgress, 0);
  const expandedMenuActive = expandedMenuProgress > 0.08;
  const brandScale = 1 - headerProgress * 0.46;
  const logoRotation = headerProgress * 360;
  const edgeStraightProgress = Math.min(Math.max((headerProgress - 0.82) / 0.18, 0), 1);
  const edgeShape = 1 - headerProgress;
  const selectedBusinessLine = businessLines.find((line) => {
    return currentPath === `/business/${line.slug}`;
  });
  const academyPathParts = currentPath.split('/').filter(Boolean);
  const academyCourseSlug = academyPathParts[0] === 'academy' ? academyPathParts[1] : undefined;
  const academyTrackSlug =
    academyPathParts[0] === 'academy' && academyPathParts[1] === 'tracks'
      ? academyPathParts[2]
      : undefined;
  const academyLessonSlug =
    academyPathParts[0] === 'academy' && academyPathParts[2] === 'lessons'
      ? academyPathParts[3]
      : undefined;
  const isAcademyCatalogPage = currentPath === '/academy/courses';
  const isAcademyProgressPage = currentPath === '/academy/progress';
  const isAcademyCertificatesPage = currentPath === '/academy/certificates' || currentPath.startsWith('/academy/certificates/');
  const academyCertificateId =
    academyPathParts[0] === 'academy' && academyPathParts[1] === 'certificates'
      ? academyPathParts[2]
      : undefined;
  const orangeEdgePath =
    `M0 0 C80 ${62 * edgeShape} 210 ${80 * edgeShape} 360 ${56 * edgeShape} ` +
    `C500 ${34 * edgeShape} 570 0 710 0 ` +
    `C850 0 930 ${46 * edgeShape} 1080 ${76 * edgeShape} ` +
    `C1225 ${105 * edgeShape} 1410 ${84 * edgeShape} 1600 ${28 * edgeShape}`;

  const fetchOrCreateProfile = React.useCallback(async (user: User) => {
    console.log('[auth] profile fetch start', user.id);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('id, full_name, company_name, role, subscription_tier, created_at, updated_at')
          .eq('id', user.id)
          .maybeSingle<UserProfile>(),
        7000,
        'Profile fetch',
      );

      if (error) {
        throw error;
      }

      if (data) {
        console.log('[auth] profile fetch result', data);
        return data;
      }

      const fallbackProfile = {
        id: user.id,
        full_name: String(user.user_metadata?.full_name ?? '').trim()
          || user.email?.split('@')[0]
          || 'YVIMO User',
        company_name: String(user.user_metadata?.company_name ?? '').trim(),
        role: String(user.user_metadata?.role ?? '').trim(),
        subscription_tier: 'Explorer' as SubscriptionTier,
      };

      const { data: insertedProfile, error: insertError } = await withTimeout(
        supabase
          .from('profiles')
          .insert(fallbackProfile)
          .select('id, full_name, company_name, role, subscription_tier, created_at, updated_at')
          .single<UserProfile>(),
        7000,
        'Profile insert',
      );

      if (insertError) {
        throw insertError;
      }

      console.log('[auth] profile fetch result', insertedProfile);
      return insertedProfile;
    } catch (error) {
      console.error('[auth] profile fetch error', error);
      return null;
    }
  }, []);

  const syncSessionUser = React.useCallback(async (session: Session | null) => {
    console.log('[auth] session value', session);
    setAuthSession(session);

    if (!session?.user) {
      setAuthUser(null);
      return;
    }

    const profile = await fetchOrCreateProfile(session.user);
    setAuthUser(profileToAppUser(session.user, profile));
  }, [fetchOrCreateProfile]);

  React.useEffect(() => {
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const progress = Math.min(window.scrollY / 260, 1);
        setScrollProgress(progress);
        setViewportWidth(window.innerWidth);
      });
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  React.useEffect(() => {
    const updatePath = () => setCurrentPath(window.location.pathname);

    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);

  React.useEffect(() => {
    let active = true;

    console.log('[auth] getSession start');

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;

      if (error) {
        console.error('[auth] getSession error', error);
        setAuthSession(null);
        setAuthUser(null);
        setAuthLoading(false);
        return;
      }

      try {
        console.log('[auth] getSession result', data.session);
        await syncSessionUser(data.session);
      } catch (error) {
        console.error('[auth] getSession sync error', error);
        setAuthSession(data.session);
        setAuthUser(data.session?.user ? profileToAppUser(data.session.user, null) : null);
      } finally {
        console.log('[auth] getSession loading reset');
        if (active) setAuthLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth] state change', event, session);
      window.setTimeout(() => {
        syncSessionUser(session).catch(() => {
          setAuthSession(null);
          setAuthUser(null);
        });
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [syncSessionUser]);

  React.useEffect(() => {
    if (!authLoading && isDashboardPage && !authSession) {
      navigateLogin();
    }
  }, [authLoading, authSession, isDashboardPage]);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeMenu();
    setLanguageMenuOpen(false);
  };

  const navigateHome = (hash = '') => {
    window.history.pushState({}, '', `/${hash}`);
    setCurrentPath('/');
    window.setTimeout(() => {
      if (!hash) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
    }, 0);
    closeMenu();
    setLanguageMenuOpen(false);
  };

  const navigateLogin = () => {
    window.history.pushState({}, '', '/login');
    setCurrentPath('/login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeMenu();
    setLanguageMenuOpen(false);
  };

  const navigateSignUp = () => {
    window.history.pushState({}, '', '/signup');
    setCurrentPath('/signup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeMenu();
    setLanguageMenuOpen(false);
  };

  const navigateDashboard = () => {
    console.log('[auth] redirect start', '/dashboard');
    window.history.pushState({}, '', '/dashboard');
    setCurrentPath('/dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeMenu();
    setLanguageMenuOpen(false);
  };

  const completeAuth = async (session: Session | null, message: string) => {
    if (session) {
      setAuthSession(session);
      setAuthUser(profileToAppUser(session.user, null));
      window.setTimeout(() => {
        setDashboardTransition(true);
        window.setTimeout(() => {
          navigateDashboard();
          setDashboardTransition(false);
        }, 4000);
      }, 1050);
      syncSessionUser(session).catch((error) => {
        console.error('[auth] post-redirect profile sync error', error);
      });
    }
    return message;
  };

  const formatAuthError = (message: string) => {
    const normalized = message.toLowerCase();

    if (normalized.includes('invalid login')) return 'Invalid email or password.';
    if (normalized.includes('already registered') || normalized.includes('already exists')) {
      return 'This email is already registered.';
    }
    if (normalized.includes('password')) return message;

    return message || 'Invalid email or password.';
  };

  const handleSignUp = async (name: string, company: string, email: string, password: string) => {
    console.log('[auth] signUp action start');
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: name.trim(),
          company_name: company.trim(),
          role: '',
        },
      },
    });

    console.log('[auth] signUp action result', { data, error });

    if (error) {
      console.error('[auth] signUp action error', error);
      return formatAuthError(error.message);
    }

    if (data.session) {
      return completeAuth(data.session, 'Account created. Redirecting to dashboard.');
    }

    if (data.user) {
      console.log('[auth] signUp user exists without session', data.user);
    }

    return 'Account created. Check your email to confirm your account.';
  };

  const handleSignIn = async (email: string, password: string) => {
    console.log('[auth] signIn action start');
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    console.log('[auth] signIn action result', { data, error });

    if (error) {
      console.error('[auth] signIn action error', error);
      return formatAuthError(error.message);
    }

    if (!data.session) {
      console.error('[auth] signIn missing session');
      return 'Signed in, but no session was returned.';
    }

    return completeAuth(data.session, 'Signed in. Redirecting to dashboard.');
  };

  const handleAppleSignIn = async () => {
    console.log('[auth] apple signIn action start');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      console.error('[auth] apple signIn action error', error);
      return formatAuthError(error.message);
    }

    return null;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAuthSession(null);
    setAuthUser(null);
    navigateLogin();
  };

  return (
    <div
      className="site-shell"
      style={
        {
          '--header-height': `${headerHeight}px`,
          '--wave-depth': `${waveDepth}px`,
          '--brand-left': `${brandLeft}px`,
          '--brand-top': `${brandTop}px`,
          '--nav-top': `${navTop}px`,
          '--nav-right': `${navRight}px`,
          '--expanded-menu-left': `${expandedMenuLeftPosition}px`,
          '--expanded-menu-panel-left': `${expandedMenuPanelLeft}px`,
          '--slogan-left': `${sloganLeft}px`,
          '--nav-scale': navScale,
          '--nav-reveal-progress': navRevealProgress,
          '--slogan-progress': sloganProgress,
          '--expanded-menu-progress': expandedMenuProgress,
          '--brand-scale': brandScale,
          '--logo-rotation': `${logoRotation}deg`,
          '--scroll-progress': headerProgress,
          '--edge-straight-progress': edgeStraightProgress,
        } as React.CSSProperties
      }
    >
      <header className={authUser ? 'topbar topbar-authenticated' : 'topbar'}>
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigateHome();
          }}
          aria-label="YVIMO home"
        >
          <img
            className="brand-logo brand-logo-square"
            src="/assets/logos/yvimo-square-logo-2024.png"
            alt=""
            aria-hidden="true"
          />
          <span className="brand-letters-wrap">
            <img
              className="brand-logo brand-logo-letters"
              src="/assets/logos/yvimo-logo-letters-holding.png"
          alt="YVIMO"
            />
          </span>
        </a>
        <div className="header-slogan" aria-hidden="true">
          <span>{t('Engineering Automation')}</span>
          <span>
            {t('that')} <strong>{t('delivers results')}</strong>
          </span>
        </div>
        <button
          className={expandedMenuActive ? 'expanded-menu-button active' : 'expanded-menu-button'}
          type="button"
          aria-label={menuOpen ? t('Close navigation') : t('Open navigation')}
          aria-expanded={menuOpen}
          onClick={() => {
            setLanguageMenuOpen(false);
            setMenuOpen((value) => !value);
          }}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <button
          className={
            expandedMenuActive
              ? 'language-circle-button expanded-language-button active'
              : 'language-circle-button expanded-language-button'
          }
          type="button"
          aria-label={t('Select language')}
          aria-expanded={languageMenuOpen}
          onClick={() => {
            setMenuOpen(false);
            setLanguageMenuOpen((value) => !value);
          }}
        >
          <Languages size={24} />
        </button>
        <button
          className="icon-button menu-button"
          type="button"
          aria-label={menuOpen ? t('Close navigation') : t('Open navigation')}
          onClick={() => {
            setLanguageMenuOpen(false);
            setMenuOpen((value) => !value);
          }}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <button
          className={
            expandedMenuActive
              ? 'language-circle-button compact-language-button'
              : 'language-circle-button compact-language-button active'
          }
          type="button"
          aria-label={t('Select language')}
          aria-expanded={languageMenuOpen}
          onClick={() => {
            setMenuOpen(false);
            setLanguageMenuOpen((value) => !value);
          }}
        >
          <Languages size={19} />
        </button>
        {!isAuthPage && !authUser && (
          <a
            className={
              expandedMenuActive
                ? 'compact-login-button'
                : 'compact-login-button active'
            }
            href="/login"
            aria-label={t('Open sign in')}
            onClick={(event) => {
              event.preventDefault();
              navigateLogin();
            }}
          >
            <LogIn size={18} />
            <span>{t('Sign in')}</span>
          </a>
        )}
        {!isAuthPage && authUser && (
          <button className="compact-user-card" type="button" onClick={navigateDashboard}>
            <span
              className="compact-user-avatar-stack"
              style={{ '--compact-profile-progress': `${headerProfileLevelProgress}%` } as React.CSSProperties}
              aria-hidden="true"
            >
              <span className="compact-user-ring">
                <UserAvatar user={authUser} className="compact-user-avatar" />
              </span>
              <span className="compact-user-level">
                LV <strong>{headerProfileLevel}</strong>
              </span>
            </span>
            <span className="compact-user-copy">
              <strong>{authUser.name}</strong>
              <span className="compact-user-meta">
                <span className={getSubscriptionClass(authUser.subscription)}>
                  {authUser.subscription}
                </span>
                <span className="compact-user-points">
                  <Star size={15} fill="currentColor" />
                  <strong>{headerYvimoPoints.toLocaleString()}</strong>
                </span>
              </span>
            </span>
          </button>
        )}
        <div
          className={
            [
              'language-menu-panel',
              languageMenuOpen ? 'open' : '',
              expandedMenuActive ? 'expanded' : 'compact',
            ].filter(Boolean).join(' ')
          }
        >
          {languages.map((item) => (
            <button
              className={item.code === currentLanguage.code ? 'active' : ''}
              type="button"
              key={item.code}
              onClick={() => {
                setLanguage(item.code);
                setLanguageMenuOpen(false);
              }}
            >
              <span className={`language-flag ${item.flagClass}`} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
        <div
          className={
            menuOpen && expandedMenuActive
              ? 'expanded-menu-panel open'
              : 'expanded-menu-panel'
          }
        >
          <a href="/#services" onClick={(event) => { event.preventDefault(); navigateHome('#services'); }}>{t('Services')}</a>
          <a href="/#gateway" onClick={(event) => { event.preventDefault(); navigateHome('#gateway'); }}>{t('Gateway')}</a>
          <a href="/#solutions" onClick={(event) => { event.preventDefault(); navigateHome('#solutions'); }}>{t('Solutions')}</a>
          <a href="/#platform" onClick={(event) => { event.preventDefault(); navigateHome('#platform'); }}>{t('Platform')}</a>
          {authUser ? (
            <button className="panel-user-card" type="button" onClick={navigateDashboard}>
              <span
                className="compact-user-avatar-stack"
                style={{ '--compact-profile-progress': `${headerProfileLevelProgress}%` } as React.CSSProperties}
                aria-hidden="true"
              >
                <span className="compact-user-ring">
                  <UserAvatar user={authUser} className="compact-user-avatar" />
                </span>
                <span className="compact-user-level">
                  LV <strong>{headerProfileLevel}</strong>
                </span>
              </span>
              <span className="compact-user-copy">
                <strong>{authUser.name}</strong>
                <span className="compact-user-meta">
                  <span className={getSubscriptionClass(authUser.subscription)}>
                    {authUser.subscription}
                  </span>
                  <span className="compact-user-points">
                    <Star size={15} fill="currentColor" />
                    <strong>{headerYvimoPoints.toLocaleString()}</strong>
                  </span>
                </span>
                <em>{t('Go to Dashboard')}</em>
              </span>
            </button>
          ) : (
            <a className="panel-login" href="/login" onClick={(event) => { event.preventDefault(); navigateLogin(); }}><LogIn size={16} />{t('Sign in')}</a>
          )}
          <a className="panel-cta" href="/#contact" onClick={(event) => { event.preventDefault(); navigateHome('#contact'); }}>{t('Start a project')}</a>
        </div>
        <nav className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Primary navigation">
          <a href="/#services" onClick={(event) => { event.preventDefault(); navigateHome('#services'); }}>{t('Services')}</a>
          <a href="/#gateway" onClick={(event) => { event.preventDefault(); navigateHome('#gateway'); }}>{t('Gateway')}</a>
          <a href="/#solutions" onClick={(event) => { event.preventDefault(); navigateHome('#solutions'); }}>{t('Solutions')}</a>
          <a href="/#platform" onClick={(event) => { event.preventDefault(); navigateHome('#platform'); }}>{t('Platform')}</a>
          <a className="nav-cta" href="/#contact" onClick={(event) => { event.preventDefault(); navigateHome('#contact'); }}>{t('Start a project')}</a>
        </nav>
        <svg
          className="header-wave"
          viewBox="0 0 1600 120"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M0 0 C80 62 210 80 360 56 C500 34 570 0 710 0 C850 0 930 46 1080 76 C1225 105 1410 84 1600 28 L1600 0 Z" />
        </svg>
        <div className="header-orange-edge" aria-hidden="true">
          <svg viewBox="0 0 1600 120" preserveAspectRatio="none" focusable="false">
            <path d={orangeEdgePath} />
          </svg>
        </div>
      </header>

      {authLoading ? (
        <main className="auth-loading-page">
          <div className="auth-loading-card">
            <span className="status-dot" />
            {t('Loading workspace...')}
          </div>
        </main>
      ) : dashboardTransition ? (
        <DashboardLoadingPage t={t} />
      ) : isLoginPage ? (
        <LoginPage
          onNavigateSignUp={navigateSignUp}
          onSignIn={handleSignIn}
          onAppleSignIn={handleAppleSignIn}
          t={t}
        />
      ) : isSignUpPage ? (
        <SignUpPage
          onNavigateLogin={navigateLogin}
          onSignUp={handleSignUp}
          t={t}
        />
      ) : isDashboardPage ? (
        authUser ? (
        <LoggedDashboardPage
          user={authUser}
          onSignOut={handleSignOut}
          onNavigate={navigateTo}
          activePath={currentPath}
          t={t}
        />
        ) : (
          <LoginPage
            onNavigateSignUp={navigateSignUp}
            onSignIn={handleSignIn}
            onAppleSignIn={handleAppleSignIn}
            t={t}
          />
        )
      ) : isAcademyPage ? (
        isAcademyCatalogPage ? (
          <AcademyCatalogPage user={authUser} navigateTo={navigateTo} t={t} languageCode={language} />
        ) : isAcademyProgressPage ? (
          <AcademyProgressPage user={authUser} navigateTo={navigateTo} t={t} languageCode={language} />
        ) : isAcademyCertificatesPage ? (
          <AcademyCertificatesPage
            user={authUser}
            navigateTo={navigateTo}
            certificateId={academyCertificateId}
            t={t}
            languageCode={language}
          />
        ) : academyTrackSlug ? (
          <AcademyTrackPage
            user={authUser}
            navigateTo={navigateTo}
            trackSlug={academyTrackSlug}
            t={t}
            languageCode={language}
          />
        ) : academyCourseSlug && academyLessonSlug ? (
          <AcademyLessonPage
            user={authUser}
            navigateTo={navigateTo}
            courseSlug={academyCourseSlug}
            lessonSlug={academyLessonSlug}
            t={t}
            languageCode={language}
          />
        ) : academyCourseSlug ? (
          <AcademyCoursePage
            user={authUser}
            navigateTo={navigateTo}
            courseSlug={academyCourseSlug}
            t={t}
            languageCode={language}
          />
        ) : (
          <AcademyHomePage user={authUser} navigateTo={navigateTo} t={t} languageCode={language} />
        )
      ) : selectedBusinessLine ? (
        <BusinessLinePage
          line={selectedBusinessLine}
          onNavigateHome={navigateHome}
          t={t}
        />
      ) : (
      <main>
        <section className="hero-section" id="home">
          <div className="hero-visual" aria-hidden="true">
            <div className="grid-layer" />
            <div className="signal-line line-a" />
            <div className="signal-line line-b" />
            <div className="signal-line line-c" />
            <img
              className="industrial-robot-layer robot-layer-left"
              src="/assets/hero/robot-left.png"
              alt=""
              aria-hidden="true"
            />
            <img
              className="industrial-robot-layer robot-layer-right"
              src="/assets/hero/robot-right.png"
              alt=""
              aria-hidden="true"
            />
            <div className="hero-console">
              <div className="console-header">
                <span className="status-dot" />
                <span>YVIMO Operations Fabric</span>
                <strong>LIVE</strong>
              </div>
              <div className="console-body">
                <div className="metric-panel">
                  <Gauge size={22} />
                  <span>Gateway Health</span>
                  <strong>98.7%</strong>
                </div>
                <div className="metric-panel">
                  <RadioTower size={22} />
                  <span>PLC Routes</span>
                  <strong>24</strong>
                </div>
                <div className="route-map">
                  <span className="node source"><Cpu size={18} /> PLC</span>
                  <span className="route-connector" />
                  <span className="node core"><ServerCog size={18} /> Gateway</span>
                  <span className="route-connector" />
                  <span className="node output"><Database size={18} /> API</span>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">{t('Industrial automation, software services, and connected products')}</p>
            <h1>{t('Automation systems built beyond the machine.')}</h1>
            <p className="hero-lede">
              {t('We build control systems, industrial software, and connected products that help manufacturers modernize machines, move data reliably, and turn operations into scalable digital systems.')}
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#contact">
                {t('Start a project')} <ArrowRight size={18} />
              </a>
              <a className="secondary-action" href="#gateway">{t('Explore our solutions')}</a>
            </div>
          </div>
        </section>

        <ServicesShowcase t={t} />

        <section className="section" id="lines">
          <div className="section-heading business-heading">
            <p className="eyebrow">{t('Business lines')}</p>
            <h2>{t('The four divisions that move YVIMO forward.')}</h2>
            <p>
              {t('Industrial automation remains our core. Around it, YVIMO grows through software services, proprietary products, and YVIMO Academy: our learning space for the next generation of industrial talent.')}
            </p>
          </div>
          <div className="business-grid">
            {businessLines.map((line) => {
              const Icon = line.icon;
              return (
                <a
                  className="business-card"
                  href={`/business/${line.slug}`}
                  key={line.title}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateTo(`/business/${line.slug}`);
                  }}
                >
                  <div className="card-icon"><Icon size={24} /></div>
                  <p className="eyebrow">{t(line.eyebrow)}</p>
                  <h3>{t(line.title)}</h3>
                  <p>{t(line.description)}</p>
                  <ul>
                    {line.points.map((point) => (
                      <li key={point}><Check size={16} /> {t(point)}</li>
                    ))}
                  </ul>
                </a>
              );
            })}
          </div>
        </section>

        <section className="product-section" id="gateway">
          <div className="product-copy">
            <div className="product-title">
              <img src="/assets/logos/gateway-logo.png" alt="" />
              <div className="product-title-copy">
                <p className="eyebrow featured-eyebrow"><Star size={15} fill="currentColor" /> {t('Featured product')}</p>
                <h2>YVIMO Gateway</h2>
              </div>
            </div>
            <p>
              {t('The industrial data layer for turning PLCs, edge devices, and shop-floor tags into clean routes, APIs, dashboards, and outputs.')}
            </p>
            <div className="feature-area">
              <div className="feature-list">
                {gatewayFeatures.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <article className="feature-card" key={feature.title}>
                      <Icon size={18} />
                      <strong>{t(feature.title)}</strong>
                      <span>{t(feature.description)}</span>
                    </article>
                  );
                })}
              </div>
              <a className="primary-action gateway-demo-button" href="/gateway-demo">{t('Try Online Demo')} <Rocket size={17} /></a>
            </div>
          </div>
          <div className="gateway-panel" aria-label="YVIMO Gateway preview">
            <div className="panel-toolbar">
              <span>{t('Gateway runtime console')}</span>
              <strong>{t('Edge node: Line 04')}</strong>
            </div>
            <div className="dashboard-grid">
              <div className="dash-card tall">
                <Network size={22} />
                <span>{t('Live routes')}</span>
                <strong>{t('Sources -> Gateway core -> Destinations')}</strong>
                <div className="mini-flow">
                  <i />
                  <b />
                  <i />
                  <b />
                  <i />
                </div>
              </div>
              <div className="dash-card">
                <TerminalSquare size={22} />
                <span>{t('Runtime API')}</span>
                <strong>/api/tags/live</strong>
              </div>
              <div className="dash-card">
                <ShieldCheck size={22} />
                <span>{t('Node status')}</span>
                <strong>{t('Running local')}</strong>
              </div>
              <div className="dash-card wide">
                <Workflow size={22} />
                <span>{t('Output destinations')}</span>
                <strong>{t('Database, MQTT, Webhook, Reports, PLC writeback')}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="solutions">
          <div
            className={
              activeSolution
                ? 'ecosystem-background has-active-solution'
                : 'ecosystem-background'
            }
            aria-hidden="true"
          >
            {ecosystemTiles.map((tile, index) => (
              <span
                className={[
                  'ecosystem-tile',
                  tile.tileSize === 'wide' ? 'wide' : '',
                  activeSolution && activeSolution === tile.group ? 'active' : '',
                  activeSolution && activeSolution !== tile.group ? 'dimmed' : '',
                ].filter(Boolean).join(' ')}
                key={`${tile.name}-${index}`}
                style={
                  {
                    '--tag-color': tile.tileColor ?? tile.color,
                    '--tile-index': index,
                    '--logo-width': tile.logoWidth,
                    '--logo-max-height': tile.logoMaxHeight,
                  } as React.CSSProperties
                }
              >
                {tile.logoSrc || tile.logoSlug ? (
                  <img
                    src={
                      tile.logoSrc ??
                      `https://cdn.simpleicons.org/${tile.logoSlug}/${tile.color.replace('#', '')}`
                    }
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.closest('.ecosystem-tile')?.remove();
                    }}
                  />
                ) : null}
              </span>
            ))}
          </div>
          <div className="section-heading compact solutions-heading">
            <p className="eyebrow">{t('Compatible & flexible')}</p>
            <h2>{t('Built to work with the technologies you already use.')}</h2>
            <p>
              {t('YVIMO integrates controls, robotics, software, and data systems across modern industrial environments.')}
            </p>
          </div>
          <div className="solution-grid">
            {solutions.map((solution) => {
              const Icon = solution.icon;
              return (
                <article
                  className="solution-card"
                  key={solution.title}
                  onMouseEnter={() => setActiveSolution(solution.title)}
                  onMouseLeave={() => setActiveSolution(null)}
                  onFocus={() => setActiveSolution(solution.title)}
                  onBlur={() => setActiveSolution(null)}
                  tabIndex={0}
                >
                  <div className="solution-icon">
                    <Icon size={24} />
                  </div>
                  <h3>{t(solution.title)}</h3>
                  <div className="technology-tags" aria-label={`${solution.title} technology examples`}>
                    {solution.tags.map((tag) => (
                      <span
                        key={tag.name}
                        style={{ '--tag-color': tag.color } as React.CSSProperties}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                  <p>{t(solution.description)}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="process-section" id="platform">
          <div className="process-particles" aria-hidden="true">
            {processParticles.map((particle) => (
              <span key={particle} />
            ))}
          </div>
          <div className="process-heading">
            <p className="eyebrow">{t('How we work')}</p>
            <h2>{t('A clear path from concept to working system.')}</h2>
            <p>
              {t('YVIMO combines industrial experience, software development, and commissioning discipline to move projects from technical need to real operation.')}
            </p>
          </div>
          <div className="process-pipeline" aria-label="YVIMO execution pipeline">
            {processSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article className="process-node" key={step.title}>
                  <span className="process-port process-port-in" />
                  <span className="process-port process-port-out" />
                  <div className="process-node-header">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div className="process-node-icon">
                      <Icon size={21} />
                    </div>
                  </div>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.description)}</p>
                </article>
              );
            })}
          </div>
          <div className="process-result">
            <span>{t('Result')}</span>
            <strong>
              {t('A working automation, software, or integration system ready for real operations.')}
            </strong>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="contact-copy">
            <p className="eyebrow">{t('Start here')}</p>
            <h2>{t('Tell us what you want to connect, automate, or improve.')}</h2>
            <p>
              {t('Share the machine, process, data flow, or operational challenge you have in mind. YVIMO can help define the right path-from controls and software to integration, validation, and deployment.')}
            </p>
            <div className="contact-actions">
              <a className="primary-action" href="mailto:info@yvimo.com">
                {t('Start a project')} <ArrowRight size={18} />
              </a>
              <a className="contact-secondary-action" href="#gateway">
                {t('Explore YVIMO Gateway')}
              </a>
            </div>
          </div>
          <div className="project-intake-card" aria-label="Project intake preview">
            <div className="intake-toolbar">
              <span>{t('Project input')}</span>
              <strong>{t('Ready')}</strong>
            </div>
            <div className="intake-flow">
              <div><Factory size={18} /><span>{t('Machine / process')}</span></div>
              <div><Database size={18} /><span>{t('Data / automation need')}</span></div>
              <div><Workflow size={18} /><span>{t('Expected output')}</span></div>
              <div><Rocket size={18} /><span>{t('Working system')}</span></div>
            </div>
          </div>
        </section>
      </main>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
