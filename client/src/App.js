import React, { useState, useEffect } from "react";
import axios from "axios";
import { Route, Link, Routes } from "react-router-dom";
import PageViewer from "./components/PageViewer";
import HistoryRecorder from "./components/HistoryRecorder";
import MindMap from "./components/MindMap";

const App = () => {
  const [currentUrl, setCurrentUrl] = useState("");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await axios.get("/api/history");
        const formatHistory = (history) => {
          return history.map((entry) => ({
            name: entry.topic,
            url: entry.url,
            children: [], // or further nested children if available
          }));
        };
        setHistory(formatHistory(response.data));
      } catch (err) {
        console.error("Error fetching history:", err);
      }
    };

    fetchHistory();
  }, []);

  const handleNavigate = (url) => {
    setCurrentUrl(url);
  };

  return (
    <div className="App">
      <h1>WikiPath.app</h1>
      <nav>
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/history">History</Link>
          </li>
          <li>
            <Link to="/map">Mind Map</Link>
          </li>
        </ul>
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <PageViewer onNavigate={handleNavigate} />
              <HistoryRecorder url={currentUrl} />
            </>
          }
        />
        <Route
          path="/history"
          element={
            <div>
              <h2>Browsing History</h2>
              {/* Optionally render a list of history items here */}
            </div>
          }
        />
        <Route path="/map" element={<MindMap data={history} />} />
      </Routes>
    </div>
  );
};

export default App;
