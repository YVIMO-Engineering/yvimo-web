import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type {
  AcademyCertificate,
  AcademyCourse,
  AcademyCourseProgressSummary,
  AcademyEnrollment,
  AcademyLesson,
  AcademyLessonNote,
  AcademyLessonProgress,
  AcademyModule,
  AcademyModuleWithLessons,
  LessonAccessResult,
} from './types';

type AcademyClient = SupabaseClient;

export type CreateCertificateInput = {
  userId: string;
  course: AcademyCourse;
  studentName: string;
  studentEmail: string;
  completedLessons: number;
  totalLessons: number;
};

export type AcademyCourseBundle = {
  course: AcademyCourse;
  modules: AcademyModuleWithLessons[];
  ungroupedLessons: AcademyLesson[];
};

export function isEnrollmentActive(enrollment: AcademyEnrollment | null) {
  if (!enrollment) return false;
  if (enrollment.status !== 'active') return false;
  if (!enrollment.expires_at) return true;

  return new Date(enrollment.expires_at).getTime() > Date.now();
}

export async function isAdminUser(userId: string, client: AcademyClient = supabase) {
  const { data } = await client
    .from('profiles')
    .select('role, subscription_tier')
    .eq('id', userId)
    .maybeSingle<{ role: string | null; subscription_tier: string | null }>();

  const role = data?.role?.trim().toLowerCase();
  const tier = data?.subscription_tier?.trim().toLowerCase();

  return role === 'admin' || role === 'owner' || tier === 'enterprise-admin';
}

