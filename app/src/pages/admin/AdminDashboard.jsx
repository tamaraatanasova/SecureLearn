import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("users"); // users, courses, materials, logs
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    let query;
    if (activeTab === "users") query = supabase.from("profiles").select("*");
    else if (activeTab === "courses") query = supabase.from("courses").select("*, profiles(full_name)");
    else if (activeTab === "materials") query = supabase.from("course_contents").select("*");
    else if (activeTab === "logs") query = supabase.from("face_login_attempts").select("*").order("created_at", { ascending: false });

    const { data: res } = await query;
    setData(res || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  const handleDelete = async (table, id) => {
    if (!confirm("Are you absolutely sure? This cannot be undone.")) return;
    await supabase.from(table).delete().eq("id", id);
    fetchData();
  };

  const toggleUserRole = async (uid, currentRole) => {
    const nextRole = currentRole === "admin" ? "student" : currentRole === "teacher" ? "admin" : "teacher";
    await supabase.from("profiles").update({ role: nextRole }).eq("id", uid);
    fetchData();
  };

  return (
    <div className="container page">
      <header className="mb-6">
        <h1 className="pageTitle">Command Center</h1>
        <p className="pageSubtitle">Manage every entity across the SecureLearn ecosystem.</p>
        <div className="mt-3">
          <Link className="btn btnPrimary" to="/users/new">Create user</Link>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-10">
        <nav className="lg:w-72 flex flex-row lg:flex-col gap-2 overflow-x-auto pb-4">
          {["users", "courses", "materials", "logs"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`btn-modern w-full whitespace-nowrap ${activeTab === tab ? "bg-indigo-600 text-white shadow-xl shadow-indigo-500/30" : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100"}`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <main className="flex-1 card-cyber overflow-hidden">
          <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
            <h2 className="text-xl font-black uppercase italic tracking-widest">{activeTab} List</h2>
            <button onClick={fetchData} className="text-xs font-bold text-indigo-600 uppercase hover:underline">Refresh Data</button>
          </div>

          <div className="overflow-x-auto">
            {loading ? <div className="p-20 text-center animate-pulse">Synchronizing Database...</div> : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.2em] text-slate-400 border-b dark:border-slate-800">
                    <th className="p-6">Entity Details</th>
                    <th className="p-6">System State</th>
                    <th className="p-6 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {data.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-6">
                        <div className="font-bold text-slate-900 dark:text-white">{item.full_name || item.title || item.recognition_status}</div>
                        <div className="text-[10px] font-mono text-slate-400 mt-1">{item.id}</div>
                      </td>
                      <td className="p-6">
                        {activeTab === 'users' && (
                          <button onClick={() => toggleUserRole(item.id, item.role)} className="px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 text-[10px] font-black uppercase">
                            {item.role}
                          </button>
                        )}
                        {activeTab === 'courses' && (
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${item.is_published ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                            {item.is_published ? 'Live' : 'Draft'}
                          </span>
                        )}
                      </td>
                      <td className="p-6 text-right space-x-2">
                        <button 
                          onClick={() => handleDelete(activeTab === 'users' ? 'profiles' : activeTab === 'materials' ? 'course_contents' : activeTab, item.id)}
                          className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-rose-600 hover:text-white transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
