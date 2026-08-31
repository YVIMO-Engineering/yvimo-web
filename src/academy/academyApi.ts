import type { SupabaseClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';
import { supabase } from '../lib/supabaseClient';
import type {
  AcademyCertificate,
  AcademyCourse,
  AcademyCourseProgressSummary,
  AcademyCourseTranslation,
  AcademyEnrollment,
  AcademyActivity,
  AcademyActivityAttempt,
  AcademyActivityConfig,
  AcademyActivityType,
  AcademyLesson,
  AcademyLessonContentGroup,
  AcademyLessonNote,
  AcademyLessonProgress,
  AcademyLessonResource,
  AcademyLessonSubmission,
  AcademyTrackProject,
  AcademyModule,
  AcademyModuleTranslation,
  AcademyModuleWithLessons,
  AcademyLessonTranslation,
  AcademyTrack,
  AcademyTrackCertificate,
  AcademyTrackCourse,
  AcademyTrackProgressSummary,
  LessonAccessResult,
} from './types';

type AcademyClient = SupabaseClient;
const supabaseProjectUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export type CreateCertificateInput = {
  userId: string;
  course: AcademyCourse;
  studentName: string;
  studentEmail: string;
  completedLessons: number;
  totalLessons: number;
};

export type CreateTrackCertificateInput = {
  userId: string;
  track: AcademyTrack;
  specializationSlug?: string | null;
  specializationTitle?: string | null;
  certificateTrackTitle?: string;
  studentName: string;
  studentEmail: string;
  completedCourses: number;
  totalCourses: number;
};

export type AcademyCourseBundle = {
  course: AcademyCourse;
  modules: AcademyModuleWithLessons[];
  ungroupedLessons: AcademyLesson[];
};

export type AcademyTrackBundle = {
  track: AcademyTrack;
  trackCourses: Array<AcademyTrackCourse & { course: AcademyCourse }>;
};

export type AcademyActivityInput = {
  id?: string;
  trackId?: string | null;
  courseId: string;
  lessonId: string;
  type: AcademyActivityType;
  title: string;
  instructions?: string | null;
  difficulty?: string | null;
  pointsReward: number;
  isRequired: boolean;
  isPublished: boolean;
  orderIndex?: number;
  configJson: AcademyActivityConfig;
};

export type AcademyLiveSessionInput = {
  id?: string;
  courseId: string;
  slug: string;
  title: string;
  description?: string | null;
  videoProvider?: AcademyLesson['video_provider'];
  videoId?: string | null;
  videoUrl?: string | null;
  durationSeconds?: number | null;
  orderIndex?: number;
  status: AcademyLesson['status'];
  verifiedUploadId?: string | null;
  specializationSlug?: string | null;
};

function shouldTranslate(languageCode?: string | null) {
  return Boolean(languageCode && languageCode !== 'en');
}

function applyCourseTranslation(
  course: AcademyCourse,
  translation?: AcademyCourseTranslation | null,
): AcademyCourse {
  if (!translation) return course;
  return {
    ...course,
    title: translation.title ?? course.title,
    subtitle: translation.subtitle ?? course.subtitle,
    description: translation.description ?? course.description,
    category: translation.category ?? course.category,
    difficulty_level: translation.difficulty_level ?? course.difficulty_level,
  };
}

function applyModuleTranslation(
  module: AcademyModule,
  translation?: AcademyModuleTranslation | null,
): AcademyModule {
  if (!translation) return module;
  return {
    ...module,
    title: translation.title ?? module.title,
    description: translation.description ?? module.description,
  };
}

function applyLessonTranslation(
  lesson: AcademyLesson,
  translation?: AcademyLessonTranslation | null,
): AcademyLesson {
  if (!translation) return lesson;
  return {
    ...lesson,
    title: translation.title ?? lesson.title,
    description: translation.description ?? lesson.description,
  };
}

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

export async function canManageAcademyActivities(userId: string | null, client: AcademyClient = supabase) {
  if (!userId) return false;
  const { data } = await client
    .from('profiles')
    .select('role, subscription_tier')
    .eq('id', userId)
    .maybeSingle<{ role: string | null; subscription_tier: string | null }>();

  const role = data?.role?.trim().toLowerCase();
  const tier = data?.subscription_tier?.trim().toLowerCase();
  return role === 'admin'
    || role === 'owner'
    || role === 'mentor'
    || tier === 'owner'
    || tier === 'instructor'
    || tier === 'enterprise-admin';
}

export async function canAccessAcademyLiveSessions(userId: string | null, client: AcademyClient = supabase) {
  if (!userId) return false;
  const { data } = await client
    .from('profiles')
    .select('role, subscription_tier')
    .eq('id', userId)
    .maybeSingle<{ role: string | null; subscription_tier: string | null }>();
  const role = data?.role?.trim().toLowerCase();
  const tier = data?.subscription_tier?.trim().toLowerCase();
  return role === 'admin'
    || role === 'owner'
    || role === 'mentor'
    || ['enterprise', 'beta tester', 'instructor', 'owner', 'enterprise-admin'].includes(tier ?? '');
}

export const canManageAcademyLiveSessions = canManageAcademyActivities;

export type AcademyStudentSummary = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  subscription_tier: string | null;
};