export async function fetchPublishedCourses(client: AcademyClient = supabase) {
  const { data, error } = await client
    .from('academy_courses')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .returns<AcademyCourse[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchCourseBySlug(courseSlug: string, client: AcademyClient = supabase) {
  const { data, error } = await client
    .from('academy_courses')
    .select('*')
    .eq('slug', courseSlug)
    .maybeSingle<AcademyCourse>();

  if (error) throw error;
  return data;
}

export async function fetchCourseBundle(
  courseSlug: string,
  client: AcademyClient = supabase,
): Promise<AcademyCourseBundle | null> {
  const course = await fetchCourseBySlug(courseSlug, client);
  if (!course) return null;

  const [{ data: modules, error: modulesError }, { data: lessons, error: lessonsError }] =
    await Promise.all([
      client
        .from('academy_course_modules')
        .select('*')
        .eq('course_id', course.id)
        .order('order_index', { ascending: true })
        .returns<AcademyModule[]>(),
      client
        .from('academy_lesson_catalog')
        .select('*')
        .eq('course_id', course.id)
        .eq('status', 'published')
        .order('order_index', { ascending: true })
        .returns<AcademyLesson[]>(),
    ]);

  if (modulesError) throw modulesError;
  if (lessonsError) throw lessonsError;

  const publishedLessons = lessons ?? [];
  const modulesWithLessons = (modules ?? []).map((module) => ({
    ...module,
    lessons: publishedLessons.filter((lesson) => lesson.module_id === module.id),
  }));
  const moduleIds = new Set((modules ?? []).map((module) => module.id));
  const ungroupedLessons = publishedLessons.filter(
    (lesson) => !lesson.module_id || !moduleIds.has(lesson.module_id),
  );

  return {
    course,
    modules: modulesWithLessons,
    ungroupedLessons,
  };
}

export async function fetchLessonBySlug(
  courseId: string,
  lessonSlug: string,
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_lesson_catalog')
    .select('*')
    .eq('course_id', courseId)
    .eq('slug', lessonSlug)
    .maybeSingle<AcademyLesson>();

  if (error) throw error;
  return data;
}

export async function fetchPlayableLessonBySlug(
  courseId: string,
  lessonSlug: string,
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_lessons')
    .select('*')
    .eq('course_id', courseId)
    .eq('slug', lessonSlug)
    .maybeSingle<AcademyLesson>();

  if (error) throw error;
  return data;
}

export async function getEnrollmentStatus(
  userId: string | null,
  courseId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return null;

  const { data, error } = await client
    .from('academy_enrollments')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle<AcademyEnrollment>();

  if (error) throw error;
  return data;
}

export async function enrollInFreeCourse(
  userId: string,
  courseId: string,
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only enroll themselves from the client.');
  }

  const { data: course, error: courseError } = await client
    .from('academy_courses')
    .select('*')
    .eq('id', courseId)
    .eq('status', 'published')
    .maybeSingle<AcademyCourse>();

  if (courseError) throw courseError;
  if (!course) throw new Error('Course is not available.');
  if (course.price !== null && Number(course.price) > 0) {
    throw new Error('This course is not free.');
  }

  const { data, error } = await client
    .from('academy_enrollments')
    .upsert(
      {
        user_id: userId,
        course_id: courseId,
        access_type: 'free',
        status: 'active',
      },
      { onConflict: 'user_id,course_id' },
    )
    .select('*')
    .single<AcademyEnrollment>();

  if (error) throw error;
  return data;
}

export async function canAccessLesson(
  {
    userId,
    courseId,
    lessonId,
  }: {
    userId: string | null;
    courseId: string;
    lessonId: string;
  },
  client: AcademyClient = supabase,
): Promise<LessonAccessResult> {
  const admin = userId ? await isAdminUser(userId, client) : false;
  const [{ data: course, error: courseError }, { data: lesson, error: lessonError }] =
    await Promise.all([
      client.from('academy_courses').select('*').eq('id', courseId).maybeSingle<AcademyCourse>(),
      client
        .from(admin ? 'academy_lessons' : 'academy_lesson_catalog')
        .select('*')
        .eq('id', lessonId)
        .maybeSingle<AcademyLesson>(),
    ]);

  if (courseError) throw courseError;
  if (lessonError) throw lessonError;

  if (!course || !lesson || lesson.course_id !== courseId) {
    return {
      allowed: false,
      reason: 'Lesson not found.',
      isPreview: false,
      enrollmentStatus: null,
    };
  }

  if (admin) {
    return {
      allowed: true,
      reason: 'Admin access granted.',
      isPreview: lesson.is_preview,
      enrollmentStatus: null,
    };
  }

  if (course.status !== 'published' || lesson.status !== 'published') {
    return {
      allowed: false,
      reason: 'This lesson is not published yet.',
      isPreview: lesson.is_preview,
      enrollmentStatus: null,
    };
  }

  if (lesson.is_preview) {
    return {
      allowed: true,
      reason: 'Preview lesson.',
      isPreview: true,
      enrollmentStatus: null,
    };
  }

  if (!userId) {
    return {
      allowed: false,
      reason: 'Sign in to access this lesson.',
      isPreview: false,
      enrollmentStatus: null,
    };
  }

  const enrollment = await getEnrollmentStatus(userId, courseId, client);
  if (!enrollment) {
    return {
      allowed: false,
      reason: 'Enroll in this course to access the lesson.',
      isPreview: false,
      enrollmentStatus: null,
    };
  }

  if (!isEnrollmentActive(enrollment)) {
    return {
      allowed: false,
      reason: enrollment.expires_at && new Date(enrollment.expires_at).getTime() <= Date.now()
        ? 'Your course access has expired.'
        : 'Your enrollment is not active.',
      isPreview: false,
      enrollmentStatus: enrollment.status,
    };
  }

  return {
    allowed: true,
    reason: 'Active enrollment.',
    isPreview: false,
    enrollmentStatus: enrollment.status,
  };
}

export async function updateLessonProgress(
  {
    userId,
    courseId,
    lessonId,
    progressSeconds,
    durationSeconds,
  }: {
    userId: string;
    courseId: string;
    lessonId: string;
    progressSeconds: number;
    durationSeconds: number | null;
  },
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only update their own lesson progress.');
  }

  const progressPercent = durationSeconds
    ? Math.min((Math.max(progressSeconds, 0) / durationSeconds) * 100, 100)
    : 0;
  const completed = progressPercent >= 90;
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await client
    .from('academy_lesson_progress')
    .select('id, completed, completed_at')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle<Pick<AcademyLessonProgress, 'id' | 'completed' | 'completed_at'>>();

  if (existingError) throw existingError;

  const { data, error } = await client
    .from('academy_lesson_progress')
    .upsert(
      {
        user_id: userId,
        course_id: courseId,
        lesson_id: lessonId,
        progress_seconds: Math.max(Math.floor(progressSeconds), 0),
        progress_percent: Number(progressPercent.toFixed(2)),
        completed,
        completed_at: completed ? existing?.completed_at ?? now : existing?.completed_at ?? null,
        last_watched_at: now,
      },
      { onConflict: 'user_id,lesson_id' },
    )
    .select('*')
    .single<AcademyLessonProgress>();

  if (error) throw error;
  return data;
}

