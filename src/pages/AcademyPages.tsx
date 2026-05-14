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
  Newspaper,
  PlayCircle,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import {
  canAccessLesson,
  enrollInFreeCourse,
  fetchCourseBundle,
  fetchLessonBySlug,
  fetchLessonProgressForCourse,
  fetchPlayableLessonBySlug,
  fetchPublishedCourses,
  getCourseProgressSummary,
  getEnrollmentStatus,
  isAdminUser,
  isEnrollmentActive,
  updateLessonProgress,
  type AcademyCourseBundle,
} from '../academy/academyApi';
import type {
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
};

type AcademyPageProps = {
  user: AcademyUser | null;
  navigateTo: (path: string) => void;
};

function formatPrice(course: AcademyCourse) {
  if (course.price === null || Number(course.price) === 0) return 'Free';
  return `${course.currency ?? 'USD'} ${Number(course.price).toFixed(2)}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const minutes = Math.max(Math.round(seconds / 60), 1);
  return `${minutes} min`;
}

function getProgressState(progress?: AcademyLessonProgress): AcademyLessonProgressState {
  if (progress?.completed) return 'completed';
  if (progress && progress.progress_percent > 0) return 'in_progress';
  return 'not_started';
}

function getProgressLabel(state: AcademyLessonProgressState) {
  if (state === 'completed') return 'Completed';
  if (state === 'in_progress') return 'In progress';
  return 'Not started';
}

function isFreeCourse(course: AcademyCourse) {
  return course.price === null || Number(course.price) === 0;
}

const academyNavItems = [
  { label: 'Courses', icon: BookOpen, active: true, path: '/academy/courses' },
  { label: 'Continue watching', icon: PlayCircle, active: false },
  { label: 'My progress', icon: CheckCircle2, active: false },
  { label: 'My certificates', icon: Trophy, active: false },
  { label: 'News', icon: Newspaper, active: false },
  { label: 'Resources', icon: FileText, active: false },
];

function AcademyShell({
  children,
  navigateTo,
}: {
  children: React.ReactNode;
  navigateTo: (path: string) => void;
}) {
  return (
    <main className="academy-shell">
      <aside className="academy-sidebar">
        <button className="academy-sidebar-back" type="button" onClick={() => navigateTo('/dashboard')}>
          <ArrowRight size={16} />
          Dashboard
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
                className={item.active ? 'active' : ''}
                type="button"
                key={item.label}
                onClick={() => navigateTo(item.path ?? '/academy')}
              >
                <Icon size={18} />
                {item.label}
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

export function AcademyHomePage({ navigateTo }: AcademyPageProps) {
  const [courses, setCourses] = React.useState<AcademyCourse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    fetchPublishedCourses()
      .then((items) => {
        if (active) setCourses(items);
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
  }, []);

  return (
    <AcademyShell navigateTo={navigateTo}>
      <section className="academy-home-hero">
        <div className="academy-hero-copy">
          <p className="eyebrow">YVIMO Academy</p>
          <h1>Industrial learning for connected manufacturing.</h1>
          <p>
            Courses, guided paths, and professional training for people building real automation,
            robotics, and industrial software systems.
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
              <strong>{title}</strong>
              <span>{detail}</span>
            </article>
          ))}
        </div>
        <button className="academy-view-all-button" type="button" onClick={() => navigateTo('/academy/courses')}>
          View all courses <ArrowRight size={17} />
        </button>
      </section>

      <section className="academy-content">
        {loading ? <AcademyEmptyState title="Loading courses..." /> : null}
        {error ? <AcademyEmptyState title="Unable to load Academy" detail={error} /> : null}

        {!loading && !error ? (
          <section className="academy-featured-section">
            <div className="academy-featured-heading">
              <p className="eyebrow">Featured</p>
              <h2>Featured learning paths</h2>
              <span>Start with the Academy tracks we are prioritizing first.</span>
            </div>
            <div className="academy-carousel-stack">
              {getVisibleCategories(courses).slice(0, 2).map((category) => (
                <AcademyCourseCarousel
                  key={category}
                  title={category}
                  courses={courses.filter((course) => getCourseCategory(course) === category)}
                  navigateTo={navigateTo}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && !error && courses.length === 0 ? (
          <AcademyEmptyState title="No published courses yet." />
        ) : null}
      </section>
    </AcademyShell>
  );
}

export function AcademyCatalogPage({ navigateTo }: AcademyPageProps) {
  const [courses, setCourses] = React.useState<AcademyCourse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    fetchPublishedCourses()
      .then((items) => {
        if (active) setCourses(items);
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
  }, []);

  const categories = getVisibleCategories(courses);

  return (
    <AcademyShell navigateTo={navigateTo}>
      <section className="academy-catalog-page">
        <div className="academy-catalog-header">
          <button className="academy-back-button" type="button" onClick={() => navigateTo('/academy')}>
            Academy home
          </button>
          <p className="eyebrow">Catalog</p>
          <h1>All Academy courses</h1>
          <p>Browse the full published catalog in a compact view.</p>
        </div>

        {loading ? <AcademyEmptyState title="Loading courses..." /> : null}
        {error ? <AcademyEmptyState title="Unable to load catalog" detail={error} /> : null}

        {!loading && !error ? (
          <div className="academy-catalog-stack">
            {categories.map((category) => (
              <section className="academy-catalog-category" key={category}>
                <div className="academy-catalog-category-heading">
                  <h2>{category}</h2>
                  <span>{courses.filter((course) => getCourseCategory(course) === category).length} courses</span>
                </div>
                <div className="academy-catalog-grid">
                  {courses
                    .filter((course) => getCourseCategory(course) === category)
                    .map((course) => (
                      <button
                        className="academy-catalog-course"
                        type="button"
                        key={course.id}
                        onClick={() => navigateTo(`/academy/${course.slug}`)}
                      >
                        <span className="academy-catalog-course-icon">
                          <GraduationCap size={18} />
                        </span>
                        <span className="academy-catalog-course-copy">
                          <strong>{course.title}</strong>
                          <span>{course.subtitle ?? course.description ?? 'Course details coming soon.'}</span>
                        </span>
                        <span className="academy-catalog-course-meta">
                          {course.difficulty_level ? <em>{course.difficulty_level}</em> : null}
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
          <AcademyEmptyState title="No published courses yet." />
        ) : null}
      </section>
    </AcademyShell>
  );
}

function AcademyCourseCarousel({
  title,
  courses,
  navigateTo,
}: {
  title: string;
  courses: AcademyCourse[];
  navigateTo: (path: string) => void;
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
          <p className="eyebrow">Courses</p>
          <h2>{title}</h2>
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
          <AcademyCourseCard course={course} navigateTo={navigateTo} key={course.id} />
        ))}
      </div>
    </section>
  );
}

function AcademyCourseCard({
  course,
  navigateTo,
}: {
  course: AcademyCourse;
  navigateTo: (path: string) => void;
}) {
  return (
    <article className="academy-course-card">
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
            {course.category ? <span>{course.category}</span> : null}
            {course.difficulty_level ? <span>{course.difficulty_level}</span> : null}
          </span>
          <strong>{course.title}</strong>
          {course.subtitle ? <span className="academy-course-summary">{course.subtitle}</span> : null}
          <span className="academy-card-footer">
            <em>{formatPrice(course)}</em>
            <span>
              View course <ArrowRight size={16} />
            </span>
          </span>
        </span>
      </button>
    </article>
  );
}

export function AcademyCoursePage({ user, navigateTo, courseSlug }: AcademyPageProps & { courseSlug: string }) {
  const [bundle, setBundle] = React.useState<AcademyCourseBundle | null>(null);
  const [enrollment, setEnrollment] = React.useState<AcademyEnrollment | null>(null);
  const [progress, setProgress] = React.useState<AcademyLessonProgress[]>([]);
  const [courseProgress, setCourseProgress] = React.useState(0);
  const [admin, setAdmin] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const loadCourse = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const nextBundle = await fetchCourseBundle(courseSlug);
      setBundle(nextBundle);

      if (nextBundle && user) {
        const [nextEnrollment, nextProgress, nextSummary, nextAdmin] = await Promise.all([
          getEnrollmentStatus(user.id, nextBundle.course.id),
          fetchLessonProgressForCourse(user.id, nextBundle.course.id),
          getCourseProgressSummary(user.id, nextBundle.course.id),
          isAdminUser(user.id),
        ]);
        setEnrollment(nextEnrollment);
        setProgress(nextProgress);
        setCourseProgress(nextSummary?.course_progress_percent ?? 0);
        setAdmin(nextAdmin);
      } else {
        setEnrollment(null);
        setProgress([]);
        setCourseProgress(0);
        setAdmin(false);
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to load course.');
    } finally {
      setLoading(false);
    }
  }, [courseSlug, user]);

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
    return <AcademyShellState title="Loading course..." navigateTo={navigateTo} />;
  }

  if (!bundle) {
    return <AcademyShellState title="Course not found." detail={message ?? undefined} navigateTo={navigateTo} />;
  }

  const allLessons = [
    ...bundle.modules.flatMap((module) => module.lessons),
    ...bundle.ungroupedLessons,
  ];

  return (
    <AcademyShell navigateTo={navigateTo}>
      <section className="academy-course-hero">
        <div>
          <button className="academy-back-button" type="button" onClick={() => navigateTo('/academy')}>
            Courses
          </button>
          <p className="eyebrow">{bundle.course.category ?? 'YVIMO Academy'}</p>
          <h1>{bundle.course.title}</h1>
          {bundle.course.subtitle ? <p>{bundle.course.subtitle}</p> : null}
          <div className="academy-meta-row">
            {bundle.course.difficulty_level ? <span>{bundle.course.difficulty_level}</span> : null}
            <span>{formatPrice(bundle.course)}</span>
            <span>{allLessons.length} lessons</span>
          </div>
        </div>
        <aside className="academy-enrollment-panel">
          <ShieldCheck size={24} />
          <strong>{admin ? 'Admin access' : activeEnrollment ? 'Enrolled' : 'Course access'}</strong>
          <span>
            {admin
              ? 'You can access all Academy content.'
              : activeEnrollment
                ? `${courseProgress}% complete`
                : isFreeCourse(bundle.course)
                  ? 'Free course enrollment is available.'
                  : 'Enrollment required for protected lessons.'}
          </span>
          {user && activeEnrollment ? (
            <div className="academy-progress-bar" aria-label="Course progress">
              <span style={{ width: `${courseProgress}%` }} />
            </div>
          ) : null}
          {!activeEnrollment && !admin ? (
            <button type="button" onClick={handleEnroll}>
              {user ? (isFreeCourse(bundle.course) ? 'Enroll free' : 'Request access') : 'Sign in'}
            </button>
          ) : null}
        </aside>
      </section>

      {message ? <p className="academy-inline-message">{message}</p> : null}

      <section className="academy-course-layout">
        <div className="academy-course-description">
          <p className="eyebrow">Overview</p>
          <p>{bundle.course.description ?? 'Course description coming soon.'}</p>
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
}: {
  module: AcademyModuleWithLessons;
  progress: AcademyLessonProgress[];
  canOpenProtected: boolean;
  navigateTo: (path: string) => void;
  courseSlug: string;
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
              className={locked ? 'academy-lesson-row locked' : 'academy-lesson-row'}
              type="button"
              key={lesson.id}
              onClick={() => navigateTo(`/academy/${courseSlug}/lessons/${lesson.slug}`)}
            >
              <span className="academy-lesson-icon">
                {locked ? <LockKeyhole size={18} /> : <PlayCircle size={18} />}
              </span>
              <span>
                <strong>{lesson.title}</strong>
                <em>
                  {lesson.is_preview ? 'Preview' : locked ? 'Locked' : getProgressLabel(progressState)}
                  {formatDuration(lesson.duration_seconds) ? ` · ${formatDuration(lesson.duration_seconds)}` : ''}
                </em>
              </span>
              {progressState === 'completed' ? <CheckCircle2 size={18} /> : <ArrowRight size={16} />}
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
}: AcademyPageProps & { courseSlug: string; lessonSlug: string }) {
  const [bundle, setBundle] = React.useState<AcademyCourseBundle | null>(null);
  const [lesson, setLesson] = React.useState<AcademyLesson | null>(null);
  const [access, setAccess] = React.useState<LessonAccessResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const latestProgress = React.useRef(0);
  const completedOnce = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    async function loadLesson() {
      try {
        const nextBundle = await fetchCourseBundle(courseSlug);
        if (!active) return;
        setBundle(nextBundle);

        if (!nextBundle) {
          setLesson(null);
          setAccess(null);
          return;
        }

        const admin = user ? await isAdminUser(user.id) : false;
        const nextLesson = admin
          ? await fetchPlayableLessonBySlug(nextBundle.course.id, lessonSlug)
          : await fetchLessonBySlug(nextBundle.course.id, lessonSlug);
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
            const playableLesson = await fetchPlayableLessonBySlug(nextBundle.course.id, lessonSlug);
            if (active && playableLesson) setLesson(playableLesson);
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
  }, [courseSlug, lessonSlug, user]);

  const persistProgress = React.useCallback(
    async (progressSeconds: number, durationSeconds: number | null) => {
      if (!user || !bundle || !lesson || !access?.allowed) return;
      if (Math.abs(progressSeconds - latestProgress.current) < 8 && progressSeconds !== durationSeconds) return;

      latestProgress.current = progressSeconds;
      await updateLessonProgress({
        userId: user.id,
        courseId: bundle.course.id,
        lessonId: lesson.id,
        progressSeconds,
        durationSeconds: durationSeconds ?? lesson.duration_seconds,
      });
    },
    [access?.allowed, bundle, lesson, user],
  );

  const markComplete = React.useCallback(async () => {
    if (completedOnce.current || !user || !bundle || !lesson) return;
    completedOnce.current = true;
    const duration = lesson.duration_seconds ?? Math.max(latestProgress.current, 1);
    await updateLessonProgress({
      userId: user.id,
      courseId: bundle.course.id,
      lessonId: lesson.id,
      progressSeconds: duration,
      durationSeconds: duration,
    });
  }, [bundle, lesson, user]);

  if (loading) {
    return <AcademyShellState title="Loading lesson..." navigateTo={navigateTo} />;
  }

  if (!bundle || !lesson) {
    return <AcademyShellState title="Lesson not found." detail={message ?? undefined} navigateTo={navigateTo} />;
  }

  const allowed = access?.allowed ?? false;

  return (
    <AcademyShell navigateTo={navigateTo}>
    <div className="academy-lesson-page">
      <section className="academy-lesson-header">
        <button
          className="academy-back-button"
          type="button"
          onClick={() => navigateTo(`/academy/${bundle.course.slug}`)}
        >
          {bundle.course.title}
        </button>
        <p className="eyebrow">{access?.isPreview ? 'Preview lesson' : 'Lesson'}</p>
        <h1>{lesson.title}</h1>
        {lesson.description ? <p>{lesson.description}</p> : null}
      </section>

      {allowed ? (
        <section className="academy-player-layout">
          <VideoPlayer
            provider={lesson.video_provider}
            videoId={lesson.video_id}
            videoUrl={lesson.video_url}
            title={lesson.title}
            onProgress={(progressSeconds, durationSeconds) => {
              persistProgress(progressSeconds, durationSeconds).catch(() => undefined);
            }}
            onComplete={() => {
              markComplete().catch(() => undefined);
            }}
          />
          {user ? (
            <button className="academy-complete-button" type="button" onClick={() => markComplete()}>
              <CheckCircle2 size={18} />
              Mark complete
            </button>
          ) : null}
        </section>
      ) : (
        <section className="academy-locked-state">
          <LockKeyhole size={30} />
          <h2>Lesson locked</h2>
          <p>{access?.reason ?? 'Enroll in this course to access the lesson.'}</p>
          <div>
            <button type="button" onClick={() => (user ? navigateTo(`/academy/${bundle.course.slug}`) : navigateTo('/login'))}>
              {user ? 'View course access' : 'Sign in'}
            </button>
          </div>
        </section>
      )}
    </div>
    </AcademyShell>
  );
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
}: {
  title: string;
  detail?: string;
  navigateTo: (path: string) => void;
}) {
  return (
    <AcademyShell navigateTo={navigateTo}>
      <AcademyEmptyState title={title} detail={detail} />
    </AcademyShell>
  );
}
