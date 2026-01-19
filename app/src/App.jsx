import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import AppShell from "./components/AppShell.jsx";

import AuthLayout from "./pages/auth/AuthLayout";
import LoginEmail from "./pages/auth/LoginEmail";
import SignupEmail from "./pages/auth/SignupEmail";
import LoginFace from "./pages/auth/LoginFace";

import Home from "./pages/Home";
import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail.jsx";
import Profile from "./pages/Profile.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import UserCreate from "./pages/UserCreate.jsx";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <AppShell>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/courses" element={<ProtectedRoute><Courses /></ProtectedRoute>} />
                <Route path="/courses/:id" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                
                {/* Admin Routes */}
                <Route path="/admin/*" element={
                  <ProtectedRoute adminOnly={true}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />

                <Route path="/users/new" element={
                  <ProtectedRoute roles={["admin", "teacher"]}>
                    <UserCreate />
                  </ProtectedRoute>
                } />

                {/* Auth area */}
                <Route path="/auth" element={<AuthLayout />}>
                  <Route index element={<Navigate to="/auth/login" replace />} />
                  <Route path="login" element={<LoginEmail />} />
                  <Route path="signup" element={<SignupEmail />} />
                  <Route path="face" element={<LoginFace />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
          </AppShell>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