export async function resetLessonProgress(
  {
    userId,
    courseId,
    lessonId,
  }: {
    userId: string;
    courseId: string;
    lessonId: string;
  },
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only update their own lesson progress.');
  }

  const { data: certificate, error: certificateError } = await client
    .from('academy_certificates')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle<{ id: string }>();

  if (certificateError) throw certificateError;
  if (certificate) {
    throw new Error('This course already has a certificate, so lesson progress cannot be reset.');
  }

  const { data, error } = await client
    .from('academy_lesson_progress')
    .upsert(
      {
        user_id: userId,
        course_id: courseId,
        lesson_id: lessonId,
        progress_seconds: 0,
        progress_percent: 0,
        completed: false,
        completed_at: null,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    )
    .select('*')
    .single<AcademyLessonProgress>();

  if (error) throw error;
  return data;
}

export async function fetchLessonProgressForCourse(
  userId: string | null,
  courseId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return [];

  const { data, error } = await client
    .from('academy_lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .returns<AcademyLessonProgress[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchLessonProgressForLesson(
  userId: string | null,
  lessonId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return null;

  const { data, error } = await client
    .from('academy_lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle<AcademyLessonProgress>();

  if (error) throw error;
  return data;
}

export async function fetchLessonNote(
  userId: string | null,
  lessonId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return null;

  const { data, error } = await client
    .from('academy_lesson_notes')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle<AcademyLessonNote>();

  if (error) throw error;
  return data;
}

export async function saveLessonNote(
  {
    userId,
    courseId,
    lessonId,
    content,
  }: {
    userId: string;
    courseId: string;
    lessonId: string;
    content: string;
  },
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only update their own lesson notes.');
  }

  const { data, error } = await client
    .from('academy_lesson_notes')
    .upsert(
      {
        user_id: userId,
        course_id: courseId,
        lesson_id: lessonId,
        content,
      },
      { onConflict: 'user_id,lesson_id' },
    )
    .select('*')
    .single<AcademyLessonNote>();

  if (error) throw error;
  return data;
}

function createCertificateCode() {
  const year = new Date().getFullYear();
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `YVIMO-${year}-${random.toUpperCase()}`;
}

export async function fetchCertificatesForUser(
  userId: string | null,
  client: AcademyClient = supabase,
) {
  if (!userId) return [];

  const { data, error } = await client
    .from('academy_certificates')
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false })
    .returns<AcademyCertificate[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchCertificateById(
  userId: string | null,
  certificateId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return null;

  const { data, error } = await client
    .from('academy_certificates')
    .select('*')
    .eq('user_id', userId)
    .eq('id', certificateId)
    .maybeSingle<AcademyCertificate>();

  if (error) throw error;
  return data;
}

export async function fetchCertificateForCourse(
  userId: string | null,
  courseId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return null;

  const { data, error } = await client
    .from('academy_certificates')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle<AcademyCertificate>();

  if (error) throw error;
  return data;
}

export async function createCertificateForCourse(
  {
    userId,
    course,
    studentName,
    studentEmail,
    completedLessons,
    totalLessons,
  }: CreateCertificateInput,
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only create their own certificates.');
  }

  const existing = await fetchCertificateForCourse(userId, course.id, client);
  if (existing) return existing;

  const { data, error } = await client
    .from('academy_certificates')
    .insert({
      user_id: userId,
      course_id: course.id,
      certificate_code: createCertificateCode(),
      student_name: studentName,
      student_email: studentEmail,
      course_title: course.title,
      course_slug: course.slug,
      course_category: course.category,
      completed_lessons: completedLessons,
      total_lessons: totalLessons,
    })
    .select('*')
    .single<AcademyCertificate>();

  if (error) throw error;
  return data;
}

export async function getCourseProgressSummary(
  userId: string | null,
  courseId: string,
  client: AcademyClient = supabase,
): Promise<AcademyCourseProgressSummary | null> {
  if (!userId) return null;

  const [{ data: lessons, error: lessonsError }, { data: progress, error: progressError }] =
    await Promise.all([
      client
        .from('academy_lessons')
        .select('id')
        .eq('course_id', courseId)
        .eq('status', 'published')
        .returns<Array<{ id: string }>>(),
      client
        .from('academy_lesson_progress')
        .select('lesson_id, completed')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .returns<Array<{ lesson_id: string; completed: boolean }>>(),
    ]);

  if (lessonsError) throw lessonsError;
  if (progressError) throw progressError;

  const totalLessons = lessons?.length ?? 0;
  const completedLessons = (progress ?? []).filter((item) => item.completed).length;
  const courseProgressPercent = totalLessons
    ? Number(((completedLessons / totalLessons) * 100).toFixed(2))
    : 0;

  return {
    user_id: userId,
    course_id: courseId,
    total_lessons: totalLessons,
    completed_lessons: completedLessons,
    course_progress_percent: courseProgressPercent,
  };
}