export async function fetchAcademyStudents(client: AcademyClient = supabase) {
  const { data, error } = await client.rpc('list_academy_students');
  if (error) throw error;
  return (data ?? []) as AcademyStudentSummary[];
}

function normalizeSharePointEmbed(value?: string | null) {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  const iframeMatch = raw.match(/<iframe[^>]+src=(["'])(.*?)\1/i);
  const candidate = (iframeMatch?.[2] ?? raw).replace(/&amp;/g, '&');
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const allowedHost = hostname === 'onedrive.live.com'
      || hostname.endsWith('.sharepoint.com')
      || hostname.endsWith('.sharepoint-df.com');
    if (url.protocol !== 'https:' || !allowedHost) {
      throw new Error('Only secure SharePoint or OneDrive embed URLs are allowed.');
    }
    return url.toString();
  } catch (caught) {
    if (caught instanceof Error && caught.message.startsWith('Only secure')) throw caught;
    throw new Error('Paste a valid SharePoint/OneDrive iframe or embed URL.');
  }
}

export async function fetchLiveSessionsForCourse(
  courseId: string,
  includeDrafts = false,
  specializationSlug?: string | null,
  client: AcademyClient = supabase,
) {
  let query = client
    .from('academy_lessons')
    .select('*')
    .eq('course_id', courseId)
    .eq('content_group', 'live_session')
    .order('order_index', { ascending: true });
  if (specializationSlug) query = query.eq('specialization_slug', specializationSlug);
  if (!includeDrafts) query = query.eq('status', 'published');
  const { data, error } = await query.returns<AcademyLesson[]>();
  if (error) throw error;
  return data ?? [];
}

export async function saveAcademyLiveSession(input: AcademyLiveSessionInput, client: AcademyClient = supabase) {
  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData.session?.user.id ?? null;
  if (!await canManageAcademyLiveSessions(userId, client)) {
    throw new Error('Only Admin, Owner, or Instructor users can manage live sessions.');
  }
  const normalizedVideoUrl = input.videoProvider === 'sharepoint'
    ? normalizeSharePointEmbed(input.videoUrl)
    : input.videoUrl?.trim() || null;
  const generatedSlug = (input.slug || input.title)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const payload = {
    course_id: input.courseId,
    module_id: null,
    slug: generatedSlug,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    lesson_type: 'video' as const,
    video_provider: input.videoProvider ?? null,
    video_id: input.videoId?.trim() || null,
    video_url: normalizedVideoUrl,
    duration_seconds: input.durationSeconds ?? null,
    order_index: input.orderIndex ?? 0,
    is_preview: false,
    status: input.status,
    content_group: 'live_session' as AcademyLessonContentGroup,
    specialization_slug: input.specializationSlug ?? null,
  };
  if (input.videoProvider === 'cloudflare_r2') {
    if (!input.verifiedUploadId && !input.id) throw new Error('Upload and verify the R2 video before saving.');
    const { data, error } = await client.rpc('claim_academy_r2_recording', {
      target_upload_id: input.verifiedUploadId,
      target_course_id: input.courseId,
      target_lesson_id: input.id ?? null,
      target_slug: generatedSlug,
      target_title: input.title.trim(),
      target_description: input.description?.trim() || '',
      target_status: input.status,
      target_order_index: input.orderIndex ?? 0,
    }).single<AcademyLesson>();
    if (error) throw error;
    if (data && input.specializationSlug) {
      const { data: specializedData, error: specializationError } = await client
        .from('academy_lessons')
        .update({ specialization_slug: input.specializationSlug })
        .eq('id', data.id)
        .select('*')
        .single<AcademyLesson>();
      if (specializationError) throw specializationError;
      return specializedData;
    }
    return data;
  }
  const query = input.id
    ? client.from('academy_lessons').update(payload).eq('id', input.id)
    : client.from('academy_lessons').insert(payload);
  const { data, error } = await query.select('*').single<AcademyLesson>();
  if (error) throw error;
  return data;
}

export async function deleteAcademyLiveSession(id: string, client: AcademyClient = supabase) {
  const { data: sessionData } = await client.auth.getSession();
  if (!await canManageAcademyLiveSessions(sessionData.session?.user.id ?? null, client)) {
    throw new Error('Only Admin, Owner, or Instructor users can manage live sessions.');
  }
  const { error } = await client.from('academy_lessons').delete().eq('id', id).eq('content_group', 'live_session');
  if (error) throw error;
}

function isMissingAcademyActivitiesTable(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || Boolean(error?.message?.includes('academy_activities'));
}

export async function fetchPublishedCourses(languageCode = 'en', client: AcademyClient = supabase) {
  const { data, error } = await client
    .from('academy_courses')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .returns<AcademyCourse[]>();

  if (error) throw error;
  const courses = data ?? [];
  if (!shouldTranslate(languageCode) || courses.length === 0) return courses;

  const { data: translations, error: translationsError } = await client
    .from('academy_course_translations')
    .select('*')
    .eq('language_code', languageCode)
    .in('course_id', courses.map((course) => course.id))
    .returns<AcademyCourseTranslation[]>();

  if (translationsError) throw translationsError;

  const translationByCourse = new Map((translations ?? []).map((item) => [item.course_id, item]));
  return courses.map((course) => applyCourseTranslation(course, translationByCourse.get(course.id)));
}

export async function fetchCourseBySlug(courseSlug: string, languageCode = 'en', client: AcademyClient = supabase) {
  const { data, error } = await client
    .from('academy_courses')
    .select('*')
    .eq('slug', courseSlug)
    .maybeSingle<AcademyCourse>();

  if (error) throw error;
  if (!data || !shouldTranslate(languageCode)) return data;

  const { data: translation, error: translationError } = await client
    .from('academy_course_translations')
    .select('*')
    .eq('course_id', data.id)
    .eq('language_code', languageCode)
    .maybeSingle<AcademyCourseTranslation>();

  if (translationError) throw translationError;
  return applyCourseTranslation(data, translation);
}

export async function fetchCourseBundle(
  courseSlug: string,
  languageCode = 'en',
  client: AcademyClient = supabase,
): Promise<AcademyCourseBundle | null> {
  const course = await fetchCourseBySlug(courseSlug, languageCode, client);
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

  let localizedModules = modules ?? [];
  let publishedLessons = lessons ?? [];

  if (shouldTranslate(languageCode)) {
    const [moduleTranslationResult, lessonTranslationResult] =
      await Promise.all([
        localizedModules.length > 0
          ? client
            .from('academy_module_translations')
            .select('*')
            .eq('language_code', languageCode)
            .in('module_id', localizedModules.map((module) => module.id))
            .returns<AcademyModuleTranslation[]>()
          : Promise.resolve({ data: [], error: null }),
        publishedLessons.length > 0
          ? client
            .from('academy_lesson_translations')
            .select('*')
            .eq('language_code', languageCode)
            .in('lesson_id', publishedLessons.map((lesson) => lesson.id))
            .returns<AcademyLessonTranslation[]>()
          : Promise.resolve({ data: [], error: null }),
      ]);
    const { data: moduleTranslations, error: moduleTranslationsError } = moduleTranslationResult;
    const { data: lessonTranslations, error: lessonTranslationsError } = lessonTranslationResult;

    if (moduleTranslationsError) throw moduleTranslationsError;
    if (lessonTranslationsError) throw lessonTranslationsError;

    const moduleTranslationById = new Map((moduleTranslations ?? []).map((item) => [item.module_id, item]));
    const lessonTranslationById = new Map((lessonTranslations ?? []).map((item) => [item.lesson_id, item]));

    localizedModules = localizedModules.map((module) => applyModuleTranslation(module, moduleTranslationById.get(module.id)));
    publishedLessons = publishedLessons.map((lesson) => applyLessonTranslation(lesson, lessonTranslationById.get(lesson.id)));
  }

  const modulesWithLessons = localizedModules.map((module) => ({
    ...module,
    lessons: publishedLessons.filter((lesson) => lesson.module_id === module.id),
  }));
  const moduleIds = new Set(localizedModules.map((module) => module.id));
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
  languageCode = 'en',
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_lesson_catalog')
    .select('*')
    .eq('course_id', courseId)
    .eq('slug', lessonSlug)
    .maybeSingle<AcademyLesson>();

  if (error) throw error;
  if (!data || !shouldTranslate(languageCode)) return data;

  const { data: translation, error: translationError } = await client
    .from('academy_lesson_translations')
    .select('*')
    .eq('lesson_id', data.id)
    .eq('language_code', languageCode)
    .maybeSingle<AcademyLessonTranslation>();

  if (translationError) throw translationError;
  return applyLessonTranslation(data, translation);
}

export async function fetchPlayableLessonBySlug(
  courseId: string,
  lessonSlug: string,
  languageCode = 'en',
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_lessons')
    .select('*')
    .eq('course_id', courseId)
    .eq('slug', lessonSlug)
    .maybeSingle<AcademyLesson>();

  if (error) throw error;
  if (!data || !shouldTranslate(languageCode)) return data;

  const { data: translation, error: translationError } = await client
    .from('academy_lesson_translations')
    .select('*')
    .eq('lesson_id', data.id)
    .eq('language_code', languageCode)
    .maybeSingle<AcademyLessonTranslation>();

  if (translationError) throw translationError;
  return applyLessonTranslation(data, translation);
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
  const liveSessionAccess = await canAccessAcademyLiveSessions(userId, client);
  const [{ data: course, error: courseError }, { data: lesson, error: lessonError }] =
    await Promise.all([
      client.from('academy_courses').select('*').eq('id', courseId).maybeSingle<AcademyCourse>(),
      client
        .from(admin || liveSessionAccess ? 'academy_lessons' : 'academy_lesson_catalog')
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

  if (lesson.content_group === 'live_session') {
    return {
      allowed: liveSessionAccess && course.status === 'published' && lesson.status === 'published',
      reason: liveSessionAccess
        ? 'Enterprise access granted.'
        : 'This recording requires Enterprise Rank Exclusive Access.',
      isPreview: false,
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

export async function fetchActivitiesForCourse(
  courseId: string,
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_activities')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<AcademyActivity[]>();

  if (isMissingAcademyActivitiesTable(error)) return [];
  if (error) throw error;
  return data ?? [];
}

export async function fetchActivityAttemptsForCourse(
  userId: string | null,
  activityIds: string[],
  client: AcademyClient = supabase,
) {
  if (!userId || activityIds.length === 0) return [];

  const { data, error } = await client
    .from('academy_activity_attempts')
    .select('*')
    .eq('user_id', userId)
    .in('activity_id', activityIds)
    .returns<AcademyActivityAttempt[]>();

  if (isMissingAcademyActivitiesTable(error)) return [];
  if (error) throw error;
  return data ?? [];
}

export async function fetchActivityById(
  activityId: string,
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_activities')
    .select('*')
    .eq('id', activityId)
    .maybeSingle<AcademyActivity>();

  if (isMissingAcademyActivitiesTable(error)) return null;
  if (error) throw error;
  return data;
}

export async function fetchActivityAttempt(
  userId: string | null,
  activityId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return null;

  const { data, error } = await client
    .from('academy_activity_attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .maybeSingle<AcademyActivityAttempt>();

  if (isMissingAcademyActivitiesTable(error)) return null;
  if (error) throw error;
  return data;
}

export async function saveAcademyActivity(input: AcademyActivityInput, client: AcademyClient = supabase) {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session?.user.id) {
    throw new Error('You must be signed in to save activities.');
  }

  const staff = await canManageAcademyActivities(sessionData.session.user.id, client);
  if (!staff) {
    throw new Error('Only Instructor and Owner users can manage activities.');
  }

  const payload = {
    track_id: input.trackId ?? null,
    course_id: input.courseId,
    lesson_id: input.lessonId,
    type: input.type,
    title: input.title.trim(),
    instructions: input.instructions?.trim() || null,
    difficulty: input.difficulty?.trim() || null,
    points_reward: Math.max(Math.floor(input.pointsReward), 0),
    is_required: input.isRequired,
    is_published: input.isPublished,
    order_index: input.orderIndex ?? 0,
    config_json: input.configJson,
    updated_by: sessionData.session.user.id,
    ...(input.id ? {} : { created_by: sessionData.session.user.id }),
  };

  const query = input.id
    ? client.from('academy_activities').update(payload).eq('id', input.id)
    : client.from('academy_activities').insert(payload);

  const { data, error } = await query.select('*').single<AcademyActivity>();
  if (error) throw error;
  return data;
}

export async function deleteAcademyActivity(activityId: string, client: AcademyClient = supabase) {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session?.user.id) {
    throw new Error('You must be signed in to delete activities.');
  }

  const staff = await canManageAcademyActivities(sessionData.session.user.id, client);
  if (!staff) {
    throw new Error('Only Instructor and Owner users can manage activities.');
  }

  const { error } = await client.from('academy_activities').delete().eq('id', activityId);
  if (error) throw error;
}

export async function completeAcademyActivity(
  {
    userId,
    activityId,
    score,
    attemptData,
  }: {
    userId: string;
    activityId: string;
    score: number;
    attemptData: Record<string, unknown>;
  },
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only complete their own activities.');
  }

  const { data, error } = await client
    .rpc('complete_academy_activity', {
      target_activity_id: activityId,
      score_value: score,
      attempt_payload: attemptData,
    })
    .single<AcademyActivityAttempt>();

  if (error) throw error;
  return data;
}

export async function fetchPublishedTrackBundles(client: AcademyClient = supabase): Promise<AcademyTrackBundle[]> {
  const [{ data: tracks, error: tracksError }, { data: links, error: linksError }] =
    await Promise.all([
      client
        .from('academy_tracks')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: true })
        .returns<AcademyTrack[]>(),
      client
        .from('academy_track_courses')
        .select('*')
        .order('step', { ascending: true })
        .returns<AcademyTrackCourse[]>(),
    ]);

  if (tracksError) throw tracksError;
  if (linksError) throw linksError;

  const courseIds = Array.from(new Set((links ?? []).map((link) => link.course_id)));
  const { data: courses, error: coursesError } = courseIds.length
    ? await client
      .from('academy_courses')
      .select('*')
      .in('id', courseIds)
      .eq('status', 'published')
      .returns<AcademyCourse[]>()
    : { data: [], error: null };

  if (coursesError) throw coursesError;

  const courseById = new Map((courses ?? []).map((course) => [course.id, course]));
  return (tracks ?? []).map((track) => ({
    track,
    trackCourses: (links ?? [])
      .filter((link) => link.track_id === track.id)
      .sort((left, right) => left.step - right.step)
      .flatMap((link) => {
        const course = courseById.get(link.course_id);
        return course ? [{ ...link, course }] : [];
      }),
  }));
}

export async function fetchTrackProgressSummaries(
  userId: string | null,
  client: AcademyClient = supabase,
) {
  if (!userId) return [];

  const { data, error } = await client
    .from('academy_track_progress_summary')
    .select('*')
    .eq('user_id', userId)
    .returns<AcademyTrackProgressSummary[]>();

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

function isMissingAcademyFilesTable(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || error?.message?.includes('academy_lesson_');
}

export async function fetchLessonResources(
  lessonId: string,
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_lesson_resources')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<AcademyLessonResource[]>();

  if (isMissingAcademyFilesTable(error)) return [];
  if (error) throw error;
  return data ?? [];
}

export async function getLessonResourceDownloadUrl(
  resource: AcademyLessonResource,
  client: AcademyClient = supabase,
) {
  if (resource.public_url) return resource.public_url;
  if (!resource.storage_path) return null;

  const { data, error } = await client.storage
    .from('academy-lesson-resources')
    .createSignedUrl(resource.storage_path, 60 * 5);

  if (error) throw error;
  return data.signedUrl;
}

export async function fetchTrackProject(
  trackSlug: string,
  specializationSlug: string | null,
  client: AcademyClient = supabase,
) {
  let query = client
    .from('academy_track_projects')
    .select('*')
    .eq('track_slug', trackSlug);
  query = specializationSlug
    ? query.eq('specialization_slug', specializationSlug)
    : query.is('specialization_slug', null);
  const { data, error } = await query.maybeSingle<AcademyTrackProject>();
  if (error?.code === '42P01') return null;
  if (error) throw error;
  return data;
}

export async function fetchLessonResourceById(
  resourceId: string | null,
  client: AcademyClient = supabase,
) {
  if (!resourceId) return null;
  const { data, error } = await client
    .from('academy_lesson_resources')
    .select('*')
    .eq('id', resourceId)
    .maybeSingle<AcademyLessonResource>();
  if (error) throw error;
  return data;
}

export async function saveTrackProject(
  input: {
    id?: string;
    trackSlug: string;
    specializationSlug?: string | null;
    courseId: string;
    lessonId: string;
    title: string;
    description: string;
    resourceId?: string | null;
    briefFile?: File | null;
  },
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (!await canManageAcademyLiveSessions(sessionData.session?.user.id ?? null, client)) {
    throw new Error('Only Admin, Owner, or Instructor users can manage capstone projects.');
  }
  let resourceId = input.resourceId ?? null;
  if (input.briefFile) {
    const resource = await publishLessonResource({
      courseId: input.courseId,
      lessonId: input.lessonId,
      title: `${input.title.trim()} brief`,
      description: 'Capstone project PDF brief',
      file: input.briefFile,
      orderIndex: 0,
    }, client);
    resourceId = resource.id;
  }
  const payload = {
    track_slug: input.trackSlug,
    specialization_slug: input.specializationSlug ?? null,
    course_id: input.courseId,
    lesson_id: input.lessonId,
    title: input.title.trim(),
    description: input.description.trim(),
    resource_id: resourceId,
  };
  const query = input.id
    ? client.from('academy_track_projects').update(payload).eq('id', input.id)
    : client.from('academy_track_projects').insert(payload);
  const { data, error } = await query.select('*').single<AcademyTrackProject>();
  if (error) throw error;
  return data;
}

export async function deleteTrackProject(id: string, client: AcademyClient = supabase) {
  const { data: sessionData } = await client.auth.getSession();
  if (!await canManageAcademyLiveSessions(sessionData.session?.user.id ?? null, client)) {
    throw new Error('Only Admin, Owner, or Instructor users can manage capstone projects.');
  }
  const { error } = await client.from('academy_track_projects').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchLessonSubmissions(
  userId: string | null,
  lessonId: string,
  client: AcademyClient = supabase,
) {
  if (!userId) return [];

  const { data, error } = await client
    .from('academy_lesson_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .order('submitted_at', { ascending: false })
    .returns<AcademyLessonSubmission[]>();

  if (isMissingAcademyFilesTable(error)) return [];
  if (error) throw error;
  return data ?? [];
}

export async function fetchLessonSubmissionsForLessons(
  userId: string,
  lessonIds: string[],
  client: AcademyClient = supabase,
) {
  if (lessonIds.length === 0) return [] as AcademyLessonSubmission[];
  const { data, error } = await client
    .from('academy_lesson_submissions')
    .select('*')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds)
    .order('submitted_at', { ascending: false })
    .returns<AcademyLessonSubmission[]>();
  if (error) throw error;
  return data ?? [];
}

export async function updateLessonSubmissionStatus(
  submissionId: string,
  status: AcademyLessonSubmission['status'],
  feedback: string | null = null,
  client: AcademyClient = supabase,
) {
  const { data, error } = await client
    .from('academy_lesson_submissions')
    .update({
      status,
      reviewer_feedback: feedback?.trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: (await client.auth.getSession()).data.session?.user.id ?? null,
    })
    .eq('id', submissionId)
    .select('*')
    .single<AcademyLessonSubmission>();
  if (error) throw error;
  return data;
}

export async function getLessonSubmissionDownloadUrl(
  submission: AcademyLessonSubmission,
  client: AcademyClient = supabase,
) {
  const { data, error } = await client.storage
    .from('academy-lesson-submissions')
    .createSignedUrl(submission.storage_path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadLessonSubmission(
  {
    userId,
    courseId,
    lessonId,
    file,
  }: {
    userId: string;
    courseId: string;
    lessonId: string;
    file: File;
  },
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only upload their own lesson submissions.');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'submission';
  const storagePath = `${userId}/${lessonId}/${Date.now()}-${safeName}`;
  const accessToken = sessionData.session.access_token;

  if (!supabaseProjectUrl) {
    throw new Error('Missing Supabase project URL.');
  }

  const projectRef = new URL(supabaseProjectUrl).hostname.split('.')[0];
  const resumableEndpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: resumableEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'academy-lesson-submissions',
        objectName: storagePath,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch(reject);
  });

  const { data, error } = await client
    .from('academy_lesson_submissions')
    .insert({
      user_id: userId,
      course_id: courseId,
      lesson_id: lessonId,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      storage_path: storagePath,
      status: 'submitted',
    })
    .select('*')
    .single<AcademyLessonSubmission>();

  if (error) throw error;
  return data;
}

export async function publishLessonResource(
  {
    courseId,
    lessonId,
    title,
    description,
    file,
    orderIndex = 0,
  }: {
    courseId: string;
    lessonId: string;
    title: string;
    description?: string | null;
    file: File;
    orderIndex?: number;
  },
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session?.user.id) {
    throw new Error('You must be signed in to publish lesson resources.');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'resource';
  const storagePath = `${courseId}/${lessonId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await client.storage
    .from('academy-lesson-resources')
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from('academy_lesson_resources')
    .insert({
      course_id: courseId,
      lesson_id: lessonId,
      title,
      description: description?.trim() || null,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      storage_path: storagePath,
      order_index: orderIndex,
    })
    .select('*')
    .single<AcademyLessonResource>();

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

export async function fetchTrackCertificatesForUser(
  userId: string | null,
  client: AcademyClient = supabase,
) {
  if (!userId) return [];

  const { data, error } = await client
    .from('academy_track_certificates')
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false })
    .returns<AcademyTrackCertificate[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchTrackCertificateForTrack(
  userId: string | null,
  trackId: string,
  specializationSlug: string | null = null,
  client: AcademyClient = supabase,
) {
  if (!userId) return null;

  let query = client
    .from('academy_track_certificates')
    .select('*')
    .eq('user_id', userId)
    .eq('track_id', trackId);

  query = specializationSlug
    ? query.eq('specialization_slug', specializationSlug)
    : query.is('specialization_slug', null);

  const { data, error } = await query.maybeSingle<AcademyTrackCertificate>();

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

export async function createCertificateForTrack(
  {
    userId,
    track,
    specializationSlug = null,
    specializationTitle = null,
    certificateTrackTitle,
    studentName,
    studentEmail,
    completedCourses,
    totalCourses,
  }: CreateTrackCertificateInput,
  client: AcademyClient = supabase,
) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('Users can only create their own certificates.');
  }

  const existing = await fetchTrackCertificateForTrack(userId, track.id, specializationSlug, client);
  if (existing) return existing;

  const { data, error } = await client
    .from('academy_track_certificates')
    .insert({
      user_id: userId,
      track_id: track.id,
      specialization_slug: specializationSlug,
      specialization_title: specializationTitle,
      certificate_code: createCertificateCode().replace('YVIMO-', 'YVIMO-TRACK-'),
      student_name: studentName,
      student_email: studentEmail,
      track_title: certificateTrackTitle ?? track.title,
      track_slug: track.slug,
      completed_courses: completedCourses,
      total_courses: totalCourses,
    })
    .select('*')
    .single<AcademyTrackCertificate>();

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
