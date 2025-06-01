import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home
 from "./components/Home";
 import LabExpertUI from "./components/LabExpertUI";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/about" element={<h1>About Us</h1>} />
        <Route path="/contact" element={<h1>Contact Us</h1>} />
        <Route path="/UI" element={<LabExpertUI/>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;