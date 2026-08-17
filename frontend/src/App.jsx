import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Seasonal from "./pages/Seasonal.jsx";
import City from "./pages/City.jsx";
import TimeAnalysis from "./pages/TimeAnalysis.jsx";
import Predict from "./pages/Predict.jsx";
import ModelPage from "./pages/ModelPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="seasonal" element={<Seasonal />} />
        <Route path="city" element={<City />} />
        <Route path="time" element={<TimeAnalysis />} />
        <Route path="predict" element={<Predict />} />
        <Route path="model" element={<ModelPage />} />
      </Route>
    </Routes>
  );
}
