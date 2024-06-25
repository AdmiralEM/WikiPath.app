import React, { useState, useEffect } from "react";
import axios from "axios";
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
        setHistory(response.data);
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
      <PageViewer onNavigate={handleNavigate} />
      <HistoryRecorder url={currentUrl} />
      <MindMap data={history} />
    </div>
  );
};

export default App;
