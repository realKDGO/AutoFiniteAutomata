import { Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import AboutPage from './pages/AboutPage';
import GeneratePage from './pages/GeneratePage';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import ResultPage from './pages/ResultPage';

export default function App() {
  return <Routes><Route element={<AppLayout />}><Route path="/" element={<HomePage />} /><Route path="/generate" element={<GeneratePage />} /><Route path="/result" element={<ResultPage />} /><Route path="/about" element={<AboutPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes>;
}
