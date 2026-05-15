import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  LockKeyhole,
  MapPin,
  Newspaper,
  PlayCircle,
  RotateCcw,
  Route,
  Save,
  ShieldCheck,
  StickyNote,
  Trophy,
  UserRound,
} from 'lucide-react';
import {
  canAccessLesson,
  createCertificateForCourse,
  enrollInFreeCourse,
  fetchCertificateForCourse,
  fetchCertificateById,
  fetchCertificatesForUser,
  fetchCourseBundle,
  fetchLessonBySlug,
  fetchLessonNote,
  fetchLessonProgressForLesson,
  fetchLessonProgressForCourse,
  fetchPlayableLessonBySlug,
  fetchPublishedCourses,
  getCourseProgressSummary,
  getEnrollmentStatus,
  isAdminUser,
  isEnrollmentActive,
  resetLessonProgress,
  saveLessonNote,
  updateLessonProgress,
  type AcademyCourseBundle,
} from '../academy/academyApi';
import type {
  AcademyCertificate,
  AcademyCourse,
  AcademyEnrollment,
  AcademyLesson,
  AcademyLessonProgress,
  AcademyLessonProgressState,
  AcademyModuleWithLessons,
  LessonAccessResult,
} from '../academy/types';
import { VideoPlayer } from '../components/academy/VideoPlayer';

type AcademyUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

type AcademyTranslator = (text: string) => string;

type AcademyPageProps = {
  user: AcademyUser | null;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
  languageCode?: string;
};

const defaultT: AcademyTranslator = (text) => text;

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

function isFreeCourse(course: AcademyCourse) {
  return course.price === null || Number(course.price) === 0;
}

type CourseCompletionMap = Record<string, boolean>;

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

function getProfileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'Y';
}

const academyNavItems = [
  { label: 'Courses', icon: BookOpen, path: '/academy', section: 'courses' },
  { label: 'Continue watching', icon: PlayCircle, path: '/academy', section: 'continue' },
  { label: 'My progress', icon: CheckCircle2, path: '/academy/progress', section: 'progress' },
  { label: 'My certificates', icon: Trophy, path: '/academy/certificates', section: 'certificates' },
  { label: 'News', icon: Newspaper, path: '/academy', section: 'news' },
  { label: 'Resources', icon: FileText, path: '/academy', section: 'resources' },
];

