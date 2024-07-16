import React, { useEffect } from "react";
import axios from "axios";

const HistoryRecorder = ({ url }) => {
  useEffect(() => {
    const recordHistory = async () => {
      try {
        const topic = url.split("/wiki/")[1].replace(/_/g, " ");
        await axios.post("/api/history", { userId: "defaultUser", url, topic });
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
