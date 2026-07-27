import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Award,
  Bot,
  Bold,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Cpu,
  Download,
  FileUp,
  FileText,
  GraduationCap,
  Heading2,
  Italic,
  List,
  ListOrdered,
  LockKeyhole,
  MapPin,
  Network,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Quote,
  Radar,
  RotateCcw,
  Route,
  Save,
  Search,
  Pencil,
  Plus,
  ShieldCheck,
  Settings2,
  Star,
  StickyNote,
  Trash2,
  Trophy,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import {
  canAccessLesson,
  canAccessAcademyLiveSessions,
  canManageAcademyActivities,
  canManageAcademyLiveSessions,
  completeAcademyActivity,
  createCertificateForCourse,
  createCertificateForTrack,
  deleteAcademyActivity,
  deleteAcademyLiveSession,
  enrollInFreeCourse,
  fetchActivitiesForCourse,
  fetchActivityAttempt,
  fetchActivityAttemptsForCourse,
  fetchActivityById,
  fetchCertificateForCourse,
  fetchCertificateById,
  fetchCertificatesForUser,
  fetchCourseBundle,
  fetchLessonBySlug,
  fetchLiveSessionsForCourse,
  fetchLessonNote,
  fetchLessonProgressForLesson,
  fetchLessonProgressForCourse,
  fetchLessonResources,
  fetchLessonSubmissions,
  fetchPlayableLessonBySlug,
  fetchPublishedCourses,
  fetchPublishedTrackBundles,
  fetchTrackCertificatesForUser,
  fetchTrackProgressSummaries,
  getLessonResourceDownloadUrl,
  getCourseProgressSummary,
  getEnrollmentStatus,
  isAdminUser,
  isEnrollmentActive,
  publishLessonResource,
  resetLessonProgress,
  saveLessonNote,
  saveAcademyActivity,
  saveAcademyLiveSession,
  updateLessonProgress,
  uploadLessonSubmission,
  type AcademyCourseBundle,
  type AcademyTrackBundle,
} from '../academy/academyApi';
import type {
  AcademyCertificate,
  AcademyActivity,
  AcademyActivityAttempt,
  AcademyActivityConfig,
  AcademyActivityOption,
  AcademyActivityType,
  AcademyCourse,
  AcademyEnrollment,
  AcademyLesson,
  AcademyLessonStatus,
  AcademyLessonProgress,
  AcademyLessonProgressState,
  AcademyLessonResource,
  AcademyLessonSubmission,
  AcademyModuleWithLessons,
  AcademyTrackCertificate,
  AcademyTrackProgressSummary,
  IndustrialScenarioConfig,
  LessonAccessResult,
  QuickCheckConfig,
  QuickCheckQuestion,
  SimulationTaskConfig,
} from '../academy/types';
import { VideoPlayer } from '../components/academy/VideoPlayer';
import { exportElementScreenshotToSinglePagePdf } from '../lib/screenshotPdfExport';

type AcademyUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  subscription?: string;
};

type AcademyTranslator = (text: string) => string;

type AcademyPageProps = {
  user: AcademyUser | null;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
  languageCode?: string;
  onUserProfileRefresh?: () => Promise<void>;
};

type AcademyTrackCourse = {
  step: number;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  level: string;
  estimatedTime: string;
  status: 'not-started' | 'in-progress' | 'completed';
  skills: string[];
  lessons?: AcademyTrackLesson[];
  requiredPlan?: string;
  isLocked?: boolean;
  progress?: number;
  completed?: boolean;
  certificateEligible?: boolean;
};

type AcademyTrackSpecialization = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  platformName: string;
  progressLabel: string;
  logoSrc: string;
  accentColor: string;
  courses: AcademyTrackCourse[];
};

type AcademyTrackCategory = 'core' | 'skill' | 'advanced';

type AcademyTrackLesson = {
  slug: string;
  title: string;
  estimatedDuration?: string;
  videoUrl?: string;
  content?: string;
  quizQuestions?: unknown[];
  completed?: boolean;
  isLocked?: boolean;
  requiredPlan?: string;
  progress?: number;
};

type AcademyTrack = {
  slug: string;
  title: string;
  shortTitle: string;
  category: AcademyTrackCategory;
  categoryLabel?: string;
  description: string;
  subtitle: string;
  level: string;
  certificateType: string;
  estimatedDuration: string;
  accessStatus?: 'available' | 'preview' | 'coming-soon';
  icon: React.ComponentType<{ size?: number }>;
  badgeSrc?: string;
  recommendedFor?: string[];
  specializations?: AcademyTrackSpecialization[];
  courses: AcademyTrackCourse[];
};

type AcademyHeroTile = {
  label: string;
  color: string;
  logoSrc?: string;
  logoSlug?: string;
  tileSize?: 'square' | 'wide';
};

const defaultT: AcademyTranslator = (text) => text;
const lessonNotesMaxLength = 5000;
const lessonSubmissionMaxBytes = 250 * 1024 * 1024;
const lessonSubmissionMaxSizeLabel = '250 MB';

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return 'File size unavailable';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

const allowedLessonNoteTags = new Set(['b', 'strong', 'i', 'em', 'h2', 'ul', 'ol', 'li', 'blockquote', 'div', 'p', 'br']);

function escapeLessonNoteText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeLessonNoteHtml(value: string) {
  if (!value.trim()) return '';
  if (typeof window === 'undefined') return escapeLessonNoteText(value);

  const parser = new DOMParser();
  const documentBody = parser.parseFromString(`<div>${value}</div>`, 'text/html').body;

  function sanitizeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escapeLessonNoteText(node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes).map(sanitizeNode).join('');
    if (!allowedLessonNoteTags.has(tag)) return children;
    if (tag === 'br') return '<br>';
    return `<${tag}>${children}</${tag}>`;
  }

  return Array.from(documentBody.childNodes).map(sanitizeNode).join('');
}

function getLessonNotePlainText(value: string) {
  if (!value) return '';
  if (typeof window === 'undefined') return value.replace(/<[^>]+>/g, '');
  const element = document.createElement('div');
  element.innerHTML = sanitizeLessonNoteHtml(value);
  return element.textContent ?? '';
}

function getReadableErrorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error && caught.message) return caught.message;
  if (caught && typeof caught === 'object') {
    const errorRecord = caught as { message?: unknown; error_description?: unknown; details?: unknown };
    const message = errorRecord.message ?? errorRecord.error_description ?? errorRecord.details;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function formatPrice(course: AcademyCourse) {
  if (course.price === null || Number(course.price) === 0) return 'Free';
  return `${course.currency ?? 'USD'} ${Number(course.price).toFixed(2)}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const minutes = Math.max(Math.round(seconds / 60), 1);
  return `${minutes} min`;
}

function formatLessonCount(count: number, t: AcademyTranslator) {
  return `${count} ${count === 1 ? t('lesson') : t('lessons')}`;
}

function formatCourseCount(count: number, t: AcademyTranslator) {
  return `${count} ${count === 1 ? t('course') : t('courses')}`;
}

function formatCompletedCount(completed: number, total: number, t: AcademyTranslator) {
  return `${completed} ${t('of')} ${total} ${total === 1 ? t('lesson completed') : t('lessons completed')}`;
}

function getProgressState(progress?: AcademyLessonProgress): AcademyLessonProgressState {
  if (progress?.completed) return 'completed';
  if (progress && progress.progress_percent > 0) return 'in_progress';
  return 'not_started';
}

function getProgressLabel(state: AcademyLessonProgressState, t: AcademyTranslator) {
  if (state === 'completed') return t('Completed');
  if (state === 'in_progress') return t('In progress');
  return t('Not started');
}

function getActivityTypeLabel(type: AcademyActivityType) {
  if (type === 'quick_check') return 'Quick Check';
  if (type === 'industrial_scenario') return 'Industrial Scenario';
  return 'Simulation Task';
}

function getActivityStatus(attempt?: AcademyActivityAttempt | null): AcademyLessonProgressState {
  if (attempt?.status === 'completed') return 'completed';
  if (attempt?.status === 'in_progress') return 'in_progress';
  return 'not_started';
}

function getDefaultActivityConfig(type: AcademyActivityType): AcademyActivityConfig {
  if (type === 'industrial_scenario') {
    return {
      context: 'PLC is in RUN, safety is OK, but the output is not energizing.',
      problemDescription: 'Review the visible machine status and choose the best next step.',
      machineStatus: 'Stopped',
      statusTags: [
        { label: 'I0.0 Start Button', value: 'ON' },
        { label: 'I0.1 E-stop OK', value: 'ON' },
        { label: 'Q0.0 Motor Output', value: 'OFF' },
      ],
      question: 'What should you check first?',
      choices: [
        { id: 'a', text: 'PLC program comments' },
        { id: 'b', text: 'The missing permissive or field input' },
        { id: 'c', text: 'HMI color theme' },
      ],
      correctChoiceId: 'b',
      explanation: 'The output is off while command and safety are OK, so the next useful check is the missing permissive or input condition.',
    };
  }

  if (type === 'simulation_task') {
    return {
      simulationType: 'start_stop_latch',
      objective: 'Start the motor, then stop it correctly.',
      initialState: {
        startButton: false,
        stopButton: false,
        estopOk: true,
        motorRunning: false,
      },
      successCondition: {
        requiredEvents: ['motor_started', 'motor_stopped'],
      },
      explanation: 'A basic latch starts when Start is pressed and stops when Stop is pressed or safety is lost.',
    };
  }

  return {
    questions: [
      {
        id: 'q1',
        type: 'multiple_choice',
        question: 'What type of PLC signal is 24VDC ON/OFF?',
        options: [
          { id: 'a', text: 'Analog' },
          { id: 'b', text: 'Digital' },
          { id: 'c', text: 'Pneumatic' },
        ],
        correctOptionId: 'b',
        explanation: 'A 24VDC ON/OFF signal is considered a digital signal.',
      },
    ],
  };
}

function getActivityAttemptScoreSummary(activity: AcademyActivity, attempt?: AcademyActivityAttempt | null) {
  if (attempt?.status !== 'completed') return null;

  const savedCorrectCount = attempt.attempt_data_json?.correctCount;
  const savedTotalQuestions = attempt.attempt_data_json?.totalQuestions;
  if (typeof savedCorrectCount === 'number' && typeof savedTotalQuestions === 'number') {
    return {
      correctCount: savedCorrectCount,
      totalQuestions: savedTotalQuestions,
    };
  }

  if (activity.type !== 'quick_check') return null;
  const config = activity.config_json as QuickCheckConfig;
  const questions = config.questions ?? [];
  const answers = (attempt.attempt_data_json?.answers ?? {}) as Record<string, string>;
  if (questions.length === 0 || Object.keys(answers).length === 0) return null;

  return {
    correctCount: questions.filter((question) => isQuickCheckAnswerCorrect(question, answers[question.id])).length,
    totalQuestions: questions.length,
  };
}

function isFreeCourse(course: AcademyCourse) {
  return course.price === null || Number(course.price) === 0;
}

function getAcademyDatabaseErrorMessage() {
  return 'Database is not connected or Database communication error.';
}

type CourseCompletionMap = Record<string, boolean>;
type TrackCompletionMap = Record<string, boolean>;

async function fetchCourseCompletionMap(userId: string | null, courses: AcademyCourse[]) {
  if (!userId || courses.length === 0) return {};

  const entries = await Promise.all(
    courses.map(async (course) => {
      const [summary, certificate] = await Promise.all([
        getCourseProgressSummary(userId, course.id),
        fetchCertificateForCourse(userId, course.id),
      ]);
      return [
        course.id,
        Boolean(certificate) || Boolean(summary && summary.total_lessons > 0 && summary.completed_lessons === summary.total_lessons),
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

async function fetchCourseCertificateMap(userId: string | null, courses: AcademyCourse[]) {
  if (!userId || courses.length === 0) return {};

  const certificates = await fetchCertificatesForUser(userId);
  const certifiedCourseIds = new Set(certificates.map((certificate) => certificate.course_id));
  return Object.fromEntries(courses.map((course) => [course.id, certifiedCourseIds.has(course.id)]));
}

function getProfileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'Y';
}

const academyNavItems = [
  { label: 'Academy Home', icon: GraduationCap, path: '/academy', section: 'home' },
  { label: 'Courses', icon: BookOpen, path: '/academy/courses', section: 'courses' },
  { label: 'Continue watching', icon: PlayCircle, path: '/academy', section: 'continue' },
  { label: 'My progress', icon: CheckCircle2, path: '/academy/progress', section: 'progress' },
  { label: 'My certificates', icon: Trophy, path: '/academy/certificates', section: 'certificates' },
  { label: 'News', icon: Newspaper, path: '/academy', section: 'news' },
  { label: 'Resources', icon: FileText, path: '/academy', section: 'resources' },
];

const academyHowSteps = [
  {
    title: 'Explore',
    description: 'Explore courses by topic: PLCs, robotics, industrial software, and career growth.',
    icon: Search,
  },
  {
    title: 'Learn',
    description: 'Follow focused lessons built around real automation and manufacturing scenarios.',
    icon: GraduationCap,
  },
  {
    title: 'Practice',
    description: 'Apply concepts through guided examples, troubleshooting cases, simulations, or project-style exercises.',
    icon: Wrench,
  },
  {
    title: 'Track progress',
    description: 'Monitor completed lessons, course progress, certificates, and recommended next steps.',
    icon: CheckCircle2,
  },
  {
    title: 'Apply at work',
    description: 'Use what you learned in real machines, production systems, projects, or your professional portfolio.',
    icon: BriefcaseBusiness,
  },
];

const academyHeroTiles: AcademyHeroTile[] = [
  { label: 'Siemens', color: '#009999', logoSlug: 'siemens', tileSize: 'wide' },
  { label: 'FANUC', color: '#f5c400', logoSrc: '/assets/logos/ecosystem/fanuc.png' },
  { label: 'Allen-Bradley', color: '#2f4f9e', logoSrc: '/assets/logos/ecosystem/allen-bradley.png' },
  { label: 'KUKA', color: '#ff6b2a', logoSrc: '/assets/logos/ecosystem/kuka.png', tileSize: 'wide' },
  { label: 'OPC UA', color: '#3d8aa8', logoSrc: '/assets/logos/ecosystem/opc-ua.png', tileSize: 'wide' },
  { label: 'AWS', color: '#ff9900', logoSrc: '/assets/logos/ecosystem/aws.png' },
  { label: 'Azure', color: '#258bd2', logoSrc: '/assets/logos/ecosystem/azure.png' },
  { label: 'Omron', color: '#1f86c7', logoSrc: '/assets/logos/ecosystem/omron.svg' },
  { label: 'ABB', color: '#ff2f2f', logoSlug: 'abb' },
  { label: 'Yaskawa', color: '#276da8', logoSrc: '/assets/logos/ecosystem/yaskawa.jpg' },
  { label: 'MQTT', color: '#8d3c96', logoSlug: 'mqtt' },
  { label: 'Node.js', color: '#69ad54', logoSlug: 'nodedotjs' },
];

function makeTrackLessons(titles: string[]): AcademyTrackLesson[] {
  return titles.map((title) => ({
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title,
    estimatedDuration: 'TBD',
    completed: false,
    isLocked: false,
    progress: 0,
  }));
}

function makeTrackCourse(
  step: number,
  slug: string,
  title: string,
  shortTitle: string,
  description: string,
  level: string,
  skills: string[],
  lessons: string[],
): AcademyTrackCourse {
  return {
    step,
    slug,
    title,
    shortTitle,
    description,
    level,
    estimatedTime: 'TBD',
    status: 'not-started',
    skills,
    certificateEligible: true,
    lessons: makeTrackLessons(lessons),
  };
}

const academyTracks: AcademyTrack[] = [
  {
    slug: 'plc-technician',
    title: 'PLC Technician Track',
    shortTitle: 'PLC Technician',
    category: 'core',
    description: 'A practical learning path for building real PLC programming, troubleshooting, HMI, networking, and machine control skills. Students learn core PLC concepts first, then choose a Siemens or Rockwell specialization.',
    subtitle: 'A practical learning path for building real PLC programming, troubleshooting, HMI, networking, and machine control skills.',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'Siemens or Rockwell path',
    icon: Cpu,
    badgeSrc: '/assets/academy/plc-technician-track-badge-v4.png',
    courses: [
      makeTrackCourse(1, 'industrial-automation-fundamentals', 'Industrial Automation Fundamentals', 'Automation Fundamentals', 'Build the foundation for understanding industrial automation systems, control architecture, sensors, actuators, signals, and basic machine behavior.', 'Beginner', ['Control architecture', 'Sensors and actuators', 'Machine states', 'Troubleshooting mindset'], [
        'What is a PLC?',
        'Industrial control architecture',
        'Inputs, outputs, sensors and actuators',
        'Digital vs analog signals',
        'Control panels, power, safety and wiring basics',
        'Relay logic and ladder thinking',
        'Machine sequences and states',
        'Troubleshooting mindset for automation technicians',
      ]),
      makeTrackCourse(2, 'plc-programming-fundamentals', 'PLC Programming Fundamentals', 'PLC Programming', 'Learn the universal PLC programming concepts used across major industrial platforms.', 'Beginner', ['PLC scan cycle', 'Ladder logic', 'Timers and counters', 'Machine sequencing'], [
        'PLC scan cycle',
        'Tags, variables and memory',
        'Ladder logic structure',
        'Contacts, coils and seal-in circuits',
        'Timers',
        'Counters',
        'Comparators',
        'Math instructions',
        'Move instructions',
        'Analog scaling',
        'Basic machine sequence',
        'Faults, interlocks and permissives',
      ]),
      makeTrackCourse(3, 'electrical-field-signals-plc-technicians', 'Electrical & Field Signals for PLC Technicians', 'Field Signals', 'Learn how PLC logic connects to the real machine through sensors, outputs, wiring, electrical diagrams, and field troubleshooting.', 'Beginner to Intermediate', ['Electrical diagrams', 'Input tracing', 'Output tracing', 'Field troubleshooting'], [
        'Reading electrical diagrams for PLC troubleshooting',
        'Tracing an input signal',
        'Tracing an output signal',
        'Sensor troubleshooting',
        'Solenoid and actuator troubleshooting',
        'Relay and contactor basics',
        'Analog signal troubleshooting',
        'Using a multimeter in PLC troubleshooting',
        'Common field signal failures',
        'Building a field troubleshooting checklist',
      ]),
    ],
    specializations: [
      {
        slug: 'plc-technician-siemens',
        title: 'Siemens / TIA Portal',
        shortTitle: 'Siemens',
        platformName: 'TIA Portal',
        progressLabel: 'Siemens Path Progress',
        logoSrc: '/assets/logos/ecosystem/siemens.svg',
        accentColor: '#009999',
        description: 'Learn PLC programming, diagnostics, HMI and PROFINET workflows using Siemens automation tools.',
        courses: [
          makeTrackCourse(4, 'siemens-plc-platform-fundamentals-tia-portal', 'Siemens PLC Platform Fundamentals: TIA Portal', 'TIA Portal', 'Learn how to create, configure, simulate, download, upload, and monitor Siemens PLC projects using TIA Portal.', 'Beginner to Intermediate', ['TIA Portal', 'S7-1200 and S7-1500', 'Data blocks', 'PLCSIM'], [
            'TIA Portal environment',
            'Creating a new Siemens PLC project',
            'S7-1200 and S7-1500 overview',
            'Hardware configuration',
            'Device and network setup',
            'Tag tables and PLC variables',
            'Data blocks',
            'FC and FB structure',
            'Instance DBs and multi-instance concepts',
            'Online monitoring',
            'Downloading and uploading projects',
            'PLCSIM simulation workflow',
            'Basic diagnostics in TIA Portal',
          ]),
          makeTrackCourse(5, 'siemens-hmi-fundamentals-wincc', 'Siemens HMI Fundamentals: WinCC', 'WinCC HMI', 'Build basic operator interfaces connected to Siemens PLC logic using WinCC concepts.', 'Beginner to Intermediate', ['WinCC', 'HMI tags', 'Alarms', 'Operator panels'], [
            'What is an HMI?',
            'UI vs UX for machine operators',
            'WinCC overview',
            'HMI tags and PLC connection',
            'Screen navigation',
            'Buttons, indicators and numeric displays',
            'Alarm configuration',
            'Recipes and setpoints',
            'Basic diagnostics screens',
            'Good HMI design practices',
            'Mini project: operator panel for a Siemens machine sequence',
          ]),
          makeTrackCourse(6, 'industrial-networks-siemens-plc-technicians', 'Industrial Networks for Siemens PLC Technicians', 'Siemens Networks', 'Learn the networking concepts required to configure and troubleshoot Siemens PLC systems, PROFINET devices, remote I/O, and basic PLC communication.', 'Intermediate', ['PROFINET', 'ET 200 remote I/O', 'GSDML files', 'Network diagnostics'], [
            'Industrial Ethernet basics',
            'IP addresses and subnets',
            'PROFINET overview',
            'Device names and IP assignment',
            'TIA Portal network view',
            'GSDML files',
            'ET 200 remote I/O architecture',
            'Module and device diagnostics',
            'Basic Profibus overview',
            'PUT and GET communication overview',
            'TCON, TSEND and TRCV concepts',
            'Network troubleshooting checklist',
            'Mini project: Siemens PLC with remote I/O and HMI',
          ]),
          makeTrackCourse(7, 'advanced-siemens-plc-programming-scl-fb-fc-db', 'Advanced Siemens PLC Programming: SCL, FB, FC and DB', 'Advanced Siemens', 'Develop reusable Siemens PLC logic using structured programming concepts, SCL, function blocks, data blocks, UDTs, and modular machine logic.', 'Intermediate', ['SCL', 'Function blocks', 'Data blocks', 'Reusable structures'], [
            'When to use structured text / SCL',
            'Variables and assignments',
            'IF / THEN / ELSE',
            'CASE statements',
            'FOR loops',
            'WHILE loops',
            'Calling functions',
            'Timers and counters in SCL',
            'FC vs FB',
            'Data blocks and instance DBs',
            'UDTs and reusable structures',
            'Multi-instance programming',
            'Mini project: reusable Siemens machine control block',
          ]),
          makeTrackCourse(8, 'siemens-plc-troubleshooting-online-diagnostics', 'Siemens PLC Troubleshooting and Online Diagnostics', 'Siemens Diagnostics', 'Learn how to diagnose machine problems using TIA Portal online tools, monitoring, cross-reference, force tables, watch tables, and diagnostics.', 'Intermediate', ['Online monitoring', 'Watch tables', 'Force tables', 'Diagnostics buffer'], [
            'Going online with a Siemens PLC',
            'Monitoring ladder and block logic',
            'Watch tables',
            'Force tables and safety considerations',
            'Cross-reference tools',
            'Diagnostics buffer',
            'Module diagnostics',
            'Finding missing permissives',
            'Finding active interlocks',
            'Troubleshooting communication faults',
            'Troubleshooting analog values',
            'Practical case: Siemens machine does not start',
          ]),
          makeTrackCourse(9, 'siemens-plc-technician-capstone-project', 'Siemens PLC Technician Capstone Project', 'Siemens Capstone', 'Build and document a complete Siemens PLC-controlled machine project with logic, HMI, remote I/O, alarms, diagnostics, testing, and simulation.', 'Intermediate', ['Project architecture', 'Manual and auto modes', 'WinCC screens', 'PLCSIM testing'], [
            'Project requirements',
            'I/O list',
            'Electrical and control architecture',
            'Siemens PLC program structure',
            'Manual mode',
            'Automatic mode',
            'Fault handling',
            'WinCC HMI screens',
            'PROFINET and remote I/O configuration',
            'Testing and simulation with PLCSIM',
            'Troubleshooting scenarios',
            'Final review and certificate submission',
          ]),
        ],
      },
      {
        slug: 'plc-technician-rockwell',
        title: 'Rockwell / Studio 5000',
        shortTitle: 'Rockwell',
        platformName: 'Studio 5000',
        progressLabel: 'Rockwell Path Progress',
        logoSrc: '/assets/logos/ecosystem/allen-bradley.png',
        accentColor: '#c8102e',
        description: 'Learn PLC programming, diagnostics, HMI and EtherNet/IP workflows using Rockwell automation tools.',
        courses: [
          makeTrackCourse(4, 'rockwell-plc-platform-fundamentals-studio-5000', 'Rockwell PLC Platform Fundamentals: Studio 5000', 'Studio 5000', 'Learn how to create, configure, download, upload, monitor, and troubleshoot Rockwell Logix projects using Studio 5000.', 'Beginner to Intermediate', ['Studio 5000', 'CompactLogix', 'ControlLogix', 'Online edits'], [
            'Studio 5000 environment',
            'CompactLogix and ControlLogix overview',
            'Creating a new Logix project',
            'Controller and chassis configuration',
            'Controller organizer structure',
            'Tags and data types',
            'Programs, routines and tasks',
            'Add-On Instructions overview',
            'Online edits',
            'Downloading and uploading projects',
            'Monitoring tools',
            'Basic diagnostics in Studio 5000',
          ]),
          makeTrackCourse(5, 'rockwell-hmi-fundamentals-factorytalk-view', 'Rockwell HMI Fundamentals: FactoryTalk View', 'FactoryTalk View', 'Build basic operator interfaces connected to Rockwell PLC logic using FactoryTalk View concepts.', 'Beginner to Intermediate', ['FactoryTalk View', 'HMI tags', 'Alarms', 'Operator displays'], [
            'What is an HMI?',
            'UI vs UX for machine operators',
            'FactoryTalk View overview',
            'HMI tags and PLC connection',
            'Display navigation',
            'Buttons, indicators and numeric displays',
            'Alarm configuration',
            'Recipes and setpoints',
            'Basic diagnostics displays',
            'Good HMI design practices',
            'Mini project: operator panel for a Rockwell machine sequence',
          ]),
          makeTrackCourse(6, 'industrial-networks-rockwell-plc-technicians', 'Industrial Networks for Rockwell PLC Technicians', 'Rockwell Networks', 'Learn the networking concepts required to configure and troubleshoot Rockwell PLC systems, EtherNet/IP devices, remote I/O, and basic PLC communication.', 'Intermediate', ['EtherNet/IP', 'FactoryTalk Linx', 'POINT I/O', 'Connection faults'], [
            'Industrial Ethernet basics',
            'IP addresses and subnets',
            'EtherNet/IP overview',
            'RSLinx / FactoryTalk Linx overview',
            'EDS files',
            'POINT I/O and remote I/O architecture',
            'Module properties and connection faults',
            'Produced and consumed tags overview',
            'Device status and diagnostics',
            'Common EtherNet/IP troubleshooting cases',
            'Network troubleshooting checklist',
            'Mini project: Rockwell PLC with remote I/O and HMI',
          ]),
          makeTrackCourse(7, 'advanced-rockwell-plc-programming-st-aoi-udt', 'Advanced Rockwell PLC Programming: ST, AOI and UDT', 'Advanced Rockwell', 'Develop reusable Rockwell PLC logic using structured text, Add-On Instructions, UDTs, arrays, and modular machine logic.', 'Intermediate', ['Structured text', 'AOIs', 'UDTs', 'Reusable patterns'], [
            'When to use structured text',
            'Variables and assignments',
            'IF / THEN / ELSE',
            'CASE statements',
            'FOR loops',
            'WHILE loops',
            'Calling routines and instructions',
            'Timers and counters in structured text',
            'UDTs and arrays',
            'Add-On Instructions',
            'Produced and consumed tags overview',
            'Reusable machine logic patterns',
            'Mini project: reusable Rockwell machine control block',
          ]),
          makeTrackCourse(8, 'rockwell-plc-troubleshooting-online-diagnostics', 'Rockwell PLC Troubleshooting and Online Diagnostics', 'Rockwell Diagnostics', 'Learn how to diagnose machine problems using Studio 5000 online tools, cross-reference, controller tags, forces, trends, faults, and module status.', 'Intermediate', ['Online tools', 'Controller tags', 'Trends', 'Module faults'], [
            'Going online with a Rockwell PLC',
            'Monitoring ladder and routines',
            'Controller tags and watch tools',
            'Forces and safety considerations',
            'Cross-reference tools',
            'Trends',
            'Controller and module fault codes',
            'Module status',
            'Finding missing permissives',
            'Finding active interlocks',
            'Troubleshooting communication faults',
            'Practical case: Rockwell machine does not start',
          ]),
          makeTrackCourse(9, 'rockwell-plc-technician-capstone-project', 'Rockwell PLC Technician Capstone Project', 'Rockwell Capstone', 'Build and document a complete Rockwell PLC-controlled machine project with logic, HMI, remote I/O, alarms, diagnostics, testing, and simulation.', 'Intermediate', ['Project architecture', 'Manual and auto modes', 'FactoryTalk displays', 'Simulation workflow'], [
            'Project requirements',
            'I/O list',
            'Electrical and control architecture',
            'Rockwell PLC program structure',
            'Manual mode',
            'Automatic mode',
            'Fault handling',
            'FactoryTalk View HMI displays',
            'EtherNet/IP and remote I/O configuration',
            'Testing and simulation workflow',
            'Troubleshooting scenarios',
            'Final review and certificate submission',
          ]),
        ],
      },
    ],
  },
  {
    slug: 'robotics-integration',
    title: 'Robotics Technician Track',
    shortTitle: 'Robotics Technician',
    category: 'core',
    description: 'Learn robot cells, motion, safety, and robot-to-PLC coordination for real automation systems.',
    subtitle: 'A structured learning path for robot cells, motion, safety, and robot-to-PLC coordination.',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'Self-paced',
    icon: Bot,
    badgeSrc: '/assets/academy/robotics-tech-track-logo.png',
    courses: [
      {
        step: 1,
        slug: 'robotics-cell-fundamentals',
        title: 'Robotics Cell Fundamentals',
        shortTitle: 'Cell Fundamentals',
        description: 'Understand robot cells, fixtures, safety, and production flow.',
        level: 'Beginner',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Robot cell basics', 'Fixtures', 'Safety zones', 'Production flow'],
      },
      {
        step: 2,
        slug: 'robot-motion-and-frames',
        title: 'Robot Motion and Frames',
        shortTitle: 'Motion and Frames',
        description: 'Learn positions, frames, paths, and motion behavior.',
        level: 'Beginner',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Robot frames', 'Positions', 'Paths', 'Motion behavior'],
      },
      {
        step: 3,
        slug: 'robot-and-plc-handshaking',
        title: 'Robot and PLC Handshaking',
        shortTitle: 'PLC Handshaking',
        description: 'Connect robot programs with machine control logic.',
        level: 'Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Handshake signals', 'Robot ready logic', 'Cycle coordination', 'Fault handling'],
      },
      {
        step: 4,
        slug: 'robot-safety-and-recovery',
        title: 'Robot Safety and Recovery',
        shortTitle: 'Safety Recovery',
        description: 'Handle stops, faults, and safe restart conditions.',
        level: 'Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Safety states', 'Fault recovery', 'Restart logic', 'Operator interaction'],
      },
    ],
  },
  {
    slug: 'cnc-technician',
    title: 'CNC Technician Track',
    shortTitle: 'CNC Technician',
    category: 'core',
    description: 'Learn CNC machine fundamentals, NC programming, FANUC control operation, PMC logic, servo diagnostics, simulation, backups, and troubleshooting.',
    subtitle: 'CNC TECHNICIAN',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'FANUC Control path',
    accessStatus: 'preview',
    icon: Wrench,
    badgeSrc: '/assets/academy/cnc-technician-track-badge-v4.png',
    courses: [
      makeTrackCourse(1, 'cnc-machine-fundamentals', 'CNC Machine Fundamentals', 'CNC Fundamentals', 'Understand CNC machine architecture, axes, tooling, workholding, coordinates, and shop-floor operating concepts.', 'Beginner', ['CNC basics', 'Machine axes', 'Tooling', 'Coordinate systems'], ['CNC machine architecture']),
      makeTrackCourse(2, 'nc-programming-editing-cimco-edit', 'NC Programming & Editing - CIMCO Edit', 'NC Programming', 'Create, edit, review, and prepare NC programs using practical programming and editor workflows.', 'Beginner', ['G-code', 'Program editing', 'CIMCO Edit', 'Program review'], ['NC programming basics']),
      makeTrackCourse(3, 'fanuc-control-operation-parameters', 'FANUC Control Operation & Parameters', 'FANUC Operation', 'Learn FANUC control navigation, operation, offsets, parameters, and safe handling practices.', 'Beginner to Intermediate', ['FANUC control', 'Offsets', 'Parameters', 'Operation'], ['FANUC control navigation']),
      makeTrackCourse(4, 'pmc-logic-machine-signals-fanuc-ladder-iii', 'PMC Logic & Machine Signals - FANUC LADDER-III', 'PMC Logic', 'Read and troubleshoot PMC logic, machine signals, interlocks, and ladder diagnostics with FANUC LADDER-III.', 'Intermediate', ['PMC logic', 'Machine signals', 'LADDER-III', 'Interlocks'], ['PMC signal flow']),
      makeTrackCourse(5, 'servo-diagnostics-tuning-fanuc-servo-guide', 'Servo Diagnostics & Tuning - FANUC SERVO Guide', 'Servo Diagnostics', 'Diagnose servo alarms, feedback issues, tuning concerns, and axis performance using FANUC SERVO Guide concepts.', 'Intermediate', ['Servo alarms', 'Axis tuning', 'Diagnostics', 'SERVO Guide'], ['Servo diagnostics workflow']),
      makeTrackCourse(6, 'cnc-control-simulation-fanuc-ncguide', 'CNC Control Simulation - FANUC NCGuide', 'NCGuide Simulation', 'Use FANUC NCGuide concepts to simulate controls, validate programs, and practice machine operation offline.', 'Intermediate', ['NCGuide', 'Simulation', 'Offline testing', 'Program validation'], ['Control simulation basics']),
      makeTrackCourse(7, 'alarms-backups-troubleshooting', 'Alarms, Backups & Troubleshooting', 'Troubleshooting', 'Build a practical workflow for backups, alarm investigation, recovery, and CNC machine fault diagnosis.', 'Intermediate', ['Alarms', 'Backups', 'Recovery', 'Troubleshooting'], ['CNC troubleshooting workflow']),
      makeTrackCourse(8, 'capstone-diagnose-cnc-machine-fault', 'Capstone: Diagnose a CNC Machine Fault', 'CNC Capstone', 'Apply the complete CNC Technician workflow to diagnose and document a realistic machine fault.', 'Intermediate', ['Fault diagnosis', 'Documentation', 'Capstone', 'FANUC Control'], ['Capstone fault case']),
    ],
  },
  {
    slug: 'industrial-sensing-technologies',
    title: 'Industrial Sensing Technologies',
    shortTitle: 'Industrial Sensing',
    category: 'skill',
    description: 'Learn how to integrate vision systems, code readers, smart sensors, color detection, vibration monitoring, and inspection technologies into real automation systems.',
    subtitle: 'Learn how sensing, inspection, vision, smart devices, and condition monitoring support real industrial automation systems.',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'Self-paced',
    accessStatus: 'preview',
    icon: Radar,
    badgeSrc: '/assets/academy/industrial-sensing-badge-v4-blue.png',
    recommendedFor: ['PLC Technician', 'Robotics Technician', 'Automation Systems Integrator'],
    courses: [
      {
        step: 1,
        slug: 'industrial-sensors-fundamentals',
        title: 'Industrial Sensors Fundamentals',
        shortTitle: 'Sensors Fundamentals',
        description: 'Understand the most common industrial sensors, how they work, and how they are applied in automation systems.',
        level: 'Beginner',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Sensor selection', 'Analog signals', 'PNP and NPN wiring', 'Sensor troubleshooting'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'Introduction to Industrial Sensing',
          'Discrete Sensors vs. Analog Sensors',
          'Proximity, Photoelectric, and Inductive Sensors',
          'Analog Signals: 0-10 V and 4-20 mA',
          'Sensor Wiring: PNP, NPN, Sourcing, and Sinking',
          'Sensor Mounting and Alignment Basics',
          'Common Sensor Faults and Troubleshooting',
          'Practical Sensor Selection Examples',
        ]),
      },
      {
        step: 2,
        slug: 'vision-systems-and-code-reading',
        title: 'Vision Systems and Code Reading',
        shortTitle: 'Vision Code Reading',
        description: 'Learn the fundamentals of machine vision, barcode readers, QR readers, and Data Matrix code reading for industrial applications.',
        level: 'Beginner to Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Machine vision', 'Code reading', 'Lighting setup', 'PLC integration'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'Introduction to Machine Vision',
          'Cameras, Lenses, Lighting, and Field of View',
          'Image Acquisition and Triggering',
          'Barcode, QR, and Data Matrix Reading',
          'Presence, Position, and Quality Inspection',
          'Lighting Problems and Image Quality Issues',
          'PLC Integration with Vision Systems',
          'Vision System Setup Checklist',
        ]),
      },
      {
        step: 3,
        slug: 'smart-devices-and-machine-integration',
        title: 'Smart Devices and Machine Integration',
        shortTitle: 'Smart Devices',
        description: 'Learn how to integrate smart sensors, IO-Link devices, laser sensors, color sensors, and measurement devices into PLC-based systems.',
        level: 'Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['IO-Link basics', 'Laser measurement', 'Color sensing', 'Device diagnostics'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'What Makes a Sensor "Smart"',
          'IO-Link Basics and Device Parameters',
          'Laser Distance Sensors and Measurement Devices',
          'Color Sensors and Part Identification',
          'Sensor Data Mapping into PLC Tags',
          'Device Diagnostics and Status Bits',
          'Integration with HMI and Alarm Systems',
          'Practical Smart Device Integration Workflow',
        ]),
      },
      {
        step: 4,
        slug: 'inspection-and-condition-monitoring-basics',
        title: 'Inspection and Condition Monitoring Basics',
        shortTitle: 'Inspection Monitoring',
        description: 'Understand how sensing technologies are used for inspection, reject logic, vibration monitoring, and machine condition awareness.',
        level: 'Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Inspection logic', 'Reject handling', 'Vibration basics', 'Machine health indicators'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'Introduction to Inspection Systems',
          'Pass/Fail Logic and Reject Handling',
          'Part Presence, Orientation, and Verification',
          'Vibration Monitoring Fundamentals',
          'Process Signals and Machine Health Indicators',
          'Alarm Thresholds and Warning Levels',
          'Data Logging for Inspection and Diagnostics',
          'Basic Troubleshooting Strategy for Inspection Systems',
        ]),
      },
    ],
  },
  {
    slug: 'industrial-networks',
    title: 'Industrial Networks',
    shortTitle: 'Industrial Networks',
    category: 'skill',
    description: 'Build practical knowledge in industrial Ethernet, IP addressing, fieldbus communication, device setup, and network troubleshooting for automation systems.',
    subtitle: 'Build practical knowledge in industrial Ethernet, fieldbus communication, protocols, device setup, and controls network troubleshooting.',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'Self-paced',
    accessStatus: 'preview',
    icon: Network,
    badgeSrc: '/assets/academy/industrial-networks-badge-v4-blue.png',
    recommendedFor: ['PLC Technician', 'Robotics Technician', 'CNC Technician', 'Automation Systems Integrator'],
    courses: [
      {
        step: 1,
        slug: 'industrial-ethernet-fundamentals',
        title: 'Industrial Ethernet Fundamentals',
        shortTitle: 'Ethernet Fundamentals',
        description: 'Learn the networking basics required to configure and troubleshoot modern automation systems.',
        level: 'Beginner',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['IP addressing', 'Subnets', 'Switches', 'Network documentation'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'What Is Industrial Ethernet',
          'IP Addresses, Subnets, and Gateways',
          'MAC Addresses, Ports, and Switches',
          'Static IP vs. DHCP in Industrial Systems',
          'Network Topologies for Machines and Cells',
          'Managed vs. Unmanaged Switches',
          'Common Network Design Mistakes',
          'Basic Network Documentation',
        ]),
      },
      {
        step: 2,
        slug: 'profinet-and-ethernet-ip-basics',
        title: 'PROFINET and EtherNet/IP Basics',
        shortTitle: 'PROFINET EtherNet/IP',
        description: 'Understand how common PLC-based industrial networks work and how controllers communicate with field devices.',
        level: 'Beginner to Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['PROFINET setup', 'EtherNet/IP setup', 'I/O data', 'Device commissioning'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'Introduction to Fieldbus and Industrial Protocols',
          'PROFINET Device Names and IP Configuration',
          'PROFINET Controllers, Devices, and GSDML Files',
          'EtherNet/IP Scanners, Adapters, and EDS Files',
          'Cyclic Communication and I/O Data',
          'Device Replacement and Commissioning Basics',
          'PLC Hardware Configuration Concepts',
          'Common PROFINET and EtherNet/IP Faults',
        ]),
      },
      {
        step: 3,
        slug: 'modbus-tcp-opc-ua-and-mqtt-concepts',
        title: 'Modbus TCP, OPC UA, and MQTT Concepts',
        shortTitle: 'Industrial Protocols',
        description: 'Learn the basic communication concepts behind common protocols used for gateways, SCADA, dashboards, and plant-floor data systems.',
        level: 'Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Modbus TCP', 'OPC UA', 'MQTT', 'Protocol translation'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'Why Industrial Protocols Matter',
          'Modbus TCP Clients, Servers, Registers, and Coils',
          'OPC UA Servers, Clients, Tags, and Security Basics',
          'MQTT Brokers, Clients, Topics, and Payloads',
          'Polling vs. Publishing Data',
          'Choosing the Right Protocol for an Application',
          'Gateway Use Cases for Protocol Translation',
          'Practical Data Flow Examples',
        ]),
      },
      {
        step: 4,
        slug: 'network-troubleshooting-for-controls',
        title: 'Network Troubleshooting for Controls',
        shortTitle: 'Network Troubleshooting',
        description: 'Learn practical troubleshooting methods for diagnosing industrial network and communication issues.',
        level: 'Intermediate',
        estimatedTime: 'TBD',
        status: 'not-started',
        skills: ['Ping and scans', 'IP conflicts', 'Firewall ports', 'PLC diagnostics'],
        certificateEligible: true,
        lessons: makeTrackLessons([
          'Troubleshooting Mindset for Network Problems',
          'Ping, IP Scan, and Device Discovery',
          'IP Conflicts and Subnet Problems',
          'Cable, Connector, and Switch Issues',
          'Firewall and Port Access Problems',
          'PLC Communication Diagnostics',
          'Reading Device Status and Network LEDs',
          'Network Commissioning Checklist',
        ]),
      },
    ],
  },
  {
    slug: 'machine-vision-code-reading',
    title: 'Machine Vision & Code Reading',
    shortTitle: 'Machine Vision',
    category: 'skill',
    description: 'Learn machine vision fundamentals, lighting, lenses, image quality, industrial code reading, PLC integration, and inspection troubleshooting.',
    subtitle: 'MACHINE VISION & CODE READING',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'Self-paced',
    accessStatus: 'preview',
    icon: Radar,
    badgeSrc: '/assets/academy/machine-vision-code-reading-badge-v4.png',
    recommendedFor: ['PLC Technician', 'Robotics Technician', 'Automation Systems Integrator'],
    courses: [
      makeTrackCourse(1, 'machine-vision-fundamentals', 'Machine Vision Fundamentals', 'Vision Fundamentals', 'Understand cameras, inspection goals, triggers, image acquisition, and practical machine vision use cases.', 'Beginner', ['Machine vision', 'Cameras', 'Triggers', 'Inspection'], ['Machine vision fundamentals']),
      makeTrackCourse(2, 'lighting-lenses-image-quality', 'Lighting, Lenses, and Image Quality', 'Image Quality', 'Learn how lighting, lens selection, exposure, focus, and mounting affect reliable inspection results.', 'Beginner to Intermediate', ['Lighting', 'Lenses', 'Exposure', 'Image quality'], ['Image quality basics']),
      makeTrackCourse(3, 'code-reading-applications', 'Code Reading Applications', 'Code Reading', 'Apply barcode, QR, and Data Matrix reading to industrial traceability and production workflows.', 'Beginner to Intermediate', ['Barcode', 'QR codes', 'Data Matrix', 'Traceability'], ['Code reading basics']),
      makeTrackCourse(4, 'vision-to-plc-integration', 'Vision-to-PLC Integration', 'Vision PLC', 'Connect vision results to PLC tags, handshakes, triggers, pass/fail logic, and diagnostics.', 'Intermediate', ['PLC integration', 'Handshakes', 'Pass fail', 'Diagnostics'], ['Vision-to-PLC workflow']),
      makeTrackCourse(5, 'inspection-troubleshooting-basics', 'Inspection Troubleshooting Basics', 'Inspection Troubleshooting', 'Troubleshoot common inspection failures caused by setup, product variation, image quality, and communication issues.', 'Intermediate', ['Troubleshooting', 'Inspection setup', 'Product variation', 'Communication'], ['Inspection troubleshooting']),
    ],
  },
  {
    slug: 'safety-systems',
    title: 'Safety Systems',
    shortTitle: 'Safety Systems',
    category: 'skill',
    description: 'Learn industrial safety fundamentals, safety relays, safety PLCs, guarding, interlocks, E-stops, robot cell safety, and validation basics.',
    subtitle: 'SAFETY SYSTEMS',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'Self-paced',
    accessStatus: 'preview',
    icon: ShieldCheck,
    badgeSrc: '/assets/academy/safety-systems-badge-v4.png',
    recommendedFor: ['PLC Technician', 'Robotics Technician', 'Automation Systems Integrator'],
    courses: [
      makeTrackCourse(1, 'industrial-safety-fundamentals', 'Industrial Safety Fundamentals', 'Safety Fundamentals', 'Understand the safety concepts technicians need when working around automated equipment.', 'Beginner', ['Safety basics', 'Risk awareness', 'Machine states', 'Standards mindset'], ['Industrial safety fundamentals']),
      makeTrackCourse(2, 'safety-relays-and-safety-plcs', 'Safety Relays and Safety PLCs', 'Safety Controllers', 'Learn how safety relays and safety PLCs monitor devices, outputs, and reset conditions.', 'Beginner to Intermediate', ['Safety relays', 'Safety PLCs', 'Reset logic', 'Outputs'], ['Safety controller basics']),
      makeTrackCourse(3, 'guarding-interlocks-and-estops', 'Guarding, Interlocks, and E-Stops', 'Guarding Interlocks', 'Understand machine guarding, door switches, interlocks, emergency stops, and safe restart behavior.', 'Beginner to Intermediate', ['Guarding', 'Interlocks', 'E-stops', 'Restart logic'], ['Guarding and interlocks']),
      makeTrackCourse(4, 'robot-cell-safety', 'Robot Cell Safety', 'Robot Safety', 'Apply safety concepts to robot cells, zones, teaching, recovery, and operator interaction.', 'Intermediate', ['Robot safety', 'Zones', 'Teaching', 'Recovery'], ['Robot cell safety']),
      makeTrackCourse(5, 'safety-validation-basics', 'Safety Validation Basics', 'Safety Validation', 'Learn basic validation workflows, test documentation, and practical safety sign-off habits.', 'Intermediate', ['Validation', 'Documentation', 'Testing', 'Sign-off'], ['Safety validation basics']),
    ],
  },
  {
    slug: 'scada-industrial-data',
    title: 'SCADA & Industrial Data',
    shortTitle: 'SCADA & Data',
    category: 'skill',
    description: 'Learn SCADA fundamentals, HMI and data tag structure, OPC UA, MQTT, alarm design, event design, and production data collection basics.',
    subtitle: 'SCADA & INDUSTRIAL DATA',
    level: 'Beginner to Intermediate',
    certificateType: 'Certificate track',
    estimatedDuration: 'Self-paced',
    accessStatus: 'preview',
    icon: Network,
    badgeSrc: '/assets/academy/scada-industrial-data-badge-v4.png',
    recommendedFor: ['PLC Technician', 'Automation Systems Integrator', 'Industrial Data / IT-OT Specialist'],
    courses: [
      makeTrackCourse(1, 'scada-fundamentals', 'SCADA Fundamentals', 'SCADA Fundamentals', 'Understand SCADA architecture, operators, servers, clients, tags, trends, and plant-floor workflows.', 'Beginner', ['SCADA', 'Architecture', 'Tags', 'Trends'], ['SCADA fundamentals']),
      makeTrackCourse(2, 'hmi-and-data-tag-structure', 'HMI and Data Tag Structure', 'Tag Structure', 'Design useful tag structures for HMIs, SCADA screens, alarms, diagnostics, and production data.', 'Beginner to Intermediate', ['HMI tags', 'Data structure', 'Diagnostics', 'Screens'], ['Tag structure basics']),
      makeTrackCourse(3, 'opc-ua-and-mqtt-basics', 'OPC UA and MQTT Basics', 'OPC UA MQTT', 'Learn how OPC UA and MQTT move industrial data between controllers, gateways, SCADA, and databases.', 'Intermediate', ['OPC UA', 'MQTT', 'Gateways', 'Data flow'], ['OPC UA and MQTT basics']),
      makeTrackCourse(4, 'alarm-and-event-design', 'Alarm and Event Design', 'Alarm Design', 'Build practical alarm and event structures that help operators respond without noise or confusion.', 'Intermediate', ['Alarms', 'Events', 'Priorities', 'Operator response'], ['Alarm design basics']),
      makeTrackCourse(5, 'production-data-collection-basics', 'Production Data Collection Basics', 'Data Collection', 'Collect counts, states, downtime, quality data, and machine events for production visibility.', 'Intermediate', ['Production data', 'Downtime', 'Quality', 'Events'], ['Production data basics']),
    ],
  },
  {
    slug: 'automation-systems-integrator',
    title: 'Automation Systems Integrator',
    shortTitle: 'Systems Integrator',
    category: 'advanced',
    description: 'An advanced learning path for technicians and engineers who want to design, connect, troubleshoot, and commission complete automation systems across PLCs, robots, HMIs, sensors, networks, safety, and industrial data platforms.',
    subtitle: 'AUTOMATION SYSTEMS INTEGRATOR',
    level: 'Advanced',
    certificateType: 'Certificate track',
    estimatedDuration: 'Multidisciplinary path',
    accessStatus: 'preview',
    icon: Route,
    badgeSrc: '/assets/academy/automation-systems-integrator-badge-v4-red.png',
    courses: [
      makeTrackCourse(1, 'integration-project-methodology', 'Integration Project Methodology', 'Methodology', 'Plan and execute automation integration projects with clear scope, risk, and commissioning discipline.', 'Advanced', ['Project method', 'Scope', 'Risk', 'Commissioning'], ['Integration methodology']),
      makeTrackCourse(2, 'electrical-controls-architecture', 'Electrical & Controls Architecture', 'Controls Architecture', 'Design controls architectures across panels, PLCs, I/O, networks, devices, and field wiring.', 'Advanced', ['Controls architecture', 'Electrical design', 'I/O', 'Networks'], ['Controls architecture']),
      makeTrackCourse(3, 'plc-integration-core', 'PLC Integration Core', 'PLC Integration', 'Connect PLC logic, interfaces, modes, diagnostics, and integration-ready machine states.', 'Advanced', ['PLC logic', 'Modes', 'Diagnostics', 'Machine states'], ['PLC integration core']),
      makeTrackCourse(4, 'hmi-scada-integration', 'HMI / SCADA Integration', 'HMI SCADA', 'Integrate HMIs and SCADA systems for operations, diagnostics, alarms, and production visibility.', 'Advanced', ['HMI', 'SCADA', 'Alarms', 'Diagnostics'], ['HMI and SCADA integration']),
      makeTrackCourse(5, 'industrial-networks-integration', 'Industrial Networks', 'Networks', 'Apply industrial network design, commissioning, protocol, and troubleshooting practices in integration projects.', 'Advanced', ['Industrial networks', 'Protocols', 'Commissioning', 'Troubleshooting'], ['Industrial networks integration']),
      makeTrackCourse(6, 'robot-to-plc-integration', 'Robot-to-PLC Integration', 'Robot PLC', 'Integrate robot programs, signals, handshakes, recovery states, and PLC-controlled cycles.', 'Advanced', ['Robots', 'PLC handshakes', 'Recovery', 'Cycles'], ['Robot-to-PLC integration']),
      makeTrackCourse(7, 'vision-sensing-integration', 'Vision & Sensing Integration', 'Vision Sensing', 'Integrate vision, smart sensors, inspection signals, and diagnostics into automation systems.', 'Advanced', ['Vision', 'Sensors', 'Inspection', 'Diagnostics'], ['Vision and sensing integration']),
      makeTrackCourse(8, 'safety-systems-integration', 'Safety Systems Integration', 'Safety Integration', 'Coordinate safety controllers, devices, reset logic, robot zones, and validation workflows.', 'Advanced', ['Safety systems', 'Robot zones', 'Reset logic', 'Validation'], ['Safety systems integration']),
      makeTrackCourse(9, 'data-collection-it-ot-mqtt-opc-ua', 'Data Collection / IT-OT / MQTT / OPC UA', 'IT OT Data', 'Connect automation systems to data platforms using practical IT-OT, MQTT, OPC UA, and gateway concepts.', 'Advanced', ['IT-OT', 'MQTT', 'OPC UA', 'Data collection'], ['IT-OT data collection']),
      makeTrackCourse(10, 'virtual-commissioning-basics', 'Virtual Commissioning Basics', 'Virtual Commissioning', 'Use simulation and offline testing to reduce commissioning risk before plant-floor startup.', 'Advanced', ['Simulation', 'Offline testing', 'Virtual FAT', 'Commissioning'], ['Virtual commissioning basics']),
      makeTrackCourse(11, 'fat-sat-commissioning', 'FAT / SAT / Commissioning', 'FAT SAT', 'Prepare and execute FAT, SAT, startup, punch lists, recovery plans, and commissioning documentation.', 'Advanced', ['FAT', 'SAT', 'Startup', 'Documentation'], ['FAT and SAT workflow']),
      makeTrackCourse(12, 'capstone-integration-project', 'Capstone Integration Project', 'Integration Capstone', 'Apply the complete systems integrator workflow to a multidisciplinary automation project.', 'Advanced', ['Capstone', 'Integration', 'Commissioning', 'Documentation'], ['Integration capstone']),
    ],
  },
  {
    slug: 'virtual-commissioning-specialist',
    title: 'Virtual Commissioning Specialist',
    shortTitle: 'Virtual Commissioning',
    category: 'advanced',
    description: 'Learn how to validate automation systems before commissioning by combining simulation, digital twins, robot simulation, PLC emulation, and virtual FAT workflows.',
    subtitle: 'VIRTUAL COMMISSIONING SPECIALIST',
    level: 'Advanced',
    certificateType: 'Certificate track',
    estimatedDuration: 'Self-paced',
    accessStatus: 'preview',
    icon: RotateCcw,
    badgeSrc: '/assets/academy/virtual-commissioning-badge-v4-red.png',
    courses: [
      makeTrackCourse(1, 'digital-twin-fundamentals', 'Digital Twin Fundamentals', 'Digital Twin', 'Understand digital twin concepts for validating automation systems before commissioning.', 'Advanced', ['Digital twins', 'Simulation', 'Validation', 'System behavior'], ['Digital twin fundamentals']),
      makeTrackCourse(2, 'robot-simulation-basics', 'Robot Simulation Basics', 'Robot Simulation', 'Use robot simulation concepts to validate motion, reach, zones, cycle flow, and offline logic.', 'Advanced', ['Robot simulation', 'Motion', 'Reach', 'Cycle flow'], ['Robot simulation basics']),
      makeTrackCourse(3, 'plc-simulation-and-emulation', 'PLC Simulation and Emulation', 'PLC Simulation', 'Connect simulated PLC logic and emulation workflows to virtual equipment and test cases.', 'Advanced', ['PLC simulation', 'Emulation', 'Test cases', 'Virtual equipment'], ['PLC simulation basics']),
      makeTrackCourse(4, 'offline-testing-methodology', 'Offline Testing Methodology', 'Offline Testing', 'Build repeatable offline tests for sequences, faults, recovery, operator actions, and machine states.', 'Advanced', ['Offline testing', 'Sequences', 'Faults', 'Recovery'], ['Offline testing methodology']),
      makeTrackCourse(5, 'virtual-fat-workflow', 'Virtual FAT Workflow', 'Virtual FAT', 'Prepare virtual FAT workflows that reduce on-site commissioning risk and improve project readiness.', 'Advanced', ['Virtual FAT', 'Risk reduction', 'Readiness', 'Documentation'], ['Virtual FAT workflow']),
      makeTrackCourse(6, 'capstone-virtual-commissioning-project', 'Capstone: Virtual Commissioning Project', 'VC Capstone', 'Apply simulation, emulation, testing, and documentation to a virtual commissioning capstone project.', 'Advanced', ['Capstone', 'Simulation', 'Emulation', 'Testing'], ['Virtual commissioning capstone']),
    ],
  },
];

const academyCoreTracks = academyTracks.filter((track) => track.category === 'core');
const academySkillPaths = academyTracks.filter((track) => track.category === 'skill');
const academyAdvancedTracks = academyTracks.filter((track) => track.category === 'advanced');

function getTrackBadgeSrc(trackSlug: string) {
  return academyTracks.find((track) => track.slug === trackSlug)?.badgeSrc ?? '/assets/academy/academy-track-logo.png';
}

function getTrackCardLabel(track: AcademyTrack) {
  if (track.category === 'core') return 'CORE TRACK';
  if (track.category === 'skill') return 'SKILL PATH';
  return 'ADVANCED TRACK';
}

function getTrackCourseCount(track: AcademyTrack) {
  return getVisibleTrackCourses(track, getDefaultSpecialization(track)).length;
}

function AcademyShell({
  children,
  navigateTo,
  t = defaultT,
  activeSection = 'courses',
  compact = false,
}: {
  children: React.ReactNode;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
  activeSection?: string;
  compact?: boolean;
}) {
  return (
    <main className={compact ? 'academy-shell theater' : 'academy-shell'}>
      <aside className="academy-sidebar">
        <button className="academy-sidebar-back" type="button" onClick={() => navigateTo('/dashboard')}>
          <ArrowRight size={16} />
          <span>{t('Dashboard')}</span>
        </button>
        <div className="academy-sidebar-title">
          <span>YVIMO</span>
          <strong>Academy</strong>
        </div>
        <nav aria-label="Academy navigation">
          {academyNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={item.section === activeSection ? 'active' : ''}
                type="button"
                key={item.label}
                onClick={() => navigateTo(item.path)}
              >
                <Icon size={18} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="academy-main">{children}</div>
    </main>
  );
}

function getCourseCategory(course: AcademyCourse) {
  return course.category?.trim() || 'Courses';
}

function getCoursePreviewImage(course: AcademyCourse) {
  if (course.thumbnail_url) return course.thumbnail_url;
  return `https://picsum.photos/seed/yvimo-course-${encodeURIComponent(course.slug)}/960/540`;
}

function CertificateQr({ value }: { value: string }) {
  return (
    <span
      className="academy-certificate-qr"
      style={{ '--qr-seed': `"${value}"` } as React.CSSProperties}
      aria-label={`Certificate QR ${value}`}
    >
      {Array.from({ length: 49 }, (_, index) => {
        const code = value.charCodeAt(index % value.length) || index;
        const active = index % 8 === 0 || (code + index * 7) % 5 < 2;
        return <i className={active ? 'active' : ''} key={index} />;
      })}
    </span>
  );
}

function getVisibleCategories(courses: AcademyCourse[]) {
  const preferred = [
    'PLC Programming',
    'Robotics',
    'CNC & FANUC Control',
    'Industrial Networks',
    'Industrial Sensing',
    'HMI / SCADA',
    'Industrial Data & IT-OT',
    'Safety Systems',
    'Industrial Software',
    'Career Growth',
  ];
  const existing = Array.from(new Set(courses.map(getCourseCategory)));
  return [
    ...preferred.filter((category) => existing.includes(category)),
    ...existing.filter((category) => !preferred.includes(category)),
  ];
}

function getTrackCourseStatus(course: AcademyTrackCourse, completion: CourseCompletionMap) {
  return completion[course.slug] ? 'completed' : 'not-started';
}

function getTrackStatusLabel(status: AcademyTrackCourse['status'], t: AcademyTranslator) {
  if (status === 'completed') return t('Completed');
  if (status === 'in-progress') return t('In progress');
  return t('Not started');
}

function getDefaultSpecialization(track?: AcademyTrack) {
  return track?.specializations?.[0] ?? null;
}

function getVisibleTrackCourses(track: AcademyTrack, specialization?: AcademyTrackSpecialization | null) {
  return specialization ? [...track.courses, ...specialization.courses] : track.courses;
}

function getLocalTrackSpecialization(trackSlug: string, specializationSlug?: string | null) {
  if (!specializationSlug) return null;
  return academyTracks
    .find((track) => track.slug === trackSlug)
    ?.specializations?.find((specialization) => specialization.slug === specializationSlug) ?? null;
}

function getTrackCourseLessonCount(course: AcademyTrackCourse) {
  return Math.max(course.lessons?.length ?? 1, 1);
}

type ProgressTrackBundleVariant = {
  bundle: AcademyTrackBundle;
  displayTitle?: string;
  routeTrackSlug?: string;
  progressKey?: string;
};

function getPathTrackBundles(bundle: AcademyTrackBundle): ProgressTrackBundleVariant[] {
  const localTrack = academyTracks.find((track) => track.slug === bundle.track.slug);
  if (!localTrack?.specializations?.length) return [{ bundle }];

  return localTrack.specializations.map((specialization) => {
    const visibleCourses = getVisibleTrackCourses(localTrack, specialization);
    const visibleSlugs = new Set(visibleCourses.map((course) => course.slug));
    const stepBySlug = new Map(visibleCourses.map((course) => [course.slug, course.step]));
    return {
      bundle: {
        ...bundle,
        track: {
          ...bundle.track,
          title: localTrack.title,
          short_title: localTrack.shortTitle,
        },
        trackCourses: bundle.trackCourses
          .filter((link) => visibleSlugs.has(link.course.slug))
          .map((link) => ({
            ...link,
            step: stepBySlug.get(link.course.slug) ?? link.step,
          }))
          .sort((left, right) => left.step - right.step),
      },
      displayTitle: `${localTrack.title} - ${specialization.title}`,
      routeTrackSlug: localTrack.slug,
      progressKey: specialization.slug,
    };
  });
}

function AcademyTrackCards({
  navigateTo,
  t,
  tracks = academyTracks,
  eyebrow = 'YVIMO ACADEMY TRACKS',
  title = 'Choose your learning path',
  description = 'Follow structured learning paths built from real industrial courses, practical progression, and applied automation skills.',
  note,
  returnSection,
}: {
  navigateTo: (path: string) => void;
  t: AcademyTranslator;
  tracks?: AcademyTrack[];
  eyebrow?: string;
  title?: string;
  description?: string;
  note?: string;
  returnSection?: string;
}) {
  const titleId = React.useId();
  const categoryClass = tracks[0]?.category ? `academy-track-section-${tracks[0].category}` : '';
  const sectionId = returnSection ? `academy-${returnSection}-tracks` : undefined;

  return (
    <section className={['academy-tracks-section', categoryClass].filter(Boolean).join(' ')} id={sectionId} aria-labelledby={titleId}>
      <div className="academy-tracks-heading">
        <p className="eyebrow">{t(eyebrow)}</p>
        <h2 id={titleId}>{t(title)}</h2>
        <p>{t(description)}</p>
        {note ? <span className="academy-track-section-note">{t(note)}</span> : null}
      </div>
      <div className="academy-track-grid">
        {tracks.map((track) => {
          const Icon = track.icon;
          const previewCourses = track.specializations ? track.courses : getVisibleTrackCourses(track, getDefaultSpecialization(track));
          const cardDescription = track.specializations
            ? track.description
            : track.description;
          return (
            <button
              className="academy-track-card"
              type="button"
              key={track.slug}
              onClick={() => navigateTo(`/academy/tracks/${track.slug}${returnSection ? `?from=${returnSection}` : ''}`)}
            >
              {track.badgeSrc ? (
                <span className="academy-track-card-badge" aria-hidden="true">
                  <img src={track.badgeSrc} alt="" />
                </span>
              ) : null}
              <span className="academy-track-card-top">
                {!track.badgeSrc ? (
                  <span className="academy-track-icon" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                ) : null}
                <span className="academy-track-title">
                  <strong>{t(track.title)}</strong>
                  <em>{t(track.categoryLabel ?? getTrackCardLabel(track))}</em>
                </span>
              </span>
              <span className="academy-track-description">{t(cardDescription)}</span>
              <span className="academy-track-chip-row">
                <span>{t(`${getTrackCourseCount(track)} courses`)}</span>
                <span>{t(track.level)}</span>
                {track.specializations ? (
                  <>
                    <span className="siemens">{t('Siemens path')}</span>
                    <span className="rockwell">{t('Rockwell path')}</span>
                  </>
                ) : null}
                <span>{t(track.certificateType)}</span>
                {track.specializations ? <span>{t('Capstone project')}</span> : null}
              </span>
              {track.recommendedFor?.length ? (
                <span className="academy-track-recommended">
                  <b>{t('Recommended for')}</b>
                  <span>{track.recommendedFor.map((item) => t(item)).join(' · ')}</span>
                </span>
              ) : null}
              <span className="academy-track-preview" aria-label={`${track.title} curriculum preview`}>
                {previewCourses.map((course) => (
                  <span key={course.slug}>
                    <b>{String(course.step).padStart(2, '0')}</b>
                    {t(course.title)}
                  </span>
                ))}
                {track.specializations?.map((specialization) => (
                  <span
                    className={`academy-track-preview-path ${specialization.slug.includes('siemens') ? 'siemens' : 'rockwell'}`}
                    key={specialization.slug}
                  >
                    <b>{specialization.shortTitle}</b>
                    {t(`${specialization.title} courses 04-09`)}
                  </span>
                ))}
              </span>
              <span className="academy-track-card-action">
                {t('View track')} <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function buildTrackCompletionMap(courses: AcademyCourse[], completion: CourseCompletionMap): TrackCompletionMap {
  return Object.fromEntries(
    courses.map((course) => [course.slug, Boolean(completion[course.id])]),
  );
}

function getTrackCoursePath(
  course: AcademyTrackCourse,
  returnContext?: { trackSlug: string; specializationSlug?: string | null },
) {
  const basePath = `/academy/${course.slug}`;
  if (!returnContext || typeof window === 'undefined') return basePath;

  const params = new URLSearchParams({
    fromTrack: returnContext.trackSlug,
    returnY: String(Math.round(window.scrollY)),
  });

  if (returnContext.specializationSlug) {
    params.set('fromSpecialization', returnContext.specializationSlug);
  }

  return `${basePath}?${params.toString()}`;
}

function getTrackRequestedSpecializationSlug() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('specialization');
}

function getCourseReturnContext() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const fromTrack = params.get('fromTrack');
  if (!fromTrack) return null;

  const returnY = Number(params.get('returnY') ?? '0');
  return {
    fromTrack,
    fromSpecialization: params.get('fromSpecialization'),
    returnY: Number.isFinite(returnY) ? Math.max(0, Math.round(returnY)) : 0,
  };
}

function getCourseReturnPath(returnContext: ReturnType<typeof getCourseReturnContext>) {
  if (!returnContext) return '/academy/courses';

  const params = new URLSearchParams();
  if (returnContext.fromSpecialization) {
    params.set('specialization', returnContext.fromSpecialization);
  }
  if (returnContext.returnY > 0) {
    params.set('returnY', String(returnContext.returnY));
  }

  const query = params.toString();
  return `/academy/tracks/${returnContext.fromTrack}${query ? `?${query}` : ''}`;
}

function buildLocalTrackBundles(courses: AcademyCourse[]): AcademyTrackBundle[] {
  const courseBySlug = new Map(courses.map((course) => [course.slug, course]));
  const now = new Date().toISOString();

  return academyTracks.flatMap((track) => {
    const trackCourses = getVisibleTrackCourses(track, getDefaultSpecialization(track)).flatMap((trackCourse) => {
      const course = courseBySlug.get(trackCourse.slug);
      if (!course) return [];

      return [{
        id: `${track.slug}-${course.id}`,
        track_id: track.slug,
        course_id: course.id,
        step: trackCourse.step,
        required_for_certificate: true,
        created_at: now,
        updated_at: now,
        course,
      }];
    });

    if (trackCourses.length === 0) return [];

    return [{
      track: {
        id: track.slug,
        slug: track.slug,
        title: track.title,
        short_title: track.shortTitle,
        description: track.description,
        subtitle: track.subtitle,
        level: track.level,
        certificate_type: track.certificateType,
        estimated_duration: track.estimatedDuration,
        status: 'published',
        created_at: now,
        updated_at: now,
      },
      trackCourses,
    }];
  });
}

function mergeTrackBundlesWithLocalFallback(
  loadedTrackBundles: AcademyTrackBundle[],
  localTrackBundles: AcademyTrackBundle[],
) {
  if (loadedTrackBundles.length === 0) return localTrackBundles;

  const localBySlug = new Map(localTrackBundles.map((bundle) => [bundle.track.slug, bundle]));
  const loadedBySlug = new Map(loadedTrackBundles.map((bundle) => [bundle.track.slug, bundle]));
  const slugs = Array.from(new Set([...localBySlug.keys(), ...loadedBySlug.keys()]));

  return slugs.flatMap((slug) => {
    const loaded = loadedBySlug.get(slug);
    const local = localBySlug.get(slug);

    if (!loaded) return local ? [local] : [];
    if (loaded.trackCourses.length > 0) {
      return [{
        ...loaded,
        track: local ? {
          ...loaded.track,
          title: local.track.title,
          short_title: local.track.short_title,
          description: local.track.description,
          subtitle: local.track.subtitle,
          level: local.track.level,
          certificate_type: local.track.certificate_type,
          estimated_duration: local.track.estimated_duration,
        } : loaded.track,
      }];
    }
    return local ? [{ ...loaded, trackCourses: local.trackCourses }] : [loaded];
  });
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeAnnularSegment(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function AcademyTrackPage({
  user,
  navigateTo,
  trackSlug,
  t = defaultT,
  languageCode = 'en',
}: AcademyPageProps & { trackSlug: string }) {
  const track = academyTracks.find((item) => item.slug === trackSlug);
  const [publishedCourses, setPublishedCourses] = React.useState<AcademyCourse[]>([]);
  const [completion, setCompletion] = React.useState<CourseCompletionMap>({});
  const [trackCertificate, setTrackCertificate] = React.useState<AcademyTrackCertificate | null>(null);
  const [trackCourseProgress, setTrackCourseProgress] = React.useState<Record<string, number>>({});
  const [selectedSpecializationSlug, setSelectedSpecializationSlug] = React.useState(
    getDefaultSpecialization(track)?.slug ?? null,
  );
  const selectedSpecialization = track?.specializations?.find((item) => item.slug === selectedSpecializationSlug)
    ?? getDefaultSpecialization(track);
  const visibleTrackCourses = React.useMemo(
    () => (track ? getVisibleTrackCourses(track, selectedSpecialization) : []),
    [selectedSpecialization, track],
  );
  const [selectedSlug, setSelectedSlug] = React.useState(visibleTrackCourses[0]?.slug ?? '');
  const [hoveredSlug, setHoveredSlug] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const curriculumRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const requestedSpecializationSlug = getTrackRequestedSpecializationSlug();
    const defaultSpecialization = track?.specializations?.find((item) => item.slug === requestedSpecializationSlug)
      ?? getDefaultSpecialization(track);
    setSelectedSpecializationSlug(defaultSpecialization?.slug ?? null);
    setSelectedSlug(track ? getVisibleTrackCourses(track, defaultSpecialization)[0]?.slug ?? '' : '');
  }, [track?.slug]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const rawReturnY = params.get('returnY');
    if (!rawReturnY) return;

    const returnY = Number(rawReturnY);
    if (!Number.isFinite(returnY)) return;

    window.setTimeout(() => {
      window.scrollTo({ top: Math.max(0, Math.round(returnY)), behavior: 'smooth' });
    }, 120);
  }, [trackSlug]);

  React.useEffect(() => {
    if (!track || visibleTrackCourses.some((course) => course.slug === selectedSlug)) return;
    setSelectedSlug(visibleTrackCourses[0]?.slug ?? '');
  }, [selectedSlug, track, visibleTrackCourses]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    fetchPublishedCourses(languageCode)
      .then(async (items) => {
        const [nextCompletion, trackCertificates] = await Promise.all([
          fetchCourseCertificateMap(user?.id ?? null, items),
          user ? fetchTrackCertificatesForUser(user.id).catch(() => [] as AcademyTrackCertificate[]) : Promise.resolve([]),
        ]);
        const progressEntries = await Promise.all(
          (visibleTrackCourses ?? []).map(async (trackCourse) => {
            const publishedCourse = items.find((item) => item.slug === trackCourse.slug);
            if (!user || !publishedCourse) return [trackCourse.slug, 0] as const;
            if (nextCompletion[publishedCourse.id]) return [trackCourse.slug, 100] as const;

            const bundle = await fetchCourseBundle(publishedCourse.slug, languageCode);
            if (!bundle) return [trackCourse.slug, 0] as const;

            const lessons = [
              ...bundle.modules.flatMap((module) => module.lessons),
              ...bundle.ungroupedLessons,
            ];
            const progress = await fetchLessonProgressForCourse(user.id, publishedCourse.id);
            const completedLessons = progress.filter((item) => item.completed).length;
            const percent = lessons.length > 0 ? Math.round((completedLessons / lessons.length) * 100) : 0;
            return [trackCourse.slug, percent] as const;
          }),
        );
        if (active) {
          setPublishedCourses(items);
          setCompletion(nextCompletion);
          setTrackCertificate(trackCertificates.find((certificate) => (
            certificate.track_slug === trackSlug
            && (certificate.specialization_slug ?? null) === (selectedSpecialization?.slug ?? null)
          )) ?? null);
          setTrackCourseProgress(Object.fromEntries(progressEntries));
        }
      })
      .catch(() => {
        if (active) setError(getAcademyDatabaseErrorMessage());
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [languageCode, selectedSpecialization?.slug, track, trackSlug, user, visibleTrackCourses]);

  if (!track) {
    return (
      <AcademyShell navigateTo={navigateTo} t={t} activeSection="tracks">
        <AcademyEmptyState title={t('Track not found.')} detail={t('Choose another Academy Track to continue.')} />
      </AcademyShell>
    );
  }

  const trackCompletion = buildTrackCompletionMap(publishedCourses, completion);
  const selectedCourse = visibleTrackCourses.find((course) => course.slug === selectedSlug) ?? visibleTrackCourses[0];
  const completedCount = visibleTrackCourses.filter((course) => getTrackCourseStatus(course, trackCompletion) === 'completed').length;
  const totalLessonCount = visibleTrackCourses.reduce((total, course) => total + getTrackCourseLessonCount(course), 0);
  const completedLessonCount = visibleTrackCourses.reduce((total, course) => {
    const coursePercent = getTrackCourseStatus(course, trackCompletion) === 'completed'
      ? 100
      : trackCourseProgress[course.slug] ?? 0;
    return total + Math.round((coursePercent / 100) * getTrackCourseLessonCount(course));
  }, 0);
  const progressPercent = totalLessonCount > 0 ? Math.round((completedLessonCount / totalLessonCount) * 100) : 0;
  const nextCourse = visibleTrackCourses.find((course) => getTrackCourseStatus(course, trackCompletion) !== 'completed') ?? visibleTrackCourses[0];
  const relatedTracks = academyTracks.filter((item) => item.slug !== track.slug);
  const trackComplete = completedCount === visibleTrackCourses.length;
  const courseReturnContext = {
    trackSlug: track.slug,
    specializationSlug: selectedSpecialization?.slug ?? null,
  };
  const returnSection = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('from');
  const academyBackPath = returnSection && ['core', 'skill', 'advanced', 'paths'].includes(returnSection)
    ? `/academy?section=${returnSection}`
    : '/academy';

  const selectCourse = (course: AcademyTrackCourse) => {
    setSelectedSlug(course.slug);
  };

  const scrollToCurriculum = () => {
    curriculumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const downloadTrackPdf = async () => {
    const exportElement = document.querySelector<HTMLElement>('.site-shell');
    if (pdfGenerating || !exportElement) return;

    setPdfGenerating(true);
    setPdfError(null);

    try {
      document.body.dataset.screenshotExport = 'academy-track';
      await exportElementScreenshotToSinglePagePdf(exportElement, 'plc-technician-track.pdf');
    } catch (error) {
      console.error('[academy] track pdf export error', error);
      setPdfError('Could not generate PDF. Please try again.');
    } finally {
      delete document.body.dataset.screenshotExport;
      setPdfGenerating(false);
    }
  };

  const viewTrackProgress = () => {
    if (trackComplete && trackCertificate) {
      navigateTo(`/academy/certificates?track=${track.slug}`);
      return;
    }

    const progressSlug = selectedSpecialization?.slug ?? track.slug;
    navigateTo(`/academy/progress?track=${progressSlug}#academy-track-${progressSlug}`);
  };

  return (
    <AcademyShell navigateTo={navigateTo} t={t} activeSection="tracks">
      <section className="academy-track-detail-page">
        <section className="academy-track-hero">
          <div className="academy-track-hero-copy">
            <button className="academy-back-button" type="button" onClick={() => navigateTo(academyBackPath)}>
              <ArrowLeft size={19} strokeWidth={3} />
              {t('Go Back')}
            </button>
            <p className="eyebrow">{t(track.categoryLabel ?? getTrackCardLabel(track))}</p>
            <h1>{t(track.title)}</h1>
            <p>{t(track.description)}</p>
            <div className="academy-track-chip-row">
              <span>{t(`${getTrackCourseCount(track)} courses`)}</span>
              <span>{t(track.level)}</span>
              <span>{t(track.certificateType)}</span>
              {track.specializations ? (
                <>
                  <span className="siemens">{t('Siemens path')}</span>
                  <span className="rockwell">{t('Rockwell path')}</span>
                  <span>{t('Capstone project')}</span>
                </>
              ) : (
                <span>{t(track.estimatedDuration)}</span>
              )}
            </div>
            <div className="academy-track-hero-actions">
              <button
                className={trackComplete && trackCertificate ? 'completed' : ''}
                type="button"
                onClick={() => {
                  if (trackComplete && trackCertificate) {
                    navigateTo(`/academy/certificates?track=${track.slug}`);
                    return;
                  }
                  navigateTo(getTrackCoursePath(visibleTrackCourses[0], courseReturnContext));
                }}
              >
                {trackComplete && trackCertificate ? t('Completed') : t('Start track')} <ArrowRight size={17} />
              </button>
              <button className="secondary" type="button" onClick={scrollToCurriculum}>
                {t('View curriculum')}
              </button>
              {track.slug === 'plc-technician' ? (
                <button className="secondary" type="button" disabled={pdfGenerating} onClick={downloadTrackPdf}>
                  <Download size={17} />
                  {pdfGenerating ? t('Generating...') : t('Download PDF')}
                </button>
              ) : null}
            </div>
            {pdfError ? <p className="academy-track-export-error" role="status">{t(pdfError)}</p> : null}
          </div>
          <div className="academy-track-hero-panel">
            <img className="academy-track-hero-badge" src={getTrackBadgeSrc(track.slug)} alt="" />
            {selectedSpecialization ? (
              <em
                className={[
                  'academy-track-hero-path-pill',
                  selectedSpecialization.slug.includes('siemens') ? 'siemens' : 'rockwell',
                ].join(' ')}
              >
                {t(`${selectedSpecialization.shortTitle} path`)}
              </em>
            ) : null}
            <span>Study Plan</span>
            <strong>{t(track.shortTitle)}</strong>
            <div className="academy-track-hero-steps">
              {visibleTrackCourses.map((course) => {
                const completed = getTrackCourseStatus(course, trackCompletion) === 'completed'
                  || (trackCourseProgress[course.slug] ?? 0) >= 100;
                const inProgress = !completed && (trackCourseProgress[course.slug] ?? 0) > 0;
                return (
                  <i
                    className={[
                      completed ? 'completed' : '',
                      inProgress ? 'in-progress' : '',
                      !completed && !inProgress ? 'not-started' : '',
                    ].filter(Boolean).join(' ')}
                    key={course.slug}
                    title={`${course.title}: ${completed ? 'Completed' : inProgress ? 'In progress' : 'Not started'}`}
                  >
                    {String(course.step).padStart(2, '0')}
                  </i>
                );
              })}
            </div>
            <button type="button" onClick={viewTrackProgress}>
              {trackComplete && trackCertificate ? t('View Certificate') : t('View progress')}
              <ArrowRight size={17} />
            </button>
          </div>
        </section>

        {track.specializations ? (
          <section className="academy-specialization-section" aria-label="PLC specialization selector">
            <div className="academy-specialization-heading">
              <p className="eyebrow">{t('Choose your PLC specialization')}</p>
              <h2>{t(selectedSpecialization?.title ?? 'Siemens / TIA Portal')}</h2>
              <span>{t(selectedSpecialization?.description ?? '')}</span>
            </div>
            <div className="academy-specialization-options" role="tablist" aria-label="PLC specialization paths">
              {track.specializations.map((specialization) => {
                const active = selectedSpecialization?.slug === specialization.slug;
                return (
                  <button
                    className={[
                      'academy-specialization-option',
                      active ? 'active' : '',
                      specialization.slug.includes('siemens') ? 'siemens' : 'rockwell',
                    ].filter(Boolean).join(' ')}
                    style={{ '--path-accent': specialization.accentColor } as React.CSSProperties}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    key={specialization.slug}
                    onClick={() => {
                      setSelectedSpecializationSlug(specialization.slug);
                      setSelectedSlug(getVisibleTrackCourses(track, specialization)[0]?.slug ?? '');
                    }}
                  >
                    <img src={specialization.logoSrc} alt="" aria-hidden="true" />
                    <span className="academy-specialization-logo-text" aria-hidden="true">
                      {specialization.shortTitle}
                    </span>
                    <strong>{t(specialization.title)}</strong>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="academy-curriculum-section" ref={curriculumRef}>
          <div className="academy-featured-heading academy-curriculum-heading">
            <p className="eyebrow">CURRICULUM MAP</p>
            <h2>{t('Explore the complete study plan')}</h2>
            <span>
              {t('Hover over each course to preview what you will learn, then open the course when you are ready to continue.')}
            </span>
          </div>

          {error ? <AcademyEmptyState title={t('Unable to load progress')} detail={error} /> : null}

          <div className="academy-curriculum-layout">
            <div
              className="academy-radial-map"
              aria-label={`${track.title} Curriculum Map`}
              onMouseLeave={() => setHoveredSlug(null)}
              onMouseMove={(event) => {
                const target = event.target as Element;
                if (!target.closest('.academy-study-segment')) {
                  setHoveredSlug(null);
                }
              }}
            >
              <div className="academy-radial-center" onMouseEnter={() => setHoveredSlug(null)}>
                <span>Track Map</span>
                <strong>{t(track.shortTitle)}</strong>
                <em>{progressPercent}% complete</em>
              </div>
              <svg className="academy-study-wheel" viewBox="0 0 640 640" role="img" aria-label={`${track.title} Study Plan`}>
                <circle className="academy-study-wheel-guide" cx="320" cy="320" r="279" />
                <circle className="academy-study-wheel-guide inner" cx="320" cy="320" r="114" />
                {visibleTrackCourses.map((course, index) => {
                  const slice = 360 / visibleTrackCourses.length;
                  const gap = 3;
                  const startAngle = index * slice + gap;
                  const endAngle = (index + 1) * slice - gap;
                  const midAngle = startAngle + (endAngle - startAngle) / 2;
                  const labelPoint = polarToCartesian(320, 320, 205, midAngle);
                  const hovered = hoveredSlug === course.slug;
                  const faded = Boolean(hoveredSlug && hoveredSlug !== course.slug);
                  const courseProgress = trackCourseProgress[course.slug] ?? 0;
                  const status = getTrackCourseStatus(course, trackCompletion) === 'completed' || courseProgress >= 100
                    ? 'completed'
                    : courseProgress > 0
                      ? 'in-progress'
                      : 'not-started';
                  return (
                    <g
                      className={[
                        'academy-study-segment',
                        hovered ? 'hovered' : '',
                        faded ? 'faded' : '',
                        status === 'completed' ? 'completed' : '',
                        status === 'in-progress' ? 'in-progress' : '',
                        status === 'not-started' ? 'not-started' : '',
                      ].filter(Boolean).join(' ')}
                      key={course.slug}
                      role="button"
                      tabIndex={0}
                      aria-label={`${course.step}. ${course.title}`}
                      onMouseEnter={() => {
                        setHoveredSlug(course.slug);
                        selectCourse(course);
                      }}
                      onFocus={() => {
                        setHoveredSlug(course.slug);
                        selectCourse(course);
                      }}
                      onBlur={() => setHoveredSlug(null)}
                      onClick={() => selectCourse(course)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectCourse(course);
                        }
                      }}
                    >
                      <path d={describeAnnularSegment(320, 320, 116, 278, startAngle, endAngle)} />
                      <foreignObject x={labelPoint.x - 72} y={labelPoint.y - 48} width="144" height="96">
                        <div className="academy-study-segment-label">
                          <span>{String(course.step).padStart(2, '0')}</span>
                          <strong>{t(course.shortTitle)}</strong>
                          <em>{getTrackStatusLabel(status, t)}</em>
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="academy-pdf-radial-map" aria-hidden="true">
              <div className="academy-pdf-radial-ring" />
              <div className="academy-pdf-radial-center">
                <span>Track Map</span>
                <strong>{t(track.shortTitle)}</strong>
                <em>{progressPercent}% complete</em>
              </div>
              {visibleTrackCourses.map((course, index) => {
                const angle = -90 + (360 / visibleTrackCourses.length) * index;
                const radians = (angle * Math.PI) / 180;
                const x = 50 + Math.cos(radians) * 38;
                const y = 50 + Math.sin(radians) * 38;
                const courseProgress = trackCourseProgress[course.slug] ?? 0;
                const status = getTrackCourseStatus(course, trackCompletion) === 'completed' || courseProgress >= 100
                  ? 'completed'
                  : courseProgress > 0
                    ? 'in-progress'
                    : 'not-started';
                return (
                  <div
                    className={[
                      'academy-pdf-radial-node',
                      status === 'completed' ? 'completed' : '',
                      status === 'in-progress' ? 'in-progress' : '',
                    ].filter(Boolean).join(' ')}
                    key={course.slug}
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <span>{String(course.step).padStart(2, '0')}</span>
                    <strong>{t(course.shortTitle)}</strong>
                    <em>{getTrackStatusLabel(status, t)}</em>
                  </div>
                );
              })}
            </div>

            <div className="academy-mobile-roadmap">
              {visibleTrackCourses.map((course) => {
                const status = getTrackCourseStatus(course, trackCompletion);
                const active = selectedCourse.slug === course.slug;
                return (
                  <article
                    className={active ? 'academy-mobile-track-step active' : 'academy-mobile-track-step'}
                    key={course.slug}
                    onClick={() => selectCourse(course)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectCourse(course);
                      }
                    }}
                    tabIndex={0}
                  >
                    <span>{String(course.step).padStart(2, '0')}</span>
                    <strong>{t(course.title)}</strong>
                    <p>{t(course.description)}</p>
                    <em>{t(course.level)} · {t(course.estimatedTime)} · {getTrackStatusLabel(status, t)}</em>
                    <button type="button" onClick={(event) => {
                      event.stopPropagation();
                      navigateTo(getTrackCoursePath(course, courseReturnContext));
                    }}>
                      {t('Open course')} <ArrowRight size={15} />
                    </button>
                  </article>
                );
              })}
            </div>

            <SelectedTrackCoursePanel
              course={selectedCourse}
              status={getTrackCourseStatus(selectedCourse, trackCompletion)}
              navigateTo={navigateTo}
              courseReturnContext={courseReturnContext}
              t={t}
            />
          </div>
        </section>

        <section className="academy-track-course-list-section">
          <div className="academy-featured-heading academy-curriculum-heading">
            <p className="eyebrow">{t('COURSE LIST')}</p>
            <h2>{t('Courses and lessons')}</h2>
            <span>
              {t('Each course is prepared for future lesson content, video, quizzes, completion tracking, and membership access rules.')}
            </span>
          </div>
          <div className="academy-track-course-list-grid">
            {visibleTrackCourses.map((course) => {
              const status = getTrackCourseStatus(course, trackCompletion);
              return (
                <article className="academy-track-course-list-card" key={course.slug}>
                  <div className="academy-track-course-list-top">
                    <span>{String(course.step).padStart(2, '0')}</span>
                    <em>{getTrackStatusLabel(status, t)}</em>
                  </div>
                  <h3>{t(course.title)}</h3>
                  <p>{t(course.description)}</p>
                  <ul>
                    {(course.lessons ?? []).map((lesson, index) => (
                      <li key={lesson.slug}>
                        <b>{String(index + 1).padStart(2, '0')}</b>
                        {t(lesson.title)}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => navigateTo(getTrackCoursePath(course, courseReturnContext))}>
                    {t('View course')} <ArrowRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="academy-track-progress-section">
          <div className="academy-track-progress-card">
            <div>
              <p className="eyebrow">TRACK PROGRESS</p>
              <h2>{t(selectedSpecialization?.progressLabel ?? 'Track progress')}</h2>
            </div>
            {loading ? <span className="academy-track-loading">{t('Loading progress...')}</span> : null}
            <div className="academy-track-progress-meter">
              <strong>{progressPercent}%</strong>
              <span><i style={{ width: `${progressPercent}%` }} /></span>
            </div>
            <div className="academy-track-progress-grid">
              <article>
                <span>{t('Completed courses')}</span>
                <strong>{completedCount} / {visibleTrackCourses.length}</strong>
              </article>
              <article>
                <span>{t('Next course')}</span>
                <strong>{t(nextCourse.title)}</strong>
              </article>
              <article>
                <span>{t('Certificate status')}</span>
                <strong>{completedCount === visibleTrackCourses.length ? t('Unlocked') : t('Locked')}</strong>
              </article>
            </div>
          </div>
          <div className="academy-certificate-track-card">
            <Award size={28} />
            <h2>{t('Earn your YVIMO Academy certificate')}</h2>
            <p>
              {t('Complete every course in this track to unlock your certificate and document your progress in industrial automation.')}
            </p>
            <button type="button" onClick={() => navigateTo(getTrackCoursePath(nextCourse, courseReturnContext))}>
              {t('Start learning')} <ArrowRight size={17} />
            </button>
          </div>
        </section>

        <section className="academy-related-tracks">
          <div className="academy-carousel-heading">
            <h2>{t('Related tracks')}</h2>
          </div>
          <div className="academy-related-track-grid">
            {relatedTracks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className="academy-related-track-card"
                  type="button"
                  key={item.slug}
                  onClick={() => navigateTo(`/academy/tracks/${item.slug}`)}
                >
                  <Icon size={20} />
                  <strong>{t(item.title)}</strong>
                  <span>{t(item.level)} · {t(`${getTrackCourseCount(item)} courses`)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </section>
    </AcademyShell>
  );
}

function SelectedTrackCoursePanel({
  course,
  status,
  navigateTo,
  courseReturnContext,
  t,
}: {
  course: AcademyTrackCourse;
  status: AcademyTrackCourse['status'];
  navigateTo: (path: string) => void;
  courseReturnContext: { trackSlug: string; specializationSlug?: string | null };
  t: AcademyTranslator;
}) {
  return (
    <aside className="academy-selected-course-panel">
      <span>{String(course.step).padStart(2, '0')}</span>
      <h2>{t(course.title)}</h2>
      <p>{t(course.description)}</p>
      <div className="academy-selected-course-facts">
        <article>
          <em>{t('Level')}</em>
          <strong>{t(course.level)}</strong>
        </article>
        <article>
          <em>{t('Estimated time')}</em>
          <strong>{t(course.estimatedTime)}</strong>
        </article>
        <article>
          <em>{t('Status')}</em>
          <strong>{getTrackStatusLabel(status, t)}</strong>
        </article>
      </div>
      <div className="academy-selected-skills">
        <strong>{t('Skills covered')}</strong>
        <ul>
          {course.skills.map((skill) => (
            <li key={skill}><CheckCircle2 size={15} /> {t(skill)}</li>
          ))}
        </ul>
      </div>
      {course.lessons && course.lessons.length > 0 ? (
        <div className="academy-selected-lessons">
          <strong>{t('Lessons')}</strong>
          <ol>
            {course.lessons.map((lesson) => (
              <li key={lesson.slug}>{t(lesson.title)}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <button type="button" onClick={() => navigateTo(getTrackCoursePath(course, courseReturnContext))}>
        {t('Open course')} <ArrowRight size={17} />
      </button>
    </aside>
  );
}

export function AcademyHomePage({ navigateTo, t = defaultT }: AcademyPageProps) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const section = new URLSearchParams(window.location.search).get('section');
    if (!section) return;

    const sectionTargets: Record<string, string> = {
      core: 'academy-core-tracks',
      skill: 'academy-skill-tracks',
      advanced: 'academy-advanced-tracks',
      paths: 'academy-learning-paths',
    };
    const targetId = sectionTargets[section];
    if (!targetId) return;

    window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (target) scrollToElementBelowHeader(target);
    }, 120);
  }, []);

  return (
    <AcademyShell navigateTo={navigateTo} t={t} activeSection="home">
      <section className="academy-home-hero">
        <div className="academy-hero-ecosystem" aria-hidden="true">
          {academyHeroTiles.map((tile, index) => (
            <span
              className={[
                'academy-hero-tile',
                tile.tileSize === 'wide' ? 'wide' : '',
              ].filter(Boolean).join(' ')}
              key={`${tile.label}-${index}`}
              style={{ '--tile-color': tile.color } as React.CSSProperties}
            >
              {tile.logoSrc || tile.logoSlug ? (
                <img
                  src={tile.logoSrc ?? `https://cdn.simpleicons.org/${tile.logoSlug}/${tile.color.replace('#', '')}`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                tile.label
              )}
            </span>
          ))}
        </div>
        <div className="academy-hero-copy">
          <p className="eyebrow">{t('YVIMO ACADEMY')}</p>
          <h1>{t('Industrial learning for connected manufacturing.')}</h1>
          <p>
            {t('Courses, guided paths, and professional training for people building real automation, robotics, CNC, and industrial software systems.')}
          </p>
        </div>
        <div className="academy-hero-actions">
          <button className="academy-view-all-button" type="button" onClick={() => document.getElementById('academy-learning-paths')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {t('Explore learning paths')} <ArrowRight size={17} />
          </button>
          <button className="academy-view-all-button secondary" type="button" onClick={() => navigateTo('/academy/courses')}>
            {t('Browse courses')}
          </button>
        </div>
      </section>

      <section className="academy-content academy-content-after-hero">
        <section className="academy-how-section" aria-labelledby="academy-how-title">
          <div className="academy-how-heading">
            <p className="eyebrow">{t('HOW YOU LEARN')}</p>
            <h2 id="academy-how-title">{t('A clear path from lesson to real industrial skill.')}</h2>
            <p>
              {t('YVIMO Academy turns industrial automation concepts into structured learning paths, practical exercises, and progress you can track.')}
            </p>
          </div>
          <div className="academy-how-flow" aria-label={t('How YVIMO Academy works')}>
            {academyHowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article className="academy-how-card" key={step.title}>
                  <span className="academy-how-port academy-how-port-in" />
                  <span className="academy-how-port academy-how-port-out" />
                  <div className="academy-how-card-header">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div className="academy-how-icon">
                      <Icon size={21} />
                    </div>
                  </div>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.description)}</p>
                </article>
              );
            })}
          </div>
          <div className="academy-how-result">
            <span>{t('RESULT')}</span>
            <strong>
              {t('A structured learning path that turns industrial knowledge into practical automation capability.')}
            </strong>
          </div>
        </section>
      </section>

      <section className="academy-learning-structure" id="academy-learning-paths">
        <div className="academy-tracks-heading">
          <p className="eyebrow">{t('LEARNING STRUCTURE')}</p>
          <h2>{t('Choose the path that matches your goal')}</h2>
          <p>
            {t('YVIMO Academy is organized into three types of learning paths: Core Tracks build complete technical roles, Skill Paths add focused technical capabilities, and Advanced Tracks combine multiple disciplines into complete automation systems.')}
          </p>
        </div>
        <div className="academy-structure-grid">
          {[
            {
              title: 'Core Tracks',
              imageSrc: '/assets/academy/paths/core-track.png',
              tone: 'core',
              description: 'Build a complete technical role from the ground up.',
              examples: ['PLC Technician', 'Robotics Technician', 'CNC Technician'],
            },
            {
              title: 'Skill Paths',
              imageSrc: '/assets/academy/paths/skill-path.png',
              tone: 'skill',
              description: 'Add focused technical capabilities that strengthen your main track or help you specialize in a specific technology area.',
              examples: ['Industrial Networks', 'Industrial Sensing', 'Machine Vision'],
            },
            {
              title: 'Advanced Tracks',
              imageSrc: '/assets/academy/paths/advanced-track.png',
              tone: 'advanced',
              description: 'Combine multiple disciplines into complete automation systems, integration projects, and commissioning workflows.',
              examples: ['Automation Systems Integrator', 'Virtual Commissioning Specialist'],
            },
          ].map((item) => (
            <article className={`academy-structure-card ${item.tone}`} key={item.title}>
              <span className="academy-structure-icon" aria-hidden="true">
                <img src={item.imageSrc} alt="" loading="lazy" />
              </span>
              <strong>{t(item.title)}</strong>
              <p>{t(item.description)}</p>
              <span className="academy-structure-pills">
                {item.examples.map((example) => (
                  <b key={example}>{t(example)}</b>
                ))}
              </span>
            </article>
          ))}
        </div>
      </section>

      <AcademyTrackCards
        navigateTo={navigateTo}
        t={t}
        tracks={academyCoreTracks}
        eyebrow="CORE TRACK"
        title="Core Tracks"
        description="Build a complete technical role from the ground up."
        returnSection="core"
      />

      <AcademyTrackCards
        navigateTo={navigateTo}
        t={t}
        tracks={academySkillPaths}
        eyebrow="SKILL PATH"
        title="Skill Paths"
        description="Add focused technical capabilities that strengthen your main track or help you specialize in a specific technology area."
        returnSection="skill"
      />

      <AcademyTrackCards
        navigateTo={navigateTo}
        t={t}
        tracks={academyAdvancedTracks}
        eyebrow="ADVANCED TRACK"
        title="Advanced Tracks"
        description="Combine multiple disciplines into complete automation systems, integration projects, and commissioning workflows."
        note="Recommended after completing a Core Track or having equivalent field experience."
        returnSection="advanced"
      />
    </AcademyShell>
  );
}

export function AcademyCatalogPage({ user, navigateTo, t = defaultT, languageCode = 'en' }: AcademyPageProps) {
  const [courses, setCourses] = React.useState<AcademyCourse[]>([]);
  const [completion, setCompletion] = React.useState<CourseCompletionMap>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    fetchPublishedCourses(languageCode)
      .then(async (items) => {
        const nextCompletion = await fetchCourseCompletionMap(user?.id ?? null, items);
        if (active) {
          setCourses(items);
          setCompletion(nextCompletion);
        }
      })
      .catch(() => {
        if (active) setError(getAcademyDatabaseErrorMessage());
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [languageCode, user]);

  const categories = getVisibleCategories(courses);

  return (
    <AcademyShell navigateTo={navigateTo} t={t} activeSection="courses">
      <section className="academy-catalog-page">
        <div className="academy-catalog-header academy-catalog-hero">
          <p className="eyebrow">{t('YVIMO ACADEMY COURSES')}</p>
          <h1>{t('Explore industrial automation courses')}</h1>
          <p>{t('Build practical skills through focused lessons, guided exercises, and real industrial automation scenarios.')}</p>
          <div className="academy-catalog-actions">
            <button className="academy-view-all-button" type="button" onClick={() => document.getElementById('academy-course-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {t('View all courses')} <ArrowRight size={17} />
            </button>
            <button className="academy-view-all-button secondary" type="button" onClick={() => navigateTo('/academy#academy-learning-paths')}>
              {t('Explore learning paths')} <ArrowRight size={17} />
            </button>
          </div>
        </div>

        {loading ? <AcademyEmptyState title={t('Loading courses...')} /> : null}
        {error ? <AcademyEmptyState title={t('Unable to load catalog')} detail={error} /> : null}

        {!loading && !error ? (
          <div className="academy-catalog-stack" id="academy-course-catalog">
            <section className="academy-featured-section academy-catalog-featured">
              <div className="academy-featured-heading">
                <p className="eyebrow">{t('FEATURED')}</p>
                <h2>{t('Featured courses')}</h2>
                <span>{t('Start with the courses we recommend first for each industrial learning area.')}</span>
              </div>
              <div className="academy-carousel-stack">
                {categories.slice(0, 4).map((category) => (
                  <AcademyCourseCarousel
                    key={category}
                    title={category}
                    courses={courses.filter((course) => getCourseCategory(course) === category)}
                    completion={completion}
                    navigateTo={navigateTo}
                    t={t}
                  />
                ))}
              </div>
            </section>
            {categories.map((category) => (
              <section className="academy-catalog-category" key={category}>
                <div className="academy-catalog-category-heading">
                  <h2>{t(category)}</h2>
                  <span>{formatCourseCount(courses.filter((course) => getCourseCategory(course) === category).length, t)}</span>
                </div>
                <div className="academy-catalog-grid">
                  {courses
                    .filter((course) => getCourseCategory(course) === category)
                    .map((course) => (
                      <button
                        className={completion[course.id] ? 'academy-catalog-course completed' : 'academy-catalog-course'}
                        type="button"
                        key={course.id}
                        onClick={() => navigateTo(`/academy/${course.slug}`)}
                      >
                        <span className="academy-catalog-course-icon">
                          <GraduationCap size={18} />
                        </span>
                        <span className="academy-catalog-course-copy">
                          <strong>{course.title}</strong>
                          <span>{course.subtitle ?? course.description ?? t('Course details coming soon.')}</span>
                        </span>
                        <span className="academy-catalog-course-meta">
                          {completion[course.id] ? <em className="completed">{t('Completed')}</em> : null}
                          {course.difficulty_level ? <em>{t(course.difficulty_level)}</em> : null}
                          <b>{formatPrice(course)}</b>
                        </span>
                      </button>
                    ))}
                </div>
              </section>
            ))}
            <section className="academy-full-catalog-cta">
              <div>
                <p className="eyebrow">{t('FULL CATALOG')}</p>
                <h2>{t('View full course catalog')}</h2>
                <span>{t('Browse every published YVIMO Academy course by category.')}</span>
              </div>
              <button className="academy-view-all-button" type="button" onClick={() => document.getElementById('academy-course-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {t('View full course catalog')} <ArrowRight size={17} />
              </button>
            </section>
          </div>
        ) : null}

        {!loading && !error && courses.length === 0 ? (
          <AcademyEmptyState title={t('No published courses yet.')} />
        ) : null}
      </section>
    </AcademyShell>
  );
}

function AcademyCourseCarousel({
  title,
  courses,
  completion,
  navigateTo,
  t = defaultT,
}: {
  title: string;
  courses: AcademyCourse[];
  completion: CourseCompletionMap;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const move = (direction: 'previous' | 'next') => {
    const track = trackRef.current;
    if (!track) return;

    const amount = Math.max(track.clientWidth * 0.82, 320);
    const target = direction === 'next'
      ? track.scrollLeft + amount
      : track.scrollLeft - amount;

    if (direction === 'next' && target >= track.scrollWidth - track.clientWidth - 12) {
      track.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }

    if (direction === 'previous' && target <= 0) {
      track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
      return;
    }

    track.scrollTo({ left: target, behavior: 'smooth' });
  };

  return (
    <section className="academy-carousel-section">
      <div className="academy-carousel-heading">
        <div>
          <p className="eyebrow">{t('Courses')}</p>
          <h2>{t(title)}</h2>
        </div>
        <div className="academy-carousel-actions">
          <button type="button" onClick={() => move('previous')} aria-label={`Previous ${title} courses`}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => move('next')} aria-label={`Next ${title} courses`}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="academy-course-rail" ref={trackRef}>
        {courses.map((course) => (
          <AcademyCourseCard
            course={course}
            completed={completion[course.id] ?? false}
            navigateTo={navigateTo}
            t={t}
            key={course.id}
          />
        ))}
      </div>
    </section>
  );
}

function AcademyCourseCard({
  course,
  completed,
  navigateTo,
  t = defaultT,
}: {
  course: AcademyCourse;
  completed?: boolean;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
}) {
  return (
    <article className={completed ? 'academy-course-card completed' : 'academy-course-card'}>
      <button
        className="academy-course-card-click"
        type="button"
        onClick={() => navigateTo(`/academy/${course.slug}`)}
      >
        <span className="academy-course-thumb">
          <img src={getCoursePreviewImage(course)} alt="" />
        </span>
        <span className="academy-course-card-body">
          <span className="academy-meta-row">
            {course.category ? <span>{t(course.category)}</span> : null}
            {course.difficulty_level ? <span>{t(course.difficulty_level)}</span> : null}
            {completed ? <span className="completed">{t('Completed')}</span> : null}
          </span>
          <strong>{course.title}</strong>
          {course.subtitle ? <span className="academy-course-summary">{course.subtitle}</span> : null}
          <span className="academy-card-footer">
            <em>{formatPrice(course)}</em>
            <span>
              {t('View course')} <ArrowRight size={16} />
            </span>
          </span>
        </span>
      </button>
    </article>
  );
}

export function AcademyCoursePage({ user, navigateTo, courseSlug, t = defaultT, languageCode = 'en', onUserProfileRefresh }: AcademyPageProps & { courseSlug: string }) {
  const [bundle, setBundle] = React.useState<AcademyCourseBundle | null>(null);
  const [enrollment, setEnrollment] = React.useState<AcademyEnrollment | null>(null);
  const [progress, setProgress] = React.useState<AcademyLessonProgress[]>([]);
  const [certificate, setCertificate] = React.useState<AcademyCertificate | null>(null);
  const [activities, setActivities] = React.useState<AcademyActivity[]>([]);
  const [activityAttempts, setActivityAttempts] = React.useState<AcademyActivityAttempt[]>([]);
  const [courseProgress, setCourseProgress] = React.useState(0);
  const [admin, setAdmin] = React.useState(false);
  const [canManageActivities, setCanManageActivities] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [editingActivity, setEditingActivity] = React.useState<{ lesson: AcademyLesson; activity: AcademyActivity | null } | null>(null);
  const [liveSessions, setLiveSessions] = React.useState<AcademyLesson[]>([]);
  const [canAccessLiveSessions, setCanAccessLiveSessions] = React.useState(false);
  const [canManageLiveSessions, setCanManageLiveSessions] = React.useState(false);
  const [editingLiveSession, setEditingLiveSession] = React.useState<AcademyLesson | null | undefined>(undefined);

  const loadCourse = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const nextBundle = await fetchCourseBundle(courseSlug, languageCode);
      setBundle(nextBundle);

      if (nextBundle && user) {
        const [nextEnrollment, nextProgress, nextSummary, nextAdmin, nextStaff, nextLiveAccess, nextLiveManager, nextCertificate, nextActivities] = await Promise.all([
          getEnrollmentStatus(user.id, nextBundle.course.id),
          fetchLessonProgressForCourse(user.id, nextBundle.course.id),
          getCourseProgressSummary(user.id, nextBundle.course.id),
          isAdminUser(user.id),
          canManageAcademyActivities(user.id),
          canAccessAcademyLiveSessions(user.id),
          canManageAcademyLiveSessions(user.id),
          fetchCertificateForCourse(user.id, nextBundle.course.id),
          fetchActivitiesForCourse(nextBundle.course.id),
        ]);
        const nextLiveSessions = nextLiveAccess
          ? await fetchLiveSessionsForCourse(nextBundle.course.id, nextLiveManager)
          : [];
        const nextActivityAttempts = await fetchActivityAttemptsForCourse(
          user.id,
          nextActivities.map((activityItem) => activityItem.id),
        );
        setEnrollment(nextEnrollment);
        setProgress(nextProgress);
        setActivities(nextActivities);
        setActivityAttempts(nextActivityAttempts);
        setCourseProgress(nextSummary?.course_progress_percent ?? 0);
        setAdmin(nextAdmin);
        setCanManageActivities(nextStaff);
        setCertificate(nextCertificate);
        setCanAccessLiveSessions(nextLiveAccess);
        setCanManageLiveSessions(nextLiveManager);
        setLiveSessions(nextLiveSessions);
      } else {
        setEnrollment(null);
        setProgress([]);
        setActivities(nextBundle ? await fetchActivitiesForCourse(nextBundle.course.id) : []);
        setActivityAttempts([]);
        setCertificate(null);
        setCourseProgress(0);
        setAdmin(false);
        setCanManageActivities(false);
        setCanAccessLiveSessions(false);
        setCanManageLiveSessions(false);
        setLiveSessions([]);
      }
    } catch (caught) {
      setMessage(getAcademyDatabaseErrorMessage());
    } finally {
      setLoading(false);
    }
  }, [courseSlug, languageCode, user]);

  React.useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  const activeEnrollment = isEnrollmentActive(enrollment);

  const handleEnroll = async () => {
    if (!bundle || !user) {
      navigateTo('/login');
      return;
    }

    try {
      await enrollInFreeCourse(user.id, bundle.course.id);
      await loadCourse();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to enroll.');
    }
  };

  const handleSaveActivity = async (input: {
    activity: AcademyActivity | null;
    lesson: AcademyLesson;
    type: AcademyActivityType;
    title: string;
    instructions: string;
    difficulty: string;
    pointsReward: number;
    isRequired: boolean;
    isPublished: boolean;
    configJson: AcademyActivityConfig;
  }) => {
    if (!bundle) return;
    const contentChanged = input.activity
      ? input.activity.type !== input.type
        || JSON.stringify(input.activity.config_json) !== JSON.stringify(input.configJson)
      : false;
    try {
      await saveAcademyActivity({
        id: input.activity?.id,
        courseId: bundle.course.id,
        lessonId: input.lesson.id,
        type: input.type,
        title: input.title,
        instructions: input.instructions,
        difficulty: input.difficulty,
        pointsReward: input.pointsReward,
        isRequired: input.isRequired,
        isPublished: input.isPublished,
        orderIndex: input.activity?.order_index ?? input.lesson.order_index,
        configJson: input.configJson,
      });
      setEditingActivity(null);
      await loadCourse();
      if (contentChanged) await onUserProfileRefresh?.();
    } catch (caught) {
      setMessage(getReadableErrorMessage(caught, 'Activity could not be saved.'));
    }
  };

  const handleDeleteActivity = async (activity: AcademyActivity) => {
    try {
      await deleteAcademyActivity(activity.id);
      await loadCourse();
    } catch (caught) {
      setMessage(getReadableErrorMessage(caught, 'Activity could not be deleted.'));
    }
  };

  const handleSaveLiveSession = async (input: {
    title: string;
    slug: string;
    description: string;
    videoProvider: AcademyLesson['video_provider'];
    videoId: string;
    videoUrl: string;
    durationSeconds: number | null;
    status: AcademyLessonStatus;
  }) => {
    if (!bundle) return;
    try {
      await saveAcademyLiveSession({
        id: editingLiveSession?.id,
        courseId: bundle.course.id,
        ...input,
        orderIndex: editingLiveSession?.order_index ?? liveSessions.length,
      });
      setEditingLiveSession(undefined);
      await loadCourse();
    } catch (caught) {
      const errorMessage = getReadableErrorMessage(caught, 'Live session could not be saved.');
      setMessage(errorMessage);
      throw caught instanceof Error ? caught : new Error(errorMessage);
    }
  };

  const handleDeleteLiveSession = async (session: AcademyLesson) => {
    if (!window.confirm(t(`Delete "${session.title}"?`))) return;
    try {
      await deleteAcademyLiveSession(session.id);
      await loadCourse();
    } catch (caught) {
      setMessage(getReadableErrorMessage(caught, 'Live session could not be deleted.'));
    }
  };

  if (loading) {
    return <AcademyShellState title={t('Loading course...')} navigateTo={navigateTo} t={t} />;
  }

  if (!bundle) {
    return <AcademyShellState title={t('Course not found.')} detail={message ?? undefined} navigateTo={navigateTo} t={t} />;
  }

  const allLessons = [
    ...bundle.modules.flatMap((module) => module.lessons),
    ...bundle.ungroupedLessons,
  ];
  const displayLessonIds = new Set(allLessons.map((lesson) => lesson.id));
  const displayProgress = progress.filter((item) => displayLessonIds.has(item.lesson_id));
  const courseCompleted = allLessons.length > 0 && displayProgress.filter((item) => item.completed).length === allLessons.length;
  const displayCourseProgress = allLessons.length > 0
    ? Math.round((displayProgress.filter((item) => item.completed).length / allLessons.length) * 100)
    : courseProgress;
  const progressButtonLabel = certificate
    ? 'View my certificate'
    : courseCompleted
      ? 'Get my certificate'
      : 'View progress route';
  const progressButtonTarget = certificate
    ? `/academy/certificates/${certificate.id}`
    : `/academy/progress?course=${bundle.course.slug}`;
  const returnContext = getCourseReturnContext();

  return (
    <AcademyShell navigateTo={navigateTo} t={t}>
      <section className="academy-course-hero">
        <div>
          <button className="academy-back-button" type="button" onClick={() => navigateTo(getCourseReturnPath(returnContext))}>
            <ArrowLeft size={19} strokeWidth={3} />
            {t('Go Back')}
          </button>
          <p className="eyebrow">{bundle.course.category ?? 'YVIMO Academy'}</p>
          <h1>{bundle.course.title}</h1>
          {bundle.course.subtitle ? <p>{bundle.course.subtitle}</p> : null}
          <div className="academy-meta-row">
            {bundle.course.difficulty_level ? <span>{bundle.course.difficulty_level}</span> : null}
            <span>{formatPrice(bundle.course)}</span>
            <span>{formatLessonCount(allLessons.length, t)}</span>
          </div>
        </div>
        <aside className="academy-enrollment-panel">
          <ShieldCheck size={24} />
          <strong>{admin ? t('Admin access') : activeEnrollment ? t('Enrolled') : t('Course access')}</strong>
          <span>
            {admin
              ? t('You can access all Academy content.')
              : activeEnrollment
                ? `${displayCourseProgress}% ${t('complete')}`
                : isFreeCourse(bundle.course)
                  ? t('Free course enrollment is available.')
                  : t('Enrollment required for protected lessons.')}
          </span>
          {user && activeEnrollment ? (
            <div className="academy-progress-bar" aria-label="Course progress">
              <span style={{ width: `${displayCourseProgress}%` }} />
            </div>
          ) : null}
          {user && activeEnrollment ? (
            <button
              className={courseCompleted || certificate ? 'academy-route-link-button certificate' : 'academy-route-link-button'}
              type="button"
              onClick={() => navigateTo(progressButtonTarget)}
            >
              {courseCompleted || certificate ? <Trophy size={17} /> : <Route size={17} />}
              {t(progressButtonLabel)}
            </button>
          ) : null}
          {!activeEnrollment && !admin ? (
            <button type="button" onClick={handleEnroll}>
              {user ? (isFreeCourse(bundle.course) ? t('Enroll free') : t('Request access')) : t('Sign in')}
            </button>
          ) : null}
        </aside>
      </section>

      {message ? <p className="academy-inline-message">{message}</p> : null}

      <section className="academy-course-layout">
        <div className="academy-course-description">
          <p className="eyebrow">{t('Overview')}</p>
          <p>{bundle.course.description ?? t('Course description coming soon.')}</p>
        </div>
        <div className="academy-module-stack">
          {bundle.modules.filter((module) => module.lessons.length > 0).map((module) => (
            <AcademyModuleBlock
              key={module.id}
              module={module}
              progress={displayProgress}
              activities={activities}
              activityAttempts={activityAttempts}
              canOpenProtected={activeEnrollment || admin}
              canManageActivities={canManageActivities}
              navigateTo={navigateTo}
              courseSlug={bundle.course.slug}
              onAddActivity={(lesson) => setEditingActivity({ lesson, activity: null })}
              onEditActivity={(lesson, activity) => setEditingActivity({ lesson, activity })}
              onDeleteActivity={handleDeleteActivity}
              t={t}
            />
          ))}
          {bundle.ungroupedLessons.length > 0 ? (
            <AcademyModuleBlock
              module={{
                id: 'ungrouped',
                course_id: bundle.course.id,
                title: 'Lessons',
                description: null,
                order_index: 999,
                created_at: '',
                updated_at: '',
                lessons: bundle.ungroupedLessons,
              }}
              progress={displayProgress}
              activities={activities}
              activityAttempts={activityAttempts}
              canOpenProtected={activeEnrollment || admin}
              canManageActivities={canManageActivities}
              navigateTo={navigateTo}
              courseSlug={bundle.course.slug}
              onAddActivity={(lesson) => setEditingActivity({ lesson, activity: null })}
              onEditActivity={(lesson, activity) => setEditingActivity({ lesson, activity })}
              onDeleteActivity={handleDeleteActivity}
              t={t}
            />
          ) : null}
        </div>
        {canAccessLiveSessions ? (
          <LiveSessionsBlock
            sessions={liveSessions}
            canManage={canManageLiveSessions}
            courseSlug={bundle.course.slug}
            navigateTo={navigateTo}
            onAdd={() => setEditingLiveSession(null)}
            onEdit={(session) => setEditingLiveSession(session)}
            onDelete={handleDeleteLiveSession}
            t={t}
          />
        ) : null}
      </section>
      {editingActivity ? (
        <ActivityEditor
          activity={editingActivity.activity}
          lesson={editingActivity.lesson}
          onCancel={() => setEditingActivity(null)}
          onSave={handleSaveActivity}
          t={t}
        />
      ) : null}
      {editingLiveSession !== undefined ? (
        <LiveSessionEditor
          session={editingLiveSession}
          onCancel={() => setEditingLiveSession(undefined)}
          onSave={handleSaveLiveSession}
          t={t}
        />
      ) : null}
    </AcademyShell>
  );
}

function LiveSessionsBlock({
  sessions, canManage, courseSlug, navigateTo, onAdd, onEdit, onDelete, t = defaultT,
}: {
  sessions: AcademyLesson[];
  canManage: boolean;
  courseSlug: string;
  navigateTo: (path: string) => void;
  onAdd: () => void;
  onEdit: (session: AcademyLesson) => void;
  onDelete: (session: AcademyLesson) => void;
  t?: AcademyTranslator;
}) {
  return (
    <article className="academy-module academy-live-sessions">
      <div className="academy-exclusive-label">
        <img src="/assets/academy/badges/license-enterprise.png" alt="" />
        <div>
          <strong>{t('Enterprise')}</strong>
          <span>{t('Rank Exclusive Access')}</span>
          <em>{t('Premium Academy benefit')}</em>
        </div>
      </div>
      <div className="academy-module-header">
        <Radar size={20} />
        <div>
          <h2>{t('Live Sessions Recordings')}</h2>
          <p>{t('Rewatch exclusive live classes, workshops, and mentor sessions.')}</p>
        </div>
        {canManage ? (
          <button className="academy-live-add" type="button" onClick={onAdd}>
            <Plus size={15} />{t('Add recording')}
          </button>
        ) : null}
      </div>
      <div className="academy-lesson-list">
        {sessions.map((session) => (
          <div className="academy-live-session-item" key={session.id}>
            <button
              className="academy-lesson-row"
              type="button"
              onClick={() => navigateTo(`/academy/${courseSlug}/live-sessions/${session.slug}`)}
            >
              <span className="academy-lesson-icon"><PlayCircle size={18} /></span>
              <span>
                <strong>{session.title}</strong>
                <em>{formatDuration(session.duration_seconds) || t('Recorded live session')}{session.status !== 'published' ? ` · ${t('Draft')}` : ''}</em>
              </span>
              <ArrowRight size={16} />
            </button>
            {canManage ? (
              <div className="academy-activity-staff-actions">
                <button type="button" onClick={() => onEdit(session)} title={t('Edit recording')}><Pencil size={15} /></button>
                <button type="button" onClick={() => onDelete(session)} title={t('Delete recording')}><Trash2 size={15} /></button>
              </div>
            ) : null}
          </div>
        ))}
        {sessions.length === 0 ? <p className="academy-live-empty">{t('No live session recordings have been published yet.')}</p> : null}
      </div>
    </article>
  );
}

function LiveSessionEditor({ session, onCancel, onSave, t = defaultT }: {
  session: AcademyLesson | null;
  onCancel: () => void;
  onSave: (input: {
    title: string; slug: string; description: string;
    videoProvider: AcademyLesson['video_provider']; videoId: string; videoUrl: string;
    durationSeconds: number | null; status: AcademyLessonStatus;
  }) => Promise<void>;
  t?: AcademyTranslator;
}) {
  const [title, setTitle] = React.useState(session?.title ?? '');
  const [description, setDescription] = React.useState(session?.description ?? '');
  const [videoProvider, setVideoProvider] = React.useState<AcademyLesson['video_provider']>(session?.video_provider ?? 'youtube');
  const [videoUrl, setVideoUrl] = React.useState(session?.video_url ?? '');
  const [status, setStatus] = React.useState<AcademyLessonStatus>(session?.status ?? 'published');
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const deriveVideoId = (provider: AcademyLesson['video_provider'], value: string) => {
    const trimmed = value.trim();
    if (!trimmed || provider === 'sharepoint') return null;
    try {
      const url = new URL(trimmed);
      if (provider === 'youtube') {
        if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? null;
        return url.searchParams.get('v') ?? url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] ?? null;
      }
      if (provider === 'vimeo') return url.pathname.split('/').filter(Boolean).pop() ?? null;
    } catch {
      if (provider === 'youtube' || provider === 'vimeo') return trimmed;
    }
    return null;
  };
  const generatedSlug = title
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const handleSave = async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    setSaveMessage({ tone: 'info', text: t('Saving recording...') });
    try {
      await onSave({
        title,
        slug: session?.slug ?? generatedSlug,
        description,
        videoProvider,
        videoId: deriveVideoId(videoProvider, videoUrl) ?? session?.video_id ?? '',
        videoUrl,
        durationSeconds: session?.duration_seconds ?? null,
        status,
      });
    } catch (caught) {
      setSaveMessage({
        tone: 'error',
        text: getReadableErrorMessage(caught, t('Live session could not be saved.')),
      });
      setSaveBusy(false);
    }
  };
  return (
    <div className="academy-editor-backdrop" role="presentation">
      <section className="academy-activity-editor academy-live-editor" role="dialog" aria-modal="true">
        <div className="academy-editor-heading">
          <div><p className="eyebrow">{t('Live session staff tools')}</p><h2>{t(session ? 'Edit recording' : 'Add recording')}</h2></div>
          <button type="button" onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="academy-editor-grid">
          <label className="academy-editor-wide">
            {t('Title')}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
            {generatedSlug ? <span className="academy-editor-help">{t('Recording URL')}: /live-sessions/{generatedSlug}</span> : null}
          </label>
          <label>{t('Video provider')}
            <select value={videoProvider ?? ''} onChange={(event) => setVideoProvider(event.target.value as AcademyLesson['video_provider'])}>
              <option value="youtube">YouTube</option><option value="vimeo">Vimeo</option>
              <option value="mux">Mux</option><option value="cloudflare_stream">Cloudflare Stream</option>
              <option value="sharepoint">SharePoint / OneDrive</option>
              <option value="local">Direct / local</option><option value="supabase">Supabase</option>
            </select>
          </label>
          <label>{t('Status')}<select value={status} onChange={(event) => setStatus(event.target.value as AcademyLessonStatus)}><option value="published">{t('Published')}</option><option value="draft">{t('Draft')}</option><option value="archived">{t('Archived')}</option></select></label>
          <label className="academy-editor-wide">
            {t(videoProvider === 'sharepoint' ? 'SharePoint embed code or Anyone link' : 'Video URL')}
            {videoProvider === 'sharepoint' ? (
              <>
                <textarea
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder={t('Paste the SharePoint iframe, embed.aspx URL, or Anyone can view link')}
                />
                <span className="academy-editor-help">{t('YVIMO detects the format automatically. Anyone links keep their anonymous access token.')}</span>
              </>
            ) : (
              <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} />
            )}
          </label>
          <label className="academy-editor-wide">{t('Description')}<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>
        {saveMessage ? (
          <div className={`academy-editor-message ${saveMessage.tone}`} role={saveMessage.tone === 'error' ? 'alert' : 'status'}>
            {saveMessage.tone === 'error' ? <AlertTriangle size={17} /> : <Clock3 size={17} />}
            <span>{saveMessage.text}</span>
          </div>
        ) : null}
        <div className="academy-editor-actions">
          <button type="button" onClick={onCancel} disabled={saveBusy}>{t('Cancel')}</button>
          <button
            type="button"
            disabled={saveBusy || !title.trim() || (!videoUrl.trim() && !session?.video_id)}
            onClick={() => void handleSave()}
          >
            {saveBusy ? <Clock3 size={16} /> : <Save size={16} />}
            {t(saveBusy ? 'Saving...' : 'Save recording')}
          </button>
        </div>
      </section>
    </div>
  );
}

function AcademyModuleBlock({
  module,
  progress,
  activities,
  activityAttempts,
  canOpenProtected,
  canManageActivities,
  navigateTo,
  courseSlug,
  onAddActivity,
  onEditActivity,
  onDeleteActivity,
  t = defaultT,
}: {
  module: AcademyModuleWithLessons;
  progress: AcademyLessonProgress[];
  activities: AcademyActivity[];
  activityAttempts: AcademyActivityAttempt[];
  canOpenProtected: boolean;
  canManageActivities: boolean;
  navigateTo: (path: string) => void;
  courseSlug: string;
  onAddActivity: (lesson: AcademyLesson) => void;
  onEditActivity: (lesson: AcademyLesson, activity: AcademyActivity) => void;
  onDeleteActivity: (activity: AcademyActivity) => void;
  t?: AcademyTranslator;
}) {
  return (
    <article className="academy-module">
      <div className="academy-module-header">
        <BookOpen size={20} />
        <div>
          <h2>{module.title}</h2>
          {module.description ? <p>{module.description}</p> : null}
        </div>
      </div>
      <div className="academy-lesson-list">
        {module.lessons.map((lesson) => {
          const lessonProgress = progress.find((item) => item.lesson_id === lesson.id);
          const progressState = getProgressState(lessonProgress);
          const locked = !lesson.is_preview && !canOpenProtected;
          const lessonActivities = activities.filter((activityItem) => activityItem.lesson_id === lesson.id);

          return (
            <div className="academy-linked-lesson-item" key={lesson.id}>
              <button
                className={[
                  'academy-lesson-row',
                  locked ? 'locked' : '',
                  progressState === 'completed' ? 'completed' : '',
                ].filter(Boolean).join(' ')}
                type="button"
                onClick={() => navigateTo(`/academy/${courseSlug}/lessons/${lesson.slug}`)}
              >
                <span className="academy-lesson-icon">
                  {locked ? (
                    <LockKeyhole size={18} />
                  ) : progressState === 'completed' ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <PlayCircle size={18} />
                  )}
                </span>
                <span>
                  <strong>{lesson.title}</strong>
                  <em>
                    {lesson.is_preview ? t('Preview') : locked ? t('Locked') : getProgressLabel(progressState, t)}
                    {formatDuration(lesson.duration_seconds) ? ` · ${formatDuration(lesson.duration_seconds)}` : ''}
                  </em>
                </span>
                {progressState === 'completed' ? <span className="academy-lesson-done">{t('Done')}</span> : <ArrowRight size={16} />}
              </button>
              {lessonActivities.length > 0 ? lessonActivities.map((activityItem) => (
                <ActivityCard
                  activity={activityItem}
                  attempt={activityAttempts.find((attempt) => attempt.activity_id === activityItem.id)}
                  locked={locked}
                  canManage={canManageActivities}
                  courseSlug={courseSlug}
                  navigateTo={navigateTo}
                  onEdit={() => onEditActivity(lesson, activityItem)}
                  onDelete={() => onDeleteActivity(activityItem)}
                  t={t}
                  key={activityItem.id}
                />
              )) : canManageActivities ? (
                <div className="academy-activity-empty">
                  <span>{t('No activity available yet')}</span>
                  <button type="button" onClick={() => onAddActivity(lesson)}>
                    <Plus size={15} />
                    {t('Add activity')}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ActivityStatusBadge({ status, t = defaultT }: { status: AcademyLessonProgressState; t?: AcademyTranslator }) {
  return (
    <span className={`academy-activity-status ${status}`}>
      {status === 'completed' ? <CheckCircle2 size={14} /> : status === 'in_progress' ? <Clock3 size={14} /> : <Activity size={14} />}
      {getProgressLabel(status, t)}
    </span>
  );
}

function PointsCelebration({ points, animate = false }: { points: number; animate?: boolean }) {
  const target = Math.max(Math.floor(points), 0);
  const [displayPoints, setDisplayPoints] = React.useState(animate ? 0 : target);

  React.useEffect(() => {
    if (!animate) {
      setDisplayPoints(target);
      return;
    }

    if (target <= 0) {
      setDisplayPoints(0);
      return;
    }

    setDisplayPoints(0);
    const duration = 950;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayPoints(Math.round(target * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, target]);

  return (
    <span className={animate ? 'academy-points-celebration is-animating' : 'academy-points-celebration'} aria-hidden="true">
      <Star size={15} fill="currentColor" />
      <strong>+ {displayPoints}</strong>
      <em>YVIMO Points</em>
    </span>
  );
}

function PointsRewardBadge({ points, t = defaultT }: { points: number; t?: AcademyTranslator }) {
  return (
    <span className="academy-points-reward">
      <Trophy size={14} />
      {points} {t('YVIMO Points')}
    </span>
  );
}

function MaxRewardBadge({ points, t = defaultT }: { points: number; t?: AcademyTranslator }) {
  return (
    <span className="academy-max-reward">
      <Trophy size={14} />
      {t('Max Reward')}: {points} {t('Points')}
    </span>
  );
}

function ActivityScoreBadge({ correct, total, large = false, t = defaultT }: { correct: number; total: number; large?: boolean; t?: AcademyTranslator }) {
  return (
    <span className={large ? 'academy-activity-score large' : 'academy-activity-score'}>
      <CheckCircle2 size={14} />
      {correct} / {total} {t(total === 1 ? 'question correct' : 'questions correct')}
    </span>
  );
}

function ActivityCard({
  activity,
  attempt,
  locked,
  canManage,
  courseSlug,
  navigateTo,
  onEdit,
  onDelete,
  t = defaultT,
}: {
  activity: AcademyActivity;
  attempt?: AcademyActivityAttempt;
  locked: boolean;
  canManage: boolean;
  courseSlug: string;
  navigateTo: (path: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  t?: AcademyTranslator;
}) {
  const status = getActivityStatus(attempt);
  const unpublished = !activity.is_published;
  const scoreSummary = getActivityAttemptScoreSummary(activity, attempt);
  return (
    <div className={['academy-activity-card', status === 'completed' ? 'completed' : '', locked ? 'locked' : '', unpublished ? 'draft' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => navigateTo(`/academy/${courseSlug}/activities/${activity.id}`)}
        disabled={locked && !canManage}
      >
        <span className="academy-activity-connector" aria-hidden="true">└</span>
        <span className="academy-lesson-icon">
          {locked ? <LockKeyhole size={18} /> : status === 'completed' ? <CheckCircle2 size={19} /> : <ClipboardCheck size={18} />}
        </span>
        <span className="academy-activity-copy">
          <strong>{activity.title}</strong>
          <em>
            {getActivityTypeLabel(activity.type)}
            {activity.difficulty ? ` · ${activity.difficulty}` : ''}
            {activity.is_required ? ` · ${t('Required')}` : ''}
            {unpublished ? ` · ${t('Draft')}` : ''}
          </em>
          <span>
            {status === 'completed' ? (
              <>
                <PointsCelebration points={attempt?.points_awarded ?? activity.points_reward} />
                {scoreSummary ? (
                  <ActivityScoreBadge
                    correct={scoreSummary.correctCount}
                    total={scoreSummary.totalQuestions}
                    t={t}
                  />
                ) : null}
                <ActivityStatusBadge status={status} t={t} />
              </>
            ) : (
              <>
                <ActivityStatusBadge status={status} t={t} />
                <MaxRewardBadge points={activity.points_reward} t={t} />
              </>
            )}
          </span>
        </span>
        <span className="academy-activity-action-label">
          {status === 'completed' ? t('Review') : status === 'in_progress' ? t('Continue') : t('Start')}
        </span>
      </button>
      {canManage ? (
        <div className="academy-activity-staff-actions">
          <button type="button" onClick={onEdit} title={t('Edit activity')}>
            <Pencil size={15} />
          </button>
          <button type="button" onClick={onDelete} title={t('Delete activity')}>
            <Trash2 size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ActivityEditor({
  activity,
  lesson,
  onCancel,
  onSave,
  t = defaultT,
}: {
  activity: AcademyActivity | null;
  lesson: AcademyLesson;
  onCancel: () => void;
  onSave: (input: {
    activity: AcademyActivity | null;
    lesson: AcademyLesson;
    type: AcademyActivityType;
    title: string;
    instructions: string;
    difficulty: string;
    pointsReward: number;
    isRequired: boolean;
    isPublished: boolean;
    configJson: AcademyActivityConfig;
  }) => void;
  t?: AcademyTranslator;
}) {
  const [type, setType] = React.useState<AcademyActivityType>(activity?.type ?? 'quick_check');
  const [title, setTitle] = React.useState(activity?.title ?? `Activity: ${lesson.title}`);
  const [instructions, setInstructions] = React.useState(activity?.instructions ?? '');
  const [difficulty, setDifficulty] = React.useState(activity?.difficulty ?? 'Beginner');
  const [pointsReward, setPointsReward] = React.useState(activity?.points_reward ?? 10);
  const [isRequired, setIsRequired] = React.useState(activity?.is_required ?? true);
  const [isPublished, setIsPublished] = React.useState(activity?.is_published ?? true);
  const [configText, setConfigText] = React.useState(JSON.stringify(activity?.config_json ?? getDefaultActivityConfig(type), null, 2));
  const [error, setError] = React.useState<string | null>(null);

  const changeType = (nextType: AcademyActivityType) => {
    setType(nextType);
    setConfigText(JSON.stringify(getDefaultActivityConfig(nextType), null, 2));
  };
  const difficultyOptions = [
    { value: 'Beginner', label: 'Easy', className: 'easy' },
    { value: 'Intermediate', label: 'Intermediate', className: 'medium' },
    { value: 'Advanced', label: 'Hard', className: 'hard' },
  ];

  const handleSave = () => {
    try {
      const parsed = JSON.parse(configText) as AcademyActivityConfig;
      onSave({
        activity,
        lesson,
        type,
        title,
        instructions,
        difficulty,
        pointsReward,
        isRequired,
        isPublished,
        configJson: parsed,
      });
    } catch {
      setError('Config JSON is not valid.');
    }
  };

  return (
    <div className="academy-editor-backdrop" role="presentation">
      <section className="academy-activity-editor" role="dialog" aria-modal="true" aria-label={t('Activity editor')}>
        <div className="academy-editor-heading">
          <div>
            <p className="eyebrow">{t('Staff activity tools')}</p>
            <h2>{activity ? t('Edit activity') : t('Add activity')}</h2>
            <span>{lesson.title}</span>
          </div>
          <button type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <div className="academy-editor-grid">
          <label>
            {t('Title')}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="academy-editor-field">
            {t('Type')}
            <div className="academy-segmented-control">
              {([
                ['quick_check', 'Quick Check'],
                ['industrial_scenario', 'Industrial Scenario'],
                ['simulation_task', 'Simulation Task'],
              ] as Array<[AcademyActivityType, string]>).map(([value, label]) => (
                <button
                  type="button"
                  className={type === value ? 'active' : ''}
                  onClick={() => changeType(value)}
                  key={value}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
          <div className="academy-editor-field">
            {t('Difficulty')}
            <div className="academy-segmented-control difficulty">
              {difficultyOptions.map((option) => (
                <button
                  type="button"
                  className={[difficulty === option.value ? 'active' : '', option.className].filter(Boolean).join(' ')}
                  onClick={() => setDifficulty(option.value)}
                  key={option.value}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
          <label>
            {t('Point reward')}
            <input type="number" min="0" value={pointsReward} onChange={(event) => setPointsReward(Number(event.target.value))} />
          </label>
          <label className="academy-editor-wide">
            {t('Instructions')}
            <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} />
          </label>
          <label className="academy-editor-check">
            <input type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} />
            {t('Required')}
          </label>
          <label className="academy-editor-check">
            <input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} />
            {t('Published')}
          </label>
        </div>
        {type === 'quick_check' ? <QuickCheckEditor configText={configText} setConfigText={setConfigText} t={t} /> : null}
        {type === 'industrial_scenario' ? <ScenarioEditor configText={configText} setConfigText={setConfigText} t={t} /> : null}
        {type === 'simulation_task' ? <SimulationEditor configText={configText} setConfigText={setConfigText} t={t} /> : null}
        {error ? <p className="academy-editor-error">{t(error)}</p> : null}
        <div className="academy-editor-actions">
          <button type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button type="button" onClick={handleSave}>
            <Save size={16} />
            {t('Save changes')}
          </button>
        </div>
      </section>
    </div>
  );
}

function QuickCheckEditor({ configText, setConfigText, t = defaultT }: { configText: string; setConfigText: (value: string) => void; t?: AcademyTranslator }) {
  const makeQuestion = React.useCallback((index: number): QuickCheckQuestion => ({
    id: `q${index + 1}`,
    type: 'multiple_choice',
    question: '',
    options: [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
      { id: 'c', text: '' },
    ],
    correctOptionId: 'a',
    explanation: '',
  }), []);

  const parseQuestions = React.useCallback(() => {
    try {
      const parsed = JSON.parse(configText) as QuickCheckConfig;
      return parsed.questions?.length ? parsed.questions : [makeQuestion(0)];
    } catch {
      return [makeQuestion(0)];
    }
  }, [configText, makeQuestion]);

  const [questions, setQuestions] = React.useState<QuickCheckQuestion[]>(parseQuestions);

  const commitQuestions = React.useCallback((nextQuestions: QuickCheckQuestion[]) => {
    const normalizedQuestions = nextQuestions.map((question, index) => ({
      ...question,
      id: `q${index + 1}`,
    }));
    setQuestions(normalizedQuestions);
    setConfigText(JSON.stringify({ questions: normalizedQuestions }, null, 2));
  }, [setConfigText]);

  const updateQuestion = (questionIndex: number, nextQuestion: QuickCheckQuestion) => {
    commitQuestions(questions.map((question, index) => index === questionIndex ? nextQuestion : question));
  };

  const setOptionCount = (questionIndex: number, count: number) => {
    const question = questions[questionIndex];
    const currentOptions = question.options ?? [];
    const nextOptions = Array.from({ length: count }, (_, index) => {
      const id = String.fromCharCode(97 + index);
      return currentOptions[index] ?? { id, text: '' };
    }).map((option, index) => ({ ...option, id: String.fromCharCode(97 + index) }));
    updateQuestion(questionIndex, {
      ...question,
      options: nextOptions,
      correctOptionId: nextOptions.some((option) => option.id === question.correctOptionId)
        ? question.correctOptionId
        : nextOptions[0]?.id,
    });
  };

  return (
    <section className="academy-quickcheck-editor">
      <div className="academy-quickcheck-heading">
        <span><ClipboardCheck size={15} />{t('Quick Check questions')}</span>
      </div>
      {questions.map((question, questionIndex) => (
        <article className="academy-question-builder" key={question.id}>
          <div className="academy-question-builder-top">
            <strong>
              <ClipboardCheck size={15} />
              {t('Question')} {String(questionIndex + 1).padStart(2, '0')}
            </strong>
            <div className="academy-question-builder-controls">
              <div className="academy-option-count">
                <span>{t('Options')}</span>
                {[2, 3, 4].map((count) => (
                  <button
                    type="button"
                    className={(question.options?.length ?? 0) === count ? 'active' : ''}
                    onClick={() => setOptionCount(questionIndex, count)}
                    key={count}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <button
                className="academy-delete-question-button"
                type="button"
                onClick={() => commitQuestions(questions.filter((_, index) => index !== questionIndex))}
                disabled={questions.length <= 1}
                title={t('Delete question')}
                aria-label={t(`Delete question ${questionIndex + 1}`)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <label>
            {t('Question text')}
            <textarea
              value={question.question}
              onChange={(event) => updateQuestion(questionIndex, { ...question, question: event.target.value })}
              placeholder={t('Write the question students will answer.')}
            />
          </label>
          <div className="academy-option-builder-grid">
            {(question.options ?? []).map((option, optionIndex) => (
              <label className={question.correctOptionId === option.id ? 'correct' : ''} key={option.id}>
                <span>
                  {t('Option')} {optionIndex + 1}
                  <button
                    type="button"
                    onClick={() => updateQuestion(questionIndex, { ...question, correctOptionId: option.id })}
                  >
                    {question.correctOptionId === option.id ? t('Correct answer') : t('Mark correct')}
                  </button>
                </span>
                <input
                  value={option.text}
                  onChange={(event) => {
                    const nextOptions = (question.options ?? []).map((current) => (
                      current.id === option.id ? { ...current, text: event.target.value } : current
                    ));
                    updateQuestion(questionIndex, { ...question, options: nextOptions });
                  }}
                  placeholder={t('Option text')}
                />
              </label>
            ))}
          </div>
          <label>
            {t('Explanation')}
            <textarea
              value={question.explanation ?? ''}
              onChange={(event) => updateQuestion(questionIndex, { ...question, explanation: event.target.value })}
              placeholder={t('Explain why the correct answer is correct.')}
            />
          </label>
        </article>
      ))}
      <button
        className="academy-add-question-tile"
        type="button"
        onClick={() => commitQuestions([...questions, makeQuestion(questions.length)])}
      >
        <Plus size={20} />
        {t('Add another question')}
      </button>
    </section>
  );
}

function ScenarioEditor({ configText, setConfigText, t = defaultT }: { configText: string; setConfigText: (value: string) => void; t?: AcademyTranslator }) {
  return (
    <label className="academy-config-editor">
      <span>{t('Scenario context/status tags/choices/explanation')}</span>
      <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
    </label>
  );
}

function SimulationEditor({ configText, setConfigText, t = defaultT }: { configText: string; setConfigText: (value: string) => void; t?: AcademyTranslator }) {
  return (
    <label className="academy-config-editor">
      <span>{t('Simulation configuration and success condition')}</span>
      <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
    </label>
  );
}

export function AcademyActivityPage({
  user,
  navigateTo,
  courseSlug,
  activityId,
  t = defaultT,
  languageCode = 'en',
  onUserProfileRefresh,
}: AcademyPageProps & { courseSlug: string; activityId: string }) {
  const [bundle, setBundle] = React.useState<AcademyCourseBundle | null>(null);
  const [activityItem, setActivityItem] = React.useState<AcademyActivity | null>(null);
  const [attempt, setAttempt] = React.useState<AcademyActivityAttempt | null>(null);
  const [activityAccess, setActivityAccess] = React.useState<LessonAccessResult | null>(null);
  const [canManage, setCanManage] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [pointsCelebration, setPointsCelebration] = React.useState(false);
  const [earnedPointsVisible, setEarnedPointsVisible] = React.useState(false);
  const [runnerRevision, setRunnerRevision] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const userId = user?.id ?? null;

  const loadActivity = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const nextBundle = await fetchCourseBundle(courseSlug, languageCode);
      const [nextActivity, nextStaff] = await Promise.all([
        fetchActivityById(activityId),
        canManageAcademyActivities(userId),
      ]);
      const nextAttempt = await fetchActivityAttempt(userId, activityId);
      const nextAccess = nextActivity
        ? await canAccessLesson({
          userId,
          courseId: nextActivity.course_id,
          lessonId: nextActivity.lesson_id,
        })
        : null;
      setBundle(nextBundle);
      setActivityItem(nextActivity);
      setAttempt(nextAttempt);
      setEarnedPointsVisible(nextAttempt?.status === 'completed');
      setActivityAccess(nextAccess);
      setCanManage(nextStaff);
    } catch (caught) {
      setMessage(getReadableErrorMessage(caught, getAcademyDatabaseErrorMessage()));
    } finally {
      setLoading(false);
    }
  }, [activityId, courseSlug, languageCode, userId]);

  React.useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const lesson = React.useMemo(() => {
    if (!bundle || !activityItem) return null;
    return [...bundle.modules.flatMap((module) => module.lessons), ...bundle.ungroupedLessons]
      .find((item) => item.id === activityItem.lesson_id) ?? null;
  }, [activityItem, bundle]);

  const handleComplete = async (score: number, attemptData: Record<string, unknown>) => {
    if (!user || !activityItem) {
      navigateTo('/login');
      return;
    }
    const wasAlreadyCompleted = attempt?.status === 'completed';
    const nextAttempt = await completeAcademyActivity({
      userId: user.id,
      activityId: activityItem.id,
      score,
      attemptData,
    });
    setAttempt(nextAttempt);
    if (!wasAlreadyCompleted && nextAttempt.status === 'completed') {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      const rewardTarget = document.querySelector('.academy-runner-footer, .academy-sim-complete-feedback');
      rewardTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      window.setTimeout(() => {
        setEarnedPointsVisible(true);
        setPointsCelebration(true);
        window.setTimeout(() => setPointsCelebration(false), 1300);
      }, rewardTarget ? 520 : 0);
    }
    await onUserProfileRefresh?.();
  };

  const handleSave = async (input: {
    activity: AcademyActivity | null;
    lesson: AcademyLesson;
    type: AcademyActivityType;
    title: string;
    instructions: string;
    difficulty: string;
    pointsReward: number;
    isRequired: boolean;
    isPublished: boolean;
    configJson: AcademyActivityConfig;
  }) => {
    if (!bundle || !activityItem) return;
    const contentChanged = activityItem.type !== input.type
      || JSON.stringify(activityItem.config_json) !== JSON.stringify(input.configJson);
    const saved = await saveAcademyActivity({
      id: activityItem.id,
      courseId: bundle.course.id,
      lessonId: input.lesson.id,
      type: input.type,
      title: input.title,
      instructions: input.instructions,
      difficulty: input.difficulty,
      pointsReward: input.pointsReward,
      isRequired: input.isRequired,
      isPublished: input.isPublished,
      orderIndex: activityItem.order_index,
      configJson: input.configJson,
    });
    setActivityItem(saved);
    if (contentChanged) {
      setAttempt(null);
      setEarnedPointsVisible(false);
      setPointsCelebration(false);
      setRunnerRevision((current) => current + 1);
      await onUserProfileRefresh?.();
    }
    setEditMode(false);
  };

  if (loading) {
    return <AcademyShellState title={t('Loading activity...')} navigateTo={navigateTo} t={t} />;
  }

  if (!bundle || !activityItem) {
    return <AcademyShellState title={t('Activity not found.')} detail={message ?? undefined} navigateTo={navigateTo} t={t} />;
  }

  const allowed = canManage || activityAccess?.allowed === true;
  const scoreSummary = getActivityAttemptScoreSummary(activityItem, attempt);

  return (
    <AcademyShell navigateTo={navigateTo} t={t}>
      <section className="academy-activity-screen">
        <div className="academy-lesson-toolbar">
          <button className="academy-back-button" type="button" onClick={() => navigateTo(`/academy/${bundle.course.slug}`)}>
            <ArrowLeft size={19} strokeWidth={3} />
            {t('Back to course')}
          </button>
          {canManage ? (
            <button className="academy-theater-button" type="button" onClick={() => setEditMode((current) => !current)}>
              <Settings2 size={18} />
              {editMode ? t('Preview as student') : t('Edit mode')}
            </button>
          ) : null}
        </div>
        <header className="academy-activity-header">
          <p className="eyebrow">{lesson ? lesson.title : bundle.course.title}</p>
          <h1>{activityItem.title}</h1>
          {activityItem.instructions ? <p>{activityItem.instructions}</p> : null}
          <div className="academy-activity-meta">
            <span>{getActivityTypeLabel(activityItem.type)}</span>
            {activityItem.difficulty ? <span>{activityItem.difficulty}</span> : null}
            <PointsRewardBadge points={activityItem.points_reward} t={t} />
            <span className="academy-activity-status-wrap">
              {earnedPointsVisible ? <PointsCelebration points={attempt?.points_awarded ?? activityItem.points_reward} animate={pointsCelebration} /> : null}
              {scoreSummary ? (
                <ActivityScoreBadge
                  correct={scoreSummary.correctCount}
                  total={scoreSummary.totalQuestions}
                  t={t}
                />
              ) : null}
              <ActivityStatusBadge status={getActivityStatus(attempt)} t={t} />
            </span>
          </div>
        </header>
        {!allowed ? (
          <section className="academy-locked-state">
            <LockKeyhole size={30} />
            <h2>{t('Activity locked')}</h2>
            <p>{t(activityAccess?.reason ?? 'Enroll in this course to access this activity.')}</p>
          </section>
        ) : null}
        {editMode && canManage && lesson ? (
          <ActivityEditor
            activity={activityItem}
            lesson={lesson}
            onCancel={() => setEditMode(false)}
            onSave={handleSave}
            t={t}
          />
        ) : null}
        {allowed ? (
          <ActivityRunner
            key={`${activityItem.id}-${activityItem.updated_at}-${attempt?.id ?? 'fresh'}-${runnerRevision}`}
            activity={activityItem}
            attempt={attempt}
            pointsCelebration={pointsCelebration}
            earnedPointsVisible={earnedPointsVisible}
            onComplete={handleComplete}
            t={t}
          />
        ) : null}
      </section>
    </AcademyShell>
  );
}

function ActivityRunner({
  activity,
  attempt,
  pointsCelebration,
  earnedPointsVisible,
  onComplete,
  t = defaultT,
}: {
  activity: AcademyActivity;
  attempt: AcademyActivityAttempt | null;
  pointsCelebration: boolean;
  earnedPointsVisible: boolean;
  onComplete: (score: number, attemptData: Record<string, unknown>) => Promise<void>;
  t?: AcademyTranslator;
}) {
  if (activity.type === 'industrial_scenario') {
    return <IndustrialScenarioRunner activity={activity} attempt={attempt} pointsCelebration={pointsCelebration} earnedPointsVisible={earnedPointsVisible} onComplete={onComplete} t={t} />;
  }
  if (activity.type === 'simulation_task') {
    return <SimulationTaskRunner activity={activity} attempt={attempt} pointsCelebration={pointsCelebration} earnedPointsVisible={earnedPointsVisible} onComplete={onComplete} t={t} />;
  }
  return <QuickCheckRunner activity={activity} attempt={attempt} pointsCelebration={pointsCelebration} earnedPointsVisible={earnedPointsVisible} onComplete={onComplete} t={t} />;
}

function QuickCheckRunner({ activity, attempt, pointsCelebration, earnedPointsVisible, onComplete, t = defaultT }: {
  activity: AcademyActivity;
  attempt: AcademyActivityAttempt | null;
  pointsCelebration: boolean;
  earnedPointsVisible: boolean;
  onComplete: (score: number, attemptData: Record<string, unknown>) => Promise<void>;
  t?: AcademyTranslator;
}) {
  const config = activity.config_json as QuickCheckConfig;
  const questions = config.questions ?? [];
  const savedAnswers = (attempt?.attempt_data_json?.answers ?? {}) as Record<string, string>;
  const [answers, setAnswers] = React.useState<Record<string, string>>(attempt?.status === 'completed' ? savedAnswers : {});
  const [checked, setChecked] = React.useState(attempt?.status === 'completed');
  const [busy, setBusy] = React.useState(false);
  const completed = attempt?.status === 'completed';
  const result = questions.map((question) => isQuickCheckAnswerCorrect(question, answers[question.id]));
  const answeredCount = questions.filter((question) => Boolean(answers[question.id])).length;
  const correctCount = result.filter(Boolean).length;
  const totalQuestions = questions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const submit = async () => {
    setChecked(true);
    if (!allAnswered || completed) return;
    setBusy(true);
    try {
      const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      await onComplete(score, {
        answers,
        correctCount,
        totalQuestions,
        type: activity.type,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="academy-runner-card">
      <div className="academy-question-stack">
        {questions.map((question, index) => (
          <article className="academy-question-card" key={question.id}>
            <strong>{index + 1}. {question.question}</strong>
            <QuickCheckQuestionControl
              question={question}
              value={answers[question.id] ?? ''}
              checked={checked}
              locked={completed}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
            {checked ? (
              <p className={isQuickCheckAnswerCorrect(question, answers[question.id]) ? 'academy-feedback good' : 'academy-feedback bad'}>
                {isQuickCheckAnswerCorrect(question, answers[question.id]) ? <CheckCircle2 size={18} /> : <X size={18} />}
                <span>
                  <strong>{isQuickCheckAnswerCorrect(question, answers[question.id]) ? t('Correct') : t('Incorrect')}</strong>
                  {question.explanation ? <em>{question.explanation}</em> : null}
                </span>
              </p>
            ) : null}
          </article>
        ))}
      </div>
      {checked && !allAnswered && !completed ? (
        <p className="academy-feedback bad">
          <X size={18} />
          <span>
            <strong>{t('Answer every question')}</strong>
            <em>{t('Complete all questions before checking your score.')}</em>
          </span>
        </p>
      ) : null}
      <RunnerFooter
        completed={completed}
        success={checked && allAnswered}
        busy={busy}
        pointsCelebration={pointsCelebration}
        earnedPointsVisible={earnedPointsVisible}
        pointsReward={attempt?.points_awarded ?? activity.points_reward}
        correctCount={attempt?.status === 'completed' ? Number(attempt.attempt_data_json?.correctCount ?? correctCount) : correctCount}
        totalQuestions={attempt?.status === 'completed' ? Number(attempt.attempt_data_json?.totalQuestions ?? totalQuestions) : totalQuestions}
        onSubmit={submit}
        t={t}
      />
    </section>
  );
}

function QuickCheckQuestionControl({
  question,
  value,
  checked,
  locked,
  onChange,
}: {
  question: QuickCheckQuestion;
  value: string;
  checked: boolean;
  locked: boolean;
  onChange: (value: string) => void;
}) {
  const getChoiceClassName = (choiceValue: string) => {
    const selected = value === choiceValue;
    if (!selected) return '';
    if (!checked) return 'selected';
    return isQuickCheckAnswerCorrect(question, value) ? 'selected correct' : 'selected incorrect';
  };

  if (question.type === 'true_false') {
    return (
      <div className="academy-choice-grid two">
        {['true', 'false'].map((item) => (
          <button type="button" className={getChoiceClassName(item)} onClick={() => onChange(item)} disabled={locked} key={item}>{item}</button>
        ))}
      </div>
    );
  }
  if (question.type === 'sequence_order') {
    return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="item1,item2,item3" disabled={locked} />;
  }
  if (question.type === 'matching') {
    return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="left=right,left=right" disabled={locked} />;
  }
  return (
    <div className="academy-choice-grid">
      {(question.options ?? []).map((option) => (
        <button type="button" className={getChoiceClassName(option.id)} onClick={() => onChange(option.id)} disabled={locked} key={option.id}>{option.text}</button>
      ))}
    </div>
  );
}

function isQuickCheckAnswerCorrect(question: QuickCheckQuestion, value?: string) {
  if (question.type === 'true_false') return value === String(question.correctValue);
  if (question.type === 'sequence_order') return value?.split(',').map((item) => item.trim()).join('|') === (question.correctOrder ?? []).join('|');
  if (question.type === 'matching') return Boolean(value?.trim());
  return value === question.correctOptionId;
}

function IndustrialScenarioRunner({ activity, attempt, pointsCelebration, earnedPointsVisible, onComplete, t = defaultT }: {
  activity: AcademyActivity;
  attempt: AcademyActivityAttempt | null;
  pointsCelebration: boolean;
  earnedPointsVisible: boolean;
  onComplete: (score: number, attemptData: Record<string, unknown>) => Promise<void>;
  t?: AcademyTranslator;
}) {
  const config = activity.config_json as IndustrialScenarioConfig;
  const savedChoice = typeof attempt?.attempt_data_json?.choice === 'string' ? attempt.attempt_data_json.choice : '';
  const [choice, setChoice] = React.useState(attempt?.status === 'completed' ? savedChoice : '');
  const [checked, setChecked] = React.useState(attempt?.status === 'completed');
  const completed = attempt?.status === 'completed';
  const correct = choice === config.correctChoiceId;

  const submit = async () => {
    setChecked(true);
    if (correct && !completed) await onComplete(100, { choice, type: activity.type });
  };

  return (
    <section className="academy-runner-card">
      <div className="academy-scenario-layout">
        <article>
          <p>{config.context}</p>
          {config.problemDescription ? <strong>{config.problemDescription}</strong> : null}
          {config.machineStatus ? <span className="academy-machine-status">{config.machineStatus}</span> : null}
        </article>
        <IOStatusPanel tags={config.statusTags ?? []} />
      </div>
      <h2>{config.question}</h2>
      <div className="academy-choice-grid">
        {(config.choices ?? []).map((option) => (
          <button
            type="button"
            className={[
              choice === option.id ? 'selected' : '',
              checked && choice === option.id ? (correct ? 'correct' : 'incorrect') : '',
            ].filter(Boolean).join(' ')}
            onClick={() => setChoice(option.id)}
            disabled={completed}
            key={option.id}
          >
            {option.text}
          </button>
        ))}
      </div>
      {checked ? (
        <p className={correct ? 'academy-feedback good' : 'academy-feedback bad'}>
          {correct ? <CheckCircle2 size={18} /> : <X size={18} />}
          <span>
            <strong>{correct ? t('Correct') : t('Incorrect')}</strong>
            <em>{config.explanation}</em>
          </span>
        </p>
      ) : null}
      <RunnerFooter completed={completed} success={checked && correct} busy={false} pointsCelebration={pointsCelebration} earnedPointsVisible={earnedPointsVisible} pointsReward={attempt?.points_awarded || activity.points_reward} onSubmit={submit} t={t} />
    </section>
  );
}

function IOStatusPanel({ tags }: { tags: Array<{ label: string; value: string }> }) {
  return (
    <div className="academy-io-panel">
      {tags.map((tag) => (
        <span key={`${tag.label}-${tag.value}`}>
          <strong>{tag.label}</strong>
          <em className={String(tag.value).toLowerCase() === 'on' || String(tag.value).toLowerCase() === 'true' ? 'on' : ''}>{tag.value}</em>
        </span>
      ))}
    </div>
  );
}

function SimulationTaskRunner({ activity, attempt, pointsCelebration, earnedPointsVisible, onComplete, t = defaultT }: {
  activity: AcademyActivity;
  attempt: AcademyActivityAttempt | null;
  pointsCelebration: boolean;
  earnedPointsVisible: boolean;
  onComplete: (score: number, attemptData: Record<string, unknown>) => Promise<void>;
  t?: AcademyTranslator;
}) {
  const config = activity.config_json as SimulationTaskConfig;
  const savedState = (
    attempt?.attempt_data_json?.state
    && typeof attempt.attempt_data_json.state === 'object'
    && !Array.isArray(attempt.attempt_data_json.state)
      ? attempt.attempt_data_json.state
      : null
  ) as Record<string, boolean> | null;
  const savedEvents = Array.isArray(attempt?.attempt_data_json?.events)
    ? attempt.attempt_data_json.events.filter((event): event is string => typeof event === 'string')
    : [];
  const [state, setState] = React.useState<Record<string, boolean>>(attempt?.status === 'completed' && savedState ? savedState : { ...(config.initialState ?? {}) });
  const [events, setEvents] = React.useState<string[]>(attempt?.status === 'completed' ? savedEvents : []);
  const [busy, setBusy] = React.useState(false);
  const completed = attempt?.status === 'completed';
  const success = (config.successCondition?.requiredEvents ?? []).every((event) => events.includes(event));

  React.useEffect(() => {
    if (!success || completed || busy) return;
    setBusy(true);
    onComplete(100, { state, events, type: activity.type })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, [activity.type, busy, completed, events, onComplete, state, success]);

  const recordEvent = (eventName: string) => setEvents((current) => current.includes(eventName) ? current : [...current, eventName]);
  const toggle = (key: string) => setState((current) => ({ ...current, [key]: !current[key] }));

  return (
    <section className="academy-runner-card">
      <div className="academy-sim-heading">
        <Activity size={22} />
        <div>
          <h2>{config.objective}</h2>
          <span>{getSimulationLabel(config.simulationType)}</span>
        </div>
      </div>
      <SimulationControlPanel
        simulationType={config.simulationType}
        state={state}
        setState={setState}
        recordEvent={recordEvent}
        toggle={toggle}
      />
      <IOStatusPanel tags={Object.entries(state).map(([label, value]) => ({ label, value: value ? 'ON' : 'OFF' }))} />
      {success || completed ? (
        <p className="academy-feedback good academy-sim-complete-feedback">
          {earnedPointsVisible ? <PointsCelebration points={attempt?.points_awarded || activity.points_reward} animate={pointsCelebration} /> : null}
          {t('Completed')}: {config.explanation}
        </p>
      ) : null}
    </section>
  );
}

function SimulationControlPanel({
  simulationType,
  state,
  setState,
  recordEvent,
  toggle,
}: {
  simulationType: SimulationTaskConfig['simulationType'];
  state: Record<string, boolean>;
  setState: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  recordEvent: (eventName: string) => void;
  toggle: (key: string) => void;
}) {
  if (simulationType === 'start_stop_latch') {
    return (
      <div className="academy-sim-controls">
        <button type="button" onClick={() => setState((current) => {
          recordEvent('motor_started');
          return { ...current, startButton: true, stopButton: false, motorRunning: current.estopOk !== false };
        })}>Start</button>
        <button type="button" onClick={() => setState((current) => {
          recordEvent('motor_stopped');
          return { ...current, stopButton: true, startButton: false, motorRunning: false };
        })}>Stop</button>
        <button type="button" onClick={() => toggle('estopOk')}>E-stop OK</button>
      </div>
    );
  }
  if (simulationType === 'alarm_reset') {
    return (
      <div className="academy-sim-controls">
        <button type="button" onClick={() => { toggle('alarmActive'); recordEvent('alarm_seen'); }}>Alarm</button>
        <button type="button" onClick={() => setState((current) => { recordEvent('alarm_reset'); return { ...current, alarmActive: false, resetPressed: true }; })}>Reset</button>
      </div>
    );
  }
  return (
    <div className="academy-sim-controls">
      {Object.keys(state).map((key) => (
        <button type="button" onClick={() => { toggle(key); recordEvent(`${key}_toggled`); }} key={key}>{key}</button>
      ))}
    </div>
  );
}

function getSimulationLabel(type: SimulationTaskConfig['simulationType']) {
  if (type === 'start_stop_latch') return 'Start/Stop motor latch';
  if (type === 'sensor_output') return 'Sensor and output interaction';
  if (type === 'alarm_reset') return 'Basic alarm reset';
  if (type === 'safety_ready') return 'Safety circuit ready/not-ready';
  return 'Conveyor sequence';
}

function RunnerFooter({ completed, success, busy, pointsCelebration, earnedPointsVisible, pointsReward, correctCount, totalQuestions, onSubmit, t = defaultT }: {
  completed: boolean;
  success: boolean;
  busy: boolean;
  pointsCelebration: boolean;
  earnedPointsVisible: boolean;
  pointsReward: number;
  correctCount?: number;
  totalQuestions?: number;
  onSubmit: () => void;
  t?: AcademyTranslator;
}) {
  return (
    <div className="academy-runner-footer">
      {completed ? (
        <span className="academy-runner-completed-wrap">
          {earnedPointsVisible ? <PointsCelebration points={pointsReward} animate={pointsCelebration} /> : null}
          {typeof correctCount === 'number' && typeof totalQuestions === 'number' ? (
            <ActivityScoreBadge correct={correctCount} total={totalQuestions} large t={t} />
          ) : null}
          <span className="academy-completed-box"><CheckCircle2 size={17} />{t('Completed')}</span>
        </span>
      ) : null}
      {success && !completed ? <span className="academy-feedback good">{t('Points awarded after completion.')}</span> : null}
      {!completed ? (
        <button className="academy-complete-button" type="button" onClick={onSubmit} disabled={busy}>
          <ClipboardCheck size={17} />
          {busy ? t('Checking...') : t('Check answer')}
        </button>
      ) : null}
    </div>
  );
}

export function AcademyLessonPage({
  user,
  navigateTo,
  courseSlug,
  lessonSlug,
  t = defaultT,
  languageCode = 'en',
  liveSession = false,
}: AcademyPageProps & { courseSlug: string; lessonSlug: string; liveSession?: boolean }) {
  const [bundle, setBundle] = React.useState<AcademyCourseBundle | null>(null);
  const [lesson, setLesson] = React.useState<AcademyLesson | null>(null);
  const [access, setAccess] = React.useState<LessonAccessResult | null>(null);
  const [lessonProgress, setLessonProgress] = React.useState<AcademyLessonProgress | null>(null);
  const [courseCertificate, setCourseCertificate] = React.useState<AcademyCertificate | null>(null);
  const [notes, setNotes] = React.useState('');
  const [notesStatus, setNotesStatus] = React.useState<string | null>(null);
  const [lessonResources, setLessonResources] = React.useState<AcademyLessonResource[]>([]);
  const [lessonSubmissions, setLessonSubmissions] = React.useState<AcademyLessonSubmission[]>([]);
  const [submissionFiles, setSubmissionFiles] = React.useState<File[]>([]);
  const [submissionStatus, setSubmissionStatus] = React.useState<string | null>(null);
  const [submissionBusy, setSubmissionBusy] = React.useState(false);
  const [resourceFile, setResourceFile] = React.useState<File | null>(null);
  const [resourceTitle, setResourceTitle] = React.useState('');
  const [resourceDescription, setResourceDescription] = React.useState('');
  const [resourceStatus, setResourceStatus] = React.useState<string | null>(null);
  const [resourceBusy, setResourceBusy] = React.useState(false);
  const [theaterMode, setTheaterMode] = React.useState(false);
  const [activeNoteFormats, setActiveNoteFormats] = React.useState({
    bold: false,
    italic: false,
    heading: false,
    bullet: false,
    numbered: false,
    quote: false,
  });
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [completeBusy, setCompleteBusy] = React.useState(false);
  const [retakeBusy, setRetakeBusy] = React.useState(false);
  const notesEditorRef = React.useRef<HTMLDivElement | null>(null);
  const hydratedNotesLessonRef = React.useRef<string | null>(null);
  const latestProgress = React.useRef(0);
  const completedOnce = React.useRef(false);
  const userId = user?.id ?? null;
  const canManageLessonResources = user?.subscription === 'Instructor' || user?.subscription === 'Owner';

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);

    async function loadLesson() {
      try {
        const nextBundle = await fetchCourseBundle(courseSlug, languageCode);
        if (!active) return;
        setBundle(nextBundle);

        if (!nextBundle) {
          setLesson(null);
          setAccess(null);
          return;
        }

        const admin = userId ? await isAdminUser(userId) : false;
        const nextLesson = admin || liveSession
          ? await fetchPlayableLessonBySlug(nextBundle.course.id, lessonSlug, languageCode)
          : await fetchLessonBySlug(nextBundle.course.id, lessonSlug, languageCode);
        if (!active) return;
        setLesson(nextLesson);

        if (nextLesson) {
          const nextAccess = await canAccessLesson({
            userId,
            courseId: nextBundle.course.id,
            lessonId: nextLesson.id,
          });
          if (!active) return;
          setAccess(nextAccess);

          if (nextAccess.allowed) {
            const [playableLesson, nextProgress, nextNote, nextCertificate, nextResources, nextSubmissions] = await Promise.all([
              fetchPlayableLessonBySlug(nextBundle.course.id, lessonSlug, languageCode),
              liveSession ? Promise.resolve(null) : fetchLessonProgressForLesson(userId, nextLesson.id),
              fetchLessonNote(userId, nextLesson.id),
              fetchCertificateForCourse(userId, nextBundle.course.id),
              fetchLessonResources(nextLesson.id),
              fetchLessonSubmissions(userId, nextLesson.id),
            ]);
            if (active && playableLesson) setLesson(playableLesson);
            if (active) {
              setLessonProgress(nextProgress);
              setCourseCertificate(nextCertificate);
              setLessonResources(nextResources);
              setLessonSubmissions(nextSubmissions);
              setNotes(sanitizeLessonNoteHtml(nextNote?.content ?? ''));
              latestProgress.current = nextProgress?.progress_seconds ?? 0;
              completedOnce.current = nextProgress?.completed ?? false;
            }
          } else if (active) {
            setLessonResources([]);
            setLessonSubmissions([]);
          }
        }
      } catch (caught) {
        if (active) setMessage(getAcademyDatabaseErrorMessage());
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadLesson();

    return () => {
      active = false;
    };
  }, [courseSlug, languageCode, lessonSlug, liveSession, userId]);

  const persistProgress = React.useCallback(
    async (progressSeconds: number, durationSeconds: number | null) => {
      if (!user || !bundle || !lesson || !access?.allowed) return;
      if (Math.abs(progressSeconds - latestProgress.current) < 8 && progressSeconds !== durationSeconds) return;

      latestProgress.current = progressSeconds;
      const nextProgress = await updateLessonProgress({
        userId: user.id,
        courseId: bundle.course.id,
        lessonId: lesson.id,
        progressSeconds,
        durationSeconds: durationSeconds ?? lesson.duration_seconds,
      });
      setLessonProgress(nextProgress);
      if (nextProgress.completed) completedOnce.current = true;
    },
    [access?.allowed, bundle, lesson, user],
  );

  const markComplete = React.useCallback(async () => {
    if (lessonProgress?.completed || completeBusy || !user || !bundle || !lesson) return;
    setCompleteBusy(true);
    completedOnce.current = true;
    const duration = lesson.duration_seconds ?? Math.max(latestProgress.current, 1);
    try {
      const nextProgress = await updateLessonProgress({
        userId: user.id,
        courseId: bundle.course.id,
        lessonId: lesson.id,
        progressSeconds: duration,
        durationSeconds: duration,
      });
      setLessonProgress(nextProgress);
    } finally {
      setCompleteBusy(false);
    }
  }, [bundle, completeBusy, lesson, lessonProgress?.completed, user]);

  const retakeLesson = React.useCallback(async () => {
    if (courseCertificate || retakeBusy || !user || !bundle || !lesson) return;
    setRetakeBusy(true);
    try {
      const nextProgress = await resetLessonProgress({
        userId: user.id,
        courseId: bundle.course.id,
        lessonId: lesson.id,
      });
      latestProgress.current = 0;
      completedOnce.current = false;
      setLessonProgress(nextProgress);
    } finally {
      setRetakeBusy(false);
    }
  }, [bundle, courseCertificate, lesson, retakeBusy, user]);

  React.useEffect(() => {
    const editor = notesEditorRef.current;
    if (!editor || !lesson) return;

    const lessonChanged = hydratedNotesLessonRef.current !== lesson.id;
    const editorIsFocused = document.activeElement === editor;
    const editorIsEmpty = (editor.textContent ?? '').trim().length === 0;

    if (lessonChanged || !editorIsFocused || (notes && editorIsEmpty)) {
      if (editor.innerHTML !== notes) editor.innerHTML = notes;
      hydratedNotesLessonRef.current = lesson.id;
    }
  }, [lesson?.id, notes]);

  const saveNotes = React.useCallback(async () => {
    if (!user || !bundle || !lesson) return;
    setNotesStatus('Saving...');
    try {
      await saveLessonNote({
        userId: user.id,
        courseId: bundle.course.id,
        lessonId: lesson.id,
        content: sanitizeLessonNoteHtml(notes),
      });
      setNotesStatus('Saved');
    } catch (caught) {
      setNotesStatus(caught instanceof Error ? caught.message : 'Unable to save notes.');
    }
  }, [bundle, lesson, notes, user]);

  const downloadLessonResource = React.useCallback(async (resource: AcademyLessonResource) => {
    try {
      const url = await getLessonResourceDownloadUrl(resource);
      if (!url) {
        setSubmissionStatus('Resource download is not configured yet.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setSubmissionStatus(caught instanceof Error ? caught.message : 'Resource could not be downloaded.');
    }
  }, []);

  const handleSubmissionFiles = React.useCallback((files: FileList | null) => {
    const nextFiles = Array.from(files ?? []);
    setSubmissionStatus(null);
    if (nextFiles.some((file) => file.size > lessonSubmissionMaxBytes)) {
      setSubmissionFiles([]);
      setSubmissionStatus(`Each submission file must be ${lessonSubmissionMaxSizeLabel} or smaller.`);
      return;
    }
    setSubmissionFiles(nextFiles);
  }, []);

  const removeSubmissionFile = React.useCallback((fileToRemove: File) => {
    setSubmissionFiles((current) => current.filter((file) => file !== fileToRemove));
    setSubmissionStatus(null);
  }, []);

  const handleResourceFile = React.useCallback((files: FileList | null) => {
    const file = files?.[0] ?? null;
    setResourceFile(file);
    setResourceStatus(null);
    if (file && !resourceTitle.trim()) {
      setResourceTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    }
  }, [resourceTitle]);

  const publishResource = React.useCallback(async () => {
    if (!bundle || !lesson || !resourceFile || resourceBusy) return;

    const title = resourceTitle.trim();
    if (!title) {
      setResourceStatus('Add a resource title before publishing.');
      return;
    }

    setResourceBusy(true);
    setResourceStatus('Publishing...');
    try {
      const nextResource = await publishLessonResource({
        courseId: bundle.course.id,
        lessonId: lesson.id,
        title,
        description: resourceDescription,
        file: resourceFile,
        orderIndex: lessonResources.length + 1,
      });
      setLessonResources((current) => [...current, nextResource].sort((a, b) => a.order_index - b.order_index));
      setResourceFile(null);
      setResourceTitle('');
      setResourceDescription('');
      setResourceStatus('Resource published');
    } catch (caught) {
      setResourceStatus(getReadableErrorMessage(caught, 'Resource could not be published.'));
    } finally {
      setResourceBusy(false);
    }
  }, [bundle, lesson, lessonResources.length, resourceBusy, resourceDescription, resourceFile, resourceTitle]);

  const submitAssignmentFiles = React.useCallback(async () => {
    if (!user || !bundle || !lesson || submissionFiles.length === 0 || submissionBusy) return;
    setSubmissionBusy(true);
    setSubmissionStatus('Uploading...');
    try {
      const uploaded: AcademyLessonSubmission[] = [];
      for (const file of submissionFiles) {
        const nextSubmission = await uploadLessonSubmission({
          userId: user.id,
          courseId: bundle.course.id,
          lessonId: lesson.id,
          file,
        });
        uploaded.push(nextSubmission);
      }
      setLessonSubmissions((current) => [...uploaded, ...current]);
      setSubmissionFiles([]);
      setSubmissionStatus('Submitted');
    } catch (caught) {
      const errorMessage = getReadableErrorMessage(caught, 'Assignment files could not be uploaded.');
      setSubmissionStatus(
        errorMessage.toLowerCase().includes('maximum allowed size') || errorMessage.toLowerCase().includes('maximum size exceeded') || errorMessage.includes('413')
          ? 'Supabase rejected this file before upload. Check Storage > Settings and set the Global file size limit to at least 250 MB, then keep the academy-lesson-submissions bucket at 250 MB.'
          : errorMessage,
      );
    } finally {
      setSubmissionBusy(false);
    }
  }, [bundle, lesson, submissionBusy, submissionFiles, user]);

  const syncNotesFromEditor = React.useCallback(() => {
    const editor = notesEditorRef.current;
    if (!editor) return;

    const plainText = editor.textContent ?? '';
    if (plainText.length > lessonNotesMaxLength) {
      editor.textContent = plainText.slice(0, lessonNotesMaxLength);
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    setNotes(sanitizeLessonNoteHtml(editor.innerHTML));
    setNotesStatus(null);
  }, []);

  const updateActiveNoteFormats = React.useCallback(() => {
    const editor = notesEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || !selection.anchorNode || !editor.contains(selection.anchorNode)) {
      return;
    }

    const commandFormats = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      heading: document.queryCommandValue('formatBlock')?.toString().toLowerCase() === 'h2',
      bullet: document.queryCommandState('insertUnorderedList'),
      numbered: document.queryCommandState('insertOrderedList'),
      quote: document.queryCommandValue('formatBlock')?.toString().toLowerCase() === 'blockquote',
    };
    if (selection.isCollapsed) {
      setActiveNoteFormats(commandFormats);
      return;
    }

    let node: Node | null = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentNode;
    const activeFormats = { ...commandFormats };

    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = (node as HTMLElement).tagName.toLowerCase();
        if (tagName === 'b' || tagName === 'strong') activeFormats.bold = true;
        if (tagName === 'i' || tagName === 'em') activeFormats.italic = true;
        if (tagName === 'h2') activeFormats.heading = true;
        if (tagName === 'ul') activeFormats.bullet = true;
        if (tagName === 'ol') activeFormats.numbered = true;
        if (tagName === 'blockquote') activeFormats.quote = true;
      }
      node = node.parentNode;
    }

    setActiveNoteFormats(activeFormats);
  }, []);

  const applyNotesFormat = React.useCallback((format: 'bold' | 'italic' | 'heading' | 'bullet' | 'numbered' | 'quote') => {
    const editor = notesEditorRef.current;
    if (!editor) return;

    editor.focus();
    const nextActiveFormats = { ...activeNoteFormats };
    if (format === 'bold') {
      document.execCommand('bold');
      nextActiveFormats.bold = !activeNoteFormats.bold;
    }
    if (format === 'italic') {
      document.execCommand('italic');
      nextActiveFormats.italic = !activeNoteFormats.italic;
    }
    if (format === 'heading') {
      document.execCommand('formatBlock', false, activeNoteFormats.heading ? 'p' : 'h2');
      nextActiveFormats.heading = !activeNoteFormats.heading;
      nextActiveFormats.quote = false;
    }
    if (format === 'bullet') {
      document.execCommand('insertUnorderedList');
      nextActiveFormats.bullet = !activeNoteFormats.bullet;
      if (nextActiveFormats.bullet) nextActiveFormats.numbered = false;
    }
    if (format === 'numbered') {
      document.execCommand('insertOrderedList');
      nextActiveFormats.numbered = !activeNoteFormats.numbered;
      if (nextActiveFormats.numbered) nextActiveFormats.bullet = false;
    }
    if (format === 'quote') {
      document.execCommand('formatBlock', false, activeNoteFormats.quote ? 'p' : 'blockquote');
      nextActiveFormats.quote = !activeNoteFormats.quote;
      nextActiveFormats.heading = false;
    }
    setActiveNoteFormats(nextActiveFormats);
    syncNotesFromEditor();
    window.setTimeout(updateActiveNoteFormats, 0);
  }, [activeNoteFormats, syncNotesFromEditor, updateActiveNoteFormats]);

  if (loading) {
    return <AcademyShellState title={t('Loading lesson...')} navigateTo={navigateTo} t={t} />;
  }

  if (!bundle || !lesson) {
    return <AcademyShellState title={t('Lesson not found.')} detail={message ?? undefined} navigateTo={navigateTo} t={t} />;
  }

  const allowed = access?.allowed ?? false;
  const completed = lessonProgress?.completed ?? false;
  const certificateIssued = Boolean(courseCertificate);
  const lessonPageClassName = [
    'academy-lesson-page',
    theaterMode ? 'theater' : '',
    liveSession ? 'live-session' : '',
  ].filter(Boolean).join(' ');
  const playerLayoutClassName = user ? 'academy-player-layout' : 'academy-player-layout no-notes';
  const notesCharacterCount = getLessonNotePlainText(notes).length;
  const notesToolbarItems = [
    { format: 'bold' as const, icon: Bold, label: 'Bold' },
    { format: 'italic' as const, icon: Italic, label: 'Italic' },
    { format: 'heading' as const, icon: Heading2, label: 'Heading' },
    { format: 'bullet' as const, icon: List, label: 'Bullet list' },
    { format: 'numbered' as const, icon: ListOrdered, label: 'Numbered list' },
    { format: 'quote' as const, icon: Quote, label: 'Quote' },
  ];

  return (
    <AcademyShell navigateTo={navigateTo} t={t} compact={theaterMode}>
    <div className={lessonPageClassName}>
      <section className="academy-lesson-header">
        <div className="academy-lesson-toolbar">
          <button
            className="academy-back-button"
            type="button"
            onClick={() => navigateTo(`/academy/${bundle.course.slug}`)}
          >
            <ArrowLeft size={19} strokeWidth={3} />
            {t('Go Back')}
          </button>
          {allowed ? (
            <button
              className={theaterMode ? 'academy-theater-button active' : 'academy-theater-button'}
              type="button"
              onClick={() => setTheaterMode((current) => !current)}
            >
              {theaterMode ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              {theaterMode ? t('Exit Theater') : t('Theater mode')}
            </button>
          ) : null}
        </div>
        <p className="eyebrow">{liveSession ? t('Enterprise live session recording') : access?.isPreview ? t('Preview lesson') : t('Lesson')}</p>
        <h1>{lesson.title}</h1>
        {lesson.description ? <p>{lesson.description}</p> : null}
      </section>

      {allowed ? (
        <>
        <section className={playerLayoutClassName}>
          <div className="academy-player-column">
            <VideoPlayer
              provider={lesson.video_provider}
              videoId={lesson.video_id}
              videoUrl={lesson.video_url}
              title={lesson.title}
              onProgress={liveSession ? undefined : (progressSeconds, durationSeconds) => {
                persistProgress(progressSeconds, durationSeconds).catch(() => undefined);
              }}
              onComplete={() => {
                if (!liveSession && !completedOnce.current) markComplete().catch(() => undefined);
              }}
            />
            {user && !liveSession ? (
              <div className="academy-lesson-actions">
                {completed ? (
                  <div className="academy-completed-box" role="status">
                    <CheckCircle2 size={18} />
                    {t('Completed')}
                  </div>
                ) : (
                  <button
                    className="academy-complete-button"
                    type="button"
                    onClick={() => markComplete()}
                    disabled={completeBusy}
                  >
                    <CheckCircle2 size={18} />
                    {completeBusy ? t('Marking...') : t('Mark complete')}
                  </button>
                )}
                {completed && !certificateIssued ? (
                  <button
                    className="academy-retake-button"
                    type="button"
                    onClick={() => retakeLesson()}
                    disabled={retakeBusy}
                  >
                    <RotateCcw size={18} />
                    {retakeBusy ? t('Resetting...') : t('Re-take lesson')}
                  </button>
                ) : null}
                {completed && certificateIssued ? (
                  <div className="academy-certificate-locked-progress" role="status">
                    <Trophy size={17} />
                    {t('Certificate issued')}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {user ? (
            <aside className="academy-notes-panel">
              <div>
                <StickyNote size={19} />
                <strong>{t('Lesson notes')}</strong>
              </div>
              <div className="academy-notes-toolbar" aria-label={t('Note formatting')}>
                {notesToolbarItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      className={activeNoteFormats[item.format] ? 'active' : ''}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyNotesFormat(item.format)}
                      title={t(item.label)}
                      aria-pressed={activeNoteFormats[item.format]}
                      key={item.format}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
              <div className="academy-notes-editor-wrap">
                {notesCharacterCount === 0 ? <span>{t('Write your notes for this lesson...')}</span> : null}
                <div
                  className="academy-notes-editor"
                  contentEditable
                  ref={notesEditorRef}
                  role="textbox"
                  aria-label={t('Lesson notes')}
                  aria-multiline="true"
                  suppressContentEditableWarning
                  onBeforeInput={(event) => {
                    const inputEvent = event.nativeEvent as InputEvent;
                    const selection = window.getSelection();
                    const selectedText = selection?.toString() ?? '';
                    if (
                      inputEvent.inputType?.startsWith('insert')
                      && notesCharacterCount >= lessonNotesMaxLength
                      && selectedText.length === 0
                    ) {
                      event.preventDefault();
                    }
                  }}
                  onInput={syncNotesFromEditor}
                  onKeyUp={updateActiveNoteFormats}
                  onMouseUp={updateActiveNoteFormats}
                  onFocus={updateActiveNoteFormats}
                  onPaste={(event) => {
                    event.preventDefault();
                    const text = event.clipboardData.getData('text/plain');
                    const remaining = lessonNotesMaxLength - notesCharacterCount;
                    document.execCommand('insertText', false, text.slice(0, Math.max(remaining, 0)));
                    syncNotesFromEditor();
                  }}
                />
              </div>
              <div className="academy-notes-footer">
                <span>{`${notesCharacterCount} / ${lessonNotesMaxLength} Characters`}</span>
                <button type="button" onClick={() => saveNotes()}>
                  <Save size={16} />
                  {t('Save')}
                </button>
              </div>
              {notesStatus ? <p className="academy-notes-status">{t(notesStatus)}</p> : null}
            </aside>
          ) : null}
        </section>
        <section className="academy-lesson-file-zone">
          <article className="academy-lesson-file-card">
            <div className="academy-lesson-file-heading">
              <span>
                <Download size={20} />
              </span>
              <div>
                <p className="eyebrow">{t('Lesson resources')}</p>
                <h2>{t('Resources for this lesson')}</h2>
              </div>
            </div>
            {lessonResources.length > 0 ? (
              <div className="academy-lesson-resource-list">
                {lessonResources.map((resource) => (
                  <button type="button" key={resource.id} onClick={() => downloadLessonResource(resource)}>
                    <FileText size={19} />
                    <span>
                      <strong>{resource.title}</strong>
                      <em>{resource.description ?? `${resource.file_name} · ${formatFileSize(resource.file_size)}`}</em>
                    </span>
                    <Download size={18} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="academy-lesson-file-empty">{t('No downloadable resources have been assigned to this lesson yet.')}</p>
            )}
            {canManageLessonResources ? (
              <div className="academy-resource-admin">
                <div>
                  <p className="eyebrow">{t('Staff tools')}</p>
                  <h3>{t('Add lesson resource')}</h3>
                </div>
                <label className="academy-resource-upload">
                  <input type="file" onChange={(event) => handleResourceFile(event.target.files)} />
                  <FileUp size={20} />
                  <span>{resourceFile ? resourceFile.name : t('Choose resource file')}</span>
                </label>
                <div className="academy-resource-admin-fields">
                  <input
                    type="text"
                    value={resourceTitle}
                    onChange={(event) => setResourceTitle(event.target.value)}
                    placeholder={t('Resource title')}
                  />
                  <textarea
                    value={resourceDescription}
                    onChange={(event) => setResourceDescription(event.target.value)}
                    placeholder={t('Short description')}
                  />
                </div>
                <div className="academy-submission-actions">
                  <button
                    className="academy-complete-button"
                    type="button"
                    onClick={() => publishResource()}
                    disabled={resourceBusy || !resourceFile}
                  >
                    <FileUp size={17} />
                    {resourceBusy ? t('Publishing...') : t('Publish resource')}
                  </button>
                  {resourceStatus ? <p>{t(resourceStatus)}</p> : null}
                </div>
              </div>
            ) : null}
          </article>

          {user ? (
            <article className="academy-lesson-file-card">
              <div className="academy-lesson-file-heading">
                <span>
                  <FileUp size={20} />
                </span>
                <div>
                  <p className="eyebrow">{t('Assignment submission')}</p>
                  <h2>{t('Upload your work')}</h2>
                </div>
              </div>
              <label className="academy-submission-dropzone">
                <input
                  type="file"
                  multiple
                  onChange={(event) => handleSubmissionFiles(event.target.files)}
                />
                <FileUp size={24} />
                <strong>{t('Choose assignment files')}</strong>
                <span>{t(`Upload PDFs, images, documents, PLC backups, or project files up to ${lessonSubmissionMaxSizeLabel} each.`)}</span>
              </label>
              {submissionFiles.length > 0 ? (
                <div className="academy-submission-staged-list">
                  {submissionFiles.map((file) => (
                    <span key={`${file.name}-${file.lastModified}`}>
                      <FileText size={16} />
                      <strong>{file.name}</strong>
                      <em>{formatFileSize(file.size)}</em>
                      <button
                        type="button"
                        onClick={() => removeSubmissionFile(file)}
                        aria-label={t(`Remove ${file.name}`)}
                      >
                        <X size={15} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="academy-submission-actions">
                <button
                  className="academy-complete-button"
                  type="button"
                  onClick={() => submitAssignmentFiles()}
                  disabled={submissionBusy || submissionFiles.length === 0}
                >
                  <FileUp size={17} />
                  {submissionBusy ? t('Uploading...') : t('Submit files')}
                </button>
                {submissionStatus ? <p>{t(submissionStatus)}</p> : null}
              </div>
              {lessonSubmissions.length > 0 ? (
                <div className="academy-submission-history">
                  <strong>{t('Submitted files')}</strong>
                  {lessonSubmissions.map((submission) => (
                    <span key={submission.id}>
                      <CheckCircle2 size={16} />
                      {submission.file_name}
                      <em>{formatFileSize(submission.file_size)}</em>
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ) : null}
        </section>
        </>
      ) : (
        <section className="academy-locked-state">
          <LockKeyhole size={30} />
          <h2>{t('Lesson locked')}</h2>
          <p>{t(access?.reason ?? 'Enroll in this course to access the lesson.')}</p>
          <div>
            <button type="button" onClick={() => (user ? navigateTo(`/academy/${bundle.course.slug}`) : navigateTo('/login'))}>
              {user ? t('View course access') : t('Sign in')}
            </button>
          </div>
        </section>
      )}
    </div>
    </AcademyShell>
  );
}

type ProgressCourse = {
  bundle: AcademyCourseBundle;
  progress: AcademyLessonProgress[];
  certificate: AcademyCertificate | null;
};

type ProgressTrack = {
  bundle: AcademyTrackBundle;
  summary: AcademyTrackProgressSummary | null;
  certificate: AcademyTrackCertificate | null;
  nextCourse: AcademyCourse | null;
  completedCourseIds: Set<string>;
  activeCourseIds: Set<string>;
  courseProgressPercent: Map<string, number>;
  displayTitle?: string;
  routeTrackSlug?: string;
  progressKey?: string;
};

type CertificatePackage = {
  track: AcademyTrack | undefined;
  specialization: AcademyTrackSpecialization | null;
  certificate: AcademyTrackCertificate;
  courseCertificates: AcademyCertificate[];
};

function getCertificatePackageId(certificate: AcademyTrackCertificate) {
  return certificate.specialization_slug ?? certificate.track_slug;
}

function buildCertificatePackage(
  trackCertificate: AcademyTrackCertificate,
  courseCertificates: AcademyCertificate[],
): CertificatePackage {
  const track = academyTracks.find((item) => item.slug === trackCertificate.track_slug);
  const specialization = getLocalTrackSpecialization(trackCertificate.track_slug, trackCertificate.specialization_slug);
  const trackCourses = track ? getVisibleTrackCourses(track, specialization) : [];
  const courseSlugs = new Set(trackCourses.map((course) => course.slug));

  return {
    track,
    specialization,
    certificate: trackCertificate,
    courseCertificates: courseCertificates.filter((certificate) => courseSlugs.has(certificate.course_slug)),
  };
}

function buildCertificatePackages(
  courseCertificates: AcademyCertificate[],
  trackCertificates: AcademyTrackCertificate[],
) {
  return trackCertificates.map((trackCertificate) => buildCertificatePackage(trackCertificate, courseCertificates));
}

function scrollToElementBelowHeader(target: HTMLElement) {
  const shell = target.closest('.site-shell') ?? document.documentElement;
  const headerHeight = parseFloat(getComputedStyle(shell).getPropertyValue('--header-height')) || 128;
  const targetTop = target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(targetTop - headerHeight - 24, 0),
    behavior: 'smooth',
  });
}

export function AcademyProgressPage({ user, navigateTo, t = defaultT, languageCode = 'en' }: AcademyPageProps) {
  const [items, setItems] = React.useState<ProgressCourse[]>([]);
  const [trackItems, setTrackItems] = React.useState<ProgressTrack[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const focusedCourseSlug = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('course');
  }, []);
  const focusedTrackSlug = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('track');
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);

    async function loadProgress() {
      try {
        if (!user) {
          setItems([]);
          setTrackItems([]);
          return;
        }

        const [courses, certificates] = await Promise.all([
          fetchPublishedCourses(languageCode),
          fetchCertificatesForUser(user.id),
        ]);
        const [loadedTrackBundles, trackSummaries, trackCertificates] = await Promise.all([
          fetchPublishedTrackBundles().catch(() => [] as AcademyTrackBundle[]),
          fetchTrackProgressSummaries(user.id).catch(() => [] as AcademyTrackProgressSummary[]),
          fetchTrackCertificatesForUser(user.id).catch(() => [] as AcademyTrackCertificate[]),
        ]);
        const certificateByCourse = new Map(certificates.map((certificate) => [certificate.course_id, certificate]));
        const summaryByTrack = new Map(trackSummaries.map((summary) => [summary.track_id, summary]));
        const certificateByTrack = new Map(
          trackCertificates.map((certificate) => [
            `${certificate.track_id}:${certificate.specialization_slug ?? ''}`,
            certificate,
          ]),
        );
        const nextItems = await Promise.all(
          courses.map(async (course) => {
            const bundle = await fetchCourseBundle(course.slug, languageCode);
            if (!bundle) return null;
            const progress = await fetchLessonProgressForCourse(user.id, course.id);
            return { bundle, progress, certificate: certificateByCourse.get(course.id) ?? null };
          }),
        );
        const trackBundles = mergeTrackBundlesWithLocalFallback(
          loadedTrackBundles,
          buildLocalTrackBundles(courses),
        );

        if (active) {
          const activeCourseIds = new Set<string>();
          const completedCourseIds = new Set<string>();
          certificates.forEach((certificate) => {
            activeCourseIds.add(certificate.course_id);
            completedCourseIds.add(certificate.course_id);
          });
          nextItems.forEach((item) => {
            if (item?.progress.length) activeCourseIds.add(item.bundle.course.id);
          });
          const courseProgressPercent = new Map<string, number>();
          nextItems.forEach((item) => {
            if (!item) return;
            const lessons = [
              ...item.bundle.modules.flatMap((module) => module.lessons),
              ...item.bundle.ungroupedLessons,
            ];
            const lessonIds = new Set(lessons.map((lesson) => lesson.id));
            const completedLessons = item.progress.filter((progress) => lessonIds.has(progress.lesson_id) && progress.completed).length;
            const percent = lessons.length > 0 ? Math.round((completedLessons / lessons.length) * 100) : 0;
            courseProgressPercent.set(item.bundle.course.id, percent);
          });
          certificates.forEach((certificate) => {
            courseProgressPercent.set(certificate.course_id, 100);
          });

          setTrackItems(
            trackBundles.flatMap((sourceBundle) => getPathTrackBundles(sourceBundle).flatMap((variant) => {
              const bundle = variant.bundle;
              const summary = variant.progressKey ? null : summaryByTrack.get(bundle.track.id) ?? null;
              const trackCertificate = certificateByTrack.get(`${bundle.track.id}:${variant.progressKey ?? ''}`) ?? null;
              if (trackCertificate) return [];
              const hasTrackActivity = bundle.trackCourses.some((link) => activeCourseIds.has(link.course_id))
                || Boolean(summary && summary.completed_courses > 0);
              if (!hasTrackActivity || bundle.trackCourses.length === 0) return [];

              const nextCourse = bundle.trackCourses.find((link) => !completedCourseIds.has(link.course_id))?.course
                ?? bundle.trackCourses[0]?.course
                ?? null;
              return [{
                bundle,
                summary,
                certificate: null,
                nextCourse,
                completedCourseIds,
                activeCourseIds,
                courseProgressPercent,
                displayTitle: variant.displayTitle,
                routeTrackSlug: variant.routeTrackSlug,
                progressKey: variant.progressKey,
              }];
            })),
          );
          setItems(
            nextItems.filter((item): item is ProgressCourse => {
              if (!item) return false;
              if (item.certificate) return false;
              return item.progress.length > 0;
            }),
          );
        }
      } catch {
        if (active) setMessage(getAcademyDatabaseErrorMessage());
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProgress();

    return () => {
      active = false;
    };
  }, [languageCode, user]);

  React.useEffect(() => {
    if (loading || !focusedCourseSlug || items.length === 0) return;

    const target = document.getElementById(`academy-route-${focusedCourseSlug}`);
    if (!target) return;

    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('focus-route');
      window.setTimeout(() => target.classList.remove('focus-route'), 1600);
    }, 120);
  }, [focusedCourseSlug, items.length, loading]);

  React.useEffect(() => {
    if (loading || !focusedTrackSlug || trackItems.length === 0) return;

    const target = document.getElementById(`academy-track-${focusedTrackSlug}`);
    if (!target) return;

    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('focus-route');
      window.setTimeout(() => target.classList.remove('focus-route'), 1600);
    }, 120);
  }, [focusedTrackSlug, loading, trackItems.length]);

  const handleTrackCertificateClaimed = (certificate: AcademyTrackCertificate) => {
    const packageId = getCertificatePackageId(certificate);
    navigateTo(`/academy/certificates?track=${packageId}`);
  };

  return (
    <AcademyShell navigateTo={navigateTo} activeSection="progress" t={t}>
      <section className="academy-progress-page">
        <div className="academy-progress-heading">
          <p className="eyebrow">{t('My progress')}</p>
          <h1>{t('Academy progress')}</h1>
          <p>{t('Track your Academy programs first, then continue individual course routes as you learn.')}</p>
        </div>

        {!user ? (
          <AcademyEmptyState title={t('Sign in to view your progress.')} detail={t('Your Academy routes are attached to your account.')} />
        ) : null}
        {loading ? <AcademyEmptyState title={t('Loading progress...')} /> : null}
        {message ? <AcademyEmptyState title={t('Unable to load progress')} detail={message} /> : null}
        {!loading && user && !message && items.length === 0 && trackItems.length === 0 ? (
          <AcademyEmptyState title={t('No progress yet.')} detail={t('Open a track or lesson to start lighting up your route.')} />
        ) : null}

        {!loading && user && !message && trackItems.length > 0 ? (
          <section className="academy-progress-tracks-section">
            <div className="academy-carousel-heading academy-progress-section-heading">
              <h2 className="academy-section-title-with-logo academy-section-title-featured">
                <img src="/assets/academy/academy-track-logo.png" alt="" />
                <span>{t('Academy Tracks')}</span>
              </h2>
            </div>
            <div className="academy-progress-track-grid">
              {trackItems.map((item) => (
                <AcademyProgressTrackCard
                  key={item.progressKey ?? item.bundle.track.id}
                  item={item}
                  user={user}
                  navigateTo={navigateTo}
                  onCertificateClaimed={handleTrackCertificateClaimed}
                  t={t}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && user && !message && items.length > 0 ? (
          <div className="academy-route-stack">
            <div className="academy-carousel-heading academy-progress-section-heading">
              <h2 className="academy-section-title-with-logo academy-section-title-featured">
                <img src="/assets/academy/academy-course-logo.png" alt="" />
                <span>{t('Active courses')}</span>
              </h2>
            </div>
            {items.map((item) => (
              <AcademyProgressRouteCard
                key={item.bundle.course.id}
                item={item}
                user={user}
                navigateTo={navigateTo}
                t={t}
              />
            ))}
          </div>
        ) : null}
      </section>
    </AcademyShell>
  );
}

function AcademyProgressRouteCard({
  item,
  user,
  navigateTo,
  t = defaultT,
}: {
  item: ProgressCourse;
  user: AcademyUser;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
}) {
  const lessons = [
    ...item.bundle.modules.flatMap((module) => module.lessons),
    ...item.bundle.ungroupedLessons,
  ];
  const progressByLesson = new Map(item.progress.map((progress) => [progress.lesson_id, progress]));
  const completedCount = lessons.filter((lesson) => progressByLesson.get(lesson.id)?.completed).length;
  const allCompleted = lessons.length > 0 && completedCount === lessons.length;
  const activeIndex = Math.min(
    lessons.findIndex((lesson) => !progressByLesson.get(lesson.id)?.completed),
    lessons.length - 1,
  );
  const currentIndex = activeIndex === -1 ? Math.max(lessons.length - 1, 0) : activeIndex;
  const [certificateBusy, setCertificateBusy] = React.useState(false);

  const handleCertificate = async () => {
    if (!allCompleted || certificateBusy) return;
    setCertificateBusy(true);
    try {
      const certificate = await createCertificateForCourse({
        userId: user.id,
        course: item.bundle.course,
        studentName: user.name,
        studentEmail: user.email,
        completedLessons: completedCount,
        totalLessons: lessons.length,
      });
      navigateTo(`/academy/certificates/${certificate.id}?new=1`);
    } finally {
      setCertificateBusy(false);
    }
  };

  return (
    <article
      className={allCompleted ? 'academy-route-card complete' : 'academy-route-card'}
      id={`academy-route-${item.bundle.course.slug}`}
    >
      <div className="academy-route-card-header">
        <div>
          <p className="eyebrow">{item.bundle.course.category ?? 'Academy route'}</p>
          <h2>{item.bundle.course.title}</h2>
          <span>{formatCompletedCount(completedCount, lessons.length, t)}</span>
        </div>
        <div className="academy-route-card-actions">
          <button type="button" onClick={() => navigateTo(`/academy/${item.bundle.course.slug}`)}>
            <Route size={17} />
            {t('Course')}
          </button>
          {allCompleted ? (
            <button
              className="certificate"
              type="button"
              onClick={handleCertificate}
              disabled={certificateBusy}
            >
              <Trophy size={17} />
              {certificateBusy ? t('Creating...') : t('View Certificate')}
            </button>
          ) : null}
        </div>
      </div>

      <AcademyRouteMap
        lessons={lessons}
        progress={item.progress}
        user={user}
        courseSlug={item.bundle.course.slug}
        navigateTo={navigateTo}
        complete={allCompleted}
        activeIndex={currentIndex}
      />
    </article>
  );
}

function AcademyProgressTrackCard({
  item,
  user,
  navigateTo,
  onCertificateClaimed,
  t = defaultT,
}: {
  item: ProgressTrack;
  user: AcademyUser;
  navigateTo: (path: string) => void;
  onCertificateClaimed: (certificate: AcademyTrackCertificate) => void;
  t?: AcademyTranslator;
}) {
  const totalCourses = item.summary && item.summary.total_courses > 0
    ? item.summary.total_courses
    : item.bundle.trackCourses.length;
  const completedCourses = item.certificate?.completed_courses
    ?? item.bundle.trackCourses.filter((link) => item.completedCourseIds.has(link.course_id)).length;
  const progressPercent = item.certificate ? 100 : Math.round((completedCourses / Math.max(totalCourses, 1)) * 100);
  const allCompleted = totalCourses > 0 && completedCourses >= totalCourses;
  const displayTitle = item.displayTitle ?? item.bundle.track.title;
  const routeTrackSlug = item.routeTrackSlug ?? item.bundle.track.slug;
  const progressId = item.progressKey ?? item.bundle.track.slug;
  const [certificateBusy, setCertificateBusy] = React.useState(false);

  const handleCertificate = async () => {
    if (!allCompleted || certificateBusy) return;
    setCertificateBusy(true);
    try {
      const certificate = await createCertificateForTrack({
        userId: user.id,
        track: item.bundle.track,
        specializationSlug: item.progressKey ?? null,
        specializationTitle: getLocalTrackSpecialization(item.bundle.track.slug, item.progressKey)?.title ?? null,
        certificateTrackTitle: displayTitle,
        studentName: user.name,
        studentEmail: user.email,
        completedCourses,
        totalCourses,
      });
      onCertificateClaimed(certificate);
    } finally {
      setCertificateBusy(false);
    }
  };

  return (
    <article
      className={allCompleted ? 'academy-progress-track-card complete' : 'academy-progress-track-card'}
      id={`academy-track-${progressId}`}
    >
      <div className="academy-progress-track-header">
        <div>
          <p className="eyebrow">{t('Academy Track')}</p>
          <h3>{displayTitle}</h3>
          <span>{completedCourses} {t('of')} {totalCourses} {t(totalCourses === 1 ? 'course' : 'courses')} {t('completed')}</span>
        </div>
        <strong>{progressPercent}%</strong>
      </div>
      <div className={allCompleted ? 'academy-progress-track-program complete' : 'academy-progress-track-program'}>
        <div className="academy-progress-track-emblem">
          <img src={getTrackBadgeSrc(item.bundle.track.slug)} alt="" />
          <span>{progressPercent}%</span>
        </div>
        <div
          className="academy-progress-track-wheel-mini"
          style={{ '--track-course-count': item.bundle.trackCourses.length } as React.CSSProperties}
          aria-label={`${displayTitle} course map`}
        >
          {item.bundle.trackCourses.map((link, index) => {
            const completed = Boolean(item.certificate) || item.completedCourseIds.has(link.course_id);
            const active = !completed && item.activeCourseIds.has(link.course_id);
            const coursePercent = completed ? 100 : item.courseProgressPercent.get(link.course_id) ?? 0;
            return (
              <button
                className={[
                  'academy-progress-track-segment',
                  completed ? 'completed' : '',
                  active ? 'active' : '',
                ].filter(Boolean).join(' ')}
                type="button"
                key={link.id}
                style={
                  {
                    '--segment-index': index,
                    '--segment-rotation': `${index * (360 / Math.max(item.bundle.trackCourses.length, 1))}deg`,
                  } as React.CSSProperties
                }
                onClick={() => navigateTo(`/academy/${link.course.slug}`)}
              >
                <span>{String(link.step).padStart(2, '0')}</span>
                <em className={completed ? 'done' : ''}>
                  {completed ? <CheckCircle2 size={40} /> : `${coursePercent}%`}
                </em>
                <strong>{link.course.title}</strong>
              </button>
            );
          })}
        </div>
      </div>
      <div className="academy-progress-track-actions">
        <button type="button" onClick={() => navigateTo(`/academy/tracks/${routeTrackSlug}`)}>
          <Route size={17} />
          {t('View track')}
        </button>
        {item.nextCourse ? (
          <button type="button" onClick={() => navigateTo(`/academy/${item.nextCourse?.slug}`)}>
            <PlayCircle size={17} />
            {t(allCompleted ? 'Review courses' : 'Next course')}
          </button>
        ) : null}
        {allCompleted ? (
          <button
            className="certificate"
            type="button"
            onClick={handleCertificate}
            disabled={certificateBusy}
          >
            <Trophy size={17} />
            {item.certificate ? t('Track certificate issued') : certificateBusy ? t('Creating...') : t('Claim track certificate')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AcademyRouteMap({
  lessons,
  progress,
  user,
  courseSlug,
  navigateTo,
  complete = false,
  activeIndex,
}: {
  lessons: AcademyLesson[];
  progress: AcademyLessonProgress[];
  user: AcademyUser | null;
  courseSlug: string;
  navigateTo?: (path: string) => void;
  complete?: boolean;
  activeIndex?: number;
}) {
  const progressByLesson = new Map(progress.map((item) => [item.lesson_id, item]));
  const completedCount = complete
    ? lessons.length
    : lessons.filter((lesson) => progressByLesson.get(lesson.id)?.completed).length;
  const routeRows = chunkLessons(lessons, 5);

  return (
    <div className={complete ? 'academy-route-map complete' : 'academy-route-map'}>
      {routeRows.map((row, rowIndex) => {
        const rowStart = rowIndex * 5;
        const rowEnd = rowStart + row.length - 1;
        const reverse = rowIndex % 2 === 1;
        const rowProgress = getRouteRowProgress(completedCount, rowStart, row.length);

        return (
          <div
            className="academy-route-row-wrap"
            key={row.map((lesson) => lesson.id).join('-')}
            style={{ '--row-items': row.length } as React.CSSProperties}
          >
            <div
              className={reverse ? 'academy-route-row reverse' : 'academy-route-row'}
              style={{ '--row-progress': `${rowProgress}%` } as React.CSSProperties}
            >
              <div className="academy-route-row-line" aria-hidden="true" />
              {row.map((lesson, rowLessonIndex) => {
                const index = rowStart + rowLessonIndex;
                const lessonCompleted = complete || progressByLesson.get(lesson.id)?.completed === true;
                const active = !complete && index === activeIndex;
                const ButtonTag = navigateTo ? 'button' : 'span';
                return (
                  <ButtonTag
                    className={[
                      'academy-route-node',
                      lessonCompleted ? 'completed' : '',
                      active ? 'active' : '',
                    ].filter(Boolean).join(' ')}
                    type={navigateTo ? 'button' : undefined}
                    key={lesson.id}
                    onClick={navigateTo ? () => navigateTo(`/academy/${courseSlug}/lessons/${lesson.slug}`) : undefined}
                  >
                    <span className="academy-route-dot">
                      {active ? (
                        user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <UserRound size={18} />
                      ) : lessonCompleted ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {active ? <MapPin className="academy-route-pointer" size={22} /> : null}
                    <strong>{lesson.title}</strong>
                  </ButtonTag>
                );
              })}
            </div>
            {rowIndex < routeRows.length - 1 ? (
              <div
                className={[
                  'academy-route-drop',
                  reverse ? 'left' : 'right',
                  completedCount > rowEnd ? 'completed' : '',
                ].filter(Boolean).join(' ')}
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function AcademyCertificatesPage({
  user,
  navigateTo,
  certificateId,
  t = defaultT,
  languageCode = 'en',
}: AcademyPageProps & { certificateId?: string }) {
  const [certificates, setCertificates] = React.useState<AcademyCertificate[]>([]);
  const [trackCertificates, setTrackCertificates] = React.useState<AcademyTrackCertificate[]>([]);
  const [detail, setDetail] = React.useState<{
    certificate: AcademyCertificate;
    bundle: AcademyCourseBundle;
    progress: AcademyLessonProgress[];
  } | null>(null);
  const [trackDetail, setTrackDetail] = React.useState<AcademyTrackCertificate | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const highlightNew = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('new') === '1';
  }, []);
  const focusedTrackSlug = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('track');
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);

    async function loadCertificates() {
      try {
        if (!user) {
          setCertificates([]);
          setTrackCertificates([]);
          setDetail(null);
          setTrackDetail(null);
          return;
        }

        if (certificateId) {
          const certificate = await fetchCertificateById(user.id, certificateId);
          if (!certificate) {
            const nextTrackCertificates = await fetchTrackCertificatesForUser(user.id).catch(() => [] as AcademyTrackCertificate[]);
            const nextTrackDetail = nextTrackCertificates.find((item) => item.id === certificateId) ?? null;
            if (active) {
              setTrackDetail(nextTrackDetail);
              setDetail(null);
              if (!nextTrackDetail) setMessage('Certificate not found.');
            }
            return;
          }

          const bundle = await fetchCourseBundle(certificate.course_slug, languageCode);
          if (!bundle) {
            setDetail(null);
            setTrackDetail(null);
            setMessage('Certificate course not found.');
            return;
          }

          const progress = await fetchLessonProgressForCourse(user.id, certificate.course_id);
          if (active) {
            setDetail({ certificate, bundle, progress });
            setTrackDetail(null);
          }
          return;
        }

        const [nextCertificates, nextTrackCertificates] = await Promise.all([
          fetchCertificatesForUser(user.id),
          fetchTrackCertificatesForUser(user.id).catch(() => [] as AcademyTrackCertificate[]),
        ]);
        if (active) {
          setCertificates(nextCertificates);
          setTrackCertificates(nextTrackCertificates);
          setTrackDetail(null);
        }
      } catch (caught) {
        if (active) setMessage(caught instanceof Error ? caught.message : 'Unable to load certificates.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCertificates();

    return () => {
      active = false;
    };
  }, [certificateId, languageCode, user]);

  React.useEffect(() => {
    if (!highlightNew || loading || (!detail && !trackDetail)) return;
    const target = document.querySelector('.academy-certificate-detail');
    if (!target) return;
    target.classList.add('focus-certificate');
    window.setTimeout(() => target.classList.remove('focus-certificate'), 1800);
  }, [detail, highlightNew, loading, trackDetail]);

  React.useEffect(() => {
    if (loading || !focusedTrackSlug || trackCertificates.length === 0) return;
    const target = document.getElementById(`academy-certificate-pack-${focusedTrackSlug}`);
    if (!target) return;

    window.setTimeout(() => {
      scrollToElementBelowHeader(target);
      target.classList.add('focus-certificate');
      window.setTimeout(() => target.classList.remove('focus-certificate'), 1800);
    }, 120);
  }, [focusedTrackSlug, loading, trackCertificates.length]);

  const certificatePackages = React.useMemo(() => {
    return trackCertificates.map((trackCertificate) => {
      const track = academyTracks.find((item) => item.slug === trackCertificate.track_slug);
      const specialization = getLocalTrackSpecialization(trackCertificate.track_slug, trackCertificate.specialization_slug);
      const trackCourses = track ? getVisibleTrackCourses(track, specialization) : [];
      const courseSlugs = new Set(trackCourses.map((course) => course.slug));
      return {
        track,
        specialization,
        certificate: trackCertificate,
        courseCertificates: certificates.filter((certificate) => courseSlugs.has(certificate.course_slug)),
      };
    });
  }, [certificates, trackCertificates]);

  const packagedCourseIds = React.useMemo(
    () => new Set(certificatePackages.flatMap((item) => item.courseCertificates.map((certificate) => certificate.id))),
    [certificatePackages],
  );
  const standaloneCertificates = certificates.filter((certificate) => !packagedCourseIds.has(certificate.id));

  if (certificateId) {
    return (
      <AcademyShell navigateTo={navigateTo} activeSection="certificates" t={t}>
        <section className="academy-certificates-page">
          <button className="academy-back-button" type="button" onClick={() => navigateTo('/academy/certificates')}>
            <ArrowLeft size={19} strokeWidth={3} />
            {t('Go Back')}
          </button>
          {loading ? <AcademyEmptyState title={t('Loading certificate...')} /> : null}
          {message ? <AcademyEmptyState title={t('Unable to load certificate')} detail={message} /> : null}
          {!loading && trackDetail ? (
            <AcademyTrackCertificateDetail
              certificate={trackDetail}
              navigateTo={navigateTo}
              t={t}
            />
          ) : null}
          {!loading && detail ? (
            <AcademyCertificateDetail
              detail={detail}
              user={user}
              navigateTo={navigateTo}
              t={t}
            />
          ) : null}
        </section>
      </AcademyShell>
    );
  }

  return (
    <AcademyShell navigateTo={navigateTo} activeSection="certificates" t={t}>
      <section className="academy-certificates-page">
        <div className="academy-progress-heading">
          <p className="eyebrow">{t('My certificates')}</p>
          <h1>{t('Completion inventory')}</h1>
          <p>{t('Your completed Academy courses and issued certificates stay here.')}</p>
        </div>

        {!user ? (
          <AcademyEmptyState title={t('Sign in to view your certificates.')} detail={t('Certificates are attached to your Academy account.')} />
        ) : null}
        {loading ? <AcademyEmptyState title={t('Loading certificates...')} /> : null}
        {message ? <AcademyEmptyState title={t('Unable to load certificates')} detail={message} /> : null}
        {!loading && user && !message && certificates.length === 0 && trackCertificates.length === 0 ? (
          <AcademyEmptyState title={t('No certificates yet.')} detail={t('Complete a course and claim its certificate to add it here.')} />
        ) : null}

        {!loading && user && !message && (certificates.length > 0 || trackCertificates.length > 0) ? (
          <div className="academy-certificate-inventory">
            {certificatePackages.map((item) => (
              <section
                className="academy-certificate-pack"
                id={`academy-certificate-pack-${item.certificate.specialization_slug ?? item.certificate.track_slug}`}
                key={item.certificate.id}
              >
                <div className="academy-certificate-pack-top">
                  <img src={getTrackBadgeSrc(item.certificate.track_slug)} alt="" />
                  <div>
                    <p className="eyebrow">{t('Track certificate package')}</p>
                    <h2>{item.certificate.track_title}</h2>
                    <span>
                      {item.courseCertificates.length} {t(item.courseCertificates.length === 1 ? 'course certificate' : 'course certificates')} + {t('Academy Track Certificate')}
                    </span>
                  </div>
                </div>
                <button
                  className="academy-certificate-card academy-certificate-card-track"
                  type="button"
                  onClick={() => navigateTo(`/academy/tracks/${item.certificate.track_slug}`)}
                >
                  <span className="academy-certificate-track-main">
                    <span className="academy-certificate-medal">
                      <Award size={30} />
                    </span>
                    <span>
                      <em>{t('Academy Track Certificate')}</em>
                      <strong>{item.certificate.track_title}</strong>
                      <small>{t('Issued')} {formatCertificateDate(item.certificate.issued_at)}</small>
                    </span>
                  </span>
                  <b>{item.certificate.certificate_code}</b>
                  <CertificateQr value={item.certificate.certificate_code} />
                </button>
                {item.courseCertificates.length > 0 ? (
                  <div className="academy-certificate-pack-grid">
                    {item.courseCertificates.map((certificate) => (
                      <button
                        className="academy-certificate-card"
                        type="button"
                        key={certificate.id}
                        onClick={() => navigateTo(`/academy/certificates/${certificate.id}`)}
                      >
                        <span className="academy-certificate-medal">
                          <Trophy size={22} />
                        </span>
                        <span>
                          <em>{certificate.course_category ?? 'YVIMO Academy'}</em>
                          <strong>{certificate.course_title}</strong>
                          <small>{t('Issued')} {formatCertificateDate(certificate.issued_at)}</small>
                        </span>
                        <b>{certificate.certificate_code}</b>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
            {standaloneCertificates.length > 0 ? (
              <div className="academy-certificate-grid">
                {standaloneCertificates.map((certificate) => (
                  <button
                    className="academy-certificate-card"
                    type="button"
                    key={certificate.id}
                    onClick={() => navigateTo(`/academy/certificates/${certificate.id}`)}
                  >
                    <span className="academy-certificate-medal">
                      <Trophy size={24} />
                    </span>
                    <span>
                      <em>{certificate.course_category ?? 'YVIMO Academy'}</em>
                      <strong>{certificate.course_title}</strong>
                      <small>{t('Issued')} {formatCertificateDate(certificate.issued_at)}</small>
                    </span>
                    <b>{certificate.certificate_code}</b>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </AcademyShell>
  );
}

function AcademyTrackCertificateDetail({
  certificate,
  navigateTo,
  t = defaultT,
}: {
  certificate: AcademyTrackCertificate;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
}) {
  return (
    <article className="academy-certificate-detail academy-track-certificate-detail">
      <section className="academy-certificate-document">
        <div className="academy-certificate-document-top">
          <span className="academy-certificate-medal">
            <Award size={30} />
          </span>
          <div>
            <p className="eyebrow">{t('Academy Track Certificate')}</p>
            <h1>{certificate.track_title}</h1>
          </div>
        </div>
        <div className="academy-certificate-recipient">
          <span>{t('Presented to')}</span>
          <strong>{certificate.student_name}</strong>
          <em>{certificate.student_email}</em>
        </div>
        <div className="academy-certificate-meta">
          <span>
            <b>{t('Certificate ID')}</b>
            {certificate.certificate_code}
          </span>
          <span>
            <b>{t('Issued')}</b>
            {formatCertificateDate(certificate.issued_at)}
          </span>
          <span>
            <b>{t('Completed courses')}</b>
            {certificate.completed_courses} / {certificate.total_courses}
          </span>
        </div>
        <button type="button" onClick={() => navigateTo(`/academy/tracks/${certificate.track_slug}`)}>
          {t('Back to track')} <ArrowRight size={17} />
        </button>
      </section>
    </article>
  );
}

function AcademyCertificateDetail({
  detail,
  user,
  navigateTo,
  t = defaultT,
}: {
  detail: {
    certificate: AcademyCertificate;
    bundle: AcademyCourseBundle;
    progress: AcademyLessonProgress[];
  };
  user: AcademyUser | null;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
}) {
  const lessons = [
    ...detail.bundle.modules.flatMap((module) => module.lessons),
    ...detail.bundle.ungroupedLessons,
  ];

  return (
    <article className="academy-certificate-detail">
      <section className="academy-certificate-document">
        <div className="academy-certificate-document-top">
          <span className="academy-certificate-medal">
            <Trophy size={30} />
          </span>
          <div>
            <p className="eyebrow">{t('Certificate of Completion')}</p>
            <h1>{detail.certificate.course_title}</h1>
          </div>
        </div>
        <div className="academy-certificate-recipient">
          <span>{t('Presented to')}</span>
          <strong>{detail.certificate.student_name}</strong>
          <em>{detail.certificate.student_email}</em>
        </div>
        <div className="academy-certificate-meta">
          <span>
            <b>{t('Certificate ID')}</b>
            {detail.certificate.certificate_code}
          </span>
          <span>
            <b>{t('Issued')}</b>
            {formatCertificateDate(detail.certificate.issued_at)}
          </span>
          <span>
            <b>{t('Lessons completed')}</b>
            {formatCompletedCount(detail.certificate.completed_lessons, detail.certificate.total_lessons, t)}
          </span>
        </div>
      </section>

      <section className="academy-certificate-route">
        <div className="academy-route-card-header">
          <div>
            <p className="eyebrow">{t('Completed route')}</p>
            <h2>{detail.certificate.course_title}</h2>
            <span>{t('Historical path completed before this certificate was issued.')}</span>
          </div>
          <button type="button" onClick={() => navigateTo(`/academy/${detail.certificate.course_slug}`)}>
            <Route size={17} />
            {t('Course')}
          </button>
        </div>
        <AcademyRouteMap
          lessons={lessons}
          progress={detail.progress}
          user={user}
          courseSlug={detail.certificate.course_slug}
          complete
        />
      </section>
    </article>
  );
}

function formatCertificateDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function chunkLessons(lessons: AcademyLesson[], size: number) {
  const rows: AcademyLesson[][] = [];
  for (let index = 0; index < lessons.length; index += size) {
    rows.push(lessons.slice(index, index + size));
  }
  return rows;
}

function getRouteRowProgress(completedCount: number, rowStart: number, rowLength: number) {
  if (rowLength <= 1) return completedCount > rowStart ? 100 : 0;
  if (completedCount <= rowStart) return 0;
  if (completedCount >= rowStart + rowLength) return 100;
  return ((completedCount - rowStart) / (rowLength - 1)) * 100;
}

function AcademyEmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="academy-empty-state">
      <Clock3 size={22} />
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

function AcademyShellState({
  title,
  detail,
  navigateTo,
  t = defaultT,
}: {
  title: string;
  detail?: string;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
}) {
  return (
    <AcademyShell navigateTo={navigateTo} t={t}>
      <AcademyEmptyState title={title} detail={detail} />
    </AcademyShell>
  );
}
