import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Blocks,
  Building2,
  Cable,
  Calculator,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Check,
  CircuitBoard,
  ClipboardCheck,
  Cloud,
  Code2,
  Cpu,
  Database,
  Factory,
  FileText,
  FileUp,
  FolderCheck,
  GitBranch,
  Gauge,
  GraduationCap,
  Languages,
  LockKeyhole,
  LogIn,
  Mail,
  Menu,
  Network,
  PackageCheck,
  Pencil,
  Plus,
  RadioTower,
  Rocket,
  ServerCog,
  ShieldCheck,
  Star,
  TerminalSquare,
  Truck,
  UserPlus,
  Users,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import type { Session, User } from '@supabase/supabase-js';
import { createSessionSupabaseClient, supabase } from './lib/supabaseClient';
import { AcademyActivityPage, AcademyCatalogPage, AcademyCertificatesPage, AcademyCoursePage, AcademyHomePage, AcademyLessonPage, AcademyProgressPage, AcademyTrackPage } from './pages/AcademyPages';
import { ProductionOrdersWorkspace, TraceabilityWorkspace, WorkCentersWorkspace } from './manufacturing/MesWorkspaces';
import { InventoryWorkspace } from './manufacturing/InventoryWorkspace';
import { StatisticsWorkspace } from './manufacturing/StatisticsWorkspace';
import { OperatorTerminalWorkspace } from './manufacturing/OperatorTerminalWorkspace';
import { QualityOperationsWorkspace, type QualityContextTab } from './manufacturing/QualityOperationsWorkspace';
import { SupplierOperationsWorkspace, type SupplierContextTab } from './manufacturing/SupplierOperationsWorkspace';
import { CustomerOperationsWorkspace, type ClientsContextTab } from './manufacturing/CustomerOperationsWorkspace';
import './manufacturing/customerOperations.css';
import './manufacturing/clientBalances.css';
import './styles.css';
import './manufacturing/customerModalControls.css';
import './manufacturing/operatorTerminalDropdowns.css';

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

type SubscriptionTier = 'Explorer' | 'Professional' | 'Enterprise' | 'Founder' | 'Instructor' | 'Beta Tester' | 'Owner';

type UserProfile = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  role: string | null;
  subscription_tier: SubscriptionTier;
  yvimo_points: number | null;
  experience_points: number | null;
  profile_level: number | null;
  profile_level_progress: number | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

type AppUser = {
  id: string;
  email: string;
  name: string;
  company?: string;
  subscription: SubscriptionTier;
  yvimoPoints: number;
  experiencePoints: number;
  profileLevel: number;
  profileLevelProgress: number;
  avatarUrl?: string;
};

type ManufacturingOrganizationRole = 'Owner' | 'Admin' | 'Operator' | 'Viewer' | 'Supplier';

type ManufacturingOrganization = {
  id: string;
  name: string;
  inviteCode: string;
  logoUrl: string;
  role: ManufacturingOrganizationRole;
  inviteRole: ManufacturingOrganizationInviteRole;
  memberCount: number;
};

type ManufacturingOrganizationInviteRole = Extract<ManufacturingOrganizationRole, 'Admin' | 'Operator' | 'Viewer' | 'Supplier'>;
type WorkspaceAccessMode = 'workspace' | 'supplier';

type ManufacturingOrganizationMemberRow = {
  organization_id: string;
  role: ManufacturingOrganizationRole;
};

type ManufacturingOrganizationRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

type ManufacturingOrganizationInviteRow = {
  organization_id: string;
  code: string;
  default_role: ManufacturingOrganizationInviteRole;
};

type ManufacturingOrganizationMember = {
  id: string;
  userId: string;
  role: ManufacturingOrganizationRole;
  profile: AppUser;
};

type ManufacturingOrganizationMemberTableRow = {
  id: string;
  user_id: string;
  role: ManufacturingOrganizationRole;
};

type ManufacturingOrganizationMemberProfileRow = Pick<UserProfile, 'id' | 'full_name' | 'subscription_tier' | 'yvimo_points' | 'experience_points' | 'profile_level' | 'profile_level_progress' | 'avatar_url'>;

type ProfileLoadState = 'idle' | 'loading' | 'loaded' | 'error';

const getManufacturingOrganizationStorageKey = (userId: string) => `yvimo-manufacturing-organization:${userId}`;

function createManufacturingInviteCode(name: string) {
  const prefix = name
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, 'YVI');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

function getManufacturingOrganizationNameSuggestion(user: AppUser) {
  return user.company?.trim() || `${user.name.split(' ')[0] || 'YVIMO'} Manufacturing`;
}

function loadWorkspaceAccessMode(): WorkspaceAccessMode {
  if (typeof window === 'undefined') return 'workspace';

  try {
    const storedMode = window.localStorage.getItem('yvimo-workspace-access-mode');
    return storedMode === 'supplier' ? 'supplier' : 'workspace';
  } catch (error) {
    console.warn('Unable to load workspace access mode', error);
    return 'workspace';
  }
}

function isLegacyDefaultManufacturingOrganization(user: AppUser, organization: Partial<ManufacturingOrganization>) {
  return organization.id === `local-${user.id}`
    && organization.name === getManufacturingOrganizationNameSuggestion(user)
    && (organization.role ?? 'Owner') === 'Owner'
    && Math.max(1, Number(organization.memberCount) || 1) === 1
    && !organization.logoUrl;
}

function loadManufacturingOrganization(user: AppUser): ManufacturingOrganization | null {
  if (typeof window === 'undefined') return null;

  try {
    const storageKey = getManufacturingOrganizationStorageKey(user.id);
    const storedOrganization = window.localStorage.getItem(storageKey);
    if (!storedOrganization) return null;
    const parsedOrganization = JSON.parse(storedOrganization) as Partial<ManufacturingOrganization>;
    if (!parsedOrganization.name || !parsedOrganization.inviteCode) return null;
    if (isLegacyDefaultManufacturingOrganization(user, parsedOrganization)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return {
      id: parsedOrganization.id || `local-${user.id}`,
      name: parsedOrganization.name,
      inviteCode: parsedOrganization.inviteCode,
      logoUrl: parsedOrganization.logoUrl || '',
      role: parsedOrganization.role || 'Owner',
      inviteRole: parsedOrganization.inviteRole || 'Operator',
      memberCount: Math.max(1, Number(parsedOrganization.memberCount) || 1),
    };
  } catch (error) {
    console.warn('Unable to load manufacturing organization', error);
    return null;
  }
}

async function loadSupabaseManufacturingOrganization(userId: string): Promise<ManufacturingOrganization | null> {
  const { data: memberRows, error: memberError } = await supabase
    .from('manufacturing_organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (memberError) throw memberError;
  const member = (memberRows?.[0] ?? null) as ManufacturingOrganizationMemberRow | null;
  if (!member) return null;

  const { data: organizationRow, error: organizationError } = await supabase
    .from('manufacturing_organizations')
    .select('id, name, logo_url')
    .eq('id', member.organization_id)
    .single();

  if (organizationError) throw organizationError;

  const { data: inviteRows } = await supabase
    .from('manufacturing_organization_invites')
    .select('organization_id, code, default_role')
    .eq('organization_id', member.organization_id)
    .eq('active', true)
    .limit(1);

  const { count } = await supabase
    .from('manufacturing_organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', member.organization_id);

  const organization = organizationRow as ManufacturingOrganizationRow;
  const invite = (inviteRows?.[0] ?? null) as ManufacturingOrganizationInviteRow | null;

  return {
    id: organization.id,
    name: organization.name,
    logoUrl: organization.logo_url ?? '',
    inviteCode: invite?.code ?? createManufacturingInviteCode(organization.name),
    role: member.role,
    inviteRole: invite?.default_role ?? 'Operator',
    memberCount: Math.max(1, count ?? 1),
  };
}

function normalizeNonNegativeNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.round(Number(value))) : fallback;
}

function normalizeProfileLevel(value: number | null | undefined) {
  return Math.max(1, normalizeNonNegativeNumber(value, 1));
}

function normalizeProfileProgress(value: number | null | undefined) {
  return Math.min(100, normalizeNonNegativeNumber(value, 0));
}

function getProfileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  return initials || 'Y';
}

function organizationMemberProfileToAppUser(userId: string, profile: ManufacturingOrganizationMemberProfileRow | null): AppUser {
  return {
    id: userId,
    email: '',
    name: profile?.full_name?.trim() || `Member ${userId.slice(0, 8)}`,
    subscription: profile?.subscription_tier ?? 'Explorer',
    yvimoPoints: normalizeNonNegativeNumber(profile?.yvimo_points),
    experiencePoints: normalizeNonNegativeNumber(profile?.experience_points),
    profileLevel: normalizeProfileLevel(profile?.profile_level),
    profileLevelProgress: normalizeProfileProgress(profile?.profile_level_progress),
    avatarUrl: profile?.avatar_url ?? undefined,
  };
}

function getSubscriptionSlug(subscription: SubscriptionTier) {
  return subscription.toLowerCase().replace(/\s+/g, '-');
}

function getSubscriptionClass(subscription: SubscriptionTier) {
  return `subscription-pill subscription-${getSubscriptionSlug(subscription)}`;
}

function getSubscriptionBadgeImage(subscription: SubscriptionTier) {
  const badgeMap: Record<SubscriptionTier, string> = {
    Explorer: '/assets/academy/badges/license-explorer.png',
    Professional: '/assets/academy/badges/license-professional.png',
    Enterprise: '/assets/academy/badges/license-enterprise.png',
    Founder: '/assets/academy/badges/license-founder.png',
    Instructor: '/assets/academy/badges/license-instructor.png',
    'Beta Tester': '/assets/academy/badges/license-beta-tester.png',
    Owner: '/assets/academy/badges/license-owner.png',
  };

  return badgeMap[subscription];
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
    yvimoPoints: normalizeNonNegativeNumber(profile?.yvimo_points),
    experiencePoints: normalizeNonNegativeNumber(profile?.experience_points),
    profileLevel: normalizeProfileLevel(profile?.profile_level),
    profileLevelProgress: normalizeProfileProgress(profile?.profile_level_progress),
    avatarUrl: profile?.avatar_url || (typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined),
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

type AvatarUploadResult = {
  ok: boolean;
  message: string;
};

type AvatarOffset = {
  x: number;
  y: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded.'));
    image.src = src;
  });
}

