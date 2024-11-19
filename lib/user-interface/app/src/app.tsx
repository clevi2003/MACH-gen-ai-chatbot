import React, { useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AppContext } from "./common/app-context";
import GlobalHeader from "./components/global-header";
import Playground from "./pages/chatbot/playground/playground";
import SessionPage from "./pages/chatbot/sessions/sessions";
import DataPage from "./pages/admin/data-view-page";
import UserFeedbackPage from "./pages/admin/user-feedback-page";
import LandingPage from "./pages/landing-page";
import { v4 as uuidv4 } from "uuid";
import "./styles/app.scss";

function App() {
  const appContext = useContext(AppContext);

  return (
    <div style={{ height: "100%" }}>
      <BrowserRouter>
        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<LandingPage u4={uuidv4} />} />

          {/* Grouped Routes with Global Header */}
          <Route
            element={
              <>
                <GlobalHeader />
                <div style={{ height: "56px", backgroundColor: "#000716" }}>&nbsp;</div>
                <Outlet /> {/* Ensure Outlet renders child routes */}
              </>
            }
          >
            {/* Chatbot Routes */}
            <Route path="/chatbot">
              <Route path="playground/:sessionId" element={<Playground />} />
              <Route path="sessions" element={<SessionPage />} />
            </Route>

            {/* Admin Routes */}
            <Route path="/admin">
              <Route path="data" element={<DataPage />} />
              <Route path="user-feedback" element={<UserFeedbackPage />} />
            </Route>

            
          </Route>

          {/* Catch-all Route */}
          <Route
            path="*"
            element={<Navigate to={`/chatbot/playground/${uuidv4()}`} replace />}
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;