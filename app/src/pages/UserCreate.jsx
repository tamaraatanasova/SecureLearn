import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/Modal.jsx";

export default function UserCreate() {
  const { t } = useTranslation();
  const { role, isAdmin, isTeacher, session } = useAuth();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [usersError, setUsersError] = useState("");
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const roleOptions = useMemo(() => {
    const base = [
      { value: "student", label: "student" },
      { value: "teacher", label: "teacher" },
    ];
    return isAdmin ? [...base, { value: "admin", label: "admin" }] : base;
  }, [isAdmin]);

  const canCreate = isAdmin || isTeacher;

  const loadUsers = async () => {
    setUsersError("");
    setIsUsersLoading(true);

    try {
      if (isAdmin) {
        const { data, error: listError } = await supabase
          .from("profiles")
          .select("id, full_name, role, created_at")
          .order("created_at", { ascending: false });

        if (listError) {
          setUsersError(listError.message);
          setUsers([]);
          setIsUsersLoading(false);
          return;
        }

        setUsers((data ?? []).map((p) => ({ ...p, courses: [] })));
        setIsUsersLoading(false);
        return;
      }

      const teacherId = session?.user?.id;
      if (!teacherId) {
        setUsers([]);
        setIsUsersLoading(false);
        return;
      }

      const { data: coursesData, error: coursesError } = await supabase
        .from("courses")
        .select("id, title")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

      if (coursesError) {
        setUsersError(coursesError.message);
        setUsers([]);
        setIsUsersLoading(false);
        return;
      }

      const courseIds = (coursesData ?? []).map((c) => c.id);
      const courseTitleById = new Map((coursesData ?? []).map((c) => [c.id, c.title || "Untitled course"]));

      if (courseIds.length === 0) {
        setUsers([]);
        setIsUsersLoading(false);
        return;
      }

      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("student_id, course_id, created_at")
        .in("course_id", courseIds)
        .order("created_at", { ascending: false });

      if (enrollmentsError) {
        setUsersError(enrollmentsError.message);
        setUsers([]);
        setIsUsersLoading(false);
        return;
      }

      const studentIds = Array.from(
        new Set((enrollmentsData ?? []).map((e) => e.student_id).filter(Boolean))
      );

      if (studentIds.length === 0) {
        setUsers([]);
        setIsUsersLoading(false);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .in("id", studentIds);

      if (profilesError) {
        setUsersError(profilesError.message);
        setUsers([]);
        setIsUsersLoading(false);
        return;
      }

      const byStudentId = new Map();
      (profilesData ?? []).forEach((p) => {
        byStudentId.set(p.id, { ...p, courses: [] });
      });

      (enrollmentsData ?? []).forEach((e) => {
        const entry = byStudentId.get(e.student_id);
        if (!entry) return;
        const title = courseTitleById.get(e.course_id) || "Untitled course";
        if (!entry.courses.includes(title)) entry.courses.push(title);
      });

      setUsers(Array.from(byStudentId.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")));
      setIsUsersLoading(false);
    } catch (err) {
      setUsersError(err?.message || "Failed to load users.");
      setUsers([]);
      setIsUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!canCreate) return;
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, isAdmin, session?.user?.id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canCreate) return;

    setError("");
    setMessage("");
    setIsSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("fullName") || "");
    const nextRole = String(formData.get("role") || "student");

    const { data, error: invokeError } = await supabase.functions.invoke("create-user", {
      body: { email, password, full_name: fullName, role: nextRole },
    });

    if (invokeError) {
      setError(invokeError.message);
      setIsSubmitting(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || "Failed to create user");
      setIsSubmitting(false);
      return;
    }

    setMessage(`User created: ${data.email} (${data.role})`);
    form.reset();
    loadUsers();
    setIsCreateOpen(false);
    setIsSubmitting(false);
  };

  if (!canCreate) {
    return (
      <div className="container page">
        <h1 className="pageTitle">{t("users")}</h1>
        <p className="pageSubtitle">Your role ({role}) cannot create users.</p>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">{t("users")}</h1>
          <p className="pageSubtitle">{t("usersPageSubtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btnPrimary" onClick={() => {
            setError("");
            setMessage("");
            setIsCreateOpen(true);
          }}>
            {t("createUser")}
          </button>
        </div>
      </div>

      <Modal
        open={isCreateOpen}
        title={t("createUser")}
        labelledById="create-user-title"
        onClose={() => setIsCreateOpen(false)}
      >
        <form onSubmit={onSubmit} className="auth-form">
          <div className="auth-field">
            <label className="small">{t("email")}</label>
            <input className="input" type="email" name="email" placeholder="name@example.com" required />
          </div>

          <div className="auth-field">
            <label className="small">{t("password")}</label>
            <input className="input" type="password" name="password" placeholder="••••••••" required />
          </div>

          <div className="auth-field">
            <label className="small">Full name</label>
            <input className="input" type="text" name="fullName" placeholder="John Doe" />
          </div>

          <div className="auth-field">
            <label className="small">Role</label>
            <select className="input" name="role" defaultValue="student">
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {!isAdmin && <div className="small mt-1">Teachers cannot create admins.</div>}
          </div>

          <div className="auth-actions">
            <button className="btn btnPrimary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("working") : t("createUser")}
            </button>
            <button type="button" className="btn" onClick={() => setIsCreateOpen(false)}>{t("close")}</button>
          </div>

          {message && <div className="small mt-2">{message}</div>}
          {error && <div className="small mt-2 text-[color:var(--primary)]">{error}</div>}
        </form>
      </Modal>

      <div className="card cardPad mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-extrabold">
              {isAdmin ? t("allUsers") : t("usersInYourCourses")}
            </div>
            <div className="small mt-1">
              {isAdmin ? t("allUsersDesc") : t("usersInYourCoursesDesc")}
            </div>
          </div>
          <button type="button" className="btn" onClick={loadUsers} disabled={isUsersLoading}>
            {isUsersLoading ? t("working") : t("refresh")}
          </button>
        </div>

        {usersError && <div className="small mt-3 text-[color:var(--primary)]">{usersError}</div>}

        {!usersError && !isUsersLoading && users.length === 0 && (
          <div className="small mt-3">{isAdmin ? t("noUsersFound") : t("noEnrolledUsersFound")}</div>
        )}

        <div className="tableWrap mt-4">
          <table className="table">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("role")}</th>
                <th>{isAdmin ? t("created") : t("courses")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 800 }}>{u.full_name || "—"}</div>
                    <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{u.id}</div>
                  </td>
                  <td>
                    <span className="pill">{u.role || "student"}</span>
                  </td>
                  <td>
                    {isAdmin ? (
                      <span className="small">{u.created_at ? new Date(u.created_at).toLocaleString() : "—"}</span>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {(u.courses || []).slice(0, 6).map((c) => (
                          <span key={c} className="pill">{c}</span>
                        ))}
                        {(u.courses || []).length > 6 && <span className="small">+{u.courses.length - 6} more</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