function AcademyShell({
  children,
  navigateTo,
  t = defaultT,
  activeSection = 'courses',
}: {
  children: React.ReactNode;
  navigateTo: (path: string) => void;
  t?: AcademyTranslator;
  activeSection?: string;
}) {
  return (
    <main className="academy-shell">
      <aside className="academy-sidebar">
        <button className="academy-sidebar-back" type="button" onClick={() => navigateTo('/dashboard')}>
          <ArrowRight size={16} />
          {t('Dashboard')}
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
                {t(item.label)}
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

function getVisibleCategories(courses: AcademyCourse[]) {
  const preferred = ['PLC Programming', 'Robotics'];
  const existing = Array.from(new Set(courses.map(getCourseCategory)));
  return [
    ...preferred.filter((category) => existing.includes(category)),
    ...existing.filter((category) => !preferred.includes(category)),
  ];
}

export function AcademyHomePage({ user, navigateTo, t = defaultT, languageCode = 'en' }: AcademyPageProps) {
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
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load courses.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [languageCode, user]);

  return (
    <AcademyShell navigateTo={navigateTo} t={t}>
      <section className="academy-home-hero">
        <div className="academy-hero-copy">
          <p className="eyebrow">{t('YVIMO Academy')}</p>
          <h1>{t('Industrial learning for connected manufacturing.')}</h1>
          <p>
            {t('Courses, guided paths, and professional training for people building real automation, robotics, and industrial software systems.')}
          </p>
        </div>
        <div className="academy-domain-grid" aria-label="Academy learning areas">
          {[
            ['PLC Programming', 'Control logic, signals, troubleshooting'],
            ['Robotics', 'Cells, motion, integration, safety'],
            ['Industrial Software', 'Dashboards, APIs, plant-floor data'],
            ['Career Growth', 'Guidance, practice, certifications'],
          ].map(([title, detail]) => (
            <article key={title}>
              <GraduationCap size={18} />
              <strong>{t(title)}</strong>
              <span>{t(detail)}</span>
            </article>
          ))}
        </div>
        <button className="academy-view-all-button" type="button" onClick={() => navigateTo('/academy/courses')}>
          {t('View all courses')} <ArrowRight size={17} />
        </button>
      </section>

      <section className="academy-content">
        {loading ? <AcademyEmptyState title={t('Loading courses...')} /> : null}
        {error ? <AcademyEmptyState title={t('Unable to load Academy')} detail={error} /> : null}

        {!loading && !error ? (
          <section className="academy-featured-section">
            <div className="academy-featured-heading">
              <p className="eyebrow">{t('Featured')}</p>
              <h2>{t('Featured learning paths')}</h2>
              <span>{t('Start with the Academy tracks we are prioritizing first.')}</span>
            </div>
            <div className="academy-carousel-stack">
              {getVisibleCategories(courses).slice(0, 2).map((category) => (
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
        ) : null}

        {!loading && !error && courses.length === 0 ? (
          <AcademyEmptyState title={t('No published courses yet.')} />
        ) : null}
      </section>
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
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load courses.');
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
    <AcademyShell navigateTo={navigateTo} t={t}>
      <section className="academy-catalog-page">
        <div className="academy-catalog-header">
          <button className="academy-back-button" type="button" onClick={() => navigateTo('/academy')}>
            {t('Academy home')}
          </button>
          <p className="eyebrow">{t('Catalog')}</p>
          <h1>{t('All Academy courses')}</h1>
          <p>{t('Browse the full published catalog in a compact view.')}</p>
        </div>

        {loading ? <AcademyEmptyState title={t('Loading courses...')} /> : null}
        {error ? <AcademyEmptyState title={t('Unable to load catalog')} detail={error} /> : null}

        {!loading && !error ? (
          <div className="academy-catalog-stack">
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
          {course.thumbnail_url ? (
            <img src={course.thumbnail_url} alt="" />
          ) : (
            <GraduationCap size={34} />
          )}
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

export function AcademyCoursePage({ user, navigateTo, courseSlug, t = defaultT, languageCode = 'en' }: AcademyPageProps & { courseSlug: string }) {
  const [bundle, setBundle] = React.useState<AcademyCourseBundle | null>(null);
  const [enrollment, setEnrollment] = React.useState<AcademyEnrollment | null>(null);
  const [progress, setProgress] = React.useState<AcademyLessonProgress[]>([]);
  const [certificate, setCertificate] = React.useState<AcademyCertificate | null>(null);
  const [courseProgress, setCourseProgress] = React.useState(0);
  const [admin, setAdmin] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const loadCourse = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const nextBundle = await fetchCourseBundle(courseSlug, languageCode);
      setBundle(nextBundle);

      if (nextBundle && user) {
        const [nextEnrollment, nextProgress, nextSummary, nextAdmin, nextCertificate] = await Promise.all([
          getEnrollmentStatus(user.id, nextBundle.course.id),
          fetchLessonProgressForCourse(user.id, nextBundle.course.id),
          getCourseProgressSummary(user.id, nextBundle.course.id),
          isAdminUser(user.id),
          fetchCertificateForCourse(user.id, nextBundle.course.id),
        ]);
        setEnrollment(nextEnrollment);
        setProgress(nextProgress);
        setCourseProgress(nextSummary?.course_progress_percent ?? 0);
        setAdmin(nextAdmin);
        setCertificate(nextCertificate);
      } else {
        setEnrollment(null);
        setProgress([]);
        setCertificate(null);
        setCourseProgress(0);
        setAdmin(false);
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to load course.');
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
  const courseCompleted = allLessons.length > 0 && progress.filter((item) => item.completed).length === allLessons.length;
  const progressButtonLabel = certificate
    ? 'View my certificate'
    : courseCompleted
      ? 'Get my certificate'
      : 'View progress route';
  const progressButtonTarget = certificate
    ? `/academy/certificates/${certificate.id}`
    : `/academy/progress?course=${bundle.course.slug}`;

  return (
    <AcademyShell navigateTo={navigateTo} t={t}>
      <section className="academy-course-hero">
        <div>
          <button className="academy-back-button" type="button" onClick={() => navigateTo('/academy')}>
            {t('Courses')}
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
                ? `${courseProgress}% ${t('complete')}`
                : isFreeCourse(bundle.course)
                  ? t('Free course enrollment is available.')
                  : t('Enrollment required for protected lessons.')}
          </span>
          {user && activeEnrollment ? (
            <div className="academy-progress-bar" aria-label="Course progress">
              <span style={{ width: `${courseProgress}%` }} />
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
          {bundle.modules.map((module) => (
            <AcademyModuleBlock
              key={module.id}
              module={module}
              progress={progress}
              canOpenProtected={activeEnrollment || admin}
              navigateTo={navigateTo}
              courseSlug={bundle.course.slug}
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
              progress={progress}
              canOpenProtected={activeEnrollment || admin}
              navigateTo={navigateTo}
              courseSlug={bundle.course.slug}
              t={t}
            />
          ) : null}
        </div>
      </section>
    </AcademyShell>
  );
}

function AcademyModuleBlock({
  module,
  progress,
  canOpenProtected,
  navigateTo,
  courseSlug,
  t = defaultT,
}: {
  module: AcademyModuleWithLessons;
  progress: AcademyLessonProgress[];
  canOpenProtected: boolean;
  navigateTo: (path: string) => void;
  courseSlug: string;
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

          return (
            <button
              className={[
                'academy-lesson-row',
                locked ? 'locked' : '',
                progressState === 'completed' ? 'completed' : '',
              ].filter(Boolean).join(' ')}
              type="button"
              key={lesson.id}
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
          );
        })}
      </div>
    </article>
  );
}

export function AcademyLessonPage({
  user,
  navigateTo,
  courseSlug,
  lessonSlug,
  t = defaultT,
  languageCode = 'en',
}: AcademyPageProps & { courseSlug: string; lessonSlug: string }) {
  const [bundle, setBundle] = React.useState<AcademyCourseBundle | null>(null);
  const [lesson, setLesson] = React.useState<AcademyLesson | null>(null);
  const [access, setAccess] = React.useState<LessonAccessResult | null>(null);
  const [lessonProgress, setLessonProgress] = React.useState<AcademyLessonProgress | null>(null);
  const [courseCertificate, setCourseCertificate] = React.useState<AcademyCertificate | null>(null);
  const [notes, setNotes] = React.useState('');
  const [notesStatus, setNotesStatus] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [completeBusy, setCompleteBusy] = React.useState(false);
  const [retakeBusy, setRetakeBusy] = React.useState(false);
  const latestProgress = React.useRef(0);
  const completedOnce = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

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

        const admin = user ? await isAdminUser(user.id) : false;
        const nextLesson = admin
          ? await fetchPlayableLessonBySlug(nextBundle.course.id, lessonSlug, languageCode)
          : await fetchLessonBySlug(nextBundle.course.id, lessonSlug, languageCode);
        if (!active) return;
        setLesson(nextLesson);

        if (nextLesson) {
          const nextAccess = await canAccessLesson({
            userId: user?.id ?? null,
            courseId: nextBundle.course.id,
            lessonId: nextLesson.id,
          });
          if (!active) return;
          setAccess(nextAccess);

          if (nextAccess.allowed) {
            const [playableLesson, nextProgress, nextNote, nextCertificate] = await Promise.all([
              fetchPlayableLessonBySlug(nextBundle.course.id, lessonSlug, languageCode),
              fetchLessonProgressForLesson(user?.id ?? null, nextLesson.id),
              fetchLessonNote(user?.id ?? null, nextLesson.id),
              fetchCertificateForCourse(user?.id ?? null, nextBundle.course.id),
            ]);
            if (active && playableLesson) setLesson(playableLesson);
            if (active) {
              setLessonProgress(nextProgress);
              setCourseCertificate(nextCertificate);
              setNotes(nextNote?.content ?? '');
              latestProgress.current = nextProgress?.progress_seconds ?? 0;
              completedOnce.current = nextProgress?.completed ?? false;
            }
          }
        }
      } catch (caught) {
        if (active) setMessage(caught instanceof Error ? caught.message : 'Unable to load lesson.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadLesson();

    return () => {
      active = false;
    };
  }, [courseSlug, languageCode, lessonSlug, user]);

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

  const saveNotes = React.useCallback(async () => {
    if (!user || !bundle || !lesson) return;
    setNotesStatus('Saving...');
    try {
      await saveLessonNote({
        userId: user.id,
        courseId: bundle.course.id,
        lessonId: lesson.id,
        content: notes,
      });
      setNotesStatus('Saved');
    } catch (caught) {
      setNotesStatus(caught instanceof Error ? caught.message : 'Unable to save notes.');
    }
  }, [bundle, lesson, notes, user]);

  if (loading) {
    return <AcademyShellState title={t('Loading lesson...')} navigateTo={navigateTo} t={t} />;
  }

  if (!bundle || !lesson) {
    return <AcademyShellState title={t('Lesson not found.')} detail={message ?? undefined} navigateTo={navigateTo} t={t} />;
  }

  const allowed = access?.allowed ?? false;
  const completed = lessonProgress?.completed ?? false;
  const certificateIssued = Boolean(courseCertificate);

  return (
    <AcademyShell navigateTo={navigateTo} t={t}>
    <div className="academy-lesson-page">
      <section className="academy-lesson-header">
        <button
          className="academy-back-button"
          type="button"
          onClick={() => navigateTo(`/academy/${bundle.course.slug}`)}
        >
          {bundle.course.title}
        </button>
        <p className="eyebrow">{access?.isPreview ? t('Preview lesson') : t('Lesson')}</p>
        <h1>{lesson.title}</h1>
        {lesson.description ? <p>{lesson.description}</p> : null}
      </section>

      {allowed ? (
        <section className="academy-player-layout">
          <div className="academy-player-column">
            <VideoPlayer
              provider={lesson.video_provider}
              videoId={lesson.video_id}
              videoUrl={lesson.video_url}
              title={lesson.title}
              onProgress={(progressSeconds, durationSeconds) => {
                persistProgress(progressSeconds, durationSeconds).catch(() => undefined);
              }}
              onComplete={() => {
                if (!completedOnce.current) markComplete().catch(() => undefined);
              }}
            />
            {user ? (
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
              <textarea
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setNotesStatus(null);
                }}
                placeholder={t('Write your notes for this lesson...')}
              />
              <div className="academy-notes-footer">
                <span>{notesStatus ? t(notesStatus) : `${notes.length} ${t('characters')}`}</span>
                <button type="button" onClick={() => saveNotes()}>
                  <Save size={16} />
                  {t('Save')}
                </button>
              </div>
            </aside>
          ) : null}
        </section>
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

export function AcademyProgressPage({ user, navigateTo, t = defaultT, languageCode = 'en' }: AcademyPageProps) {
  const [items, setItems] = React.useState<ProgressCourse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const focusedCourseSlug = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('course');
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);

    async function loadProgress() {
      try {
        if (!user) {
          setItems([]);
          return;
        }

        const [courses, certificates] = await Promise.all([
          fetchPublishedCourses(languageCode),
          fetchCertificatesForUser(user.id),
        ]);
        const certificateByCourse = new Map(certificates.map((certificate) => [certificate.course_id, certificate]));
        const nextItems = await Promise.all(
          courses.map(async (course) => {
            const bundle = await fetchCourseBundle(course.slug, languageCode);
            if (!bundle) return null;
            const progress = await fetchLessonProgressForCourse(user.id, course.id);
            return { bundle, progress, certificate: certificateByCourse.get(course.id) ?? null };
          }),
        );

        if (active) {
          setItems(
            nextItems.filter((item): item is ProgressCourse => {
              if (!item) return false;
              if (item.certificate) return false;
              return item.progress.length > 0;
            }),
          );
        }
      } catch (caught) {
        if (active) setMessage(caught instanceof Error ? caught.message : 'Unable to load progress.');
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

  return (
    <AcademyShell navigateTo={navigateTo} activeSection="progress" t={t}>
      <section className="academy-progress-page">
        <div className="academy-progress-heading">
          <p className="eyebrow">{t('My progress')}</p>
          <h1>{t('Course routes')}</h1>
          <p>{t('Follow every lesson path and see how far your completed route is glowing behind you.')}</p>
        </div>

        {!user ? (
          <AcademyEmptyState title={t('Sign in to view your progress.')} detail={t('Your Academy routes are attached to your account.')} />
        ) : null}
        {loading ? <AcademyEmptyState title={t('Loading progress...')} /> : null}
        {message ? <AcademyEmptyState title={t('Unable to load progress')} detail={message} /> : null}
        {!loading && user && !message && items.length === 0 ? (
          <AcademyEmptyState title={t('No course progress yet.')} detail={t('Open a lesson to start lighting up your route.')} />
        ) : null}

        {!loading && user && !message ? (
          <div className="academy-route-stack">
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
  const [detail, setDetail] = React.useState<{
    certificate: AcademyCertificate;
    bundle: AcademyCourseBundle;
    progress: AcademyLessonProgress[];
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const highlightNew = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('new') === '1';
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);

    async function loadCertificates() {
      try {
        if (!user) {
          setCertificates([]);
          setDetail(null);
          return;
        }

        if (certificateId) {
          const certificate = await fetchCertificateById(user.id, certificateId);
          if (!certificate) {
            setDetail(null);
            setMessage('Certificate not found.');
            return;
          }

          const bundle = await fetchCourseBundle(certificate.course_slug, languageCode);
          if (!bundle) {
            setDetail(null);
            setMessage('Certificate course not found.');
            return;
          }

          const progress = await fetchLessonProgressForCourse(user.id, certificate.course_id);
          if (active) setDetail({ certificate, bundle, progress });
          return;
        }

        const nextCertificates = await fetchCertificatesForUser(user.id);
        if (active) setCertificates(nextCertificates);
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
    if (!highlightNew || loading || !detail) return;
    const target = document.querySelector('.academy-certificate-detail');
    if (!target) return;
    target.classList.add('focus-certificate');
    window.setTimeout(() => target.classList.remove('focus-certificate'), 1800);
  }, [detail, highlightNew, loading]);

  if (certificateId) {
    return (
      <AcademyShell navigateTo={navigateTo} activeSection="certificates" t={t}>
        <section className="academy-certificates-page">
          <button className="academy-back-button" type="button" onClick={() => navigateTo('/academy/certificates')}>
            {t('My certificates')}
          </button>
          {loading ? <AcademyEmptyState title={t('Loading certificate...')} /> : null}
          {message ? <AcademyEmptyState title={t('Unable to load certificate')} detail={message} /> : null}
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
        {!loading && user && !message && certificates.length === 0 ? (
          <AcademyEmptyState title={t('No certificates yet.')} detail={t('Complete a course and claim its certificate to add it here.')} />
        ) : null}

        {!loading && user && !message && certificates.length > 0 ? (
          <div className="academy-certificate-grid">
            {certificates.map((certificate) => (
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
      </section>
    </AcademyShell>
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
