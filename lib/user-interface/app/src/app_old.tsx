import { useContext } from "react";
import {
  BrowserRouter,
  HashRouter,
  Outlet,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import { AppContext } from "./common/app-context";
import GlobalHeader from "./components/global-header";
import Playground from "./pages/chatbot/playground/playground";
import DataPage from "./pages/admin/data-view-page";
import UserFeedbackPage from "./pages/admin/user-feedback-page";
import SessionPage from "./pages/chatbot/sessions/sessions"
import { v4 as uuidv4 } from "uuid";
import "./styles/app.scss";
import AboutPage from "./pages/landing-page/about-page";
import HowToUsePage from "./pages/landing-page/how-to-use-page";
import SupportPage from "./pages/landing-page/support-page";

function App() {
  const appContext = useContext(AppContext); 
  const Router = BrowserRouter;

  return (
    <div style={{ height: "100%" }}>
      <Router>
        <GlobalHeader />
        <div style={{ height: "56px", backgroundColor: "#000716" }}>&nbsp;</div>
        <div>
          <Routes>            
            <Route
                index
                path="/"
                element={<Navigate to={`/home/about`} replace />}
                // element={<Navigate to={`/chatbot/playground/${uuidv4()}`} replace />}
            />            
            <Route path="/home" element={<Outlet />}>                 
             <Route path="about" element={<AboutPage />} />   
             <Route path="how-to-use" element={<HowToUsePage />} />  
             <Route path="support" element={<SupportPage />} />                          
            </Route>
            <Route path="/chatbot" element={<Outlet />}>
              <Route path="playground/:sessionId" element={<Playground />} />
              <Route path="sessions" element={<SessionPage />} /> 
            </Route>
            <Route path="/admin" element={<Outlet />}>                 
             <Route path="data" element={<DataPage />} />   
             <Route path="user-feedback" element={<UserFeedbackPage />} />                           
            </Route>            
            <Route path="*" element={<Navigate to={`/chatbot/playground/${uuidv4()}`} replace />} />
          </Routes>
        </div>
      </Router>
    </div>
  );
}

export default App;
 