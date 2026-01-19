import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/Modal.jsx";

export default function CourseDetail() {
   const { id } = useParams();
   const { t } = useTranslation();
   const { session, isTeacher, isAdmin } = useAuth();
   const [course, setCourse] = useState(null);
   const [modules, setModules] = useState([]);
   const [lessons, setLessons] = useState([]);
   const [tests, setTests] = useState([]);
   const [materials, setMaterials] = useState([]);
   const [materialUrls, setMaterialUrls] = useState({});
   const [enrollment, setEnrollment] = useState(null);
   const [isLoading, setIsLoading] = useState(true);
   const [error, setError] = useState("");
   const [actionError, setActionError] = useState("");
   const [isWorking, setIsWorking] = useState(false);
   const [isModuleFormOpen, setIsModuleFormOpen] = useState(false);
   const [isMaterialFormOpen, setIsMaterialFormOpen] = useState(false);
   const [openLessonModuleId, setOpenLessonModuleId] = useState(null);
   const [openTestModuleId, setOpenTestModuleId] = useState(null);
   const [openQuestionTestId, setOpenQuestionTestId] = useState(null);
   const [editingModuleId, setEditingModuleId] = useState(null);
   const [editingMaterialId, setEditingMaterialId] = useState(null);
   const [moduleError, setModuleError] = useState("");
   const [materialError, setMaterialError] = useState("");
   const [lessonError, setLessonError] = useState("");
   const [testError, setTestError] = useState("");
   const [questionError, setQuestionError] = useState("");
   const [moduleUpdateError, setModuleUpdateError] = useState("");
   const [materialUpdateError, setMaterialUpdateError] = useState("");
   const [moduleMessage, setModuleMessage] = useState("");
   const [materialMessage, setMaterialMessage] = useState("");
   const [lessonMessage, setLessonMessage] = useState("");
   const [testMessage, setTestMessage] = useState("");
   const [questionMessage, setQuestionMessage] = useState("");
   const [moduleUpdateMessage, setModuleUpdateMessage] = useState("");
   const [materialUpdateMessage, setMaterialUpdateMessage] = useState("");
   const [isSubmittingModule, setIsSubmittingModule] = useState(false);
   const [isSubmittingMaterial, setIsSubmittingMaterial] = useState(false);
   const [isSubmittingLesson, setIsSubmittingLesson] = useState(false);
   const [isSubmittingTest, setIsSubmittingTest] = useState(false);
   const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
   const [isUpdatingModule, setIsUpdatingModule] = useState(false);
   const [isUpdatingMaterial, setIsUpdatingMaterial] = useState(false);
   const [completedLessonIds, setCompletedLessonIds] = useState(new Set());

   useEffect(() => {
      let isMounted = true;

      const loadCourse = async () => {
         setIsLoading(true);
         setError("");

         const { data: courseData, error: courseError } = await supabase
            .from("courses")
            .select("*")
            .eq("id", id)
            .single();

         if (!isMounted) return;

         if (courseError) {
            setError(courseError.message);
            setIsLoading(false);
            return;
         }

         setCourse(courseData);

         const { data: moduleData } = await supabase
            .from("modules")
            .select("*")
            .eq("course_id", id)
            .order("order_index", { ascending: true });

         const moduleIds = (moduleData || []).map((m) => m.id);

         const { data: lessonData } = moduleIds.length
            ? await supabase
               .from("lessons")
               .select("*")
               .in("module_id", moduleIds)
               .order("order_index", { ascending: true })
            : { data: [] };

         const { data: progressData } = session?.user?.id && (lessonData || []).length
            ? await supabase
               .from("lesson_progress")
               .select("lesson_id")
               .eq("student_id", session.user.id)
               .in("lesson_id", (lessonData || []).map((lesson) => lesson.id))
            : { data: [] };

         const { data: testData } = moduleIds.length
            ? await supabase
               .from("tests")
               .select("*")
               .in("module_id", moduleIds)
               .order("created_at", { ascending: false })
            : { data: [] };

         const { data: materialData } = await supabase
            .from("course_contents")
            .select("*")
            .eq("course_id", id)
            .order("created_at", { ascending: false });

         const { data: enrollmentData } = session?.user?.id
            ? await supabase
               .from("enrollments")
               .select("*")
               .eq("course_id", id)
               .eq("student_id", session.user.id)
               .maybeSingle()
            : { data: null };

         if (!isMounted) return;

         setModules(moduleData || []);
         setLessons(lessonData || []);
         setTests(testData || []);
         setMaterials(materialData || []);
         setCompletedLessonIds(new Set((progressData || []).map((row) => row.lesson_id)));
         setEnrollment(enrollmentData || null);
         setIsLoading(false);
      };

      loadCourse();

      return () => {
         isMounted = false;
      };
   }, [id, session?.user?.id]);

   useEffect(() => {
      let isMounted = true;

      const loadMaterialUrls = async () => {
         const fileMaterials = materials.filter((material) => material.file_path);
         if (fileMaterials.length === 0) {
            setMaterialUrls({});
            return;
         }

         const entries = await Promise.all(
            fileMaterials.map(async (material) => {
               const { data } = await supabase.storage
                  .from("materials")
                  .createSignedUrl(material.file_path, 60 * 60);
               return [material.file_path, data?.signedUrl || ""];
            })
         );

         if (!isMounted) return;
         const nextUrls = {};
         entries.forEach(([path, url]) => {
            if (path && url) nextUrls[path] = url;
         });
         setMaterialUrls(nextUrls);
      };

      loadMaterialUrls();

      return () => {
         isMounted = false;
      };
   }, [materials]);

   const moduleLessons = useMemo(() => {
      const grouped = new Map();
      lessons.forEach((lesson) => {
         const list = grouped.get(lesson.module_id) || [];
         list.push(lesson);
         grouped.set(lesson.module_id, list);
      });
      return grouped;
   }, [lessons]);

   const moduleTests = useMemo(() => {
      const grouped = new Map();
      tests.forEach((test) => {
         const list = grouped.get(test.module_id) || [];
         list.push(test);
         grouped.set(test.module_id, list);
      });
      return grouped;
   }, [tests]);

   const isCourseTeacher = course?.teacher_id && session?.user?.id === course.teacher_id;
   const canManageCourse = isAdmin || isCourseTeacher;

   const handleTogglePublish = async () => {
      if (!course) return;
      setActionError("");
      setIsWorking(true);

      const nextPublished = !course.is_published;
      const { error: updateError } = await supabase
         .from("courses")
         .update({ is_published: nextPublished })
         .eq("id", course.id);

      if (updateError) {
         setActionError(updateError.message);
         setIsWorking(false);
         return;
      }

      setCourse((prev) => ({ ...prev, is_published: nextPublished }));
      setIsWorking(false);
   };

   const handleEnroll = async () => {
      setActionError("");
      setIsWorking(true);

      const { data, error: enrollError } = await supabase
         .from("enrollments")
         .insert({
            course_id: id,
            student_id: session.user.id,
            status: "active",
         })
         .select("*")
         .single();

      if (enrollError) {
         setActionError(enrollError.message);
         setIsWorking(false);
         return;
      }

      setEnrollment(data);
      setIsWorking(false);
   };

   const handleUnenroll = async () => {
      setActionError("");
      setIsWorking(true);

      const { error: unenrollError } = await supabase
         .from("enrollments")
         .delete()
         .eq("course_id", id)
         .eq("student_id", session.user.id);

      if (unenrollError) {
         setActionError(unenrollError.message);
         setIsWorking(false);
         return;
      }

      setEnrollment(null);
      setIsWorking(false);
   };

   const handleCreateLesson = async (e, moduleId) => {
      e.preventDefault();
      setLessonError("");
      setLessonMessage("");
      setIsSubmittingLesson(true);

      const formData = new FormData(e.currentTarget);
      const title = formData.get("title");
      const contentType = formData.get("contentType");
      const orderIndex = Number(formData.get("orderIndex") || 0);
      const bodyContent = formData.get("bodyContent");
      const externalUrl = formData.get("externalUrl");

      const { data, error: createError } = await supabase
         .from("lessons")
         .insert({
            module_id: moduleId,
            title,
            content_type: contentType,
            order_index: Number.isNaN(orderIndex) ? 0 : orderIndex,
            body_content: bodyContent || null,
            external_url: externalUrl || null,
         })
         .select("*")
         .single();

      if (createError) {
         setLessonError(createError.message);
         setIsSubmittingLesson(false);
         return;
      }

      setLessons((prev) => [...prev, data].sort((a, b) => a.order_index - b.order_index));
      setLessonMessage(t("lessonCreated"));
      e.currentTarget.reset();
      setIsSubmittingLesson(false);
   };

   const handleCreateTest = async (e, moduleId) => {
      e.preventDefault();
      setTestError("");
      setTestMessage("");
      setIsSubmittingTest(true);

      const formData = new FormData(e.currentTarget);
      const title = formData.get("title");
      const passingScore = Number(formData.get("passingScore") || 60);

      const { data, error: createError } = await supabase
         .from("tests")
         .insert({
            module_id: moduleId,
            title,
            passing_score: Number.isNaN(passingScore) ? 60 : passingScore,
         })
         .select("*")
         .single();

      if (createError) {
         setTestError(createError.message);
         setIsSubmittingTest(false);
         return;
      }

      setTests((prev) => [data, ...prev]);
      setTestMessage(t("testCreated"));
      e.currentTarget.reset();
      setIsSubmittingTest(false);
   };

   const handleCreateQuestion = async (e, testId) => {
      e.preventDefault();
      setQuestionError("");
      setQuestionMessage("");
      setIsSubmittingQuestion(true);

      const formData = new FormData(e.currentTarget);
      const prompt = formData.get("prompt");
      const points = Number(formData.get("points") || 1);
      const optionsRaw = formData.get("options");
      const correctIndex = Number(formData.get("correctIndex") || 1) - 1;

      const options = optionsRaw
         ? optionsRaw.split(",").map((opt) => opt.trim()).filter(Boolean)
         : [];

      if (options.length === 0) {
         setQuestionError(t("optionsRequired"));
         setIsSubmittingQuestion(false);
         return;
      }

      const { data: questionData, error: questionError } = await supabase
         .from("test_questions")
         .insert({
            test_id: testId,
            prompt,
            question_type: "multiple_choice",
            points: Number.isNaN(points) ? 1 : points,
         })
         .select("*")
         .single();

      if (questionError) {
         setQuestionError(questionError.message);
         setIsSubmittingQuestion(false);
         return;
      }

      const optionRows = options.map((optionText, index) => ({
         question_id: questionData.id,
         option_text: optionText,
         is_correct: index === correctIndex,
      }));

      const { error: optionsError } = await supabase
         .from("question_options")
         .insert(optionRows);

      if (optionsError) {
         setQuestionError(optionsError.message);
         setIsSubmittingQuestion(false);
         return;
      }

      setQuestionMessage(t("questionCreated"));
      e.currentTarget.reset();
      setIsSubmittingQuestion(false);
   };

   const handleMarkComplete = async (lessonId) => {
      if (!session?.user?.id || completedLessonIds.has(lessonId)) return;

      const { error: progressError } = await supabase
         .from("lesson_progress")
         .insert({ lesson_id: lessonId, student_id: session.user.id });

      if (progressError) {
         setActionError(progressError.message);
         return;
      }

      setCompletedLessonIds((prev) => new Set([...prev, lessonId]));
   };

   const handleCreateModule = async (e) => {
      e.preventDefault();
      setModuleError("");
      setModuleMessage("");
      setIsSubmittingModule(true);

      const formData = new FormData(e.currentTarget);
      const title = formData.get("title");
      const orderIndex = Number(formData.get("orderIndex") || 0);

      if (!title) {
         setModuleError(t("moduleTitleRequired"));
         setIsSubmittingModule(false);
         return;
      }

      const { data, error: createError } = await supabase
         .from("modules")
         .insert({
            course_id: id,
            title,
            order_index: Number.isNaN(orderIndex) ? 0 : orderIndex,
         })
         .select("*")
         .single();

      if (createError) {
         setModuleError(createError.message);
         setIsSubmittingModule(false);
         return;
      }

      setModules((prev) => [...prev, data].sort((a, b) => a.order_index - b.order_index));
      setModuleMessage(t("moduleCreated"));
      e.currentTarget.reset();
      setIsModuleFormOpen(false);
      setIsSubmittingModule(false);
   };

   const handleUpdateModule = async (e, moduleId) => {
      e.preventDefault();
      setModuleUpdateError("");
      setModuleUpdateMessage("");
      setIsUpdatingModule(true);

      const formData = new FormData(e.currentTarget);
      const title = formData.get("title");
      const orderIndex = Number(formData.get("orderIndex") || 0);

      const { data, error: updateError } = await supabase
         .from("modules")
         .update({
            title,
            order_index: Number.isNaN(orderIndex) ? 0 : orderIndex,
         })
         .eq("id", moduleId)
         .select("*")
         .single();

      if (updateError) {
         setModuleUpdateError(updateError.message);
         setIsUpdatingModule(false);
         return;
      }

      setModules((prev) =>
         prev.map((module) => (module.id === moduleId ? data : module))
            .sort((a, b) => a.order_index - b.order_index)
      );
      setModuleUpdateMessage(t("moduleUpdated"));
      setEditingModuleId(null);
      setIsUpdatingModule(false);
   };

   const handleDeleteModule = async (moduleId) => {
      setModuleUpdateError("");
      setModuleUpdateMessage("");

      const { error: deleteError } = await supabase
         .from("modules")
         .delete()
         .eq("id", moduleId);

      if (deleteError) {
         setModuleUpdateError(deleteError.message);
         return;
      }

      setModules((prev) => prev.filter((module) => module.id !== moduleId));
   };

   const handleCreateMaterial = async (e) => {
      e.preventDefault();
      setMaterialError("");
      setMaterialMessage("");
      setIsSubmittingMaterial(true);

      if (!session?.user?.id) {
         setMaterialError(t("mustBeLoggedIn"));
         setIsSubmittingMaterial(false);
         return;
      }

      const formData = new FormData(e.currentTarget);
      const title = formData.get("title");
      const description = formData.get("description");
      const type = formData.get("type");
      const externalUrl = formData.get("externalUrl");
      const file = formData.get("file");
      let filePath = null;

      if (type === "file") {
         if (!file || !(file instanceof File) || file.size === 0) {
            setMaterialError(t("fileRequired"));
            setIsSubmittingMaterial(false);
            return;
         }

         const safeName = file.name.replace(/\s+/g, "_");
         const storagePath = `courses/${id}/${Date.now()}_${safeName}`;
         const { error: uploadError } = await supabase.storage
            .from("materials")
            .upload(storagePath, file);

         if (uploadError) {
            setMaterialError(uploadError.message);
            setIsSubmittingMaterial(false);
            return;
         }

         filePath = storagePath;
      }

      const { data, error: createError } = await supabase
         .from("course_contents")
         .insert({
            course_id: id,
            created_by: session.user.id,
            type,
            title,
            description: description || null,
            external_url: externalUrl || null,
            file_path: filePath,
         })
         .select("*")
         .single();

      if (createError) {
         setMaterialError(createError.message);
         setIsSubmittingMaterial(false);
         return;
      }

      setMaterials((prev) => [data, ...prev]);
      setMaterialMessage(t("materialCreated"));
      e.currentTarget.reset();
      setIsMaterialFormOpen(false);
      setIsSubmittingMaterial(false);
   };

   const handleUpdateMaterial = async (e, materialId) => {
      e.preventDefault();
      setMaterialUpdateError("");
      setMaterialUpdateMessage("");
      setIsUpdatingMaterial(true);

      const formData = new FormData(e.currentTarget);
      const title = formData.get("title");
      const description = formData.get("description");
      const type = formData.get("type");
      const externalUrl = formData.get("externalUrl");

      const { data, error: updateError } = await supabase
         .from("course_contents")
         .update({
            title,
            description: description || null,
            type,
            external_url: externalUrl || null,
         })
         .eq("id", materialId)
         .select("*")
         .single();

      if (updateError) {
         setMaterialUpdateError(updateError.message);
         setIsUpdatingMaterial(false);
         return;
      }

      setMaterials((prev) => prev.map((material) => (material.id === materialId ? data : material)));
      setMaterialUpdateMessage(t("materialUpdated"));
      setEditingMaterialId(null);
      setIsUpdatingMaterial(false);
   };

   const handleDeleteMaterial = async (materialId) => {
      setMaterialUpdateError("");
      setMaterialUpdateMessage("");

      const { error: deleteError } = await supabase
         .from("course_contents")
         .delete()
         .eq("id", materialId);

      if (deleteError) {
         setMaterialUpdateError(deleteError.message);
         return;
      }

      setMaterials((prev) => prev.filter((material) => material.id !== materialId));
   };

   if (isLoading) {
      return <div className="container page">{t("loading")}</div>;
   }

   if (error || !course) {
      return (
         <div className="container page">
            <div className="card" style={{ padding: 18 }}>
               <div className="small">{error || t("courseNotFound")}</div>
               <div style={{ marginTop: 12 }}>
                  <Link to="/courses" className="btn">{t("backToCourses")}</Link>
               </div>
            </div>
         </div>
      );
   }

   const isEnrolled = Boolean(enrollment);

   if (!canManageCourse && !course.is_published) {
      return (
         <div className="container page">
            <div className="card cardPad">
               <div className="badge badgeWarn">{t("draft")}</div>
               <h1 className="pageTitle" style={{ marginTop: 10 }}>{course.title}</h1>
               {course.description && <p className="pageSubtitle">{course.description}</p>}
               <div className="small mt-3">{t("courseNotPublishedYet")}</div>
               <div className="mt-4 flex gap-2 flex-wrap">
                  <Link to="/courses" className="btn">{t("backToCourses")}</Link>
               </div>
            </div>
         </div>
      );
   }

   if (!canManageCourse && !isEnrolled) {
      return (
         <div className="container page">
            <div className="card cardPad">
               <div className="badge">{t("enrollmentRequired")}</div>
               <h1 className="pageTitle" style={{ marginTop: 10 }}>{course.title}</h1>
               {course.description && <p className="pageSubtitle">{course.description}</p>}
               <div className="small mt-3">{t("enrollToAccessCourse")}</div>
               <div className="mt-4 flex gap-2 flex-wrap">
                  <button
                     onClick={handleEnroll}
                     className="btn btnPrimary"
                     disabled={isWorking}
                  >
                     {isWorking ? t("working") : t("enroll")}
                  </button>
                  <Link to="/courses" className="btn">{t("backToCourses")}</Link>
               </div>
               {actionError && <div className="small mt-3 text-[color:var(--primary)]">{actionError}</div>}
            </div>
         </div>
      );
   }

   return (
      <div className="container page">
         <div className="relative h-[30vh] md:h-[40vh] rounded-[3rem] overflow-hidden bg-slate-900 text-white mb-8 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent z-10" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
            <div className="absolute bottom-10 left-10 z-20 max-w-2xl">
               <div className="inline-block bg-indigo-600 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                  {course.category}
               </div>
               <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic mb-4 uppercase">{course.title}</h1>
               <p className="text-lg opacity-80 italic">{course.description}</p>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Main Content Area */}
            <div className="lg:col-span-2 space-y-12">
               <section>
                  <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-slate-800 pb-4">
                     <h2 className="text-3xl font-black italic uppercase tracking-tighter">Course Modules</h2>
                     {canManageCourse && (
                        <button onClick={() => setIsModuleFormOpen(!isModuleFormOpen)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-indigo-200 transition active:scale-95 text-sm">
                           + Add Module
                        </button>
                     )}
                  </div>

                  <Modal
                     open={Boolean(canManageCourse && isModuleFormOpen)}
                     title={t("addModule")}
                     labelledById="create-module-title"
                     onClose={() => setIsModuleFormOpen(false)}
                  >
                     <div className="small">{t("moduleTitle")} · {t("moduleOrder")}</div>

                     <form onSubmit={handleCreateModule} className="auth-form" style={{ marginTop: 14 }}>
                        <div className="auth-field">
                           <label className="small">{t("moduleTitle")}</label>
                           <input className="input" name="title" placeholder={t("moduleTitlePlaceholder")} required />
                        </div>

                        <div className="auth-field">
                           <label className="small">{t("moduleOrder")}</label>
                           <input className="input" name="orderIndex" type="number" min="0" defaultValue="0" />
                        </div>

                        <div className="auth-actions">
                           <button className="btn btnPrimary" type="submit" disabled={isSubmittingModule}>
                              {isSubmittingModule ? t("saving") : t("createModule")}
                           </button>
                           <button type="button" className="btn" onClick={() => setIsModuleFormOpen(false)}>{t("close")}</button>
                        </div>

                        {moduleMessage && <div className="small mt-2">{moduleMessage}</div>}
                        {moduleError && <div className="small mt-2 text-[color:var(--primary)]">{moduleError}</div>}
                     </form>
                  </Modal>

                  {modules.map((module) => (
                     <div key={module.id} className="mb-8 p-1 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-slate-800 dark:to-slate-700 rounded-[2rem] shadow-sm">
                        <div className="bg-white dark:bg-slate-900 rounded-[1.8rem] p-6">
                           <div className="flex justify-between items-center mb-6">
                              <h3 className="text-xl font-bold flex items-center gap-3">
                                 <span className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-lg text-xs font-black italic leading-none">{module.order_index}</span>
                                 {module.title}
                              </h3>
                              {/* CRUD buttons with icons... */}
                           </div>

                           {/* Sub-items (Lessons) */}
                           <div className="space-y-3">
                              {moduleLessons.get(module.id)?.map(lesson => (
                                 <div key={lesson.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition cursor-pointer group">
                                    <div className="flex items-center gap-4">
                                       <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center text-xl group-hover:scale-110 transition">📖</div>
                                       <div>
                                          <div className="font-bold text-sm">{lesson.title}</div>
                                          <div className="text-[10px] text-gray-400 font-bold uppercase">{lesson.content_type}</div>
                                       </div>
                                    </div>
                                    {/* Checkmark logic... */}
                                 </div>
                              ))}
                           </div>
                        </div>
                     </div>
                  ))}
               </section>

               <section>
                  <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-slate-800 pb-4">
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter">{t("materials")}</h2>
                  {canManageCourse && (
                        <button
                           onClick={() => setIsMaterialFormOpen(!isMaterialFormOpen)}
                           className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-indigo-200 transition active:scale-95 text-sm"
                        >
                           + {t("addMaterial")}
                        </button>
                     )}
                  </div>

                  <Modal
                     open={Boolean(canManageCourse && isMaterialFormOpen)}
                     title={t("addMaterial")}
                     labelledById="create-material-title"
                     onClose={() => setIsMaterialFormOpen(false)}
                  >
                     <div className="small">{t("materials")}</div>

                     <form onSubmit={handleCreateMaterial} className="auth-form" style={{ marginTop: 14 }}>
                        <div className="auth-field">
                           <label className="small">{t("materialTitle")}</label>
                           <input className="input" name="title" placeholder={t("materialTitlePlaceholder")} required />
                        </div>

                        <div className="auth-field">
                           <label className="small">{t("materialDescription")}</label>
                           <textarea className="input" name="description" placeholder={t("materialDescriptionPlaceholder")} />
                        </div>

                        <div className="auth-field">
                           <label className="small">{t("materialType")}</label>
                           <select className="input" name="type" defaultValue="link">
                              <option value="link">{t("materialTypeLink")}</option>
                              <option value="file">{t("materialTypeFile")}</option>
                              <option value="note">{t("materialTypeNote")}</option>
                           </select>
                        </div>

                        <div className="auth-field">
                           <label className="small">{t("materialUrl")}</label>
                           <input className="input" name="externalUrl" placeholder={t("materialUrlPlaceholder")} />
                           <div className="small mt-1">{t("materialTypeLink")} / {t("materialTypeNote")}</div>
                        </div>

                        <div className="auth-field">
                           <label className="small">{t("materialFile")}</label>
                           <input className="input" name="file" type="file" />
                           <div className="small mt-1">{t("materialTypeFile")}</div>
                        </div>

                        <div className="auth-actions">
                           <button className="btn btnPrimary" type="submit" disabled={isSubmittingMaterial}>
                              {isSubmittingMaterial ? t("saving") : t("createMaterial")}
                           </button>
                           <button type="button" className="btn" onClick={() => setIsMaterialFormOpen(false)}>{t("close")}</button>
                        </div>

                        {materialMessage && <div className="small mt-2">{materialMessage}</div>}
                        {materialError && <div className="small mt-2 text-[color:var(--primary)]">{materialError}</div>}
                     </form>
                  </Modal>

                  {materials.length === 0 ? (
                     <div className="small">{t("noMaterials")}</div>
                  ) : (
                     <div className="grid gap-3">
                        {materials.map((material) => {
                           const downloadUrl = material.file_path ? (materialUrls[material.file_path] || "") : "";
                           return (
                              <div key={material.id} className="card cardPadSm">
                                 <div className="flex items-start justify-between gap-3">
                                    <div>
                                       <div style={{ fontWeight: 900 }}>{material.title}</div>
                                       {material.description && <div className="small mt-1">{material.description}</div>}
                                    </div>
                                    <span className="badge">{material.type}</span>
                                 </div>

                                 <div className="mt-4 flex gap-2 flex-wrap">
                                    {material.external_url && (
                                       <a className="btn" href={material.external_url} target="_blank" rel="noreferrer">
                                          {t("openLink")}
                                       </a>
                                    )}
                                    {downloadUrl && (
                                       <a className="btn" href={downloadUrl} target="_blank" rel="noreferrer">
                                          {t("downloadFile")}
                                       </a>
                                    )}
                                    {canManageCourse && (
                                       <button
                                          type="button"
                                          className="btn"
                                          onClick={() => handleDeleteMaterial(material.id)}
                                       >
                                          {t("delete")}
                                       </button>
                                    )}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  )}
               </section>
            </div>

            {/* Sidebar Area */}
            <div className="space-y-8">
               <div className="card cardPad sticky top-28">
                  <h4 className="text-xl font-extrabold mb-4">{t("courseInfo")}</h4>
                  <div className="space-y-4 mb-8">
                     <div className="flex justify-between text-sm">
                        <span className="small">{t("statusLabel")}</span>
                        <span className="badge">{course.is_published ? t("published") : t("draft")}</span>
                     </div>
                     {/* ... other meta ... */}
                  </div>

                  <div className="grid gap-3">
                     {!canManageCourse && (
                        enrollment ? (
                           <button onClick={handleUnenroll} className="btn w-full">{t("leaveCourse")}</button>
                        ) : (
                           <button onClick={handleEnroll} className="btn btnPrimary w-full">{t("enrollNow")}</button>
                        )
                     )}
                     {canManageCourse && (
                        <button onClick={handleTogglePublish} className="btn btnPrimary w-full">
                           {course.is_published ? t("unpublish") : t("publish")}
                        </button>
                     )}
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
}
