import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Reader from './pages/Reader';
import Confirm from './pages/Confirm';
import Summary from './pages/Summary';
import Library from './pages/Library';
import ArticleDetail from './pages/ArticleDetail';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/article/:id" element={<ArticleDetail />} />
        <Route path="/reader" element={<Reader />} />
        <Route path="/confirm" element={<Confirm />} />
        <Route path="/summary" element={<Summary />} />
      </Routes>
    </Router>
  );
}