async function createCroppedAvatarFile(file: File, offset: AvatarOffset, zoom: number) {
  const previewSize = 188;
  const outputSize = 512;
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas is not available.');
    }

    context.clearRect(0, 0, outputSize, outputSize);

    const baseScale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight);
    const scale = baseScale * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const outputOffsetX = offset.x * (outputSize / previewSize);
    const outputOffsetY = offset.y * (outputSize / previewSize);

    context.drawImage(
      image,
      (outputSize - drawWidth) / 2 + outputOffsetX,
      (outputSize - drawHeight) / 2 + outputOffsetY,
      drawWidth,
      drawHeight,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
          return;
        }

        reject(new Error('Avatar image could not be created.'));
      }, 'image/png', 0.92);
    });

    return new File([blob], 'profile-avatar.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

type BillingPeriod = 'monthly' | 'three_months' | 'six_months' | 'annual';

type CheckoutPlan = {
  product_key: string;
  plan_key: string;
  billing_period: BillingPeriod;
  price_display: string;
  price_id: string | null;
};

type MembershipPlan = {
  name: Extract<SubscriptionTier, 'Explorer' | 'Professional' | 'Enterprise'>;
  description: string;
  badge: string | null;
  badgeImage: string;
  monthly: {
    price: string;
    label: string;
    cta: string;
    plan_key: string;
    note: string | null;
  };
  three_months: {
    price: string;
    label: string;
    cta: string;
    plan_key: string;
    note: string | null;
  };
  six_months: {
    price: string;
    label: string;
    cta: string;
    plan_key: string;
    note: string | null;
  };
  annual: {
    price: string;
    label: string;
    cta: string;
    plan_key: string;
    note: string | null;
  };
  features: string[];
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
    'New to YVIMO?': '¿Nuevo en YVIMO?',
    'Create your YVIMO account': 'Crea tu cuenta YVIMO',
    'Already have an account?': '¿Ya tienes una cuenta?',
    'Continue with Apple Passkey': 'Continuar con Apple Passkey',
    'Continue with Microsoft': 'Continuar con Microsoft',
    'Continue with Google': 'Continuar con Google',
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
    'Official team ranks': 'Rangos oficiales del equipo',
    'Our staff members': 'Nuestro equipo',
    'To help you recognize official YVIMO staff easily, team profiles may carry one of these ranks. These badges identify people who create Academy content, test upcoming features, or represent YVIMO leadership.':
      'Para que puedas reconocer facilmente al equipo oficial de YVIMO, los perfiles del staff pueden mostrar uno de estos rangos. Estas insignias identifican a quienes crean contenido de Academy, prueban nuevas funciones o representan el liderazgo de YVIMO.',
    'Academy staff': 'Staff de Academy',
    'Product testing': 'Pruebas de producto',
    'YVIMO leadership': 'Liderazgo YVIMO',
    'Beta Tester': 'Beta Tester',
    Owner: 'Owner',
    'Official instructors and collaborators who create lessons, review learning material, and support students inside YVIMO Academy.':
      'Instructores y colaboradores oficiales que crean lecciones, revisan material de aprendizaje y apoyan a estudiantes dentro de YVIMO Academy.',
    'Trusted testers who validate new platform features, report issues, and help us improve tools before public release.':
      'Testers de confianza que validan nuevas funciones, reportan problemas y nos ayudan a mejorar herramientas antes de publicarlas.',
    'Official YVIMO ownership and leadership accounts responsible for platform direction, official decisions, and company-level communication.':
      'Cuentas oficiales de propiedad y liderazgo de YVIMO responsables de la direccion de la plataforma, decisiones oficiales y comunicacion de la empresa.',
    'Course guidance and mentoring': 'Guia de cursos y mentorias',
    'Academy content review': 'Revision de contenido de Academy',
    'Learning path support': 'Soporte en rutas de aprendizaje',
    'Early feature validation': 'Validacion temprana de funciones',
    'Bug reporting and feedback': 'Reporte de errores y feedback',
    'Preview workflow testing': 'Pruebas de flujos en preview',
    'Official YVIMO communication': 'Comunicacion oficial de YVIMO',
    'Platform and business decisions': 'Decisiones de plataforma y negocio',
    'Final escalation authority': 'Autoridad final de escalamiento',
    'All official YVIMO staff members display one of these badges on their profile. Please do not trust accounts claiming to represent YVIMO if their profile does not show an official staff badge.':
      'Todo el personal oficial de YVIMO muestra una de estas insignias en su perfil. No confies en cuentas que digan representar a YVIMO si su perfil no muestra una insignia oficial del staff.',
    'Change profile picture': 'Cambiar foto de perfil',
    'Profile picture': 'Foto de perfil',
    'Choose image': 'Elegir imagen',
    Zoom: 'Zoom',
    'Center image': 'Centrar imagen',
    'Drag image to reposition it': 'Arrastra la imagen para acomodarla',
    'Choose an image file.': 'Elige un archivo de imagen.',
    'Image must be 5 MB or smaller.': 'La imagen debe pesar 5 MB o menos.',
    'Choose an image first.': 'Elige una imagen primero.',
    'Profile picture could not be prepared.': 'No se pudo preparar la foto de perfil.',
    'Save picture': 'Guardar foto',
    'Saving...': 'Guardando...',
    Cancel: 'Cancelar',
    Close: 'Cerrar',
    'Profile picture updated.': 'Foto de perfil actualizada.',
    'Profile picture could not be uploaded.': 'No se pudo subir la foto de perfil.',
    'Profile picture was uploaded, but your profile could not be updated.':
      'La foto se subio, pero no se pudo actualizar tu perfil.',
    'Sign in again to update your profile picture.': 'Inicia sesion de nuevo para actualizar tu foto de perfil.',
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
    'New to YVIMO?': 'YVIMO 新用户？',
    'Create your YVIMO account': '创建你的 YVIMO 账户',
    'Already have an account?': '已经有账户？',
    'Continue with Apple Passkey': '使用 Apple Passkey 继续',
    'Continue with Microsoft': '使用 Microsoft 继续',
    'Continue with Google': '使用 Google 继续',
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
  'Manufacturing Ops': 'Manufacturing Ops',
  'MES, APS, production tracking, scheduling, and manufacturing intelligence in one connected workspace.':
    'MES, APS, seguimiento de producci\u00f3n, programaci\u00f3n e inteligencia de manufactura en un workspace conectado.',
  'Flagship products': 'Productos principales',
  'Start with your main YVIMO workspaces': 'Comienza con tus workspaces principales de YVIMO',
  'Secondary modules': 'M\u00f3dulos secundarios',
  'Tools, licenses, and commercial workflows': 'Herramientas, licencias y flujos comerciales',
  'MANUFACTURING OPS': 'MANUFACTURING OPS',
  MES: 'MES',
  APS: 'APS',
  Active: 'Activo',
  Selected: 'Seleccionado',
  Structured: 'Estructurado',
  'View structure': 'Ver estructura',
  'All MES modules': 'Todos los m\u00f3dulos MES',
  'All modules': 'Todos los m\u00f3dulos',
  Events: 'Eventos',
  Quality: 'Calidad',
  'This module is being structured. Data models, permissions, and CRUD workflows will be connected in a future step.':
    'Este m\u00f3dulo se est\u00e1 estructurando. Los modelos de datos, permisos y flujos CRUD se conectar\u00e1n en un paso futuro.',
  'This MES module is being structured. Data models, permissions, and CRUD workflows will be connected in a future step.':
    'Este m\u00f3dulo MES se est\u00e1 estructurando. Los modelos de datos, permisos y flujos CRUD se conectar\u00e1n en un paso futuro.',
  'Execute, track, and monitor production orders across work centers.':
    'Ejecuta, rastrea y monitorea \u00f3rdenes de producci\u00f3n en centros de trabajo.',
  'Plan and schedule production using capacity, priorities, and constraints.':
    'Planea y programa producci\u00f3n usando capacidad, prioridades y restricciones.',
  'Transform production data into actionable manufacturing KPIs.':
    'Convierte datos de producci\u00f3n en KPIs de manufactura accionables.',
  'Production order tracking': 'Seguimiento de \u00f3rdenes de producci\u00f3n',
  'Work center status': 'Estado de centros de trabajo',
  'Operator actions': 'Acciones de operador',
  'Downtime and scrap capture': 'Captura de paros y scrap',
  Traceability: 'Trazabilidad',
  'Quality checkpoints': 'Puntos de control de calidad',
  'Production schedule': 'Programa de producci\u00f3n',
  'Capacity planning': 'Planeaci\u00f3n de capacidad',
  'Work center loading': 'Carga de centros de trabajo',
  'Bottleneck visibility': 'Visibilidad de cuellos de botella',
  'Priority sequencing': 'Secuenciaci\u00f3n de prioridades',
  'OEE dashboard': 'Dashboard OEE',
  'Downtime analysis': 'An\u00e1lisis de paros',
  'Cycle time trends': 'Tendencias de tiempo ciclo',
  'Throughput visibility': 'Visibilidad de throughput',
  'Production reports': 'Reportes de producci\u00f3n',
  'Open MES': 'Abrir MES',
  'Open APS': 'Abrir APS',
  'Open Intelligence': 'Abrir Intelligence',
  'Operations Intelligence': 'Inteligencia Operativa',
  'Manufacturing execution, production tracking, traceability, quality checkpoints, and shop-floor visibility.':
    'Ejecuci\u00f3n de manufactura, seguimiento de producci\u00f3n, trazabilidad, puntos de calidad y visibilidad de piso.',
  'Manufacturing execution, production tracking, work center visibility, downtime, quality, and traceability.':
    'Ejecuci\u00f3n de manufactura, seguimiento de producci\u00f3n, visibilidad de centros de trabajo, paros, calidad y trazabilidad.',
  'Advanced planning and scheduling for work centers, capacity, priorities, and delivery constraints.':
    'Planeaci\u00f3n y programaci\u00f3n avanzada para centros de trabajo, capacidad, prioridades y restricciones de entrega.',
  'Production Orders': '\u00d3rdenes de producci\u00f3n',
  'Work Centers': 'Centros de trabajo',
  'Operator Terminal': 'Terminal de operador',
  'Production Events': 'Eventos de producci\u00f3n',
  'Inventory': 'Inventario',
  'Quality Checks': 'Revisiones de calidad',
  'Downtime Events': 'Eventos de paro',
  Clients: 'Clientes',
  'Create, release, assign, and track manufacturing orders from planned quantity to completion.':
    'Crea, libera, asigna y rastrea \u00f3rdenes de manufactura desde la cantidad planeada hasta su terminaci\u00f3n.',
  'Manage machines, lines, cells, and stations where production is executed.':
    'Administra m\u00e1quinas, l\u00edneas, celdas y estaciones donde se ejecuta la producci\u00f3n.',
  'Simple shop-floor interface for starting jobs, reporting production, scrap, downtime, and completing operations.':
    'Interfaz simple de piso para iniciar trabajos, reportar producci\u00f3n, scrap, paros y completar operaciones.',
  'Timeline of execution events such as order started, quantity added, downtime started, quality check completed, and order completed.':
    'Linea de tiempo de eventos como orden iniciada, cantidad agregada, paro iniciado, revisi\u00f3n de calidad completada y orden terminada.',
  'Track machine stops, reason codes, duration, category, and notes.':
    'Rastrea paros de m\u00e1quina, c\u00f3digos de raz\u00f3n, duraci\u00f3n, categor\u00eda y notas.',
  'Record pass/fail checks, measurements, inspection results, and quality notes linked to production orders.':
    'Registra revisiones aprobado/rechazado, mediciones, resultados de inspecci\u00f3n y notas de calidad ligadas a \u00f3rdenes de producci\u00f3n.',
  'View the complete production history for an order, lot, serial number, work center, or operation.':
    'Consulta el historial completo de producci\u00f3n por orden, lote, n\u00famero de serie, centro de trabajo u operaci\u00f3n.',
  'Manage customers, their assets and equipment, deliveries, returns, balances, documents, and vouchers.':
    'Administra clientes, sus activos y equipos, entregas, devoluciones, saldos, documentos y comprobantes.',
  'Production Schedule': 'Programa de producci\u00f3n',
  'Capacity Planning': 'Planeaci\u00f3n de capacidad',
  'Work Center Loading': 'Carga de centros de trabajo',
  Bottlenecks: 'Cuellos de botella',
  'Priority Sequencing': 'Secuenciaci\u00f3n de prioridades',
  'Build and review sequenced production plans across lines, cells, and work centers.':
    'Construye y revisa planes de producci\u00f3n secuenciados entre l\u00edneas, celdas y centros de trabajo.',
  'Compare demand against available machine, labor, and shift capacity.':
    'Compara la demanda contra la capacidad disponible de m\u00e1quinas, mano de obra y turnos.',
  'Visualize assigned workload by work center and planning horizon.':
    'Visualiza carga asignada por centro de trabajo y horizonte de planeaci\u00f3n.',
  'Identify constrained operations and overloaded resources before execution.':
    'Identifica operaciones restringidas y recursos sobrecargados antes de ejecutar.',
  'Sequence orders using due dates, priorities, changeovers, and constraints.':
    'Secuencia \u00f3rdenes usando fechas compromiso, prioridades, cambios de modelo y restricciones.',
  'OEE Dashboard': 'Dashboard OEE',
  'Downtime Analysis': 'An\u00e1lisis de paros',
  'Cycle Time Trends': 'Tendencias de tiempo ciclo',
  'Throughput Visibility': 'Visibilidad de throughput',
  'Production Reports': 'Reportes de producci\u00f3n',
  'Monitor availability, performance, quality, and total OEE by area or work center.':
    'Monitorea disponibilidad, rendimiento, calidad y OEE total por \u00e1rea o centro de trabajo.',
  'Analyze stops by reason, category, equipment, duration, and trend.':
    'Analiza paros por raz\u00f3n, categor\u00eda, equipo, duraci\u00f3n y tendencia.',
  'Track cycle time behavior and variation across products, shifts, and operations.':
    'Rastrea comportamiento y variaci\u00f3n de tiempo ciclo por productos, turnos y operaciones.',
  'Review output, pace, constraints, and production flow across the plant.':
    'Revisa salida, ritmo, restricciones y flujo de producci\u00f3n en la planta.',
  'Prepare production summaries, KPI reports, and execution history snapshots.':
    'Prepara res\u00famenes de producci\u00f3n, reportes KPI e instant\u00e1neas del historial de ejecuci\u00f3n.',
  Preview: 'Preview',
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
  onMicrosoftSignIn,
  onGoogleSignIn,
  t,
}: {
  onNavigateSignUp: () => void;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onAppleSignIn: () => Promise<string | null>;
  onMicrosoftSignIn: () => Promise<string | null>;
  onGoogleSignIn: () => Promise<string | null>;
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
              className="microsoft-button"
              type="button"
              disabled={authBusy}
              onClick={async () => {
                setAuthBusy(true);
                console.log('[auth] microsoft signIn start');

                try {
                  setFormMessage(await onMicrosoftSignIn());
                } catch (error) {
                  console.error('[auth] microsoft signIn unexpected error', error);
                  setFormMessage(error instanceof Error ? error.message : 'Invalid email or password.');
                } finally {
                  console.log('[auth] microsoft signIn loading reset');
                  setAuthBusy(false);
                }
              }}
            >
              <span className="microsoft-mark" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
              {t('Continue with Microsoft')}
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

            <button
              className="google-button"
              type="button"
              disabled={authBusy}
              onClick={async () => {
                setAuthBusy(true);
                console.log('[auth] google signIn start');

                try {
                  setFormMessage(await onGoogleSignIn());
                } catch (error) {
                  console.error('[auth] google signIn unexpected error', error);
                  setFormMessage(error instanceof Error ? error.message : 'Invalid email or password.');
                } finally {
                  console.log('[auth] google signIn loading reset');
                  setAuthBusy(false);
                }
              }}
            >
              <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
                <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.97 20.53 7.68 23 12 23Z" />
                <path fill="#fbbc05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.16C1.41 8.55 1 10.22 1 12s.41 3.45 1.16 4.94l3.68-2.84Z" />
                <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.68 1 3.97 3.47 2.16 7.06L5.84 9.9c.87-2.6 3.3-4.52 6.16-4.52Z" />
              </svg>
              {t('Continue with Google')}
            </button>

            <div className="login-auth-switch login-signup-cta">
              <span>{t('New to YVIMO?')}</span>
              <button type="button" onClick={onNavigateSignUp}>
                {t('Create account')}
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

            <div className="login-auth-switch login-signup-cta">
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
  onUpdateAvatar,
  activePath,
  t,
  languageCode,
}: {
  user: AppUser;
  onSignOut: () => void;
  onNavigate: (path: string) => void;
  onUpdateAvatar: (file: File) => Promise<AvatarUploadResult>;
  activePath: string;
  t: Translator;
  languageCode: LanguageCode;
}) {
  const [billingPeriod, setBillingPeriod] = React.useState<BillingPeriod>('monthly');
  const [checkoutMessage, setCheckoutMessage] = React.useState<string | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = React.useState(false);
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [avatarOffset, setAvatarOffset] = React.useState<AvatarOffset>({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = React.useState(1);
  const [tabletSidebarExpanded, setTabletSidebarExpanded] = React.useState(false);
  const avatarDragRef = React.useRef<{ pointerId: number; startX: number; startY: number; origin: AvatarOffset } | null>(null);
  const [avatarMessage, setAvatarMessage] = React.useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = React.useState(false);
  const membershipRank: Record<SubscriptionTier, number> = {
    Explorer: 0,
    Professional: 1,
    Enterprise: 2,
    Founder: 3,
    Instructor: 4,
    'Beta Tester': 5,
    Owner: 6,
  };
  const profileLevelProgress = user.profileLevelProgress;
  const profileLevel = user.profileLevel;
  const yvimoPoints = user.yvimoPoints;
  const [manufacturingOrganization, setManufacturingOrganization] = React.useState<ManufacturingOrganization | null>(() => loadManufacturingOrganization(user));
  const [manufacturingOrganizationName, setManufacturingOrganizationName] = React.useState(getManufacturingOrganizationNameSuggestion(user));
  const [manufacturingJoinCode, setManufacturingJoinCode] = React.useState('');
  const [manufacturingOrganizationMessage, setManufacturingOrganizationMessage] = React.useState('');
  const [manufacturingOrganizationDialogOpen, setManufacturingOrganizationDialogOpen] = React.useState(false);
  const [manufacturingUnavailableApp, setManufacturingUnavailableApp] = React.useState('');
  const [manufacturingInviteRole, setManufacturingInviteRole] = React.useState<ManufacturingOrganizationInviteRole>('Operator');
  const [manufacturingOrganizationUploadingLogo, setManufacturingOrganizationUploadingLogo] = React.useState(false);
  const [manufacturingOrganizationMode, setManufacturingOrganizationMode] = React.useState<'manage' | 'edit' | 'members' | 'switch'>('manage');
  const [manufacturingOrganizationMembers, setManufacturingOrganizationMembers] = React.useState<ManufacturingOrganizationMember[]>([]);
  const [manufacturingSwitchDialogOpen, setManufacturingSwitchDialogOpen] = React.useState(false);
  const [manufacturingSwitchAction, setManufacturingSwitchAction] = React.useState<'leave' | 'transfer' | 'disband'>('leave');
  const [manufacturingNewOwnerUserId, setManufacturingNewOwnerUserId] = React.useState('');
  const [manufacturingSwitchBusy, setManufacturingSwitchBusy] = React.useState(false);
  const [supplierContextTab, setSupplierContextTab] = React.useState<SupplierContextTab>('dashboard');
  const [workspaceAccessMode, setWorkspaceAccessMode] = React.useState<WorkspaceAccessMode>(() => loadWorkspaceAccessMode());
  const [supplierSelectedCustomer, setSupplierSelectedCustomer] = React.useState('Gleason Corp');
  const [supplierCustomerPickerOpen, setSupplierCustomerPickerOpen] = React.useState(false);
  const [supplierJoinDialogOpen, setSupplierJoinDialogOpen] = React.useState(false);
  const [supplierInvitationCode, setSupplierInvitationCode] = React.useState('');
  const [supplierJoinMessage, setSupplierJoinMessage] = React.useState('');

  React.useEffect(() => {
    try {
      window.localStorage.setItem('yvimo-workspace-access-mode', workspaceAccessMode);
    } catch (error) {
      console.warn('Unable to save workspace access mode', error);
    }
  }, [workspaceAccessMode]);

  React.useEffect(() => {
    if (!supplierJoinMessage) return;
    const messageTimer = window.setTimeout(() => setSupplierJoinMessage(''), 3200);
    return () => window.clearTimeout(messageTimer);
  }, [supplierJoinMessage]);

  React.useEffect(() => {
    const nextOrganization = loadManufacturingOrganization(user);
    setManufacturingOrganization(nextOrganization);
    setManufacturingOrganizationName(nextOrganization?.name || getManufacturingOrganizationNameSuggestion(user));
    setManufacturingJoinCode('');
    setManufacturingOrganizationMessage('');
    setManufacturingOrganizationMode(nextOrganization ? 'manage' : 'switch');
  }, [user.id]);

  React.useEffect(() => {
    if (!manufacturingUnavailableApp) return;

    const unavailableAppTimer = window.setTimeout(() => {
      setManufacturingUnavailableApp('');
    }, 5000);

    return () => window.clearTimeout(unavailableAppTimer);
  }, [manufacturingUnavailableApp]);

  React.useEffect(() => {
    let cancelled = false;
    loadSupabaseManufacturingOrganization(user.id)
      .then((organization) => {
        if (cancelled || !organization) return;
        setManufacturingOrganization(organization);
        setManufacturingOrganizationName(organization.name);
        setManufacturingInviteRole(organization.inviteRole);
        setManufacturingOrganizationMessage('');
      })
      .catch((error) => {
        console.warn('Unable to load Supabase manufacturing organization; using local fallback', error);
      });

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  React.useEffect(() => {
    try {
      if (manufacturingOrganization) {
        window.localStorage.setItem(getManufacturingOrganizationStorageKey(user.id), JSON.stringify(manufacturingOrganization));
      } else {
        window.localStorage.removeItem(getManufacturingOrganizationStorageKey(user.id));
      }
    } catch (error) {
      console.warn('Unable to save manufacturing organization', error);
    }
  }, [manufacturingOrganization, user.id]);

  React.useEffect(() => {
    if (!manufacturingOrganization || manufacturingOrganization.id.startsWith('local-') || manufacturingOrganization.id.startsWith('joined-')) {
      setManufacturingOrganizationMembers(manufacturingOrganization ? [{
        id: 'local-current-user',
        userId: user.id,
        role: manufacturingOrganization.role,
        profile: user,
      }] : []);
      return;
    }

    let cancelled = false;
    const loadMembers = async () => {
      const { data, error } = await supabase
        .from('manufacturing_organization_members')
        .select('id, user_id, role')
        .eq('organization_id', manufacturingOrganization.id)
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (error) throw error;
      const memberRows = (data ?? []) as ManufacturingOrganizationMemberTableRow[];
      const memberIds = Array.from(new Set(memberRows.map((member) => member.user_id)));
      const { data: profileRows, error: profileError } = memberIds.length > 0
        ? await supabase
          .from('profiles')
          .select('id, full_name, subscription_tier, yvimo_points, experience_points, profile_level, profile_level_progress, avatar_url')
          .in('id', memberIds)
        : { data: [], error: null };

      if (cancelled) return;
      if (profileError) throw profileError;
      const profilesById = new Map(((profileRows ?? []) as ManufacturingOrganizationMemberProfileRow[]).map((profile) => [profile.id, profile]));
      const members = memberRows.map((member) => ({
        id: member.id,
        userId: member.user_id,
        role: member.role,
        profile: member.user_id === user.id ? user : organizationMemberProfileToAppUser(member.user_id, profilesById.get(member.user_id) ?? null),
      }));
      const nextMembers = members.some((member) => member.userId === user.id)
        ? members
        : [{
          id: 'local-current-user',
          userId: user.id,
          role: manufacturingOrganization.role,
          profile: user,
        }, ...members];
      setManufacturingOrganizationMembers(nextMembers);
      setManufacturingOrganization((currentOrganization) => currentOrganization?.id === manufacturingOrganization.id
        ? { ...currentOrganization, memberCount: Math.max(1, nextMembers.length) }
        : currentOrganization);
      const nextOwner = nextMembers.find((member) => member.userId !== user.id);
      setManufacturingNewOwnerUserId((currentOwnerId) => currentOwnerId || nextOwner?.userId || '');
    };

    void loadMembers()
      .catch((error) => {
        console.warn('Unable to load manufacturing organization members', error);
        setManufacturingOrganizationMembers([{
          id: 'local-current-user',
          userId: user.id,
          role: manufacturingOrganization.role,
          profile: user,
        }]);
      });

    const refreshTimer = window.setInterval(() => {
      if (manufacturingOrganizationDialogOpen) void loadMembers().catch((error) => console.warn('Unable to refresh manufacturing organization members', error));
    }, 20000);
    const membersChannel = supabase
      .channel(`manufacturing-organization-members:${manufacturingOrganization.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'manufacturing_organization_members',
        filter: `organization_id=eq.${manufacturingOrganization.id}`,
      }, () => {
        void loadMembers().catch((error) => console.warn('Unable to refresh manufacturing organization members', error));
      })
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(membersChannel);
    };
  }, [manufacturingOrganization?.id, manufacturingOrganization?.role, manufacturingOrganizationDialogOpen, user]);

  const createManufacturingOrganization = async () => {
    const nextName = manufacturingOrganizationName.trim();
    if (!nextName) {
      setManufacturingOrganizationMessage('Enter an organization name first.');
      return;
    }

    const localOrganization: ManufacturingOrganization = {
      id: `local-${Date.now()}`,
      name: nextName,
      inviteCode: createManufacturingInviteCode(nextName),
      logoUrl: manufacturingOrganization?.logoUrl ?? '',
      role: 'Owner',
      inviteRole: manufacturingInviteRole,
      memberCount: 1,
    };

    try {
      const { data: organization, error: organizationError } = await supabase
        .from('manufacturing_organizations')
        .insert({ name: nextName, created_by: user.id })
        .select('id, name, logo_url')
        .single();

      if (organizationError) throw organizationError;

      const organizationRow = organization as ManufacturingOrganizationRow;
      const nextInviteCode = createManufacturingInviteCode(nextName);

      const { error: memberError } = await supabase
        .from('manufacturing_organization_members')
        .insert({ organization_id: organizationRow.id, user_id: user.id, role: 'Owner' });

      if (memberError) throw memberError;

      const { error: inviteError } = await supabase
        .from('manufacturing_organization_invites')
        .insert({
          organization_id: organizationRow.id,
          code: nextInviteCode,
          default_role: manufacturingInviteRole,
          created_by: user.id,
        });

      if (inviteError) throw inviteError;

      setManufacturingOrganization({
        id: organizationRow.id,
        name: organizationRow.name,
        logoUrl: organizationRow.logo_url ?? '',
        inviteCode: nextInviteCode,
        role: 'Owner',
        inviteRole: manufacturingInviteRole,
        memberCount: 1,
      });
      setManufacturingOrganizationMode('manage');
      setManufacturingOrganizationMessage('Organization created in Supabase.');
    } catch (error) {
      console.warn('Unable to create Supabase manufacturing organization; using local fallback', error);
      setManufacturingOrganization(localOrganization);
      setManufacturingOrganizationMode('manage');
      setManufacturingOrganizationMessage('Organization created locally. Run migration 034 to sync with Supabase.');
    }
  };

  const joinManufacturingOrganization = async () => {
    const nextCode = manufacturingJoinCode.trim().toUpperCase();
    if (!nextCode) {
      setManufacturingOrganizationMessage('Enter an invite code to join.');
      return;
    }

    try {
      const { data: invite, error: inviteError } = await supabase
        .from('manufacturing_organization_invites')
        .select('organization_id, code, default_role')
        .eq('code', nextCode)
        .eq('active', true)
        .single();

      if (inviteError) throw inviteError;
      const inviteRow = invite as ManufacturingOrganizationInviteRow;

      const { error: memberError } = await supabase
        .from('manufacturing_organization_members')
        .insert({
          organization_id: inviteRow.organization_id,
          user_id: user.id,
          role: inviteRow.default_role,
        });

      if (memberError) throw memberError;

      const organization = await loadSupabaseManufacturingOrganization(user.id);
      if (organization) {
        setManufacturingOrganization(organization);
        setManufacturingOrganizationName(organization.name);
        setManufacturingInviteRole(organization.inviteRole);
      }
      setManufacturingOrganizationMode('manage');
      setManufacturingOrganizationMessage('Joined organization in Supabase.');
    } catch (error) {
      console.warn('Unable to join Supabase manufacturing organization; using local fallback', error);
      const codeName = nextCode.split('-')[0] || 'TEAM';
      setManufacturingOrganization({
        id: `joined-${nextCode}`,
        name: `${codeName} Organization`,
        inviteCode: nextCode,
        logoUrl: '',
        role: 'Operator',
        inviteRole: 'Operator',
        memberCount: 2,
      });
      setManufacturingOrganizationName(`${codeName} Organization`);
      setManufacturingOrganizationMode('manage');
      setManufacturingOrganizationMessage('Joined locally. Run migration 034 to sync with Supabase.');
    }
  };

  const saveManufacturingOrganizationName = async () => {
    const nextName = manufacturingOrganizationName.trim();
    if (!manufacturingOrganization || !nextName) {
      setManufacturingOrganizationMessage('Select an organization and enter a name.');
      return;
    }

    setManufacturingOrganization((currentOrganization) => currentOrganization ? ({ ...currentOrganization, name: nextName }) : currentOrganization);

    try {
      const { error } = await supabase
        .from('manufacturing_organizations')
        .update({ name: nextName })
        .eq('id', manufacturingOrganization.id);

      if (error) throw error;
      setManufacturingOrganizationMode('manage');
      setManufacturingOrganizationMessage('Organization updated.');
    } catch (error) {
      console.warn('Unable to update manufacturing organization', error);
      setManufacturingOrganizationMode('manage');
      setManufacturingOrganizationMessage('Organization name updated locally.');
    }
  };

  const resetManufacturingOrganizationSelection = (message = 'Create a new organization or join with an invite code.') => {
    setManufacturingOrganization(null);
    setManufacturingJoinCode('');
    setManufacturingOrganizationName(getManufacturingOrganizationNameSuggestion(user));
    setManufacturingOrganizationMode('switch');
    setManufacturingOrganizationMessage(message);
    setManufacturingSwitchDialogOpen(false);
    setManufacturingSwitchAction('leave');
    setManufacturingNewOwnerUserId('');
    setManufacturingOrganizationMembers([]);
  };

  const openManufacturingSwitchConfirmation = () => {
    if (!manufacturingOrganization) {
      resetManufacturingOrganizationSelection();
      return;
    }

    const nextMembers = manufacturingOrganizationMembers.filter((member) => member.userId !== user.id);
    const ownerAction = nextMembers.length > 0 ? 'transfer' : 'disband';
    setManufacturingSwitchAction(manufacturingOrganization.role === 'Owner' ? ownerAction : 'leave');
    setManufacturingNewOwnerUserId((currentOwnerId) => currentOwnerId || nextMembers[0]?.userId || '');
    setManufacturingSwitchDialogOpen(true);
  };

  const confirmManufacturingOrganizationSwitch = async () => {
    if (!manufacturingOrganization) {
      resetManufacturingOrganizationSelection();
      return;
    }

    const isOwner = manufacturingOrganization.role === 'Owner';
    const isSupabaseOrganization = !manufacturingOrganization.id.startsWith('local-') && !manufacturingOrganization.id.startsWith('joined-');

    if (isOwner && manufacturingSwitchAction === 'transfer' && !manufacturingNewOwnerUserId) {
      setManufacturingOrganizationMessage('Select a new Owner before switching organizations.');
      return;
    }

    setManufacturingSwitchBusy(true);
    try {
      if (isSupabaseOrganization) {
        if (isOwner && manufacturingSwitchAction === 'transfer') {
          const { error: transferError } = await supabase
            .from('manufacturing_organization_members')
            .update({ role: 'Owner' })
            .eq('organization_id', manufacturingOrganization.id)
            .eq('user_id', manufacturingNewOwnerUserId);

          if (transferError) throw transferError;

          const { error: leaveError } = await supabase
            .from('manufacturing_organization_members')
            .delete()
            .eq('organization_id', manufacturingOrganization.id)
            .eq('user_id', user.id);

          if (leaveError) throw leaveError;
        } else if (isOwner && manufacturingSwitchAction === 'disband') {
          const { error: inviteError } = await supabase
            .from('manufacturing_organization_invites')
            .update({ active: false })
            .eq('organization_id', manufacturingOrganization.id);

          if (inviteError) throw inviteError;

          const { error: otherMembersError } = await supabase
            .from('manufacturing_organization_members')
            .delete()
            .eq('organization_id', manufacturingOrganization.id)
            .neq('user_id', user.id);

          if (otherMembersError) throw otherMembersError;

          const { error: currentMemberError } = await supabase
            .from('manufacturing_organization_members')
            .delete()
            .eq('organization_id', manufacturingOrganization.id)
            .eq('user_id', user.id);

          if (currentMemberError) throw currentMemberError;
        } else {
          const { error: leaveError } = await supabase
            .from('manufacturing_organization_members')
            .delete()
            .eq('organization_id', manufacturingOrganization.id)
            .eq('user_id', user.id);

          if (leaveError) throw leaveError;
        }
      }

      resetManufacturingOrganizationSelection(
        isOwner && manufacturingSwitchAction === 'disband'
          ? 'Organization disbanded. Members and active invites were removed; historical data remains in Supabase.'
          : 'Organization switched. Choose or join another organization.'
      );
    } catch (error) {
      console.warn('Unable to switch manufacturing organization', error);
      setManufacturingOrganizationMessage('Could not switch organization. Check Supabase permissions.');
    } finally {
      setManufacturingSwitchBusy(false);
    }
  };

  const regenerateManufacturingInviteCode = async () => {
    if (!manufacturingOrganization) {
      setManufacturingOrganizationMessage('Create or join an organization first.');
      return;
    }
    const nextInviteCode = createManufacturingInviteCode(manufacturingOrganization.name);
    setManufacturingOrganization((currentOrganization) => currentOrganization ? ({
      ...currentOrganization,
      inviteCode: nextInviteCode,
      inviteRole: manufacturingInviteRole,
    }) : currentOrganization);

    try {
      await supabase
        .from('manufacturing_organization_invites')
        .update({ active: false })
        .eq('organization_id', manufacturingOrganization.id)
        .eq('active', true);

      const { error } = await supabase
        .from('manufacturing_organization_invites')
        .insert({
          organization_id: manufacturingOrganization.id,
          code: nextInviteCode,
          default_role: manufacturingInviteRole,
          created_by: user.id,
        });

      if (error) throw error;
      setManufacturingOrganizationMessage('New Supabase invite code generated.');
    } catch (error) {
      console.warn('Unable to regenerate Supabase invite code', error);
      setManufacturingOrganizationMessage('New local invite code generated.');
    }
  };

  const copyManufacturingInviteCode = async () => {
    if (!manufacturingOrganization) {
      setManufacturingOrganizationMessage('Create or join an organization first.');
      return;
    }
    try {
      await navigator.clipboard?.writeText(manufacturingOrganization.inviteCode);
      setManufacturingOrganizationMessage('Invite code copied.');
    } catch (error) {
      console.warn('Unable to copy manufacturing invite code', error);
      setManufacturingOrganizationMessage(`Invite code: ${manufacturingOrganization.inviteCode}`);
    }
  };

  const updateManufacturingInviteRole = async (role: ManufacturingOrganizationInviteRole) => {
    if (role === manufacturingInviteRole) return;
    setManufacturingInviteRole(role);
    if (!manufacturingOrganization) return;

    const nextInviteCode = createManufacturingInviteCode(manufacturingOrganization.name);
    setManufacturingOrganization((currentOrganization) => currentOrganization ? ({
      ...currentOrganization,
      inviteCode: nextInviteCode,
      inviteRole: role,
    }) : currentOrganization);

    try {
      await supabase
        .from('manufacturing_organization_invites')
        .update({ active: false })
        .eq('organization_id', manufacturingOrganization.id)
        .eq('active', true);

      const { error } = await supabase
        .from('manufacturing_organization_invites')
        .insert({
          organization_id: manufacturingOrganization.id,
          code: nextInviteCode,
          default_role: role,
          created_by: user.id,
        });

      if (error) throw error;
      setManufacturingOrganizationMessage(`New invite code generated for ${role}.`);
    } catch (error) {
      console.warn('Unable to regenerate Supabase invite code for role change', error);
      setManufacturingOrganizationMessage(`New local invite code generated for ${role}.`);
    }
  };

  const uploadManufacturingOrganizationLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) return;
    if (!manufacturingOrganization) {
      setManufacturingOrganizationMessage('Create or join an organization before uploading a logo.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setManufacturingOrganizationMessage('Choose an image file.');
      return;
    }

    setManufacturingOrganizationUploadingLogo(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${user.id}/${manufacturingOrganization.id}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('manufacturing-organization-logos')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('manufacturing-organization-logos')
        .getPublicUrl(filePath);

      const logoUrl = publicUrlData.publicUrl;
      const { error: updateError } = await supabase
        .from('manufacturing_organizations')
        .update({ logo_url: logoUrl })
        .eq('id', manufacturingOrganization.id);

      if (updateError) throw updateError;

      setManufacturingOrganization((currentOrganization) => currentOrganization ? ({ ...currentOrganization, logoUrl }) : currentOrganization);
      setManufacturingOrganizationMessage('Organization logo updated.');
    } catch (error) {
      console.warn('Unable to upload manufacturing organization logo', error);
      setManufacturingOrganizationMessage('Logo upload failed. Check migration 034 and storage policies.');
    } finally {
      setManufacturingOrganizationUploadingLogo(false);
    }
  };

  React.useEffect(() => {
    if (!avatarDialogOpen) {
      setAvatarMessage(null);
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarOffset({ x: 0, y: 0 });
      setAvatarZoom(1);
      avatarDragRef.current = null;
    }
  }, [avatarDialogOpen]);

  React.useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);
  const academyPlans: MembershipPlan[] = [
    {
      name: 'Explorer',
      description: 'Explore the YVIMO portal, preview selected Academy lessons, and experience the platform before upgrading.',
      badge: null,
      badgeImage: '/assets/academy/badges/license-explorer.png',
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
      badgeImage: '/assets/academy/badges/license-professional.png',
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
      badgeImage: '/assets/academy/badges/license-enterprise.png',
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
  const staffRanks: Array<{
    name: Extract<SubscriptionTier, 'Instructor' | 'Beta Tester' | 'Owner'>;
    badgeImage: string;
    eyebrow: string;
    description: string;
    responsibilities: string[];
  }> = [
    {
      name: 'Instructor',
      badgeImage: '/assets/academy/badges/license-instructor.png',
      eyebrow: 'Academy staff',
      description: 'Official instructors and collaborators who create lessons, review learning material, and support students inside YVIMO Academy.',
      responsibilities: [
        'Course guidance and mentoring',
        'Academy content review',
        'Learning path support',
      ],
    },
    {
      name: 'Beta Tester',
      badgeImage: '/assets/academy/badges/license-beta-tester.png',
      eyebrow: 'Product testing',
      description: 'Trusted testers who validate new platform features, report issues, and help us improve tools before public release.',
      responsibilities: [
        'Early feature validation',
        'Bug reporting and feedback',
        'Preview workflow testing',
      ],
    },
    {
      name: 'Owner',
      badgeImage: '/assets/academy/badges/license-owner.png',
      eyebrow: 'YVIMO leadership',
      description: 'Official YVIMO ownership and leadership accounts responsible for platform direction, official decisions, and company-level communication.',
      responsibilities: [
        'Official YVIMO communication',
        'Platform and business decisions',
        'Final escalation authority',
      ],
    },
  ];
  const quickAccessItems: Array<{
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number }>;
    path: string;
    flagship?: boolean;
  }> = [
    {
      label: 'Gateway Online',
      description: 'Design, simulate, and prepare industrial connectivity flows using virtual devices, labs, and Gateway tools.',
      icon: ServerCog,
      path: '/portal/gateway-online',
      flagship: true,
    },
    {
      label: 'YVIMO Academy',
      description: 'Continue courses, guided paths, progress, and professional learning.',
      icon: GraduationCap,
      path: '/academy',
      flagship: true,
    },
    {
      label: 'Manufacturing Ops',
      description: 'MES, APS, production tracking, scheduling, and manufacturing intelligence in one connected workspace.',
      icon: Factory,
      path: '/workspace/manufacturing-ops',
      flagship: true,
    },
    {
      label: 'Engineering Tools',
      description: 'Access templates, calculators, quotation tools, network utilities, and controls resources for real industrial automation projects.',
      icon: Wrench,
      path: '/portal/engineering-tools',
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
  const flagshipAccessItems = quickAccessItems.filter((item) => item.flagship);
  const secondaryAccessItems = quickAccessItems.filter((item) => !item.flagship);
  const navItems = [
    { label: 'Workspace', icon: Blocks, featured: false, path: '/dashboard' },
    { label: 'Gateway Online', icon: ServerCog, featured: true, path: '/portal/gateway-online' },
    { label: 'Academy', icon: GraduationCap, featured: true, path: '/academy' },
    { label: 'Manufacturing Ops', icon: Factory, featured: true, path: '/workspace/manufacturing-ops' },
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
  const manufacturingOpsModules: Array<{
    label: string;
    description: string;
    features: string[];
    icon: React.ComponentType<{ size?: number }>;
    path: string;
    cta: string;
    status: string;
    featured?: boolean;
    disabled?: boolean;
  }> = [
    {
      label: 'MES',
      description: 'Execute, track, and monitor production orders across work centers in real time.',
      features: [
        'Production order tracking',
        'Work center status',
        'Operator actions',
        'Downtime and scrap capture',
      ],
      icon: Factory,
      path: '/workspace/manufacturing-ops/mes',
      cta: 'Open MES',
      status: 'Active',
      featured: true,
    },
    {
      label: 'APS',
      description: 'Plan and schedule production using capacity, priorities, due dates, and operational constraints.',
      features: [
        'Production schedule',
        'Capacity planning',
        'Work center loading',
        'Bottleneck visibility',
      ],
      icon: Workflow,
      path: '/workspace/manufacturing-ops/aps',
      cta: 'Open APS',
      status: 'Active',
    },
    {
      label: 'Operations Intelligence',
      description: 'Transform production data into actionable manufacturing KPIs, trends, and improvement insights.',
      features: [
        'OEE dashboard',
        'Downtime analysis',
        'Cycle time trends',
        'Throughput visibility',
      ],
      icon: Gauge,
      path: '/workspace/manufacturing-ops/intelligence',
      cta: 'Open Intelligence',
      status: 'Active',
    },
  ];
  const mesModules: Array<{
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number }>;
    path: string;
    implemented: boolean;
    tone?: 'green' | 'blue' | 'orange' | 'purple';
  }> = [
    {
      label: 'Production Orders',
      description: 'Create, release, assign, and track manufacturing orders from planned quantity to completion.',
      icon: FileUp,
      path: '/workspace/manufacturing-ops/mes/orders',
      implemented: true,
      tone: 'green',
    },
    {
      label: 'Work Centers',
      description: 'Manage machines, lines, cells, and stations where production is executed.',
      icon: Factory,
      path: '/workspace/manufacturing-ops/mes/work-centers',
      implemented: true,
      tone: 'blue',
    },
    {
      label: 'Operator Terminal',
      description: 'Simple shop-floor interface for starting jobs, reporting production, scrap, downtime, and completing operations.',
      icon: TerminalSquare,
      path: '/workspace/manufacturing-ops/mes/operator-terminal',
      implemented: true,
      tone: 'green',
    },
    {
      label: 'Inventory',
      description: 'Track materials, components, work in progress, and finished goods across manufacturing locations.',
      icon: PackageCheck,
      path: '/workspace/manufacturing-ops/mes/inventory',
      implemented: true,
      tone: 'blue',
    },
    {
      label: 'Statistics',
      description: 'View live production output, weekly trends, scrap, and plant-wide manufacturing performance.',
      icon: BarChart3,
      path: '/workspace/manufacturing-ops/mes/statistics',
      implemented: true,
      tone: 'purple',
    },
    {
      label: 'Quality Checks',
      description: 'Record pass/fail checks, measurements, inspection results, and quality notes linked to production orders.',
      icon: ShieldCheck,
      path: '/workspace/manufacturing-ops/mes/quality',
      implemented: true,
      tone: 'orange',
    },
    {
      label: 'Traceability',
      description: 'View the complete production history for an order, lot, serial number, work center, or operation.',
      icon: Database,
      path: '/workspace/manufacturing-ops/mes/traceability',
      implemented: true,
      tone: 'orange',
    },
    {
      label: 'Suppliers',
      description: 'Track external processing check-outs, returns, vouchers, supplier documents, and outside-process traceability.',
      icon: Truck,
      path: '/workspace/manufacturing-ops/mes/suppliers',
      implemented: true,
      tone: 'blue',
    },
    {
      label: 'Clients',
      description: 'Manage customers, their assets and equipment, deliveries, returns, balances, documents, and vouchers.',
      icon: Users,
      path: '/workspace/manufacturing-ops/mes/clients',
      implemented: true,
      tone: 'blue',
    },
  ];
  const apsModules: Array<{
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number }>;
    path: string;
  }> = [
    {
      label: 'Production Schedule',
      description: 'Build and review sequenced production plans across lines, cells, and work centers.',
      icon: CalendarClock,
      path: '/workspace/manufacturing-ops/aps/schedule',
    },
    {
      label: 'Capacity Planning',
      description: 'Compare demand against available machine, labor, and shift capacity.',
      icon: Gauge,
      path: '/workspace/manufacturing-ops/aps/capacity',
    },
    {
      label: 'Work Center Loading',
      description: 'Visualize assigned workload by work center and planning horizon.',
      icon: Factory,
      path: '/workspace/manufacturing-ops/aps/loading',
    },
    {
      label: 'Bottlenecks',
      description: 'Identify constrained operations and overloaded resources before execution.',
      icon: AlertTriangle,
      path: '/workspace/manufacturing-ops/aps/bottlenecks',
    },
    {
      label: 'Priority Sequencing',
      description: 'Sequence orders using due dates, priorities, changeovers, and constraints.',
      icon: Workflow,
      path: '/workspace/manufacturing-ops/aps/priorities',
    },
  ];
  const intelligenceModules: Array<{
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number }>;
    path: string;
  }> = [
    {
      label: 'OEE Dashboard',
      description: 'Monitor availability, performance, quality, and total OEE by area or work center.',
      icon: Gauge,
      path: '/workspace/manufacturing-ops/intelligence/oee',
    },
    {
      label: 'Downtime Analysis',
      description: 'Analyze stops by reason, category, equipment, duration, and trend.',
      icon: RadioTower,
      path: '/workspace/manufacturing-ops/intelligence/downtime',
    },
    {
      label: 'Cycle Time Trends',
      description: 'Track cycle time behavior and variation across products, shifts, and operations.',
      icon: Activity,
      path: '/workspace/manufacturing-ops/intelligence/cycle-time',
    },
    {
      label: 'Throughput Visibility',
      description: 'Review output, pace, constraints, and production flow across the plant.',
      icon: Workflow,
      path: '/workspace/manufacturing-ops/intelligence/throughput',
    },
    {
      label: 'Production Reports',
      description: 'Prepare production summaries, KPI reports, and execution history snapshots.',
      icon: FileUp,
      path: '/workspace/manufacturing-ops/intelligence/reports',
    },
  ];
  const isManufacturingOpsPage =
    activePath === '/workspace/manufacturing-ops'
    || activePath.startsWith('/workspace/manufacturing-ops/');
  const isWorkspaceOverviewPage = activePath === '/dashboard';
  const isSupplierAccessOverview = isWorkspaceOverviewPage && workspaceAccessMode === 'supplier';
  const supplierPortalCustomers = [
    { name: 'Gleason Corp', logo: 'Gleason', color: '#f4f8ff' },
    { name: 'Dana', logo: 'DANA', color: '#eef7ff' },
    { name: 'Ford', logo: 'Ford', color: '#edf3ff' },
  ];
  const selectedSupplierCustomer =
    supplierPortalCustomers.find((customer) => customer.name === supplierSelectedCustomer) ?? supplierPortalCustomers[0];
  const supplierPortalNavItems = [
    { label: 'Overview', icon: Blocks },
    { label: 'Transfers', icon: Truck },
    { label: 'Documents', icon: FileUp },
    { label: 'Vouchers', icon: Database },
    { label: 'Settings', icon: Gauge },
  ];
  const setAccessMode = (mode: WorkspaceAccessMode) => {
    setWorkspaceAccessMode(mode);
    setTabletSidebarExpanded(false);
    setSupplierCustomerPickerOpen(false);
  };
  const joinCustomerWorkspace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSupplierJoinDialogOpen(false);
    setSupplierInvitationCode('');
    setSupplierJoinMessage('Invitation code received. Customer join flow will be connected soon.');
  };
  const isMesPage =
    activePath === '/workspace/manufacturing-ops/mes'
    || activePath.startsWith('/workspace/manufacturing-ops/mes/');
  const isApsPage =
    activePath === '/workspace/manufacturing-ops/aps'
    || activePath.startsWith('/workspace/manufacturing-ops/aps/');
  const isOperationsIntelligencePage =
    activePath === '/workspace/manufacturing-ops/intelligence'
    || activePath.startsWith('/workspace/manufacturing-ops/intelligence/');
  const activeManufacturingModule = isApsPage
    ? manufacturingOpsModules[1]
    : isOperationsIntelligencePage
      ? manufacturingOpsModules[2]
      : manufacturingOpsModules[0];
  const getManufacturingPanelTitle = (label: string) => {
    if (label === 'MES') return 'Manufacturing Execution System';
    if (label === 'APS') return 'Advanced Production Scheduling';
    if (label === 'Operations Intelligence') return 'Operations Intelligence';
    return label;
  };
  const getManufacturingRowLabel = (label: string) => {
    if (label === 'Operations Intelligence') return 'Ops Intelligence';
    return label;
  };
  const getManufacturingAppPosition = (moduleLabel: string, index: number) => {
    const positionsByModule: Record<string, number[]> = {
      MES: [1, 2, 4, 5, 6, 7, 8, 9, 10],
      APS: [1, 4, 5, 6, 8],
      'Operations Intelligence': [1, 2, 4, 5, 8],
    };
    return positionsByModule[moduleLabel]?.[index] ?? index + 1;
  };
  const activeSpecialtyModules = isApsPage
    ? apsModules
    : isOperationsIntelligencePage
      ? intelligenceModules
      : mesModules;
  const isManufacturingAppImplemented = (module: { implemented?: boolean }) => module.implemented === true;
  const getManufacturingAppToneClass = (module: { tone?: 'green' | 'blue' | 'orange' | 'purple' }) => module.tone ? `tone-${module.tone}` : '';
  const handleManufacturingAppLaunch = (module: { label: string; path: string; implemented?: boolean }) => {
    if (!isManufacturingAppImplemented(module)) {
      setManufacturingUnavailableApp(module.label);
      return;
    }
    setManufacturingUnavailableApp('');
    onNavigate(module.path);
  };
  const activeMesModule = mesModules.find((module) => activePath === module.path
    || (module.path === '/workspace/manufacturing-ops/mes/quality' && activePath.startsWith('/workspace/manufacturing-ops/mes/quality/'))
    || (module.path === '/workspace/manufacturing-ops/mes/clients' && activePath.startsWith('/workspace/manufacturing-ops/mes/clients/')));
  const isOperatorTerminalPage = activePath === '/workspace/manufacturing-ops/mes/operator-terminal';
  const isSupplierOperationsPage = activePath === '/workspace/manufacturing-ops/mes/suppliers';
  const isQualityOperationsPage = activePath === '/workspace/manufacturing-ops/mes/quality' || activePath.startsWith('/workspace/manufacturing-ops/mes/quality/');
  const isClientsOperationsPage = activePath === '/workspace/manufacturing-ops/mes/clients' || activePath.startsWith('/workspace/manufacturing-ops/mes/clients/');
  const isCompactMesApplicationPage = activePath === '/workspace/manufacturing-ops/mes/orders'
    || activePath === '/workspace/manufacturing-ops/mes/work-centers'
    || activePath === '/workspace/manufacturing-ops/mes/inventory'
    || activePath === '/workspace/manufacturing-ops/mes/statistics'
    || activePath === '/workspace/manufacturing-ops/mes/traceability';
  const supplierContextTabs: Array<{
    value: SupplierContextTab;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    disabled?: boolean;
  }> = [
    { value: 'dashboard', label: 'Dashboard', icon: ClipboardCheck },
    { value: 'transfers', label: 'Transfers', icon: PackageCheck },
    { value: 'suppliers', label: 'Suppliers', icon: Building2 },
    { value: 'vouchers-docs', label: 'Vouchers and Docs', icon: FileUp },
    { value: 'check-in-out', label: 'Check in/out', icon: Truck },
  ];
  const qualityContextTabs: Array<{
    value: QualityContextTab;
    label: string;
    path: string;
    icon: React.ComponentType<{ size?: number }>;
    disabled?: boolean;
  }> = [
    { value: 'dashboard', label: 'Dashboard', path: '/workspace/manufacturing-ops/mes/quality', icon: Gauge },
    { value: 'inspections', label: 'Inspections', path: '/workspace/manufacturing-ops/mes/quality/inspections', icon: ClipboardCheck },
    { value: 'quality-plans', label: 'Quality Plans', path: '/workspace/manufacturing-ops/mes/quality/quality-plans', icon: FolderCheck, disabled: true },
    { value: 'specifications', label: 'Specifications', path: '/workspace/manufacturing-ops/mes/quality/specifications', icon: ShieldCheck },
    { value: 'certificates-docs', label: 'Certificates & Docs', path: '/workspace/manufacturing-ops/mes/quality/certificates-docs', icon: FileText },
    { value: 'ncrs', label: 'NCRs', path: '/workspace/manufacturing-ops/mes/quality/ncrs', icon: AlertTriangle, disabled: true },
    { value: 'holds-releases', label: 'Holds & Releases', path: '/workspace/manufacturing-ops/mes/quality/holds-releases', icon: PackageCheck, disabled: true },
  ];
  const activeQualityContextTab = qualityContextTabs.find((tab) => activePath === tab.path && !tab.disabled)?.value ?? 'dashboard';
  const clientsContextTabs: Array<{
    value: ClientsContextTab;
    label: string;
    path: string;
    icon: React.ComponentType<{ size?: number }>;
    disabled?: boolean;
  }> = [
    { value: 'customers', label: 'Customers', path: '/workspace/manufacturing-ops/mes/clients', icon: Users },
    { value: 'assets-equipment', label: 'Assets & Equipment', path: '/workspace/manufacturing-ops/mes/clients/assets-equipment', icon: Wrench },
    { value: 'deliveries-returns', label: 'Deliveries & Returns', path: '/workspace/manufacturing-ops/mes/clients/deliveries-returns', icon: Truck, disabled: true },
    { value: 'balances', label: 'Balances', path: '/workspace/manufacturing-ops/mes/clients/balances', icon: Calculator },
    { value: 'docs-vouchers', label: 'Docs & Vouchers', path: '/workspace/manufacturing-ops/mes/clients/docs-vouchers', icon: FileText, disabled: true },
  ];
  const activeClientsContextTab = clientsContextTabs.find((tab) => activePath === tab.path && !tab.disabled)?.value ?? 'customers';
  const activeManufacturingOrganizationId = manufacturingOrganization
    && !manufacturingOrganization.id.startsWith('local-')
    && !manufacturingOrganization.id.startsWith('joined-')
    ? manufacturingOrganization.id
    : '';
  const manufacturingOrganizationRequiredPanel = (
    <section className="mes-workspace-panel">
      <div className="mes-screen-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/dashboard')}>
          <ArrowLeft size={17} /> Go Back to Workspace
        </button>
        <div className="mes-workspace-heading">
          <span className="eyebrow">Organization required</span>
          <h2>Choose a Manufacturing Organization</h2>
          <p>Production Orders, Work Centers, Operator Terminal, and Traceability are shared by organization. Create one or join with an invite code before entering this workspace.</p>
        </div>
      </div>
      <div className="manufacturing-organization-card manufacturing-organization-required-card">
        <button className="manufacturing-organization-trigger manufacturing-organization-required-trigger" type="button" onClick={() => setManufacturingOrganizationDialogOpen(true)}>
          <span className="manufacturing-organization-icon">
            {manufacturingOrganization?.logoUrl ? <img src={manufacturingOrganization.logoUrl} alt="" aria-hidden="true" /> : <Building2 size={19} />}
          </span>
          <span>
            <em>Organization</em>
            <strong>{manufacturingOrganization?.name || 'No organization'}</strong>
            <small>{manufacturingOrganization ? 'Finish syncing this organization in Supabase' : 'Create or join a team workspace'}</small>
          </span>
        </button>
      </div>
    </section>
  );
  const renderActiveMesWorkspace = () => {
    if (!activeManufacturingOrganizationId) {
      return manufacturingOrganizationRequiredPanel;
    }
    if (activePath === '/workspace/manufacturing-ops/mes/orders') {
      return <ProductionOrdersWorkspace onNavigate={onNavigate} organizationId={activeManufacturingOrganizationId} />;
    }
    if (activePath === '/workspace/manufacturing-ops/mes/work-centers') {
      return <WorkCentersWorkspace onNavigate={onNavigate} organizationId={activeManufacturingOrganizationId} />;
    }
    if (activePath === '/workspace/manufacturing-ops/mes/inventory') {
      return <InventoryWorkspace onNavigate={onNavigate} organizationId={activeManufacturingOrganizationId} organizationName={manufacturingOrganization?.name ?? 'Manufacturing Organization'} />;
    }
    if (activePath === '/workspace/manufacturing-ops/mes/statistics') {
      return <StatisticsWorkspace onNavigate={onNavigate} organizationId={activeManufacturingOrganizationId} />;
    }
    if (isOperatorTerminalPage) {
      return <OperatorTerminalWorkspace onNavigate={onNavigate} organizationId={activeManufacturingOrganizationId} languageCode={languageCode} t={t} />;
    }
    if (activePath === '/workspace/manufacturing-ops/mes/traceability') {
      return <TraceabilityWorkspace onNavigate={onNavigate} organizationId={activeManufacturingOrganizationId} />;
    }
    if (isQualityOperationsPage) {
      return <QualityOperationsWorkspace onNavigate={onNavigate} activeTab={activeQualityContextTab} organizationId={activeManufacturingOrganizationId} organizationName={manufacturingOrganization?.name} organizationLogoUrl={manufacturingOrganization?.logoUrl} />;
    }
    if (isClientsOperationsPage) {
      return <CustomerOperationsWorkspace onNavigate={onNavigate} activeTab={activeClientsContextTab} organizationId={activeManufacturingOrganizationId} />;
    }
    if (isSupplierOperationsPage) {
      return (
        <SupplierOperationsWorkspace
          onNavigate={onNavigate}
          organizationId={activeManufacturingOrganizationId}
          activeTab={supplierContextTab}
          onActiveTabChange={setSupplierContextTab}
        />
      );
    }
    return null;
  };
  const activeMesWorkspace = renderActiveMesWorkspace();
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
  const foundingMemberRank = membershipRank.Founder;
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

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAvatarMessage(null);

    if (!file) {
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarOffset({ x: 0, y: 0 });
      setAvatarZoom(1);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarOffset({ x: 0, y: 0 });
      setAvatarZoom(1);
      setAvatarMessage('Choose an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarOffset({ x: 0, y: 0 });
      setAvatarZoom(1);
      setAvatarMessage('Image must be 5 MB or smaller.');
      return;
    }

    setAvatarFile(file);
    setAvatarOffset({ x: 0, y: 0 });
    setAvatarZoom(1);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!avatarPreview) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    avatarDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: avatarOffset,
    };
  };

  const handleAvatarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = avatarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setAvatarOffset({
      x: drag.origin.x + event.clientX - drag.startX,
      y: drag.origin.y + event.clientY - drag.startY,
    });
  };

  const handleAvatarPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (avatarDragRef.current?.pointerId === event.pointerId) {
      avatarDragRef.current = null;
    }
  };

  const resetAvatarCrop = () => {
    setAvatarOffset({ x: 0, y: 0 });
    setAvatarZoom(1);
  };

  const handleAvatarSave = async () => {
    if (!avatarFile) {
      setAvatarMessage('Choose an image first.');
      return;
    }

    setAvatarSaving(true);
    setAvatarMessage(null);

    let uploadFile = avatarFile;

    try {
      uploadFile = await createCroppedAvatarFile(avatarFile, avatarOffset, avatarZoom);
    } catch (error) {
      console.error('[auth] avatar crop error', error);
      setAvatarSaving(false);
      setAvatarMessage('Profile picture could not be prepared.');
      return;
    }

    const result = await onUpdateAvatar(uploadFile);
    setAvatarSaving(false);
    setAvatarMessage(result.message);

    if (result.ok) {
      window.setTimeout(() => setAvatarDialogOpen(false), 700);
    }
  };

  const manufacturingOrganizationTrigger = (
    <button className="manufacturing-organization-trigger" type="button" onClick={() => setManufacturingOrganizationDialogOpen(true)}>
      <span className="manufacturing-organization-icon">
        {manufacturingOrganization?.logoUrl ? <img src={manufacturingOrganization.logoUrl} alt="" aria-hidden="true" /> : <Building2 size={19} />}
      </span>
      <span>
        <em>Organization</em>
        <strong>{manufacturingOrganization?.name || 'No organization'}</strong>
        <small>
          {manufacturingOrganization
            ? `${manufacturingOrganization.role} access · ${manufacturingOrganization.memberCount} member${manufacturingOrganization.memberCount === 1 ? '' : 's'}`
            : 'Create or join a team workspace'}
        </small>
      </span>
    </button>
  );

  const assignableManufacturingOrganizationOwners = manufacturingOrganizationMembers.filter((member) => member.userId !== user.id);

  const manufacturingOrganizationDialog = manufacturingOrganizationDialogOpen ? (
    <div className="manufacturing-organization-dialog-backdrop" role="presentation" onMouseDown={() => setManufacturingOrganizationDialogOpen(false)}>
      <section
        className={['manufacturing-organization-dialog', manufacturingOrganizationMode === 'members' ? 'members-open' : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manufacturing-organization-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="manufacturing-organization-dialog-close" type="button" aria-label="Close organization menu" onClick={() => setManufacturingOrganizationDialogOpen(false)}>
          <X size={18} />
        </button>
        <div className="manufacturing-organization-zone manufacturing-organization-details-zone">
          <div className="manufacturing-organization-dialog-heading">
            <span className="manufacturing-organization-icon">
              {manufacturingOrganization?.logoUrl ? <img src={manufacturingOrganization.logoUrl} alt="" aria-hidden="true" /> : <Building2 size={30} />}
            </span>
            <div>
              <span>Manufacturing organization</span>
              <h2 id="manufacturing-organization-dialog-title">{manufacturingOrganization?.name || 'No organization selected'}</h2>
              <p>{manufacturingOrganization ? `${manufacturingOrganization.role} access · ${manufacturingOrganization.memberCount} member${manufacturingOrganization.memberCount === 1 ? '' : 's'}` : 'Create an organization or join one with an invite code.'}</p>
            </div>
          </div>
          {manufacturingOrganization && manufacturingOrganizationMode !== 'switch' ? (
            <div className="manufacturing-organization-manage">
              {manufacturingOrganizationMode === 'edit' ? (
                <>
                  <label>
                    <span>Organization name</span>
                    <input value={manufacturingOrganizationName} onChange={(event) => setManufacturingOrganizationName(event.target.value)} placeholder="Organization name" />
                  </label>
                  <label className="manufacturing-organization-logo-edit">
                    <span>Organization image</span>
                    <span className="manufacturing-organization-logo-edit-control">
                      <span className="manufacturing-organization-icon">
                        {manufacturingOrganization.logoUrl ? <img src={manufacturingOrganization.logoUrl} alt="" aria-hidden="true" /> : <Building2 size={24} />}
                      </span>
                      <strong>{manufacturingOrganizationUploadingLogo ? 'Uploading...' : 'Change image'}</strong>
                    </span>
                    <input type="file" accept="image/*" onChange={uploadManufacturingOrganizationLogo} disabled={manufacturingOrganizationUploadingLogo} />
                  </label>
                  <button type="button" onClick={() => void saveManufacturingOrganizationName()}>Save changes</button>
                  <button type="button" onClick={() => setManufacturingOrganizationMode('manage')}>Cancel</button>
                </>
              ) : manufacturingOrganizationMode === 'members' ? (
                <div className="manufacturing-organization-members">
                  <div className="manufacturing-organization-members-heading">
                    <span>Organization members</span>
                    <button type="button" onClick={() => setManufacturingOrganizationMode('manage')}>Done</button>
                  </div>
                  <div className="manufacturing-organization-member-list">
                    {(manufacturingOrganizationMembers.length > 0 ? manufacturingOrganizationMembers : [{
                      id: 'local-current-user',
                      userId: user.id,
                      role: manufacturingOrganization.role,
                      profile: user,
                    }]).map((member) => {
                      const isCurrentUser = member.userId === user.id;
                      const memberUser: AppUser = isCurrentUser ? user : member.profile;

                      return (
                        <div className="manufacturing-organization-member-row" key={member.id}>
                          <div
                            className="manufacturing-organization-member-ring"
                            style={{ '--member-progress': `${memberUser.profileLevelProgress}%` } as React.CSSProperties}
                            aria-label={`${memberUser.profileLevelProgress}% level progress`}
                          >
                            <UserAvatar user={memberUser} className="manufacturing-organization-member-avatar" />
                          </div>
                          <div>
                            <strong>{memberUser.name}{isCurrentUser ? ' (You)' : ''}</strong>
                            <span>{member.role} access</span>
                          </div>
                          <em>Level {memberUser.profileLevel}</em>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => setManufacturingOrganizationMode('edit')}><Pencil size={15} /> Edit Organization</button>
                  <button type="button" onClick={() => setManufacturingOrganizationMode('members')}><Users size={15} /> View Members</button>
                  <button type="button" onClick={openManufacturingSwitchConfirmation}>Switch Organization</button>
                </>
              )}
            </div>
          ) : (
            <div className="manufacturing-organization-controls">
              <label>
                <span>Create organization</span>
                <input value={manufacturingOrganizationName} onChange={(event) => setManufacturingOrganizationName(event.target.value)} placeholder="Organization name" />
              </label>
              <button type="button" onClick={() => void createManufacturingOrganization()}><Plus size={15} /> Create</button>
              <label>
                <span>Join organization</span>
                <input value={manufacturingJoinCode} onChange={(event) => setManufacturingJoinCode(event.target.value.toUpperCase())} placeholder="CODE-123ABC" />
              </label>
              <button type="button" onClick={() => void joinManufacturingOrganization()}><UserPlus size={15} /> Join</button>
            </div>
          )}
        </div>
        {manufacturingOrganization ? (
          <div className="manufacturing-organization-zone manufacturing-organization-invite-zone">
            <div className="manufacturing-organization-code" aria-label="Organization invite code">
              <span>Invite code</span>
              <strong>{manufacturingOrganization.inviteCode}</strong>
            </div>
            <fieldset className="manufacturing-organization-roles" aria-label="Invite permission">
              <legend>Invite permission</legend>
              {(['Admin', 'Operator', 'Viewer', 'Supplier'] as ManufacturingOrganizationInviteRole[]).map((role) => (
                <button
                  type="button"
                  className={role === manufacturingInviteRole ? 'active' : ''}
                  key={role}
                  onClick={() => void updateManufacturingInviteRole(role)}
                >
                  {role}
                </button>
              ))}
            </fieldset>
            <div className="manufacturing-organization-actions">
              <button type="button" onClick={copyManufacturingInviteCode}><Users size={15} /> Copy invite</button>
              <button type="button" onClick={regenerateManufacturingInviteCode}>New code</button>
              <span>{manufacturingOrganizationMessage || 'Shared MES data will use this organization context.'}</span>
            </div>
          </div>
        ) : manufacturingOrganizationMessage ? (
          <div className="manufacturing-organization-actions manufacturing-organization-message-zone">
            <span>{manufacturingOrganizationMessage}</span>
          </div>
        ) : null}
      </section>
      {manufacturingSwitchDialogOpen ? (
        <section
          className="manufacturing-organization-switch-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manufacturing-organization-switch-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div>
            <span>Organization switch</span>
            <h3 id="manufacturing-organization-switch-title">Confirm switch</h3>
            <p>
              {manufacturingOrganization?.role === 'Owner'
                ? 'Owner access needs a clean handoff before you leave this organization.'
                : 'This removes your membership from the current organization and lets you choose another one.'}
            </p>
          </div>
          {manufacturingOrganization?.role === 'Owner' ? (
            <>
              <div className="manufacturing-organization-switch-options">
                {assignableManufacturingOrganizationOwners.length > 0 ? (
                  <label className={manufacturingSwitchAction === 'transfer' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="manufacturing-switch-action"
                      checked={manufacturingSwitchAction === 'transfer'}
                      onChange={() => setManufacturingSwitchAction('transfer')}
                    />
                    <span>Assign another Owner</span>
                  </label>
                ) : null}
                <label className={manufacturingSwitchAction === 'disband' ? 'active danger' : 'danger'}>
                  <input
                    type="radio"
                    name="manufacturing-switch-action"
                    checked={manufacturingSwitchAction === 'disband'}
                    onChange={() => setManufacturingSwitchAction('disband')}
                  />
                  <span>Disband organization</span>
                </label>
              </div>
              {manufacturingSwitchAction === 'transfer' ? (
                <label className="manufacturing-organization-owner-select">
                  <span>New Owner</span>
                  <select value={manufacturingNewOwnerUserId} onChange={(event) => setManufacturingNewOwnerUserId(event.target.value)}>
                    <option value="">Select member</option>
                    {assignableManufacturingOrganizationOwners.map((member) => (
                      <option key={member.id} value={member.userId}>
                        {member.userId.slice(0, 8)} · {member.role}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="manufacturing-organization-switch-warning">
                  Disbanding removes all organization members and disables active invite codes. The organization record and historical MES data stay in Supabase.
                </p>
              )}
            </>
          ) : (
            <p className="manufacturing-organization-switch-warning">
              You can join or create another organization right after leaving this one.
            </p>
          )}
          <div className="manufacturing-organization-switch-actions">
            <button type="button" onClick={() => setManufacturingSwitchDialogOpen(false)} disabled={manufacturingSwitchBusy}>Cancel</button>
            <button
              type="button"
              className={manufacturingSwitchAction === 'disband' ? 'danger' : ''}
              onClick={() => void confirmManufacturingOrganizationSwitch()}
              disabled={manufacturingSwitchBusy || (manufacturingOrganization?.role === 'Owner' && manufacturingSwitchAction === 'transfer' && !manufacturingNewOwnerUserId)}
            >
              {manufacturingSwitchBusy
                ? 'Working...'
                : manufacturingSwitchAction === 'disband'
                  ? 'Disband and switch'
                  : 'Confirm switch'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  ) : null;

  return (
    <main className={[
      'logged-shell',
      isOperatorTerminalPage ? 'operator-terminal-shell' : '',
      isCompactMesApplicationPage ? 'compact-mes-application-shell' : '',
      isSupplierOperationsPage || isQualityOperationsPage || isClientsOperationsPage ? 'supplier-context-shell' : '',
      isSupplierAccessOverview ? 'supplier-access-shell' : '',
      isSupplierAccessOverview && supplierCustomerPickerOpen ? 'supplier-customer-picker-open' : '',
    ].filter(Boolean).join(' ')}>
      <aside className={['logged-sidebar', isSupplierAccessOverview ? 'supplier-portal-sidebar' : '', tabletSidebarExpanded ? 'tablet-expanded' : ''].filter(Boolean).join(' ')}>
        {isSupplierAccessOverview ? (
          <>
            <div className="logged-sidebar-title supplier-portal-sidebar-title">
              <div>
                <span>YVIMO</span>
                <strong>Supplier Portal</strong>
              </div>
              <button
                className="logged-sidebar-toggle"
                type="button"
                aria-label={tabletSidebarExpanded ? 'Collapse supplier menu' : 'Expand supplier menu'}
                onClick={() => setTabletSidebarExpanded((expanded) => !expanded)}
              >
                <Menu size={18} />
              </button>
            </div>

            <div className="supplier-company-identity-card">
              <span className="supplier-company-logo" aria-hidden="true">RN</span>
              <div>
                <span>Supplier Company</span>
                <strong>Recubrimientos del Norte</strong>
              </div>
            </div>

            <div className="supplier-customer-card">
              <span>Selected Customer</span>
              <button
                className="supplier-selected-customer-card"
                type="button"
                aria-expanded={supplierCustomerPickerOpen}
                onClick={() => setSupplierCustomerPickerOpen((open) => !open)}
              >
                <span className="supplier-customer-logo" style={{ background: selectedSupplierCustomer.color }}>
                  {selectedSupplierCustomer.logo}
                </span>
                <span>
                  <strong>{selectedSupplierCustomer.name}</strong>
                </span>
              </button>
              <button className="supplier-join-customer-button" type="button" onClick={() => setSupplierJoinDialogOpen(true)}>
                <Plus size={16} /> Join customer
              </button>
            </div>

            <nav aria-label="Supplier portal navigation">
              {supplierPortalNavItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    className={index === 0 ? 'active' : ''}
                    type="button"
                    key={item.label}
                    title={item.label}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </>
        ) : (
          <>
            <div className="logged-sidebar-title">
              <div>
                <span>YVIMO</span>
                <strong>{t('Dashboard')}</strong>
              </div>
              <button
                className="logged-sidebar-toggle"
                type="button"
                aria-label={tabletSidebarExpanded ? 'Collapse dashboard menu' : 'Expand dashboard menu'}
                onClick={() => setTabletSidebarExpanded((expanded) => !expanded)}
              >
                <Menu size={18} />
              </button>
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
                  || (item.path === '/workspace/manufacturing-ops' && activePath.startsWith('/workspace/manufacturing-ops'))
                  || (item.path === '/portal/engineering-tools' && (
                    activePath.startsWith('/portal/engineering-tools')
                    || activePath.startsWith('/dashboard/engineering-tools')
                  ));
                return (
                  <button
                    className={[active || (index === 0 && activePath === '/dashboard') ? 'active' : '', item.featured ? 'featured' : ''].filter(Boolean).join(' ')}
                    type="button"
                    key={item.label}
                    title={t(item.label)}
                    onClick={() => {
                      setTabletSidebarExpanded(false);
                      onNavigate(item.path);
                    }}
                  >
                    <Icon size={18} />
                    <span>{t(item.label)}</span>
                  </button>
                );
              })}
            </nav>
          </>
        )}
        <button className="logged-signout" type="button" title={t('Sign out')} onClick={onSignOut}>
          <LogIn size={18} />
          <span>{t('Sign out')}</span>
        </button>
      </aside>

      {isSupplierAccessOverview && supplierCustomerPickerOpen ? (
        <aside className="supplier-customer-picker-strip" aria-label="Supplier customer options">
          <div>
            <span>Customers</span>
            <strong>Select customer</strong>
          </div>
          <div className="supplier-customer-option-list">
            {supplierPortalCustomers.map((customer) => (
              <button
                className={customer.name === supplierSelectedCustomer ? 'active' : ''}
                type="button"
                key={customer.name}
                onClick={() => {
                  setSupplierSelectedCustomer(customer.name);
                  setSupplierCustomerPickerOpen(false);
                }}
              >
                <span className="supplier-customer-logo" style={{ background: customer.color }}>{customer.logo}</span>
                <strong>{customer.name}</strong>
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {isSupplierOperationsPage ? (
        <aside className="supplier-shell-context-menu" aria-label="Supplier Operations sections">
          <div>
            <span>MES</span>
            <strong>Suppliers</strong>
          </div>
          <nav>
            {supplierContextTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.value}
                  className={supplierContextTab === tab.value ? 'active' : ''}
                  onClick={() => setSupplierContextTab(tab.value)}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      ) : null}

      {isQualityOperationsPage ? (
        <aside className="supplier-shell-context-menu quality-shell-context-menu" aria-label="Quality sections">
          <div>
            <span>MES</span>
            <strong>Quality</strong>
          </div>
          <nav>
            {qualityContextTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.value}
                  className={[activeQualityContextTab === tab.value ? 'active' : '', tab.disabled ? 'disabled' : ''].filter(Boolean).join(' ')}
                  disabled={tab.disabled}
                  aria-disabled={tab.disabled}
                  onClick={() => {
                    if (!tab.disabled) onNavigate(tab.path);
                  }}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      ) : null}

      {isClientsOperationsPage ? (
        <aside className="supplier-shell-context-menu clients-shell-context-menu" aria-label="Clients sections">
          <div>
            <span>MES</span>
            <strong>Clients</strong>
          </div>
          <nav>
            {clientsContextTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.value}
                  className={[activeClientsContextTab === tab.value ? 'active' : '', tab.disabled ? 'disabled' : ''].filter(Boolean).join(' ')}
                  disabled={tab.disabled}
                  aria-disabled={tab.disabled}
                  onClick={() => {
                    if (!tab.disabled) onNavigate(tab.path);
                  }}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      ) : null}

      <section
        className={[
          'logged-workspace',
          isManufacturingOpsPage ? 'manufacturing-workspace-active' : '',
          activeMesWorkspace ? 'mes-application-screen-active' : '',
          isOperatorTerminalPage ? 'operator-terminal-workspace-active' : '',
        ].filter(Boolean).join(' ')}
      >
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
              <img
                className="founding-member-badge"
                src="/assets/academy/badges/license-founder.png"
                alt=""
                aria-hidden="true"
              />
              <div className="founding-member-copy">
                <span>{t('Limited early access')}</span>
                <h2>{t('Founding Member')}</h2>
                <p>{t('Get Professional-level YVIMO access for $1,000 MXN/month while the platform is being built.')}</p>
                <p>{t('Join early, help shape the platform, and lock in early-access pricing while your subscription stays active.')}</p>
                <strong>{currentFoundingMemberPricing.price} <em>{t(currentFoundingMemberPricing.label)}</em></strong>
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
            </section>

            <section className="license-pricing-grid" aria-label="YVIMO membership pricing plans">
              {academyPlans.map((plan) => {
                const pricing = plan[billingPeriod];
                const priceDisplay = `${pricing.price}${pricing.label ? ` ${pricing.label}` : ''}`;
                const planName = plan.name;
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
                  <article
                    className={[
                      'license-plan-card',
                      plan.badge === 'Recommended' ? 'recommended' : '',
                    ].filter(Boolean).join(' ')}
                    key={plan.name}
                  >
                    {plan.badge ? <span className="license-plan-status">{t(plan.badge)}</span> : null}
                    <div className="license-plan-heading">
                      <h2>
                        <span className={`license-plan-tier subscription-pill subscription-${getSubscriptionSlug(plan.name)}`}>
                          {t(plan.name)}
                        </span>
                      </h2>
                    </div>
                    <img className="license-plan-badge-image" src={plan.badgeImage} alt="" aria-hidden="true" />
                    <p className="license-plan-description">{t(plan.description)}</p>
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

            <section className="license-staff-section" aria-labelledby="license-staff-title">
              <div className="license-staff-heading">
                <span>{t('Official team ranks')}</span>
                <h2 id="license-staff-title">{t('Our staff members')}</h2>
                <p>
                  {t('To help you recognize official YVIMO staff easily, team profiles may carry one of these ranks. These badges identify people who create Academy content, test upcoming features, or represent YVIMO leadership.')}
                </p>
              </div>

              <div className="license-staff-grid">
                {staffRanks.map((rank) => (
                  <article className={`license-staff-card staff-rank-${getSubscriptionSlug(rank.name)}`} key={rank.name}>
                    <span className="license-staff-card-eyebrow">{t(rank.eyebrow)}</span>
                    <img className="license-staff-badge-image" src={rank.badgeImage} alt="" aria-hidden="true" />
                    <h3>{t(rank.name)}</h3>
                    <p>{t(rank.description)}</p>
                    <ul>
                      {rank.responsibilities.map((responsibility) => (
                        <li key={responsibility}>
                          <Check size={16} />
                          {t(responsibility)}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <div className="license-staff-warning" role="note">
                <ShieldCheck size={20} />
                <p>
                  {t('All official YVIMO staff members display one of these badges on their profile. Please do not trust accounts claiming to represent YVIMO if their profile does not show an official staff badge.')}
                </p>
              </div>
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
        ) : isManufacturingOpsPage ? (
          <div className="engineering-tools-page manufacturing-ops-page">
            {activeMesWorkspace ? manufacturingOrganizationDialog : null}
            {activeMesWorkspace ? (
              activeMesWorkspace
            ) : (
              <>
                <div className="manufacturing-page-header">
                  <button className="academy-back-button engineering-back-button" type="button" onClick={() => onNavigate('/dashboard')}>
                    <ArrowLeft size={16} />
                    Go Back
                  </button>
                  <section className="engineering-tools-hero manufacturing-ops-hero">
                    <p className="eyebrow">{t('YVIMO PORTAL')}</p>
                    <h1>{t('Manufacturing Ops')}</h1>
                    <p>{t('Plan, execute, track, and improve manufacturing operations from one connected YVIMO workspace.')}</p>
                  </section>
                </div>
                {isMesPage || isApsPage || isOperationsIntelligencePage ? (
              <>
                {manufacturingOrganizationTrigger}
                {manufacturingOrganizationDialog}
                <section
                  className={[
                    'manufacturing-suite-stage',
                    'manufacturing-specialty-stage',
                    `active-${getSubscriptionSlug(activeManufacturingModule.label)}`,
                  ].join(' ')}
                  aria-label="Manufacturing Ops modules"
                >
                  <span className="manufacturing-flow flow-description-to-orbit" aria-hidden="true" />
                  <span className="manufacturing-flow flow-orbit-entry" aria-hidden="true" />
                  <span className="manufacturing-flow flow-orbit-to-row" aria-hidden="true" />
                  <span className="manufacturing-flow flow-row-to-watch" aria-hidden="true" />
                  <article className="manufacturing-suite-panel">
                    <div className="manufacturing-suite-panel-top">
                      <span className="manufacturing-suite-icon">
                        {React.createElement(activeManufacturingModule.icon, { size: 30 })}
                      </span>
                      <span className="engineering-access-badge">{t('Active')}</span>
                    </div>
                    <h2>{t(getManufacturingPanelTitle(activeManufacturingModule.label))}</h2>
                    <p>{t(activeManufacturingModule.description)}</p>
                    <div className="manufacturing-suite-metrics" aria-label={`${activeManufacturingModule.label} capability groups`}>
                      {activeManufacturingModule.features.slice(0, 4).map((item) => (
                        <span key={item}>{t(item)}</span>
                      ))}
                    </div>
                  </article>

                  <div className="manufacturing-suite-orbit" aria-label="Manufacturing Ops selector">
                    {manufacturingOpsModules.map((module) => {
                      const Icon = module.icon;
                      const moduleActive = module.label === activeManufacturingModule.label;
                      return (
                        <button
                          className={moduleActive ? 'active' : ''}
                          type="button"
                          key={module.label}
                          aria-label={t(module.label)}
                          onClick={() => onNavigate(module.path)}
                        >
                          <Icon size={24} />
                        </button>
                      );
                    })}
                  </div>

                  <div className="manufacturing-suite-right">
                    <div className="manufacturing-suite-menu">
                      {manufacturingOpsModules.map((module) => {
                        const moduleActive = module.label === activeManufacturingModule.label;
                        return (
                          <button
                            className={['manufacturing-suite-row', moduleActive ? 'active' : ''].filter(Boolean).join(' ')}
                            type="button"
                            key={module.label}
                            onClick={() => onNavigate(module.path)}
                          >
                            <strong>{t(getManufacturingRowLabel(module.label))}</strong>
                          </button>
                        );
                      })}
                    </div>
                    <div className="manufacturing-app-launcher-stack">
                      {manufacturingUnavailableApp ? (
                        <div className="manufacturing-app-alert" role="alert">
                          <strong>{t(manufacturingUnavailableApp)}</strong>
                          <span>{t('This feature/app is not implemented yet. You will be able to access it soon when it is ready.')}</span>
                        </div>
                      ) : null}
                      <section className="manufacturing-app-launcher" aria-label={`${activeManufacturingModule.label} modules`}>
                        <div className="manufacturing-app-launcher-header">
                          <strong>{t('Applications')}</strong>
                          <span>{t('Select a module to open its workspace.')}</span>
                        </div>
                        {activeSpecialtyModules.map((module, index) => {
                          const Icon = module.icon;
                          const activeModule = activePath === module.path;
                          const implementedModule = isManufacturingAppImplemented(module);
                          return (
                            <button
                              className={[
                                'manufacturing-app-icon',
                                `position-${getManufacturingAppPosition(activeManufacturingModule.label, index)}`,
                                implementedModule ? 'implemented' : 'unimplemented',
                                getManufacturingAppToneClass(module),
                                activeModule ? 'active' : '',
                              ].filter(Boolean).join(' ')}
                              type="button"
                              key={module.label}
                              aria-disabled={!implementedModule}
                              onClick={() => handleManufacturingAppLaunch(module)}
                            >
                              <span className="manufacturing-app-glyph">
                                <Icon size={26} />
                              </span>
                              <strong>{t(module.label)}</strong>
                            </button>
                          );
                        })}
                      </section>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <>
                {manufacturingOrganizationTrigger}
                {manufacturingOrganizationDialog}
                <section
                  className={[
                    'manufacturing-suite-stage',
                    `active-${getSubscriptionSlug(activeManufacturingModule.label)}`,
                  ].join(' ')}
                  aria-label="Manufacturing Ops modules"
                >
                  <span className="manufacturing-flow flow-description-to-orbit" aria-hidden="true" />
                  <span className="manufacturing-flow flow-orbit-entry" aria-hidden="true" />
                  <span className="manufacturing-flow flow-orbit-to-row" aria-hidden="true" />
                  <span className="manufacturing-flow flow-row-to-watch" aria-hidden="true" />
                  <article className="manufacturing-suite-panel">
                    <div className="manufacturing-suite-panel-top">
                      <span className="manufacturing-suite-icon">
                        {React.createElement(activeManufacturingModule.icon, { size: 30 })}
                      </span>
                      <span className="engineering-access-badge">{t('Active')}</span>
                    </div>
                    <h2>{t(getManufacturingPanelTitle(activeManufacturingModule.label))}</h2>
                    <p>{t(activeManufacturingModule.description)}</p>
                    <div className="manufacturing-suite-metrics" aria-label="MES capability groups">
                      {activeManufacturingModule.features.slice(0, 4).map((item) => (
                        <span key={item}>{t(item)}</span>
                      ))}
                    </div>
                  </article>

                  <div className="manufacturing-suite-orbit" aria-label="Manufacturing Ops selector">
                    {manufacturingOpsModules.map((module) => {
                      const Icon = module.icon;
                      const moduleActive = module.label === activeManufacturingModule.label;
                      return (
                        <button
                          className={moduleActive ? 'active' : ''}
                          type="button"
                          key={module.label}
                          aria-label={t(module.label)}
                          onClick={() => onNavigate(module.path)}
                        >
                          <Icon size={24} />
                        </button>
                      );
                    })}
                  </div>

                  <div className="manufacturing-suite-right">
                    <div className="manufacturing-suite-menu">
                      {manufacturingOpsModules.map((module) => {
                        return (
                          <button
                            className={['manufacturing-suite-row', module.label === activeManufacturingModule.label ? 'active' : ''].filter(Boolean).join(' ')}
                            type="button"
                            key={module.label}
                            onClick={() => onNavigate(module.path)}
                          >
                            <strong>{t(getManufacturingRowLabel(module.label))}</strong>
                          </button>
                        );
                      })}
                    </div>
                    <div className="manufacturing-app-launcher-stack">
                      {manufacturingUnavailableApp ? (
                        <div className="manufacturing-app-alert" role="alert">
                          <strong>{t(manufacturingUnavailableApp)}</strong>
                          <span>{t('This feature/app is not implemented yet. You will be able to access it soon when it is ready.')}</span>
                        </div>
                      ) : null}
                      <section className="manufacturing-app-launcher compact" aria-label="MES modules">
                        <div className="manufacturing-app-launcher-header">
                          <strong>{t('Applications')}</strong>
                          <span>{t('Select a module to open its workspace.')}</span>
                        </div>
                        {mesModules.map((module, index) => {
                          const Icon = module.icon;
                          const activeModule = activePath === module.path;
                          const implementedModule = isManufacturingAppImplemented(module);
                          return (
                            <button
                              className={[
                                'manufacturing-app-icon',
                                `position-${getManufacturingAppPosition('MES', index)}`,
                                implementedModule ? 'implemented' : 'unimplemented',
                                getManufacturingAppToneClass(module),
                                activeModule ? 'active' : '',
                              ].filter(Boolean).join(' ')}
                              type="button"
                              key={module.label}
                              aria-disabled={!implementedModule}
                              onClick={() => handleManufacturingAppLaunch(module)}
                            >
                              <span className="manufacturing-app-glyph">
                                <Icon size={24} />
                              </span>
                              <strong>{t(module.label)}</strong>
                            </button>
                          );
                        })}
                      </section>
                    </div>
                  </div>
                </section>
              </>
            )}
              </>
            )}
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
        ) : isSupplierAccessOverview ? (
          <div className="supplier-portal-overview">
            <div className="access-mode-switch" role="tablist" aria-label="Access mode">
              <button
                type="button"
                role="tab"
                aria-selected={workspaceAccessMode === 'workspace'}
                className={workspaceAccessMode === 'workspace' ? 'active' : ''}
                onClick={() => setAccessMode('workspace')}
              >
                Workspace Access
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspaceAccessMode === 'supplier'}
                className={workspaceAccessMode === 'supplier' ? 'active' : ''}
                onClick={() => setAccessMode('supplier')}
              >
                Supplier Access
              </button>
            </div>

            <section className="supplier-portal-hero">
              <p className="eyebrow">Supplier Access</p>
              <h1>Supplier Portal</h1>
              <p>External supplier access for customer manufacturing operations.</p>
              <span>This portal will allow suppliers to confirm received parts, update external process status, upload certificates, and return completed work.</span>
            </section>

            {supplierJoinMessage ? <div className="supplier-portal-toast" role="status">{supplierJoinMessage}</div> : null}

            <section className="supplier-portal-kpis" aria-label="Supplier portal metrics">
              {[
                ['Assigned Transfers', '0'],
                ['Documents Required', '0'],
                ['Vouchers', '0'],
                ['Customer Requests', '0'],
              ].map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </section>

            <section className="supplier-portal-empty-state">
              <Truck size={28} />
              <strong>No supplier transfers yet.</strong>
              <p>Select a customer from the sidebar or join a customer using an invitation code.</p>
            </section>
          </div>
        ) : (
        <div className="workspace-layout">
          <div className="workspace-main">
            <div className="access-mode-switch" role="tablist" aria-label="Access mode">
              <button
                type="button"
                role="tab"
                aria-selected={workspaceAccessMode === 'workspace'}
                className={workspaceAccessMode === 'workspace' ? 'active' : ''}
                onClick={() => setAccessMode('workspace')}
              >
                Workspace Access
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspaceAccessMode === 'supplier'}
                className={workspaceAccessMode === 'supplier' ? 'active' : ''}
                onClick={() => setAccessMode('supplier')}
              >
                Supplier Access
              </button>
            </div>
            <div className="workspace-heading">
              <p className="eyebrow">{t('YVIMO PORTAL')}</p>
              <h1>{t('Workspace overview')}</h1>
              <p>{t('Your YVIMO tools, licenses, and learning access in one place.')}</p>
            </div>
            <section className="workspace-product-section" aria-label="Flagship products">
              <div className="workspace-section-heading">
                <span>{t('Flagship products')}</span>
                <h2>{t('Start with your main YVIMO workspaces')}</h2>
              </div>
              <div className="workspace-grid workspace-flagship-grid">
                {flagshipAccessItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="workspace-access-card workspace-flagship-card"
                      type="button"
                      key={item.label}
                      onClick={() => onNavigate(item.path)}
                    >
                      <span className="workspace-access-icon">
                        <Icon size={24} />
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
            </section>

            <section className="workspace-product-section workspace-secondary-section" aria-label="Secondary modules">
              <div className="workspace-section-heading">
                <span>{t('Secondary modules')}</span>
                <h2>{t('Tools, licenses, and commercial workflows')}</h2>
              </div>
              <div className="workspace-grid workspace-secondary-grid">
                {secondaryAccessItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="workspace-secondary-tile"
                      type="button"
                      key={item.label}
                      onClick={() => onNavigate(item.path)}
                    >
                      <span className="workspace-access-icon">
                        <Icon size={18} />
                      </span>
                      <span className="workspace-access-copy">
                        <strong>{t(item.label)}</strong>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="workspace-profile-card" aria-label="Workspace profile">
            <div className="workspace-profile-copy">
              <strong>{user.name}</strong>
            </div>
            <button
              className="workspace-profile-avatar-button"
              type="button"
              onClick={() => setAvatarDialogOpen(true)}
              aria-label={t('Change profile picture')}
            >
              <span
                className="workspace-profile-ring"
                style={{ '--profile-progress': `${profileLevelProgress}%` } as React.CSSProperties}
                aria-label={`${profileLevelProgress}% level progress`}
              >
                <UserAvatar user={user} className="workspace-profile-avatar" />
                <span className="workspace-profile-edit-icon" aria-hidden="true">
                  <Pencil size={16} />
                </span>
              </span>
            </button>
            <div className="workspace-profile-level" aria-label={`Level ${profileLevel}`}>
              <span>LV</span>
              <strong>{profileLevel}</strong>
            </div>
            <img
              className="workspace-profile-badge"
              src={getSubscriptionBadgeImage(user.subscription)}
              alt={`${user.subscription} badge`}
            />
            <span className={`${getSubscriptionClass(user.subscription)} workspace-profile-tier`}>
              {user.subscription}
            </span>
            <div className="workspace-profile-points">
              <Star size={19} fill="currentColor" />
              <strong>{yvimoPoints.toLocaleString()}</strong>
              <span>{t('YVIMO Points')}</span>
            </div>
          </aside>

          {avatarDialogOpen ? (
            <div className="profile-avatar-dialog-backdrop" role="presentation" onMouseDown={() => setAvatarDialogOpen(false)}>
              <section
                className="profile-avatar-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-avatar-dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  className="profile-avatar-dialog-close"
                  type="button"
                  onClick={() => setAvatarDialogOpen(false)}
                  aria-label={t('Close')}
                >
                  <X size={18} />
                </button>
                <div className="profile-avatar-dialog-heading">
                  <span>{t('Profile picture')}</span>
                  <h2 id="profile-avatar-dialog-title">{t('Change profile picture')}</h2>
                </div>
                <div
                  className={avatarPreview ? 'profile-avatar-preview editable' : 'profile-avatar-preview'}
                  aria-label={t('Drag image to reposition it')}
                  onPointerDown={handleAvatarPointerDown}
                  onPointerMove={handleAvatarPointerMove}
                  onPointerUp={handleAvatarPointerEnd}
                  onPointerCancel={handleAvatarPointerEnd}
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt=""
                      draggable={false}
                      style={{
                        transform: `translate(${avatarOffset.x}px, ${avatarOffset.y}px) scale(${avatarZoom})`,
                      }}
                    />
                  ) : (
                    <UserAvatar user={user} className="profile-avatar-preview-fallback" />
                  )}
                </div>
                <div className="profile-avatar-crop-controls">
                  <label>
                    <span>{t('Zoom')}</span>
                    <input
                      type="range"
                      min="1"
                      max="2.6"
                      step="0.01"
                      value={avatarZoom}
                      disabled={!avatarPreview}
                      onChange={(event) => setAvatarZoom(Number(event.target.value))}
                    />
                  </label>
                  <button type="button" onClick={resetAvatarCrop} disabled={!avatarPreview}>
                    {t('Center image')}
                  </button>
                </div>
                <label className="profile-avatar-file-control">
                  <Pencil size={17} />
                  <span>{avatarFile ? avatarFile.name : t('Choose image')}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAvatarFileChange} />
                </label>
                {avatarMessage ? <p className="profile-avatar-message">{t(avatarMessage)}</p> : null}
                <div className="profile-avatar-dialog-actions">
                  <button type="button" onClick={() => setAvatarDialogOpen(false)}>
                    {t('Cancel')}
                  </button>
                  <button type="button" onClick={handleAvatarSave} disabled={!avatarFile || avatarSaving}>
                    {avatarSaving ? t('Saving...') : t('Save picture')}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
        )}
        {supplierJoinDialogOpen ? (
          <div className="supplier-join-dialog-backdrop" role="presentation" onMouseDown={() => setSupplierJoinDialogOpen(false)}>
            <section
              className="supplier-join-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="supplier-join-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                className="supplier-join-dialog-close"
                type="button"
                onClick={() => setSupplierJoinDialogOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
              <div className="supplier-join-dialog-heading">
                <span>Supplier Access</span>
                <h2 id="supplier-join-dialog-title">Join customer workspace</h2>
                <p>Enter the supplier invitation code provided by your customer.</p>
              </div>
              <form onSubmit={joinCustomerWorkspace}>
                <label>
                  <span>Invitation code</span>
                  <input
                    value={supplierInvitationCode}
                    onChange={(event) => setSupplierInvitationCode(event.target.value)}
                    placeholder="GLSN-SUP-2026"
                  />
                </label>
                <div className="supplier-join-dialog-actions">
                  <button type="button" onClick={() => setSupplierJoinDialogOpen(false)}>Cancel</button>
                  <button type="submit">Join customer</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
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
  const [profileLoadState, setProfileLoadState] = React.useState<ProfileLoadState>('idle');
  const [profileLoadError, setProfileLoadError] = React.useState<string | null>(null);
  const [dashboardTransition, setDashboardTransition] = React.useState(false);
  const authSessionRef = React.useRef<Session | null>(null);
  const authProfileRequestRef = React.useRef(0);
  const explicitSignOutRef = React.useRef(false);
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
    || currentPath.startsWith('/portal/engineering-tools/')
    || currentPath === '/workspace/manufacturing-ops'
    || currentPath.startsWith('/workspace/manufacturing-ops/');
  const isMesApplicationScreen =
    currentPath === '/workspace/manufacturing-ops/mes/orders'
    || currentPath === '/workspace/manufacturing-ops/mes/work-centers'
    || currentPath === '/workspace/manufacturing-ops/mes/operator-terminal'
    || currentPath === '/workspace/manufacturing-ops/mes/traceability'
    || currentPath === '/workspace/manufacturing-ops/mes/suppliers'
    || currentPath === '/workspace/manufacturing-ops/mes/quality'
    || currentPath.startsWith('/workspace/manufacturing-ops/mes/quality/')
    || currentPath === '/workspace/manufacturing-ops/mes/clients'
    || currentPath.startsWith('/workspace/manufacturing-ops/mes/clients/');
  const isWorkspacePage = currentPath === '/dashboard';
  const isAcademyPage = currentPath === '/academy' || currentPath.startsWith('/academy/');
  const isAuthPage = isLoginPage || isSignUpPage;
  const headerProgress = isAuthPage || isDashboardPage || isAcademyPage ? 1 : scrollProgress;
  const compactViewport = viewportWidth < 760;
  const tinyViewport = viewportWidth < 480;
  const headerProfileLevelProgress = authUser?.profileLevelProgress ?? 0;
  const headerProfileLevel = authUser?.profileLevel ?? 1;
  const headerYvimoPoints = authUser?.yvimoPoints ?? 0;
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
  const academyCourseSlug =
    academyPathParts[0] === 'academy' && !['courses', 'tracks', 'progress', 'certificates'].includes(academyPathParts[1] ?? '')
      ? academyPathParts[1]
      : undefined;
  const academyTrackSlug =
    academyPathParts[0] === 'academy' && academyPathParts[1] === 'tracks'
      ? academyPathParts[2]
      : undefined;
  const academyLessonSlug =
    academyPathParts[0] === 'academy' && academyPathParts[2] === 'lessons'
      ? academyPathParts[3]
      : undefined;
  const academyLiveSessionSlug =
    academyPathParts[0] === 'academy' && academyPathParts[2] === 'live-sessions'
      ? academyPathParts[3]
      : undefined;
  const academyActivityId =
    academyPathParts[0] === 'academy' && academyPathParts[2] === 'activities'
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

  React.useEffect(() => {
    authSessionRef.current = authSession;
  }, [authSession]);

  React.useEffect(() => {
    if (profileLoadState === 'error') {
      console.warn('[auth] profile unavailable; keeping authenticated session', {
        profileLoadError,
        hasSession: !!authSession?.user,
      });
    }
  }, [authSession, profileLoadError, profileLoadState]);

  const fetchOrCreateProfile = React.useCallback(async (session: Session) => {
    const { user } = session;

    try {
      const profileClient = createSessionSupabaseClient(session.access_token);

      console.log('[auth] profile fetch start', user.id);

      const { data, error } = await withTimeout(
        profileClient
          .from('profiles')
          .select('id, full_name, company_name, role, subscription_tier, yvimo_points, experience_points, profile_level, profile_level_progress, avatar_url, created_at, updated_at')
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
      };

      const { data: insertedProfile, error: insertError } = await withTimeout(
        profileClient
          .from('profiles')
          .insert(fallbackProfile)
          .select('id, full_name, company_name, role, subscription_tier, yvimo_points, experience_points, profile_level, profile_level_progress, avatar_url, created_at, updated_at')
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
      console.warn('[auth] profile fetch error', error);
      return null;
    }
  }, []);

  const syncSessionUser = React.useCallback(async (session: Session | null) => {
    console.log('[auth] session value', session);
    const requestId = ++authProfileRequestRef.current;
    setAuthSession(session);

    if (!session?.user) {
      setAuthUser(null);
      setProfileLoadState('idle');
      setProfileLoadError(null);
      return;
    }

    setAuthUser(profileToAppUser(session.user, null));
    setProfileLoadState('loading');
    setProfileLoadError(null);

    try {
      const profile = await fetchOrCreateProfile(session);
      if (requestId !== authProfileRequestRef.current) return;
      setAuthUser(profileToAppUser(session.user, profile));
      setProfileLoadState(profile ? 'loaded' : 'error');
      setProfileLoadError(profile ? null : 'Profile could not be loaded.');
    } catch (error) {
      if (requestId !== authProfileRequestRef.current) return;
      console.error('[auth] session profile sync error', error);
      setAuthUser(profileToAppUser(session.user, null));
      setProfileLoadState('error');
      setProfileLoadError(error instanceof Error ? error.message : 'Profile could not be loaded.');
    }
  }, [fetchOrCreateProfile]);

  const refreshAuthProfile = React.useCallback(async () => {
    if (!authSession?.user) return;

    setProfileLoadState('loading');
    setProfileLoadError(null);

    try {
      const profile = await fetchOrCreateProfile(authSession);
      setAuthUser((currentUser) => (
        profile || !currentUser ? profileToAppUser(authSession.user, profile) : currentUser
      ));
      setProfileLoadState(profile ? 'loaded' : 'error');
      setProfileLoadError(profile ? null : 'Profile could not be loaded.');
    } catch (error) {
      console.error('[auth] profile refresh sync error', error);
      setAuthUser((currentUser) => currentUser ?? profileToAppUser(authSession.user, null));
      setProfileLoadState('error');
      setProfileLoadError(error instanceof Error ? error.message : 'Profile could not be loaded.');
    }
  }, [authSession, fetchOrCreateProfile]);

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
        setProfileLoadState('idle');
        setProfileLoadError(null);
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
        setProfileLoadState(data.session?.user ? 'error' : 'idle');
        setProfileLoadError(error instanceof Error ? error.message : 'Profile could not be loaded.');
      } finally {
        console.log('[auth] getSession loading reset');
        if (active) setAuthLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth] state change', event, session);
      window.setTimeout(() => {
        if (event === 'SIGNED_OUT') {
          if (!explicitSignOutRef.current && authSessionRef.current?.user) {
            console.warn('[auth] ignored SIGNED_OUT without explicit sign out while local session exists');
            return;
          }

          explicitSignOutRef.current = false;
          syncSessionUser(null).catch(() => {
            setAuthSession(null);
            setAuthUser(null);
            setProfileLoadState('idle');
            setProfileLoadError(null);
          });
          return;
        }

        if (
          event === 'SIGNED_IN'
          && session?.user?.id
          && session.user.id === authSessionRef.current?.user?.id
        ) {
          setAuthSession(session);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          setAuthSession(session);
          return;
        }

        if (event === 'USER_UPDATED') {
          setAuthSession(session);
          if (session?.user) {
            setAuthUser((currentUser) => currentUser
              ? {
                  ...currentUser,
                  avatarUrl: typeof session.user.user_metadata?.avatar_url === 'string'
                    ? session.user.user_metadata.avatar_url
                    : currentUser.avatarUrl,
                }
              : profileToAppUser(session.user, null));
          }
          return;
        }

        syncSessionUser(session).catch(() => {
          setAuthSession(session);
          setAuthUser(session?.user ? profileToAppUser(session.user, null) : null);
          setProfileLoadState(session?.user ? 'error' : 'idle');
          setProfileLoadError(session?.user ? 'Profile could not be loaded.' : null);
        });
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [syncSessionUser]);

  React.useEffect(() => {
    if (!authLoading && isDashboardPage && !authSession?.user) {
      navigateLogin();
    }
  }, [authLoading, authSession, isDashboardPage]);

  React.useEffect(() => {
    if (
      authLoading
      || !authSession?.user
      || !isDashboardPage
      || profileLoadState !== 'idle'
    ) return;

    refreshAuthProfile().catch((error) => {
      console.error('[auth] dashboard profile refresh error', error);
    });
  }, [authLoading, authSession, isDashboardPage, profileLoadState, refreshAuthProfile]);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(window.location.pathname);
    window.setTimeout(() => {
      if (window.location.hash) {
        document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
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
      explicitSignOutRef.current = false;
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      setAuthSession(session);
      setAuthUser(profileToAppUser(session.user, null));
      setProfileLoadState('loading');
      setProfileLoadError(null);
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
    console.log('[auth] apple signIn temporarily disabled');
    return 'Apple login is temporarily disabled.';
  };

  const handleMicrosoftSignIn = async () => {
    console.log('[auth] microsoft signIn action start');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      console.error('[auth] microsoft signIn action error', error);
      return formatAuthError(error.message);
    }

    return null;
  };

  const handleGoogleSignIn = async () => {
    console.log('[auth] google signIn action start');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      console.error('[auth] google signIn action error', error);
      return formatAuthError(error.message);
    }

    return null;
  };

  const handleUpdateAvatar = async (file: File): Promise<AvatarUploadResult> => {
    if (!authSession?.user) {
      return { ok: false, message: 'Sign in again to update your profile picture.' };
    }

    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const filePath = `${authSession.user.id}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('profile-avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[auth] avatar upload error', uploadError);
      return { ok: false, message: 'Profile picture could not be uploaded.' };
    }

    const { data: publicUrlData } = supabase.storage
      .from('profile-avatars')
      .getPublicUrl(filePath);

    const avatarUrl = publicUrlData.publicUrl;
    const { data, error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: avatarUrl },
    });

    if (updateError) {
      console.error('[auth] avatar metadata update error', updateError);
      return { ok: false, message: 'Profile picture was uploaded, but your profile could not be updated.' };
    }

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', authSession.user.id);

    if (profileUpdateError) {
      console.error('[auth] profile avatar update error', profileUpdateError);
      return { ok: false, message: 'Profile picture was saved to your account, but could not be shared with your organization.' };
    }

    setAuthUser((currentUser) => currentUser ? { ...currentUser, avatarUrl } : currentUser);
    setAuthSession((currentSession) => {
      if (!currentSession || !data.user) return currentSession;
      return { ...currentSession, user: data.user };
    });

    return { ok: true, message: 'Profile picture updated.' };
  };

  const handleSignOut = async () => {
    explicitSignOutRef.current = true;
    await supabase.auth.signOut();
    setAuthSession(null);
    setAuthUser(null);
    setProfileLoadState('idle');
    setProfileLoadError(null);
    navigateLogin();
  };

  return (
    <div
      className={['site-shell', isMesApplicationScreen ? 'site-shell-mes-application' : ''].filter(Boolean).join(' ')}
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
          onMicrosoftSignIn={handleMicrosoftSignIn}
          onGoogleSignIn={handleGoogleSignIn}
          t={t}
        />
      ) : isSignUpPage ? (
        <SignUpPage
          onNavigateLogin={navigateLogin}
          onSignUp={handleSignUp}
          t={t}
        />
      ) : isDashboardPage ? (
        authSession?.user ? (
          authUser ? (
            <LoggedDashboardPage
              user={authUser}
              onSignOut={handleSignOut}
              onNavigate={navigateTo}
              onUpdateAvatar={handleUpdateAvatar}
              activePath={currentPath}
              t={t}
              languageCode={language}
            />
          ) : (
            <DashboardLoadingPage t={t} />
          )
        ) : (
          <LoginPage
            onNavigateSignUp={navigateSignUp}
            onSignIn={handleSignIn}
            onAppleSignIn={handleAppleSignIn}
            onMicrosoftSignIn={handleMicrosoftSignIn}
            onGoogleSignIn={handleGoogleSignIn}
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
        ) : academyCourseSlug && academyActivityId ? (
          <AcademyActivityPage
            user={authUser}
            navigateTo={navigateTo}
            courseSlug={academyCourseSlug}
            activityId={academyActivityId}
            t={t}
            languageCode={language}
            onUserProfileRefresh={refreshAuthProfile}
          />
        ) : academyCourseSlug && (academyLessonSlug || academyLiveSessionSlug) ? (
          <AcademyLessonPage
            user={authUser}
            navigateTo={navigateTo}
            courseSlug={academyCourseSlug}
            lessonSlug={academyLessonSlug ?? academyLiveSessionSlug ?? ''}
            liveSession={Boolean(academyLiveSessionSlug)}
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
            onUserProfileRefresh={refreshAuthProfile}
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
