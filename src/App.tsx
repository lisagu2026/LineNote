import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getCurrentUser } from './lib/api';
import Auth from './pages/Auth';
import Reader from './pages/Reader';
import Confirm from './pages/Confirm';
import Summary from './pages/Summary';
import Library from './pages/Library';
import ArticleDetail from './pages/ArticleDetail';
import { useStore } from './store';

function ProtectedRoute({children}: {children: JSX.Element}) {
  const authToken = useStore((state) => state.authToken);
  return authToken ? children : <Navigate to="/auth" replace />;
}

export default function App() {
  const authToken = useStore((state) => state.authToken);
  const syncAuthUser = useStore((state) => state.syncAuthUser);
  const clearAuthSession = useStore((state) => state.clearAuthSession);
  const [authChecking, setAuthChecking] = useState(Boolean(authToken));

  useEffect(() => {
    let cancelled = false;

    if (!authToken) {
      setAuthChecking(false);
      return;
    }

    setAuthChecking(true);
    void getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          syncAuthUser(user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearAuthSession();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authToken, clearAuthSession, syncAuthUser]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-600">
        正在校验登录状态...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to={authToken ? '/library' : '/auth'} replace />} />
        <Route path="/auth" element={authToken ? <Navigate to="/library" replace /> : <Auth />} />
        <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
        <Route path="/library/article/:id" element={<ProtectedRoute><ArticleDetail /></ProtectedRoute>} />
        <Route path="/reader" element={<ProtectedRoute><Reader /></ProtectedRoute>} />
        <Route path="/confirm" element={<ProtectedRoute><Confirm /></ProtectedRoute>} />
        <Route path="/summary" element={<ProtectedRoute><Summary /></ProtectedRoute>} />
      </Routes>
    </Router>
  );
}
