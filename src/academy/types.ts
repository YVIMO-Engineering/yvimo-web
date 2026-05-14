export type VideoProvider =
  | 'youtube'
  | 'cloudflare_stream'
  | 'mux'
  | 'vimeo'
  | 'local'
  | 'supabase';

export type AcademyCourseStatus = 'draft' | 'published' | 'archived';
export type AcademyLessonType = 'video' | 'text' | 'quiz' | 'assignment';
export type AcademyLessonStatus = 'draft' | 'published' | 'archived';
export type AcademyAccessType = 'free' | 'manual' | 'paid' | 'corporate' | 'trial' | 'admin';
export type AcademyEnrollmentStatus = 'active' | 'inactive' | 'expired' | 'revoked';
export type AcademyLessonProgressState = 'not_started' | 'in_progress' | 'completed';

export type AcademyCourse = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  difficulty_level: string | null;
  thumbnail_url: string | null;
  price: number | null;
  currency: string | null;
  status: AcademyCourseStatus;
  created_at: string;
  updated_at: string;
};

export type AcademyModule = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type AcademyLesson = {
  id: string;
  course_id: string;
  module_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  lesson_type: AcademyLessonType;
  video_provider: VideoProvider | null;
  video_id: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  order_index: number;
  is_preview: boolean;
  status: AcademyLessonStatus;
  created_at: string;
  updated_at: string;
};

export type AcademyEnrollment = {
  id: string;
  user_id: string;
  course_id: string;
  access_type: AcademyAccessType;
  status: AcademyEnrollmentStatus;
  enrolled_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AcademyLessonProgress = {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  progress_seconds: number;
  progress_percent: number;
  completed: boolean;
  completed_at: string | null;
  last_watched_at: string;
  created_at: string;
  updated_at: string;
};

export type AcademyModuleWithLessons = AcademyModule & {
  lessons: AcademyLesson[];
};

export type AcademyCourseProgressSummary = {
  user_id: string;
  course_id: string;
  total_lessons: number;
  completed_lessons: number;
  course_progress_percent: number;
};

export type LessonAccessResult = {
  allowed: boolean;
  reason: string;
  isPreview: boolean;
  enrollmentStatus: AcademyEnrollmentStatus | null;
};
