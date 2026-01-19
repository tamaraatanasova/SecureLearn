import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Courses() {
  const { t } = useTranslation();
  const { session, isTeacher, isAdmin } = useAuth();
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [enrollments, setEnrollments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadCourses = async () => {
      setIsLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("courses")
        .select("*")
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (fetchError) {
        setError(fetchError.message);
        setCourses([]);
      } else {
        setCourses(data ?? []);
      }

      if (session?.user?.id && data?.length) {
        const courseIds = data.map((course) => course.id);
        const { data: enrollmentData } = await supabase
          .from("enrollments")
          .select("*")
          .eq("student_id", session.user.id)
          .in("course_id", courseIds);

        if (isMounted) {
          setEnrollments(enrollmentData || []);
        }
      } else if (isMounted) {
        setEnrollments([]);
      }

      setIsLoading(false);
    };

    loadCourses();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const enrollmentIds = new Set(enrollments.map((enrollment) => enrollment.course_id));

    const visibleCourses = courses.filter((course) => {
      if (isAdmin) return true;
      if (isTeacher) {
        const isOwner = Boolean(course.teacher_id) && course.teacher_id === session?.user?.id;
        if (isOwner) return true;
      }
      if (course.is_published) return true;
      return enrollmentIds.has(course.id);
    });

    const searchedCourses = normalizedQuery
      ? visibleCourses.filter((course) => {
        const haystack = `${course.title || ""} ${course.category || ""} ${course.description || ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      : visibleCourses;

    setFilteredCourses(searchedCourses);
  }, [courses, enrollments, searchQuery, isTeacher, isAdmin]);

  const onCreateCourse = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreateMessage("");
    setIsCreating(true);

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title");
    const description = formData.get("description");
    const category = formData.get("category");
    const isPublished = formData.get("isPublished") === "on";

    const { error: createErr, data } = await supabase
      .from("courses")
      .insert({
        title,
        description: description || null,
        category: category || null,
        is_published: isPublished,
        teacher_id: session?.user?.id || null,
      })
      .select("*")
      .single();

    if (createErr) {
      setCreateError(createErr.message);
      setIsCreating(false);
      return;
    }

    setCourses((prev) => [data, ...prev]);
    setCreateMessage(t("courseCreated"));
    e.currentTarget.reset();
    setIsCreating(false);
  };

  const enrollmentMap = useMemo(() => {
    const map = new Map();
    enrollments.forEach((enrollment) => {
      map.set(enrollment.course_id, enrollment);
    });
    return map;
  }, [enrollments]);

  if (isLoading) {
    return <div className="container page">{t("loading")}</div>;
  }

  if (error) {
    return (
      <div className="container page">
        <div className="card cardPad">
          <div className="small text-[color:var(--primary)]">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">{t("courses")}</h1>
          <p className="pageSubtitle">{t("coursesSubtitle")}</p>
        </div>
        <div className="w-full md:w-96 relative">
          <input
            className="input-modern pl-12"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchCourses")}
          />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 opacity-30">🔍</span>
        </div>
      </div>

      {(isTeacher || isAdmin) && (
        <div className="card cardPad mb-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2">Instructor Studio</h2>
              <p className="small">Create and manage your educational content with ease.</p>
            </div>
            <button onClick={() => setIsFormOpen(!isFormOpen)} className="btn btnPrimary px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition">
              {isFormOpen ? t("close") : t("addCourse")}
            </button>
          </div>
          {isFormOpen && (
            <form onSubmit={onCreateCourse} className="mt-8 p-8 rounded-[2rem] border" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="text-[10px] uppercase tracking-[0.18em] opacity-80 font-bold">{t("courseTitle")}</label>
                  <input
                    className="input mt-2"
                    type="text"
                    name="title"
                    placeholder={t("courseTitlePlaceholder")}
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[10px] uppercase tracking-[0.18em] opacity-80 font-bold">{t("courseDescription")}</label>
                  <textarea
                    className="input mt-2 min-h-[110px]"
                    name="description"
                    placeholder={t("courseDescriptionPlaceholder")}
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] opacity-80 font-bold">{t("courseCategory")}</label>
                  <input
                    className="input mt-2"
                    type="text"
                    name="category"
                    placeholder={t("courseCategoryPlaceholder")}
                  />
                </div>

                <label className="flex items-center gap-3 mt-7">
                  <input type="checkbox" name="isPublished" />
                  <span className="font-semibold">{t("coursePublish")}</span>
                </label>
              </div>

              <div className="mt-6 flex items-center gap-3 flex-wrap">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="btn btnPrimary px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition disabled:opacity-60 disabled:hover:scale-100"
                >
                  {isCreating ? t("creating") : t("createCourse")}
                </button>
                <button
                  type="button"
                  className="btn px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs border border-white/20 hover:bg-white/10 transition"
                  onClick={() => {
                    setIsFormOpen(false);
                    setCreateError("");
                    setCreateMessage("");
                  }}
                >
                  {t("close")}
                </button>
              </div>

              {createMessage && <div className="mt-4 font-semibold">{createMessage}</div>}
              {createError && <div className="mt-4 font-semibold text-white/90">{createError}</div>}
            </form>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {filteredCourses.map((course) => (
          <div key={course.id} className="card-cyber group flex flex-col">
            <div className="h-40 relative overflow-hidden" style={{ background: "var(--panel)" }}>
              <div className="absolute top-5 left-5 badge z-10">
                {course.category || "General"}
              </div>
              {!course.is_published && <div className="absolute top-5 right-5 badge badgeWarn z-10">Draft</div>}
            </div>
            <div className="p-8 flex-1 flex flex-col">
              <h3 className="text-2xl font-extrabold tracking-tight mb-3 line-clamp-2 leading-tight">
                {course.title}
              </h3>
              <p className="small line-clamp-3 mb-7 leading-relaxed flex-1">
                {course.description || "—"}
              </p>
              <div className="flex items-center justify-between pt-5 border-t" style={{ borderColor: "var(--border)" }}>
                <Link to={`/courses/${course.id}`} className="btn btnPrimary">
                  {t("viewCourse")}
                </Link>
                <span className="small">
                  {(() => {
                    const isOwner = Boolean(course.teacher_id) && course.teacher_id === session?.user?.id;
                    if (isAdmin) return t("adminAccess");
                    if (isOwner) return t("owner");
                    return enrollmentMap.has(course.id) ? `✓ ${t("enrolled")}` : t("notEnrolled");
                  })()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
