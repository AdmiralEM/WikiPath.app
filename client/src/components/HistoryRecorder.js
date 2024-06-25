import React, { useEffect } from "react";
import axios from "axios";

const HistoryRecorder = ({ url }) => {
  useEffect(() => {
    const recordHistory = async () => {
      try {
        const response = await axios.post("/api/history", { url });
        console.log("History recorded:", response.data);
      } catch (err) {
        console.error("Error recording history:", err);
      }
    };

    if (url) {
      recordHistory();
    }
  }, [url]);

  return null;
};

export default HistoryRecorder;
