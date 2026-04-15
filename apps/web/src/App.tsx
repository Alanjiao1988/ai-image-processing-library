import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/layout/AppLayout";
import { AiImageProcessingPage } from "./pages/AiImageProcessingPage";
import { ImageLibraryPage } from "./pages/ImageLibraryPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<AiImageProcessingPage />} />
        <Route path="/library" element={<ImageLibraryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
